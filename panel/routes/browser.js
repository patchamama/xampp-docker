const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const AdmZip = require('adm-zip')
const tar = require('tar')

const router = express.Router()
const HTDOCS = process.env.HTDOCS_PATH || '/htdocs'

const EDITABLE = new Set([
  'php', 'html', 'htm', 'css', 'js', 'json', 'xml', 'txt',
  'md', 'ini', 'conf', 'cnf', 'sh', 'py', 'ts', 'sql', 'yaml', 'yml', 'env',
  'htaccess', 'htpasswd', 'gitignore', 'gitattributes', 'editorconfig',
  'npmrc', 'babelrc', 'eslintrc', 'prettierrc', 'stylelintrc',
  'lock', 'log', 'csv', 'tsv', 'toml', 'neon', 'twig', 'blade',
])

const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'])

// Binary/executable types — never editable or viewable
const BINARY = new Set([
  'exe', 'bin', 'so', 'dylib', 'dll', 'o', 'a', 'out',
  'zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'mp3', 'mp4', 'avi', 'mov', 'mkv', 'flac', 'ogg', 'wav',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'swf', 'class', 'pyc', 'pyo',
])

const RUNNABLE = {
  php:  { lang: 'php',    how: 'url' },
  html: { lang: null,     how: 'url' },
  htm:  { lang: null,     how: 'url' },
  py:   { lang: 'python', how: 'exec' },
  js:   { lang: 'node',   how: 'exec' },
}

function safePath(rel) {
  const abs = path.resolve(path.join(HTDOCS, rel))
  if (!abs.startsWith(path.resolve(HTDOCS))) throw new Error('Access denied')
  return abs
}

function extOf(name) {
  const parts = name.split('.')
  // dotfiles like .htaccess → parts = ['', 'htaccess'] → pop = 'htaccess'
  // files with no dot like 'Makefile' → parts = ['Makefile'] → pop = 'Makefile' (same as name)
  return parts.pop().toLowerCase()
}

function fileType(name, ext) {
  if (BINARY.has(ext))  return 'binary'
  if (IMAGES.has(ext))  return 'image'
  if (EDITABLE.has(ext)) return 'text'
  // Dotfiles (e.g. .htaccess) and unknown extensions — try as text
  // A file whose ext === its full name has no dot extension (e.g. Makefile)
  const noExt = (ext === name.toLowerCase())
  if (noExt) return 'text'
  // Unknown extension — treat as text (worst case it shows garbage, but never blocks editing)
  return 'text'
}

