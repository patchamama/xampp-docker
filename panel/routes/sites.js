const express = require('express')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const router = express.Router()
const HTDOCS = process.env.HTDOCS_PATH || '/htdocs'
const MYSQL_HOST = process.env.MYSQL_HOST || 'mariadb'

const EXCLUDE = new Set(['webalizer', 'dashboard', 'img', 'phpmyadmin', '_xampp-examples'])
const META_FILE = '.xampp-site.json'

function safeSitePath(siteName) {
  const abs = path.resolve(HTDOCS, siteName)
  const root = path.resolve(HTDOCS) + path.sep
  if (!(abs + path.sep).startsWith(root)) return null
  return abs
}

function detectCMS(dirPath) {
  const has = (f) => fs.existsSync(path.join(dirPath, f))
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8')) } catch { return null } }

  if (has('wp-config.php') || has('wp-login.php') || has('wp-includes/version.php')) return 'WordPress'
  // Joomla: configuration.php (installed) OR administrator + components dirs (any version)
  if (has('LocalSettings.php') || (has('includes/DefaultSettings.php')) || (has('api.php') && has('extensions') && has('maintenance'))) return 'MediaWiki'
  if (has('configuration.php') || (has('administrator') && has('components') && has('libraries'))) return 'Joomla'
  const composer = read('composer.json')
  if (composer?.require?.['drupal/core'] || composer?.require?.['drupal/drupal'] || has('core/lib/Drupal.php')) return 'Drupal'
  if (has('index.php') || has('index.html')) return 'PHP'
  return null
}

const CMS_ICONS = {
  WordPress: '🟦',
  MediaWiki: '🟩',
  Joomla: '🟧',
  Drupal: '🟪',
  PHP: '⬜',
}

function findFaviconPath(dirPath, siteName) {
  const candidates = ['favicon.ico', 'favicon.png', 'favicon.svg', 'favicon.jpg']
  for (const f of candidates) {
    if (fs.existsSync(path.join(dirPath, f))) return `/api/sites/asset/${siteName}/${f}`
  }
  return null
}

function readSiteMeta(siteDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(siteDir, META_FILE), 'utf8'))
  } catch {
    return null
  }
}

function extractDbNameFromFile(filePath, patterns = []) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8')
    for (const rx of patterns) {
      const m = txt.match(rx)
      if (m?.[1]) return m[1].trim()
    }
  } catch {}
  return null
}

