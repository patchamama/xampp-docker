const express = require('express')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const router = express.Router()
const HTDOCS = process.env.HTDOCS_PATH || '/htdocs'
const BACKUPS = process.env.BACKUPS_PATH || '/backups'
const MYSQL_HOST = process.env.MYSQL_HOST || 'mariadb'

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS)) fs.mkdirSync(BACKUPS, { recursive: true })
}

function safeSitePath(siteName) {
  const abs = path.resolve(HTDOCS, siteName)
  const root = path.resolve(HTDOCS) + path.sep
  if (!(abs + path.sep).startsWith(root)) return null
  return abs
}

function safeBackupPath(filename) {
  const abs = path.resolve(BACKUPS, filename)
  const root = path.resolve(BACKUPS) + path.sep
  if (!(abs + path.sep).startsWith(root)) return null
  return abs
}

function parseBackupName(filename) {
  const m = filename.match(/^(.+)__(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.tar\.gz$/)
  if (!m) return null
  const iso = m[2].replace('_', 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2')
  return { site: m[1], timestamp: iso }
}

function listBackupFiles(siteFilter) {
  ensureBackupsDir()
  return fs.readdirSync(BACKUPS)
    .filter(f => f.endsWith('.tar.gz') && (!siteFilter || f.startsWith(`${siteFilter}__`)))
    .sort().reverse()
    .map(f => {
      const parsed = parseBackupName(f)
      const stat = fs.statSync(path.join(BACKUPS, f))
      return { filename: f, site: parsed?.site || f, createdAt: parsed?.timestamp || null, size: stat.size }
    })
}

// GET /api/backups — list all
router.get('/', (req, res) => {
  try { res.json(listBackupFiles()) } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/backups/download/:filename — MUST be before /:site
router.get('/download/:filename', (req, res) => {
  const backupFile = safeBackupPath(req.params.filename)
  if (!backupFile || !fs.existsSync(backupFile)) return res.status(404).end()
  res.download(backupFile, req.params.filename)
})

// POST /api/backups/restore/:filename — MUST be before /:site
router.post('/restore/:filename', (req, res) => {
  const backupFile = safeBackupPath(req.params.filename)
  if (!backupFile || !fs.existsSync(backupFile)) return res.status(404).json({ error: 'Backup not found' })

  try {
    const tmpDir = `/tmp/restore_${Date.now()}`
    fs.mkdirSync(tmpDir, { recursive: true })
    execSync(`tar -xzf ${backupFile} -C ${tmpDir}`, { stdio: 'pipe' })

    const manifestPath = path.join(tmpDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return res.status(400).json({ error: 'Invalid backup: missing manifest' })
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const siteDir = safeSitePath(manifest.site)
    if (!siteDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return res.status(400).json({ error: 'Invalid site name in manifest' })
    }

    if (fs.existsSync(`${tmpDir}/files`)) {
      if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true })
      execSync(`cp -r ${tmpDir}/files ${siteDir}`, { stdio: 'pipe' })
    }

    let dbRestored = false
    if (manifest.dbIncluded && fs.existsSync(`${tmpDir}/db.sql`)) {
      try {
        execSync(`mysql -h ${MYSQL_HOST} -u root -e "CREATE DATABASE IF NOT EXISTS \\\`${manifest.dbName}\\\`;"`, { stdio: 'pipe' })
        execSync(`mysql -h ${MYSQL_HOST} -u root ${manifest.dbName} < ${tmpDir}/db.sql`, { stdio: 'pipe' })
        dbRestored = true
      } catch {}
    }

    fs.rmSync(tmpDir, { recursive: true, force: true })
    res.json({ ok: true, site: manifest.site, dbRestored })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/backups/:site — list backups for one site
router.get('/:site', (req, res) => {
  try { res.json(listBackupFiles(req.params.site)) } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/backups/:site — create backup
router.post('/:site', (req, res) => {
  const siteDir = safeSitePath(req.params.site)
  if (!siteDir || !fs.existsSync(siteDir)) return res.status(404).json({ error: 'Site not found' })

  try {
    ensureBackupsDir()

    const now = new Date()
    const ts = now.toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19)
    const filename = `${req.params.site}__${ts}.tar.gz`
    const backupFile = path.join(BACKUPS, filename)
    const tmpDir = `/tmp/backup_${req.params.site}_${Date.now()}`
    fs.mkdirSync(tmpDir, { recursive: true })

    // Detect DB name
    let dbName = null
    const metaPath = path.join(siteDir, '.xampp-site.json')
    if (fs.existsSync(metaPath)) {
      try { dbName = JSON.parse(fs.readFileSync(metaPath, 'utf8'))?.db?.name } catch {}
    }
    if (!dbName) {
      const wpCfg = path.join(siteDir, 'wp-config.php')
      if (fs.existsSync(wpCfg)) {
        const txt = fs.readFileSync(wpCfg, 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
        const m = txt.match(/define\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i)
        if (m) dbName = m[1]
      }
    }
    if (!dbName) dbName = req.params.site.replace(/[^a-z0-9_]/gi, '_')

    let dbDumped = false
    try {
      execSync(`mysqldump -h ${MYSQL_HOST} -u root --single-transaction --routines --triggers ${dbName} > ${tmpDir}/db.sql`, { stdio: 'pipe' })
      dbDumped = true
    } catch {}

    execSync(`cp -r ${siteDir} ${tmpDir}/files`, { stdio: 'pipe' })
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({
      site: req.params.site, createdAt: now.toISOString(), dbName, dbIncluded: dbDumped
    }, null, 2))
    execSync(`tar -czf ${backupFile} -C ${tmpDir} .`, { stdio: 'pipe' })
    fs.rmSync(tmpDir, { recursive: true, force: true })

    const stat = fs.statSync(backupFile)
    res.json({ ok: true, filename, size: stat.size, dbIncluded: dbDumped })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/backups/:filename — delete backup
router.delete('/:filename', (req, res) => {
  const backupFile = safeBackupPath(req.params.filename)
  if (!backupFile || !fs.existsSync(backupFile)) return res.status(404).json({ error: 'Backup not found' })
  try {
    fs.unlinkSync(backupFile)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
