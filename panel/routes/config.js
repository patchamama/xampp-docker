const express = require('express')
const fs = require('fs')
const path = require('path')
const Docker = require('dockerode')

const router = express.Router()
const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const CONFIG_FILES = {
  'php.ini': {
    path: '/app/config/php/php.ini',
    restartContainer: 'xampp-php',
  },
  'httpd.conf': {
    path: '/app/config/apache/httpd.conf',
    restartContainer: 'xampp-php',
  },
  'my.cnf': {
    path: '/app/config/mysql/my.cnf',
    restartContainer: 'xampp-mariadb',
  },
}

router.get('/:file', (req, res) => {
  const entry = CONFIG_FILES[req.params.file]
  if (!entry) return res.status(404).json({ error: 'Unknown config file' })

  try {
    const content = fs.readFileSync(entry.path, 'utf8')
    res.json({ file: req.params.file, content })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:file', async (req, res) => {
  const entry = CONFIG_FILES[req.params.file]
  if (!entry) return res.status(404).json({ error: 'Unknown config file' })

  const { content } = req.body
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content field required' })
  }

  try {
    fs.writeFileSync(entry.path, content, 'utf8')
    const container = docker.getContainer(entry.restartContainer)
    await container.restart()
    res.json({ ok: true, restarted: entry.restartContainer })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