function detectDbName(siteDir, cms, siteName, meta) {
  if (meta?.db?.name) return meta.db.name

  const fallback = siteName.replace(/[^a-z0-9_]/gi, '_')
  switch (cms) {
    case 'WordPress': {
      const db = extractDbNameFromFile(path.join(siteDir, 'wp-config.php'), [
        /define\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i
      ])
      return db || fallback
    }
    case 'Joomla': {
      const db = extractDbNameFromFile(path.join(siteDir, 'configuration.php'), [
        /public\s+\$db\s*=\s*['"]([^'"]+)['"]/i
      ])
      return db || fallback
    }
    case 'MediaWiki': {
      const db = extractDbNameFromFile(path.join(siteDir, 'LocalSettings.php'), [
        /\$wgDBname\s*=\s*['"]([^'"]+)['"]/i
      ])
      return db || fallback
    }
    case 'Drupal': {
      const db1 = extractDbNameFromFile(path.join(siteDir, 'sites/default/settings.php'), [
        /['"]database['"]\s*=>\s*['"]([^'"]+)['"]/i
      ])
      const db2 = extractDbNameFromFile(path.join(siteDir, 'sites/default/settings.local.php'), [
        /['"]database['"]\s*=>\s*['"]([^'"]+)['"]/i
      ])
      return db1 || db2 || fallback
    }
    default:
      return fallback
  }
}

function writeSiteMeta(siteDir, meta) {
  fs.writeFileSync(path.join(siteDir, META_FILE), JSON.stringify(meta, null, 2), 'utf8')
}

function getWpDynamicInfo(siteDir) {
  // Run each WP-CLI command independently so one failure doesn't wipe all results.
  // shell:true allows 2>/dev/null to suppress PHP deprecation notices from subprocesses.
  const run = (cmd) => {
    try { return execSync(cmd, { encoding: 'utf8', shell: true }).trim() } catch { return '' }
  }
  // Valid slugs only — filters out any leaked PHP notice lines
  const slugLines = (raw) => raw.split('\n').filter(l => /^[a-z0-9][a-z0-9._-]*$/.test(l.trim()))

  return {
    currentTheme: slugLines(run(`wp theme list --path=${siteDir} --status=active --field=name --allow-root 2>/dev/null`))[0] || null,
    activePlugins: slugLines(run(`wp plugin list --path=${siteDir} --status=active --field=name --allow-root 2>/dev/null`)),
    users: slugLines(run(`wp user list --path=${siteDir} --field=user_login --allow-root 2>/dev/null`)),
  }
}

router.get('/', (req, res) => {
  try {
    const entries = fs.readdirSync(HTDOCS, { withFileTypes: true })
    const sites = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (EXCLUDE.has(entry.name)) continue

      const fullPath = path.join(HTDOCS, entry.name)
      const cms = detectCMS(fullPath)
      if (!cms) continue
      const meta = readSiteMeta(fullPath)
      const dbName = detectDbName(fullPath, cms, entry.name, meta)
      const frontendUrl = `http://localhost/${entry.name}`
      const adminUrl = meta?.urls?.admin || (() => {
        switch (cms) {
          case 'WordPress': return `${frontendUrl}/wp-admin`
          case 'Joomla': return `${frontendUrl}/administrator`
          case 'MediaWiki': return `${frontendUrl}/index.php?title=Special:UserLogin`
          case 'Drupal': return `${frontendUrl}/user/login`
          default: return frontendUrl
        }
      })()

      sites.push({
        name: entry.name,
        cms,
        icon: CMS_ICONS[cms] || '⬜',
        url: frontendUrl,
        adminUrl,
        phpmyadminUrl: `http://localhost:8081/index.php?route=/database/structure&db=${dbName}`,
        favicon: findFaviconPath(fullPath, entry.name),
        hasMeta: !!meta
      })
    }

    res.json(sites)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:site/info', (req, res) => {
  try {
    const siteDir = safeSitePath(req.params.site)
    if (!siteDir || !fs.existsSync(siteDir)) return res.status(404).json({ error: 'Site not found' })
    const cms = detectCMS(siteDir) || 'PHP'
    const meta = readSiteMeta(siteDir) || {}
    const dbName = detectDbName(siteDir, cms, req.params.site, meta)
    const dynamic = cms === 'WordPress' ? getWpDynamicInfo(siteDir) : {}

    const frontendFallback = `http://localhost/${req.params.site}`
    const adminFallback = (() => {
      switch (cms) {
        case 'WordPress': return `${frontendFallback}/wp-admin`
        case 'Joomla': return `${frontendFallback}/administrator`
        case 'MediaWiki': return `${frontendFallback}/index.php?title=Special:UserLogin`
        case 'Drupal': return `${frontendFallback}/user/login`
        default: return frontendFallback
      }
    })()

    res.json({
      site: req.params.site,
      cms,
      urls: {
        frontend: meta.urls?.frontend || frontendFallback,
        admin: meta.urls?.admin || adminFallback,
        phpmyadmin: `http://localhost:8081/index.php?route=/database/structure&db=${dbName}`
      },
      db: { host: MYSQL_HOST, user: 'root', password: '', ...(meta.db || {}), name: dbName },
      admin: meta.admin || null,
      ...dynamic
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:site/users', (req, res) => {
  try {
    const siteDir = safeSitePath(req.params.site)
    if (!siteDir || !fs.existsSync(siteDir)) return res.status(404).json({ error: 'Site not found' })
    const cms = detectCMS(siteDir)
    if (cms !== 'WordPress') return res.status(400).json({ error: 'User management currently supported only for WordPress' })

    const { action, username, password, email, role } = req.body || {}
    if (!action || !username) return res.status(400).json({ error: 'Missing action or username' })

    if (action === 'change_password') {
      if (!password) return res.status(400).json({ error: 'Missing password' })
      execSync(`wp user update ${username} --user_pass='${String(password).replace(/'/g, "'\\''")}' --path=${siteDir} --allow-root`)
      return res.json({ ok: true, message: `Password updated for ${username}` })
    }

    if (action === 'add_user') {
      if (!password || !email) return res.status(400).json({ error: 'Missing password or email' })
      const wpRole = role || 'author'
      execSync(`wp user create ${username} ${email} --role=${wpRole} --user_pass='${String(password).replace(/'/g, "'\\''")}' --path=${siteDir} --allow-root`)
      return res.json({ ok: true, message: `User ${username} created` })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:site', (req, res) => {
  try {
    const siteDir = safeSitePath(req.params.site)
    if (!siteDir || !fs.existsSync(siteDir)) return res.status(404).json({ error: 'Site not found' })
    const dropDb = !!req.query.dropDb
    const meta = readSiteMeta(siteDir)
    const dbName = meta?.db?.name || req.params.site.replace(/[^a-z0-9_]/gi, '_')

    fs.rmSync(siteDir, { recursive: true, force: true })
    if (dropDb) {
      execSync(`mysql -h ${MYSQL_HOST} -u root -e "DROP DATABASE IF EXISTS \\\`${dbName}\\\`;"`)
    }
    res.json({ ok: true, message: 'Site deleted', dbDropped: dropDb, dbName })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve static assets from htdocs (favicon, og images, etc.)
router.get('/asset/:site/:file', (req, res) => {
  const siteDir = safeSitePath(req.params.site)
  if (!siteDir) return res.status(403).end()
  const file = path.join(siteDir, req.params.file)
  if (!file.startsWith(siteDir)) return res.status(403).end()
  res.sendFile(file, err => { if (err) res.status(404).end() })
})

router._writeSiteMeta = writeSiteMeta

module.exports = router
