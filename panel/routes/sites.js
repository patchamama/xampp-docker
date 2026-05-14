const express = require('express')
const fs = require('fs')
const path = require('path')

const router = express.Router()
const HTDOCS = process.env.HTDOCS_PATH || '/htdocs'

const EXCLUDE = new Set(['webalizer', 'dashboard', 'img', 'phpmyadmin', '_xampp-examples'])

function detectCMS(dirPath) {
  const has = (f) => fs.existsSync(path.join(dirPath, f))
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8')) } catch { return null } }

  if (has('wp-config.php')) return 'WordPress'
  if (has('LocalSettings.php')) return 'MediaWiki'
  if (has('configuration.php') && has('libraries')) return 'Joomla'
  const composer = read('composer.json')
  if (composer?.require?.['drupal/core'] || composer?.require?.['drupal/drupal']) return 'Drupal'
  if (has('index.php') || has('index.html')) return 'PHP'
  return null
}

const CMS_ICONS = {
  WordPress: '🟦',
  MediaWiki: '🟩',
  Joomla:    '🟧',
  Drupal:    '🟪',
  PHP:       '⬜',
}

function findFaviconPath(dirPath, siteName) {
  const candidates = ['favicon.ico', 'favicon.png', 'favicon.svg', 'favicon.jpg']
  for (const f of candidates) {
    if (fs.existsSync(path.join(dirPath, f))) return `/site-asset/${siteName}/${f}`
  }
  return null
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

      sites.push({
        name:    entry.name,
        cms,
        icon:    CMS_ICONS[cms] || '⬜',
        url:     `http://localhost/${entry.name}`,
        favicon: findFaviconPath(fullPath, entry.name),
      })
    }

    res.json(sites)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve static assets from htdocs (favicon, og images, etc.)
router.get('/asset/:site/:file', (req, res) => {
  const file = path.join(HTDOCS, req.params.site, req.params.file)
  if (!file.startsWith(HTDOCS)) return res.status(403).end()
  res.sendFile(file, err => { if (err) res.status(404).end() })
})

module.exports = router
