const express = require('express')
const Docker = require('dockerode')

const router = express.Router()
const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const LOG_CONTAINERS = {
  apache: 'xampp-php',
  mysql: 'xampp-mariadb',
  ftp: 'xampp-ftp',
  panel: 'xampp-panel',
}

function stripAnsiAndCtl(s) {
  return s
    // ANSI escape sequences
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // Other non-printable control chars except \n \r \t
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\uFFFF]/g, '')
}

// SSE — tail live logs from a container
router.get('/:service', (req, res) => {
  const containerName = LOG_CONTAINERS[req.params.service]
  if (!containerName) return res.status(404).json({ error: 'Unknown service' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const container = docker.getContainer(containerName)
  container.logs({ follow: true, stdout: true, stderr: true, tail: 50 }, (err, stream) => {
    if (err) {
      res.write(`data: Error: ${err.message}\n\n`)
      return res.end()
    }

    // Docker non-TTY logs are multiplexed with 8-byte headers.
    let buf = Buffer.alloc(0)
    stream.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      while (buf.length >= 8) {
        const payloadLen = buf.readUInt32BE(4)
        if (buf.length < 8 + payloadLen) break
        const payload = buf.slice(8, 8 + payloadLen).toString('utf8')
        buf = buf.slice(8 + payloadLen)

        const lines = payload.split('\n')
        for (const line of lines) {
          const clean = stripAnsiAndCtl(line).trim()
          if (clean) res.write(`data: ${clean}\n\n`)
        }
      }
    })

    stream.on('end', () => res.end())

    req.on('close', () => {
      try { stream.destroy() } catch {}
      res.end()
    })
  })
})

module.exports = router
