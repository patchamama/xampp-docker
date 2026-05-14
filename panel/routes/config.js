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

const ENV_FILE = '/app/.env'
const ENV_FILE_FALLBACK = '/app/config/.env'
const PHP_OPTIONS = [
  { key: 'php:8.4-apache', label: 'PHP 8.4 (Latest)' },
  { key: 'php:8.3-apache', label: 'PHP 8.3' },
  { key: 'php:8.2-apache', label: 'PHP 8.2 (Previous)' },
]

function resolveEnvFile() {
  try {
    const st = fs.statSync(ENV_FILE)
    if (st.isFile()) return ENV_FILE
  } catch {}
  try {
    const st2 = fs.statSync(ENV_FILE_FALLBACK)
    if (st2.isFile()) return ENV_FILE_FALLBACK
  } catch {}
  return ENV_FILE_FALLBACK
}

function readEnv() {
  const file = resolveEnvFile()
  try { return fs.readFileSync(file, 'utf8') } catch { return '' }
}

function writeEnv(content) {
  const file = resolveEnvFile()
  fs.writeFileSync(file, content, 'utf8')
}

async function getPhpRuntimeVersion() {
  try {
    const container = docker.getContainer('xampp-php')
    const execObj = await container.exec({
      Cmd: ['php', '-r', 'echo PHP_VERSION;'],
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await execObj.start({ hijack: true, stdin: false })
    let out = ''
    await new Promise((resolve, reject) => {
      container.modem.demuxStream(stream, { write: c => { out += c.toString('utf8') } }, { write: () => {} })
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    return out.trim() || null
  } catch {
    return null
  }
}

router.get('/php-runtime/options', async (req, res) => {
  const env = readEnv()
  const m = env.match(/^PHP_BASE_IMAGE=(.+)$/m)
  const current = m?.[1]?.trim() || 'php:8.4-apache'
  const runtime_php_version = await getPhpRuntimeVersion()
  res.json({ current, runtime_php_version, options: PHP_OPTIONS })
})

router.put('/php-runtime/options', (req, res) => {
  try {
    const { php_base_image } = req.body || {}
    if (!php_base_image || !PHP_OPTIONS.find(o => o.key === php_base_image)) {
      return res.status(400).json({ error: 'Invalid php_base_image option' })
    }
    const env = readEnv()
    let next = env
    if (/^PHP_BASE_IMAGE=.+$/m.test(next)) {
      next = next.replace(/^PHP_BASE_IMAGE=.+$/m, `PHP_BASE_IMAGE=${php_base_image}`)
    } else {
      next += `${next.endsWith('\n') || next.length === 0 ? '' : '\n'}PHP_BASE_IMAGE=${php_base_image}\n`
    }
    writeEnv(next)
    res.json({
      ok: true,
      php_base_image,
      message: 'PHP version preference saved. Rebuild php-apache and control-panel to apply.',
      apply_commands: [
        'docker compose build --no-cache php-apache control-panel',
        'docker compose up -d --force-recreate php-apache control-panel'
      ]
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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
