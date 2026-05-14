const express = require('express')
const Docker = require('dockerode')
const os = require('os')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const router = express.Router()
const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const LANGS = {
  php:    { ext: 'php',    bin: 'php',     container: 'xampp-php' },
  python: { ext: 'py',     bin: 'python3', container: 'xampp-php' },
  node:   { ext: 'js',     bin: 'node',    container: 'xampp-php' },
}

async function runCode(containerName, bin, code, ext) {
  const id   = crypto.randomBytes(8).toString('hex')
  const file = `/tmp/xampp_run_${id}.${ext}`

  // Write code into container via exec + shell heredoc
  const container = docker.getContainer(containerName)

  // Step 1: write file
  const writeExec = await container.exec({
    Cmd: ['sh', '-c', `cat > ${file}`],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
  })
  const writeStream = await writeExec.start({ hijack: true, stdin: true })
  writeStream.write(code)
  writeStream.end()
  await new Promise(r => writeStream.on('finish', r))

  // Small delay to ensure file is flushed
  await new Promise(r => setTimeout(r, 100))

  // Step 2: run file
  const runExec = await container.exec({
    Cmd: [bin, file],
    AttachStdout: true,
    AttachStderr: true,
  })
  const runStream = await runExec.start({ hijack: true, stdin: false })

  return new Promise((resolve, reject) => {
    const chunks = []
    runStream.on('data', chunk => chunks.push(chunk))
    runStream.on('end', () => {
      const buf = Buffer.concat(chunks)
      let output = ''
      let offset = 0
      while (offset + 8 <= buf.length) {
        const size = buf.readUInt32BE(offset + 4)
        output += buf.slice(offset + 8, offset + 8 + size).toString('utf8')
        offset += 8 + size
      }
      // Cleanup
      container.exec({ Cmd: ['rm', '-f', file], AttachStdout: false, AttachStderr: false })
        .then(e => e.start({ hijack: true, stdin: false })).catch(() => {})
      resolve(output)
    })
    runStream.on('error', reject)
  })
}

// GET /api/languages — list available languages
router.get('/', (req, res) => {
  res.json(Object.entries(LANGS).map(([id, l]) => ({ id, label: id })))
})

// POST /api/languages/run — execute arbitrary code
router.post('/run', async (req, res) => {
  const { lang, code } = req.body
  const def = LANGS[lang]
  if (!def) return res.status(400).json({ error: 'Unknown language' })
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'code is required' })
  }

  try {
    const output = await runCode(def.container, def.bin, code, def.ext)
    const isHtml = lang === 'php' && output.trim().startsWith('<')
    res.json({ output, isHtml })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
