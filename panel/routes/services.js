const express = require('express')
const Docker = require('dockerode')

const router = express.Router()
const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const SERVICE_CONTAINERS = {
  apache: 'xampp-php',
  mysql: 'xampp-mariadb',
  proftpd: 'xampp-ftp',
}

router.get('/', async (req, res) => {
  try {
    const statuses = {}
    for (const [name, containerName] of Object.entries(SERVICE_CONTAINERS)) {
      try {
        const container = docker.getContainer(containerName)
        const info = await container.inspect()
        statuses[name] = {
          running: info.State.Running,
          status: info.State.Status,
          startedAt: info.State.StartedAt,
        }
      } catch {
        statuses[name] = { running: false, status: 'not found' }
      }
    }
    res.json(statuses)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:service/:action', async (req, res) => {
  const { service, action } = req.params
  const containerName = SERVICE_CONTAINERS[service]

  if (!containerName) {
    return res.status(404).json({ error: `Unknown service: ${service}` })
  }

  const allowed = ['start', 'stop', 'restart']
  if (!allowed.includes(action)) {
    return res.status(400).json({ error: `Unknown action: ${action}` })
  }

  try {
    const container = docker.getContainer(containerName)
    await container[action]()
    res.json({ ok: true, service, action })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
