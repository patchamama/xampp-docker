const express = require('express')
const path = require('path')

const servicesRouter = require('./routes/services')
const configRouter = require('./routes/config')
const sitesRouter = require('./routes/sites')
const installerRouter = require('./routes/installer')
const phpinfoRouter = require('./routes/phpinfo')
const logsRouter = require('./routes/logs')
const languagesRouter = require('./routes/languages')
const browserRouter   = require('./routes/browser')

const app = express()
const PORT = process.env.PANEL_PORT || 8080

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

app.use('/api/services', servicesRouter)
app.use('/api/config', configRouter)
app.use('/api/sites', sitesRouter)
app.use('/api/install', installerRouter)
app.use('/api/phpinfo', phpinfoRouter)
app.use('/api/logs', logsRouter)
app.use('/api/languages', languagesRouter)
app.use('/api/browser',   browserRouter)

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`XAMPP Control Panel running on http://localhost:${PORT}`)
})
