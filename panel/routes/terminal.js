const express = require('express')
const path = require('path')
const { spawn } = require('child_process')
const crypto = require('crypto')

const router = express.Router()
const HTDOCS = process.env.HTDOCS_PATH || '/htdocs'
const sessions = new Map()

function safeResolve(base, p) {
  const resolved = path.resolve(base, `.${p || '/'}`)
  if (!resolved.startsWith(path.resolve(base))) return null
  return resolved
}

function pushOutput(session, text) {
  session.buffer.push(text)
  if (session.buffer.length > 1000) session.buffer.shift()
  for (const client of session.clients) {
    try { client.write(`data: ${JSON.stringify({ output: text })}\n\n`) } catch {}
  }
}

router.post('/start', (req, res) => {
  const { cwd = '/' } = req.body || {}
  const targetCwd = safeResolve(HTDOCS, cwd)
  if (!targetCwd) return res.status(400).json({ error: 'Invalid cwd path' })

  const id = crypto.randomUUID()
  // Non-interactive shell avoids "/bin/sh: can't access tty" warning while
  // still preserving session state (cd, env, etc.) across commands.
  const shell = spawn('/bin/sh', [], { cwd: targetCwd, env: process.env })
  const session = {
    id, shell, cwd, clients: new Set(), buffer: [],
  }
  sessions.set(id, session)

  shell.stdout.on('data', d => pushOutput(session, d.toString('utf8')))
  shell.stderr.on('data', d => pushOutput(session, d.toString('utf8')))
  shell.on('close', (code) => {
    pushOutput(session, `\n[process exited ${code}]\n`)
    for (const c of session.clients) { try { c.end() } catch {} }
    sessions.delete(id)
  })

  res.json({ session_id: id, cwd })
})

router.get('/stream/:id', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  session.clients.add(res)
  for (const line of session.buffer) {
    res.write(`data: ${JSON.stringify({ output: line })}\n\n`)
  }

  req.on('close', () => {
    session.clients.delete(res)
    try { res.end() } catch {}
  })
})

router.post('/input/:id', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const { data = '' } = req.body || {}
  try {
    session.shell.stdin.write(String(data))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/stop/:id', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) return res.json({ ok: true })
  try {
    session.shell.kill('SIGTERM')
  } catch {}
  sessions.delete(req.params.id)
  res.json({ ok: true })
})

module.exports = router
