const express = require('express')
const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync, exec } = require('child_process')
const AdmZip = require('adm-zip')
const tar = require('tar')
const mysql = require('mysql2/promise')

const router = express.Router()
const HTDOCS = process.env.HTDOCS_PATH || '/htdocs'
const MYSQL_HOST = process.env.MYSQL_HOST || 'mariadb'

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

async function getLatestVersion(cms) {
  switch (cms) {
    case 'wordpress': {
      const data = await fetchJSON('https://api.wordpress.org/core/version-check/1.7/')
      return { version: data.offers[0].version, url: data.offers[0].download }
    }
    case 'joomla': {
      const data = await fetchJSON('https://api.github.com/repos/joomla/joomla-cms/releases/latest')
      const asset = data.assets.find(a => a.name.endsWith('.zip') && !a.name.includes('update'))
      return { version: data.tag_name, url: asset.browser_download_url }
    }
    case 'mediawiki': {
      const data = await fetchJSON('https://api.github.com/repos/wikimedia/mediawiki/releases/latest')
      const asset = data.assets.find(a => a.name.endsWith('.tar.gz'))
      return { version: data.tag_name, url: asset.browser_download_url }
    }
    case 'drupal': {
      const data = await fetchJSON('https://www.drupal.org/api-d7/node.json?type=project_release&field_project=3060&taxonomy_vocabulary_7=13028&sort=field_release_version_major,field_release_version_minor,field_release_version_patch&direction=DESC&limit=1')
      const node = data.list[0]
      const url = node.field_release_file.uri.replace('public://', 'https://ftp.drupal.org/files/projects/')
      return { version: node.field_release_version, url }
    }
  }
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'XAMPP-Panel/1.0' } }
    https.get(url, options, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = (u) => {
      https.get(u, { headers: { 'User-Agent': 'XAMPP-Panel/1.0' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) return get(res.headers.location)
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
      }).on('error', reject)
    }
    get(url)
  })
}

async function createDatabase(dbName) {
  const conn = await mysql.createConnection({ host: MYSQL_HOST, user: 'root', password: '' })
  await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.end()
}

router.post('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const { cms, dir, title, adminUser, adminPass, adminEmail, overwrite } = req.body || {}

  if (!cms || !dir || !title || !adminUser || !adminPass || !adminEmail) {
    sendEvent(res, { error: 'Missing required fields' })
    return res.end()
  }

  const targetDir = path.join(HTDOCS, dir)
  const dbName = dir.replace(/[^a-z0-9_]/gi, '_')

  try {
    // 1. Check dir doesn't exist
    if (fs.existsSync(targetDir)) {
      if (!overwrite) {
        sendEvent(res, { error: `Directory ${dir} already exists in htdocs`, code: 'DIR_EXISTS' })
        return res.end()
      }
      sendEvent(res, { step: 'prepare', message: `Directory ${dir} exists. Overwriting...` })
      fs.rmSync(targetDir, { recursive: true, force: true })
    }

    // 2. Fetch latest version info
    sendEvent(res, { step: 'fetch', message: `Fetching latest ${cms} version...` })
    const { version, url } = await getLatestVersion(cms.toLowerCase())
    sendEvent(res, { step: 'fetch', message: `Found ${cms} ${version}` })

    // 3. Download
    sendEvent(res, { step: 'download', message: `Downloading ${cms} ${version}...` })
    const tmpFile = `/tmp/${cms}-${version}${url.endsWith('.tar.gz') ? '.tar.gz' : '.zip'}`
    await downloadFile(url, tmpFile)
    sendEvent(res, { step: 'download', message: 'Download complete.' })

    // 4. Extract
    sendEvent(res, { step: 'extract', message: 'Extracting files...' })
    const tmpExtract = `/tmp/${cms}-extract-${Date.now()}`
    fs.mkdirSync(tmpExtract, { recursive: true })

    if (tmpFile.endsWith('.tar.gz')) {
      await tar.x({ file: tmpFile, cwd: tmpExtract })
    } else {
      const zip = new AdmZip(tmpFile)
      zip.extractAllTo(tmpExtract, true)
    }

    // Most archives have a single root folder — move its contents
    const extracted = fs.readdirSync(tmpExtract)
    const srcDir = extracted.length === 1 ? path.join(tmpExtract, extracted[0]) : tmpExtract
    fs.mkdirSync(targetDir, { recursive: true })
    execSync(`cp -r ${srcDir}/. ${targetDir}/`)
    sendEvent(res, { step: 'extract', message: 'Files extracted.' })

    // 5. Create database
    sendEvent(res, { step: 'database', message: `Creating database '${dbName}'...` })
    await createDatabase(dbName)
    sendEvent(res, { step: 'database', message: 'Database created.' })

    // 6. Configure & install silently
    sendEvent(res, { step: 'install', message: 'Running silent installation...' })

    switch (cms.toLowerCase()) {
      case 'wordpress':
        execSync(`wp config create --path=${targetDir} --dbname=${dbName} --dbuser=root --dbpass= --dbhost=${MYSQL_HOST} --allow-root`)
        execSync(`wp core install --path=${targetDir} --url=http://localhost/${dir} --title="${title}" --admin_user=${adminUser} --admin_password=${adminPass} --admin_email=${adminEmail} --skip-email --allow-root`)
        break

      case 'joomla':
        execSync(`php ${targetDir}/installation/joomla.php install \
          --site-name="${title}" \
          --admin-user="${adminUser}" \
          --admin-username="${adminUser}" \
          --admin-password="${adminPass}" \
          --admin-email="${adminEmail}" \
          --db-type=mysqli \
          --db-host=${MYSQL_HOST} \
          --db-user=root \
          --db-pass="" \
          --db-name=${dbName} \
          --db-prefix=jos_ \
          --no-interaction`)
        fs.rmSync(path.join(targetDir, 'installation'), { recursive: true, force: true })
        break

      case 'mediawiki': {
        execSync(`php ${targetDir}/maintenance/install.php \
          --dbtype=mysql \
          --dbserver=${MYSQL_HOST} \
          --dbuser=root \
          --dbpass="" \
          --dbname=${dbName} \
          --pass="${adminPass}" \
          "${title}" "${adminUser}"`)
        break
      }

      case 'drupal':
        execSync(`drush --root=${targetDir} site:install standard \
          --db-url=mysql://root:@${MYSQL_HOST}/${dbName} \
          --site-name="${title}" \
          --account-name=${adminUser} \
          --account-pass=${adminPass} \
          --account-mail=${adminEmail} \
          --yes`)
        break
    }

    sendEvent(res, { step: 'install', message: 'Installation complete.' })

    // 7. Cleanup tmp
    fs.rmSync(tmpFile, { force: true })
    fs.rmSync(tmpExtract, { recursive: true, force: true })

    sendEvent(res, {
      step: 'done',
      message: `${cms} installed successfully!`,
      url: `http://localhost/${dir}`,
      adminUrl: `http://localhost/${dir}/wp-admin` // generic; overridden in UI per CMS
    })

  } catch (err) {
    sendEvent(res, { error: err.message })
  }

  res.end()
})

module.exports = router
