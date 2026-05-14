const express = require('express')
const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync, exec } = require('child_process')
const Docker = require('dockerode')
const AdmZip = require('adm-zip')
const tar = require('tar')
const mysql = require('mysql2/promise')

const router = express.Router()
const docker = new Docker({ socketPath: '/var/run/docker.sock' })
const HTDOCS = process.env.HTDOCS_PATH || '/htdocs'
const MYSQL_HOST = process.env.MYSQL_HOST || 'mariadb'
const PHP_CONTAINER = process.env.PHP_CONTAINER || 'xampp-php'
const META_FILE = '.xampp-site.json'

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
      const versions = await getVersions('joomla')
      if (!versions.length) throw new Error('Could not find a compatible Joomla release asset')
      return { version: versions[0].version, url: versions[0].url }
    }
    case 'mediawiki': {
      const versions = await getVersions('mediawiki')
      if (!versions.length) throw new Error('Could not resolve latest MediaWiki version')
      return { version: versions[0].version, url: versions[0].url }
    }
    case 'drupal': {
      const xml = await fetchText('https://updates.drupal.org/release-history/drupal/current')
      const m = xml.match(/<version>(\d+\.\d+\.\d+)<\/version>[\s\S]*?<download_link>(https:\/\/[^<]+\.tar\.gz)<\/download_link>/)
      if (!m) throw new Error('Could not resolve latest Drupal release')
      return { version: m[1], url: m[2] }
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
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with HTTP ${res.statusCode} for ${u}`))
        }
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
      }).on('error', reject)
    }
    get(url)
  })
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'XAMPP-Panel/1.0' } }
    https.get(url, options, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

async function getPhpContainerVersion() {
  try {
    const container = docker.getContainer(PHP_CONTAINER)
    const execObj = await container.exec({
      Cmd: ['php', '-r', 'echo PHP_VERSION;'],
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await execObj.start({ hijack: true, stdin: false })
    let out = ''
    await new Promise((resolve, reject) => {
      container.modem.demuxStream(stream, { write: c => { out += c.toString('utf8') } }, { write: () => {} })
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    const version = out.trim()
    return version.match(/^\d+\.\d+\.\d+$/) ? version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

async function getVersions(cms) {
  const phpVersion = await getPhpContainerVersion()

  switch (cms) {
    case 'wordpress': {
      const data = await fetchJSON('https://api.wordpress.org/core/version-check/1.7/')
      const offers = Array.isArray(data?.offers) ? data.offers : []
      return offers.slice(0, 15).map((o, i) => ({
        version: o.version,
        url: o.download,
        channel: i === 0 ? 'stable' : 'legacy'
      }))
    }
    case 'joomla': {
      const releases = await fetchJSON('https://api.github.com/repos/joomla/joomla-cms/releases?per_page=30')
      const supportsJoomla6 = versionCompare(phpVersion, '8.3.0') >= 0
      const filtered = (Array.isArray(releases) ? releases : [])
        .filter(r => !r.prerelease && !r.draft)
        .reduce((acc, r) => {
          const version = String(r.tag_name).replace(/^v/i, '')
          const major = parseInt(version.split('.')[0] || '0', 10)
          if (major >= 6 && !supportsJoomla6) return acc
          const asset = (r.assets || []).find(a => a?.name?.endsWith('.zip') && !a.name.includes('update'))
          if (asset) acc.push({ version, url: asset.browser_download_url })
          return acc
        }, [])
      return filtered.map((v, i) => ({
        ...v,
        channel: i === 0 ? 'stable' : 'legacy'
      }))
    }
    case 'mediawiki': {
      const html = await fetchText('https://www.mediawiki.org/wiki/Download/en')
      const matches = [...html.matchAll(/https:\/\/releases\.wikimedia\.org\/mediawiki\/(\d+\.\d+)\/mediawiki-(\d+\.\d+\.\d+)\.tar\.gz/g)]
      const seen = new Set()
      const versions = []
      for (const m of matches) {
        const majorMinor = m[1]
        const v = m[2]
        if (seen.has(v)) continue
        seen.add(v)
        versions.push({ majorMinor, version: v })
      }
      return versions.slice(0, 10).map((entry, i) => ({
        version: entry.version,
        url: `https://releases.wikimedia.org/mediawiki/${entry.majorMinor}/mediawiki-${entry.version}.tar.gz`,
        channel: i === 0 ? 'stable' : (i === 2 ? 'lts' : 'legacy')
      }))
    }
    case 'drupal': {
      // Official Drupal release feed — has real download URLs unlike GitHub releases
      const xml = await fetchText('https://updates.drupal.org/release-history/drupal/current')
      const supportsDrupal11 = versionCompare(phpVersion, '8.3.0') >= 0
      const supportsDrupal10 = versionCompare(phpVersion, '8.1.0') >= 0
      const releaseBlocks = [...xml.matchAll(/<release>([\s\S]*?)<\/release>/g)]
      const filtered = []
      for (const block of releaseBlocks) {
        const content = block[1]
        const version = (content.match(/<version>([^<]+)<\/version>/) || [])[1]
        const url = (content.match(/<download_link>([^<]+\.tar\.gz)<\/download_link>/) || [])[1]
        const status = (content.match(/<status>([^<]+)<\/status>/) || [])[1]
        if (!version || !url || status !== 'published') continue
        const major = parseInt(version.split('.')[0] || '0', 10)
        if (major >= 11 && !supportsDrupal11) continue
        if (major >= 10 && !supportsDrupal10) continue
        filtered.push({ version, url })
        if (filtered.length >= 10) break
      }
      return filtered.map((v, i) => ({
        ...v,
        channel: i === 0 ? 'stable' : 'legacy'
      }))
    }
    default:
      return []
  }
}

