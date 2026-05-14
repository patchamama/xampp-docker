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

    stream.on('data', (chunk) => {
      const lines = chunk.toString('utf8').split('\n')
      for (const line of lines) {
        const clean = line.replace(/^[\x00-\x08].*?[\x00-\xFF]{4}/, '').trim()
        if (clean) res.write(`data: ${clean}\n\n`)
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
