const express = require('express')
const path = require('path')
const { exec } = require('child_process')

const router = express.Router()
const HTDOCS = process.env.HTDOCS_PATH || '/htdocs'

function safeResolve(base, p) {
  const resolved = path.resolve(base, `.${p || '/'}`)
  if (!resolved.startsWith(path.resolve(base))) return null
  return resolved
}

router.post('/exec', (req, res) => {
  const { command, cwd = '/' } = req.body || {}
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Missing command' })
  }

  const targetCwd = safeResolve(HTDOCS, cwd)
  if (!targetCwd) return res.status(400).json({ error: 'Invalid cwd path' })

  exec(command, { cwd: targetCwd, timeout: 20000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
    res.json({
      cwd,
      stdout: stdout || '',
      stderr: stderr || '',
      code: error ? (error.code ?? 1) : 0
    })
  })
})

module.exports = router