function versionCompare(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

async function createDatabase(dbName) {
  const conn = await mysql.createConnection({ host: MYSQL_HOST, user: 'root', password: '' })
  await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.end()
}

async function execInPhpContainer(cmd) {
  const container = docker.getContainer(PHP_CONTAINER)
  const execObj = await container.exec({
    Cmd: ['sh', '-lc', cmd],
    AttachStdout: true,
    AttachStderr: true,
  })

  const stream = await execObj.start({ hijack: true, stdin: false })
  let stdout = ''
  let stderr = ''

  await new Promise((resolve, reject) => {
    container.modem.demuxStream(stream, {
      write: (chunk) => { stdout += chunk.toString('utf8') }
    }, {
      write: (chunk) => { stderr += chunk.toString('utf8') }
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  const inspect = await execObj.inspect()
  if (inspect.ExitCode !== 0) {
    const err = new Error(`Command failed in ${PHP_CONTAINER}: ${cmd}`)
    err.stdout = stdout
    err.stderr = stderr
    err.exitCode = inspect.ExitCode
    throw err
  }
  return { stdout, stderr }
}

function getAdminUrl(cms, dir) {
  switch ((cms || '').toLowerCase()) {
    case 'wordpress': return `http://localhost/${dir}/wp-admin`
    case 'joomla': return `http://localhost/${dir}/administrator`
    case 'mediawiki': return `http://localhost/${dir}/index.php?title=Special:UserLogin`
    case 'drupal': return `http://localhost/${dir}/user/login`
    default: return `http://localhost/${dir}`
  }
}

router.get('/versions', async (req, res) => {
  try {
    const cms = String(req.query.cms || '').toLowerCase()
    if (!cms) return res.status(400).json({ error: 'Missing cms' })
    const versions = await getVersions(cms)
    res.json({ cms, versions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const { cms, dir, title, adminUser, adminPass, adminEmail, overwrite, version, customUrl } = req.body || {}

  if (!cms || !dir || !title || !adminUser || !adminPass || !adminEmail) {
    sendEvent(res, { error: 'Missing required fields' })
    return res.end()
  }

  const targetDir = path.join(HTDOCS, dir)
  const phpTargetDir = `/var/www/html/${dir}`
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
    let resolved
    if (customUrl) {
      if (!/^https?:\/\//i.test(customUrl)) {
        throw new Error('Custom URL must start with http:// or https://')
      }
      const guessedVersion = version || 'custom'
      resolved = { version: guessedVersion, url: customUrl }
    } else if (version) {
      const versions = await getVersions(cms.toLowerCase())
      resolved = versions.find(v => v.version === version)
      if (!resolved) throw new Error(`Selected version ${version} is not available for ${cms}`)
    } else {
      const { version: latestVersion, url: latestUrl } = await getLatestVersion(cms.toLowerCase())
      resolved = { version: latestVersion, url: latestUrl }
    }
    const { version: pickedVersion, url } = resolved
    sendEvent(res, { step: 'fetch', message: `Found ${cms} ${pickedVersion}` })

    // 3. Download
    sendEvent(res, { step: 'download', message: `Downloading ${cms} ${pickedVersion}...` })
    const tmpFile = `/tmp/${cms}-${pickedVersion}${url.endsWith('.tar.gz') ? '.tar.gz' : '.zip'}`
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
        await execInPhpContainer(`wp config create --path=${phpTargetDir} --dbname=${dbName} --dbuser=root --dbpass= --dbhost=${MYSQL_HOST} --allow-root`)
        await execInPhpContainer(`wp core install --path=${phpTargetDir} --url=http://localhost/${dir} --title="${title}" --admin_user=${adminUser} --admin_password=${adminPass} --admin_email=${adminEmail} --skip-email --allow-root`)
        break

      case 'joomla':
        await execInPhpContainer(`php ${phpTargetDir}/installation/joomla.php install \
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
        await execInPhpContainer(`php ${phpTargetDir}/maintenance/install.php \
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
        // Install drush into the project via composer (runs in xampp-php which has PHP 8.4)
        sendEvent(res, { step: 'install', message: 'Installing drush into project...' })
        await execInPhpContainer(`cd ${phpTargetDir} && composer require drush/drush --no-interaction 2>&1`)
        await execInPhpContainer(`cd ${phpTargetDir} && vendor/bin/drush site:install standard \
          --db-url=mysql://root:@${MYSQL_HOST}/${dbName} \
          --site-name="${title}" \
          --account-name=${adminUser} \
          --account-pass=${adminPass} \
          --account-mail=${adminEmail} \
          --yes`)
        break
    }

    sendEvent(res, { step: 'install', message: 'Installation complete.' })

    const frontendUrl = `http://localhost/${dir}`
    const adminUrl = getAdminUrl(cms, dir)
    const summary = {
      site: dir,
      cms: cms.toLowerCase(),
      urls: {
        frontend: frontendUrl,
        admin: adminUrl,
        phpmyadmin: `http://localhost:8081/index.php?route=/database/structure&db=${encodeURIComponent(dbName)}`
      },
      db: {
        host: MYSQL_HOST,
        name: dbName,
        user: 'root',
        password: ''
      },
      admin: {
        username: adminUser,
        password: adminPass,
        email: adminEmail
      }
    }
    fs.writeFileSync(path.join(targetDir, META_FILE), JSON.stringify(summary, null, 2), 'utf8')
    sendEvent(res, { step: 'summary', message: 'Installation summary ready.', summary })

    // 7. Cleanup tmp
    fs.rmSync(tmpFile, { force: true })
    fs.rmSync(tmpExtract, { recursive: true, force: true })

    sendEvent(res, {
      step: 'done',
      message: `${cms} installed successfully!`,
      url: frontendUrl,
      adminUrl
    })

  } catch (err) {
    const stderr = err?.stderr ? String(err.stderr) : ''
    const details = stderr.trim()
    sendEvent(res, { error: details ? `${err.message}\n${details}` : err.message })
  }

  res.end()
})

module.exports = router
