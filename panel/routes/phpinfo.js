const express = require('express')
const Docker = require('dockerode')

const router = express.Router()
const docker = new Docker({ socketPath: '/var/run/docker.sock' })

router.get('/', async (req, res) => {
  try {
    const container = docker.getContainer('xampp-php')
    const exec = await container.exec({
      Cmd: ['php', '-r', 'phpinfo();'],
      AttachStdout: true,
      AttachStderr: false,
    })

    const stream = await exec.start({ hijack: true, stdin: false })

    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => {
      // Demux docker multiplexed stream: each frame has 8-byte header
      // [stream_type(1), 0, 0, 0, size(4 big-endian)]
      const buf = Buffer.concat(chunks)
      let output = ''
      let offset = 0
      while (offset + 8 <= buf.length) {
        const size = buf.readUInt32BE(offset + 4)
        output += buf.slice(offset + 8, offset + 8 + size).toString('utf8')
        offset += 8 + size
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(output)
    })
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`)
  }
})

module.exports = router
