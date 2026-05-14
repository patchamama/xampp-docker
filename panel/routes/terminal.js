const express = require('express')
const crypto = require('crypto')
const Docker = require('dockerode')

const router = express.Router()
const docker = new Docker({ socketPath: '/var/run/docker.sock' })
const PHP_CONTAINER = process.env.PHP_CONTAINER || 'xampp-php'
const sessions = new Map()

function pushOutput(session, text) {
  session.buffer.push(text)
  if (session.buffer.length > 2000) session.buffer.shift()
  for (const client of session.clients) {
    try { client.write(`data: ${JSON.stringify({ output: text })}\n\n`) } catch {}
  }
}

router.post('/start', async (req, res) => {
  const { cwd = '/' } = req.body || {}

  try {
    const container = docker.getContainer(PHP_CONTAINER)

    const execObj = await container.exec({
      Cmd: ['bash', '-l'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      WorkingDir: `/var/www/html${cwd === '/' ? '' : cwd}`,
      Env: ['TERM=xterm-256color', 'PS1=\\u@xampp:\\w\\$ '],
    })

    const stream = await execObj.start({ hijack: true, stdin: true, Tty: true })

    const id = crypto.randomUUID()
    const session = { id, stream, execObj, cwd, clients: new Set(), buffer: [], alive: true }
    sessions.set(id, session)

    stream.on('data', (chunk) => {
      // PTY stream is raw — strip ANSI only for display safety, keep content
      const text = chunk.toString('utf8')
      pushOutput(session, text)
    })

    stream.on('end', () => {
      session.alive = false
      pushOutput(session, '\n[session ended]\n')
      for (const c of session.clients) { try { c.end() } catch {} }
      sessions.delete(id)
    })

    stream.on('error', () => {
      session.alive = false
      sessions.delete(id)
    })

    res.json({ session_id: id, cwd })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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
  if (!session || !session.alive) return res.status(404).json({ error: 'Session not found' })
  const { data = '' } = req.body || {}
  try {
    session.stream.write(String(data))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/resize/:id', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) return res.json({ ok: true })
  const { cols = 80, rows = 24 } = req.body || {}
  session.execObj.resize({ w: parseInt(cols), h: parseInt(rows) }).catch(() => {})
  res.json({ ok: true })
})

router.post('/stop/:id', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) return res.json({ ok: true })
  try { session.stream.write('\x04') } catch {}
  try { session.stream.destroy() } catch {}
  sessions.delete(req.params.id)
  res.json({ ok: true })
})

module.exports = router