// GET /api/browser?path=/foo  — list directory
router.get('/', (req, res) => {
  const rel = (req.query.path || '/').replace(/\.\./g, '')
  let abs
  try { abs = safePath(rel) } catch { return res.status(403).json({ error: 'Access denied' }) }

  try {
    const stat = fs.statSync(abs)
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' })

    const entries = fs.readdirSync(abs, { withFileTypes: true }).map(e => {
      const ext  = e.isFile() ? extOf(e.name) : null
      const type = ext ? fileType(e.name, ext) : null
      const run  = ext ? RUNNABLE[ext] : null
      return {
        name:     e.name,
        type:     e.isDirectory() ? 'dir' : 'file',
        ext,
        fileType: type,
        editable: type === 'text',
        image:    type === 'image',
        runnable: !!run,
        runHow:   run?.how || null,
        runLang:  run?.lang || null,
        size:     e.isFile() ? fs.statSync(path.join(abs, e.name)).size : null,
      }
    }).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    res.json({ path: rel, entries })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/browser/read?path=/foo/bar.php  — read file content
router.get('/read', (req, res) => {
  const rel = (req.query.path || '').replace(/\.\./g, '')
  let abs
  try { abs = safePath(rel) } catch { return res.status(403).json({ error: 'Access denied' }) }

  const name = path.basename(abs)
  const ext  = extOf(name)
  const type = fileType(name, ext)

  if (type !== 'text') return res.status(400).json({ error: 'File type not editable' })

  try {
    const content = fs.readFileSync(abs, 'utf8')
    res.json({ path: rel, content, ext })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/browser/write  — save file content
router.put('/write', (req, res) => {
  const { path: rel, content } = req.body
  if (!rel || typeof content !== 'string') return res.status(400).json({ error: 'path and content required' })
  const safeRel = rel.replace(/\.\./g, '')
  let abs
  try { abs = safePath(safeRel) } catch { return res.status(403).json({ error: 'Access denied' }) }

  const name = path.basename(abs)
  const ext  = extOf(name)
  const type = fileType(name, ext)

  if (type !== 'text') return res.status(400).json({ error: 'File type not editable' })

  try {
    fs.writeFileSync(abs, content, 'utf8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/browser/url?path=/foo/bar.php  — resolve public URL for a file
router.get('/url', (req, res) => {
  const rel = (req.query.path || '').replace(/\.\./g, '')
  res.json({ url: `http://localhost${rel}` })
})

// DELETE /api/browser/delete  — delete a file
router.delete('/delete', (req, res) => {
  const { path: rel } = req.body
  if (!rel) return res.status(400).json({ error: 'path required' })
  const safeRel = rel.replace(/\.\./g, '')
  let abs
  try { abs = safePath(safeRel) } catch { return res.status(403).json({ error: 'Access denied' }) }

  try {
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot delete directories' })
    fs.unlinkSync(abs)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/browser/rename  — rename a file
router.patch('/rename', (req, res) => {
  const { path: rel, name } = req.body
  if (!rel || !name) return res.status(400).json({ error: 'path and name required' })
  if (name.includes('/') || name.includes('\\') || name.includes('..'))
    return res.status(400).json({ error: 'Invalid name' })

  const safeRel = rel.replace(/\.\./g, '')
  let abs
  try { abs = safePath(safeRel) } catch { return res.status(403).json({ error: 'Access denied' }) }

  const newAbs = path.join(path.dirname(abs), name)
  if (!newAbs.startsWith(path.resolve(HTDOCS))) return res.status(403).json({ error: 'Access denied' })

  try {
    fs.renameSync(abs, newAbs)
    const newRel = path.join(path.dirname(safeRel), name)
    res.json({ ok: true, path: newRel })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/browser/image?path=/foo/bar.png  — serve image file
router.get('/image', (req, res) => {
  const rel = (req.query.path || '').replace(/\.\./g, '')
  let abs
  try { abs = safePath(rel) } catch { return res.status(403).json({ error: 'Access denied' }) }

  const ext = extOf(path.basename(abs))
  if (!IMAGES.has(ext)) return res.status(400).json({ error: 'Not an image' })

  const mime = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    ico: 'image/x-icon', bmp: 'image/bmp', avif: 'image/avif',
  }

  try {
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream')
    fs.createReadStream(abs).pipe(res)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/browser/upload?path=/dir — upload multiple files into directory
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const rel = (req.query.path || '/').replace(/\.\./g, '')
    let abs
    try { abs = safePath(rel) } catch { return cb(new Error('Access denied')) }
    if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true })
    cb(null, abs)
  },
  filename: (_req, file, cb) => cb(null, file.originalname),
})
const upload = multer({ storage })

router.post('/upload', upload.array('files'), (req, res) => {
  try {
    res.json({ ok: true, uploaded: req.files.map(f => f.originalname) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/browser/extract?path=/dir/archive.zip — extract zip or tar in same directory
router.post('/extract', (req, res) => {
  const rel = (req.query.path || '').replace(/\.\./g, '')
  let abs
  try { abs = safePath(rel) } catch { return res.status(403).json({ error: 'Access denied' }) }
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found' })

  const dir = path.dirname(abs)
  const name = path.basename(abs).toLowerCase()

  try {
    if (name.endsWith('.zip')) {
      const zip = new AdmZip(abs)
      zip.extractAllTo(dir, true)
    } else if (name.endsWith('.tar.gz') || name.endsWith('.tgz') || name.endsWith('.tar')) {
      tar.x({ file: abs, cwd: dir, sync: true })
    } else {
      return res.status(400).json({ error: 'Unsupported archive format' })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
