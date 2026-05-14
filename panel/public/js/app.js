// i18n
let lang = localStorage.getItem('lang') || 'es'
let i18n = {}

async function loadLang(l) {
  const res = await fetch(`/i18n/${l}.json`)
  i18n = await res.json()
  lang = l
  localStorage.setItem('lang', l)
  applyI18n()
  updateLangButtons()
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (i18n[key]) el.textContent = i18n[key]
  })
  document.title = i18n['title'] || 'XAMPP Control Panel'
}

function t(key) { return i18n[key] || key }

function setLang(l) { loadLang(l) }

function updateLangButtons() {
  document.querySelectorAll('.lang-selector button').forEach(b => {
    b.classList.toggle('active', b.id === `lang-${lang}`)
  })
}

// Navigation
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault()
    const section = link.dataset.section
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
    link.classList.add('active')
    document.getElementById(`section-${section}`)?.classList.add('active')
    if (section === 'services')  loadServices()
    if (section === 'sites')     loadSites()
    if (section === 'phpinfo')   loadPhpInfo()
    if (section === 'languages') {
      if (!cmEditor) initCodeMirror()
      switchLang(currentLang)
      setTimeout(() => cmEditor && cmEditor.refresh(), 50)
    }
    if (section === 'browser') browseDir(browserCurrentPath)
  })
})

// Services
async function loadServices() {
  try {
    const res = await fetch('/api/services')
    const data = await res.json()
    for (const [svc, info] of Object.entries(data)) {
      const dot = document.getElementById(`dot-${svc}`)
      const label = document.getElementById(`label-${svc}`)
      if (dot) {
        dot.className = `status-dot ${info.running ? 'running' : 'stopped'}`
      }
      if (label) {
        label.textContent = info.running ? t('status_running') : t('status_stopped')
      }
    }
  } catch (err) {
    console.error('loadServices error', err)
  }
}

async function serviceAction(service, action) {
  try {
    await fetch(`/api/services/${service}/${action}`, { method: 'POST' })
    setTimeout(loadServices, 1200)
  } catch (err) {
    console.error(err)
  }
}

// Sites
const CMS_SVG = {
  WordPress: `<svg width="22" height="22" viewBox="0 0 24 24" fill="#21759b"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM3.5 12c0-1.03.19-2.01.53-2.93L7.64 20.1A8.52 8.52 0 0 1 3.5 12zm8.5 8.5c-.7 0-1.38-.09-2.04-.26l2.17-6.3 2.22 6.08c.01.03.03.06.04.09A8.5 8.5 0 0 1 12 20.5zm1.18-11.63L15 14.8l-.59 1.97-2.18-6.47 1.94-.43zM12 4.5c1.3 0 2.49.35 3.52.96-.02 0-.04-.01-.06-.01-1.13 0-1.99 1-1.99 2.08 0 .97.56 1.79 1.15 2.76.45.78.97 1.77.97 3.2 0 1-.38 2.15-.88 3.75L13.24 19l-3.56-10.59c.6-.03 1.14-.1 1.14-.1.53-.06.47-.85-.06-.82 0 0-1.61.13-2.65.13-.18 0-.39 0-.61-.01C8.9 5.37 10.37 4.5 12 4.5zm-7.12 2.18A8.5 8.5 0 0 1 20.43 10H20c-.97 0-1.84.55-2.27 1.4l-1.5 2.73-2.1-6.28A5.6 5.6 0 0 0 12 7.27c-.19 0-.38.01-.56.03l2-2.62zm-.49 9.88L7.8 19.9A8.52 8.52 0 0 1 4.5 12c0-.66.08-1.3.21-1.92l-1.82 5.38c.5.37.5.37.5.55z"/></svg>`,
  Joomla:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="#f7941e"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/><path d="M9.5 7.5h5v2h-5zm0 7h5v2h-5zm-2-5h2v5H7.5zm7 0h2v5h-2z"/></svg>`,
  MediaWiki: `<svg width="22" height="22" viewBox="0 0 24 24" fill="#3366cc"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 14.5h-2v-7h2v7zm0-9h-2V5.5h2V7.5z"/></svg>`,
  Drupal:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="#0678be"><path d="M12 2C9.5 2 7 3.5 7 3.5S9 4 9 6c0 1.5-1.5 2.5-1.5 2.5S6 7.5 6 5.5C4.5 6.5 3 8.5 3 11a9 9 0 0 0 18 0c0-4.5-4-9-9-9zm0 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>`,
  PHP:       `<svg width="22" height="22" viewBox="0 0 24 24" fill="#8892bf"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm-2 6h4c1.1 0 2 .9 2 2v1c0 1.1-.9 2-2 2h-2v3h-2V8zm2 2v2h2v-2h-2z"/></svg>`,
}

async function loadSites() {
  const list = document.getElementById('sites-list')
  list.innerHTML = '<p style="color:var(--muted);padding:8px 0">Cargando…</p>'
  try {
    const res   = await fetch('/api/sites')
    const sites = await res.json()
    if (!sites.length) {
      list.innerHTML = `<p style="color:var(--muted)">${t('sites_empty')}</p>`
      return
    }

    list.innerHTML = ''
    const grid = document.createElement('div')
    grid.className = 'cards'
    list.appendChild(grid)

    for (const s of sites) {
      const card = document.createElement('div')
      card.className = 'site-card'

      // Favicon / CMS icon
      let iconHtml
      if (s.favicon) {
        iconHtml = `<img class="site-favicon" src="${s.favicon}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
          alt="${s.cms}">
          <span class="site-favicon-fallback" style="display:none">${CMS_SVG[s.cms] || s.icon}</span>`
      } else {
        // Try loading favicon.ico from the live site
        iconHtml = `<img class="site-favicon"
          src="http://localhost/${s.name}/favicon.ico"
          onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
          alt="${s.cms}">
          <span class="site-favicon-fallback" style="display:none">${CMS_SVG[s.cms] || s.icon}</span>`
      }

      card.innerHTML = `
        ${iconHtml}
        <div class="site-info">
          <a class="site-name" href="${s.url}" target="_blank">${s.name}</a>
          <div class="site-cms">${s.cms}</div>
        </div>
        <div class="site-actions">
          <button class="site-browse-btn" onclick="browseDir('/${s.name}')">📁 ${t('browser_title') || 'Archivos'}</button>
        </div>`
      grid.appendChild(card)
    }
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red)">${err.message}</p>`
  }
}

// PHP Info
async function loadPhpInfo() {
  const frame = document.getElementById('phpinfo-frame')
  frame.src = '/api/phpinfo'
}

// Config
let currentConfigFile = ''

async function loadConfig(file) {
  if (!file) return
  currentConfigFile = file
  const ta = document.getElementById('config-editor')
  ta.value = 'Loading...'
  try {
    const res = await fetch(`/api/config/${file}`)
    const data = await res.json()
    ta.value = data.content
  } catch (err) {
    ta.value = `Error: ${err.message}`
  }
}

async function saveConfig() {
  if (!currentConfigFile) return
  const content = document.getElementById('config-editor').value
  const flash = document.getElementById('config-flash')
  flash.className = 'flash'

  try {
    const res = await fetch(`/api/config/${currentConfigFile}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    const data = await res.json()
    if (data.ok) {
      flash.textContent = t('config_saved')
      flash.className = 'flash ok'
    } else {
      throw new Error(data.error)
    }
  } catch (err) {
    flash.textContent = `${t('config_error')} ${err.message}`
    flash.className = 'flash err'
  }

  setTimeout(() => { flash.className = 'flash' }, 4000)
}

// CMS Installer
async function installCMS() {
  const body = {
    cms: document.getElementById('i-cms').value,
    dir: document.getElementById('i-dir').value.trim(),
    title: document.getElementById('i-title').value.trim(),
    adminUser: document.getElementById('i-user').value.trim(),
    adminPass: document.getElementById('i-pass').value,
    adminEmail: document.getElementById('i-email').value.trim(),
  }

  if (!body.dir || !body.title || !body.adminUser || !body.adminPass || !body.adminEmail) {
    return alert('Please fill all fields.')
  }

  const log = document.getElementById('install-log')
  const btn = document.getElementById('install-btn')
  log.innerHTML = ''
  log.classList.add('visible')
  btn.disabled = true

  const addLine = (cls, msg) => {
    const el = document.createElement('div')
    el.className = cls
    el.textContent = msg
    log.appendChild(el)
    log.scrollTop = log.scrollHeight
  }

  try {
    const res = await fetch('/api/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw) continue
        try {
          const ev = JSON.parse(raw)
          if (ev.error) {
            addLine('err', `✗ ${ev.error}`)
          } else if (ev.step === 'done') {
            addLine('done', `✓ ${t('install_done')}`)
            addLine('done', `→ ${ev.url}`)
            const link = document.createElement('a')
            link.href = ev.url
            link.target = '_blank'
            link.textContent = t('install_visit')
            link.style.color = 'var(--accent2)'
            log.appendChild(link)
          } else {
            addLine('step', `[${ev.step}] ${ev.message}`)
          }
        } catch {}
      }
    }
  } catch (err) {
    addLine('err', `✗ ${err.message}`)
  }

  btn.disabled = false
}

// Logs
let logsSource = null

function startLogs(service) {
  if (!service) return
  if (logsSource) logsSource.close()
  const output = document.getElementById('log-output')
  output.textContent = ''

  logsSource = new EventSource(`/api/logs/${service}`)
  logsSource.onmessage = (e) => {
    output.textContent += e.data + '\n'
    output.scrollTop = output.scrollHeight
  }
  logsSource.onerror = () => {
    output.textContent += '\n[connection lost]\n'
  }
}

function clearLogs() {
  document.getElementById('log-output').textContent = ''
}

// ── Sidebar toggle ────────────────────────────────────────────────────────

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar')
  const btn     = document.getElementById('sidebar-toggle')
  const collapsed = sidebar.classList.toggle('collapsed')
  document.body.classList.toggle('sidebar-collapsed', collapsed)
  btn.textContent = collapsed ? '›' : '‹'
  localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0')
}

// Restore state on load
;(function () {
  if (localStorage.getItem('sidebar-collapsed') === '1') {
    document.getElementById('sidebar').classList.add('collapsed')
    document.body.classList.add('sidebar-collapsed')
    const btn = document.getElementById('sidebar-toggle')
    if (btn) btn.textContent = '›'
  }
})()

// Init
loadLang(lang)
loadServices()
setInterval(loadServices, 5000)
// CodeMirror init deferred — only when section is first visited

// ── Languages ──────────────────────────────────────────────────────────────

const LANG_SNIPPETS = {
  php: `<?php
// PHP — Test de extensiones y conexión MySQL
header('Content-Type: text/html; charset=utf-8');

$tests = [];
$tests[] = ['PHP Version', PHP_VERSION, true];

foreach (['pdo_mysql','mysqli','mbstring','gd','zip','curl','opcache','intl','soap','xml','bcmath'] as $ext) {
    $tests[] = ["Extensión: $ext", extension_loaded($ext) ? 'cargada' : 'FALTA', extension_loaded($ext)];
}

try {
    $pdo = new PDO('mysql:host=mariadb;dbname=mysql', 'root', '');
    $ver = $pdo->query('SELECT VERSION()')->fetchColumn();
    $tests[] = ['MySQL (PDO)', "OK — MariaDB $ver", true];
} catch (Exception $e) {
    $tests[] = ['MySQL (PDO)', 'FALLO: ' . $e->getMessage(), false];
}

$tmp = sys_get_temp_dir() . '/xampp_' . getmypid();
file_put_contents($tmp, 'ok');
$write_ok = file_get_contents($tmp) === 'ok';
@unlink($tmp);
$tests[] = ['Escritura en disco', $write_ok ? 'OK' : 'FALLO', $write_ok];

if (extension_loaded('gd')) {
    $img = imagecreatetruecolor(10, 10);
    $tests[] = ['GD imagecreate', $img !== false ? 'OK' : 'FALLO', $img !== false];
    if ($img) imagedestroy($img);
}
?>
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:monospace;padding:1.5rem;background:#0f172a;color:#e2e8f0}
  h2{color:#38bdf8}table{border-collapse:collapse;width:100%;max-width:640px}
  th{text-align:left;padding:.4rem .8rem;background:#1e293b;color:#94a3b8;font-size:.75rem;text-transform:uppercase}
  td{padding:.4rem .8rem;border-bottom:1px solid #1e293b}
  .ok{color:#4ade80}.err{color:#f87171}.val{color:#fbbf24}
</style></head><body>
<h2>🐘 PHP Test</h2>
<table><tr><th>Check</th><th>Resultado</th></tr>
<?php foreach($tests as [$label,$value,$ok]): ?>
<tr>
  <td><?=htmlspecialchars($label)?></td>
  <td><span class="<?=$ok?'ok':'err'?>"><?=$ok?'✓':'✗'?></span>
      <span class="val"> <?=htmlspecialchars($value)?></span></td>
</tr>
<?php endforeach; ?>
</table></body></html>`,

  php2: `<?php
// Muestra la tabla completa de phpinfo()
phpinfo();`,

  python: `#!/usr/bin/env python3
# Python — Test de entorno
import sys, os, platform, subprocess, json
from datetime import datetime

results = []

def check(label, fn):
    try:
        results.append({"label": label, "value": str(fn()), "ok": True})
    except Exception as e:
        results.append({"label": label, "value": str(e), "ok": False})

check("Python version",    lambda: sys.version.split()[0])
check("Platform",          lambda: platform.machine())
check("OS",                lambda: platform.system() + " " + platform.release())
check("Temp dir writable", lambda: _write_test())
check("pip version",       lambda: subprocess.check_output(["pip3","--version"],stderr=subprocess.DEVNULL).decode().split()[1])
check("json module",       lambda: json.dumps({"ok": True}))
check("datetime",          lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

def _write_test():
    p = "/tmp/py_xampp_test"
    open(p,"w").write("ok")
    v = open(p).read()
    os.unlink(p)
    return "writable" if v == "ok" else "FALLO"

results[3]["value"] = _write_test(); results[3]["ok"] = True

print("=" * 50)
print("  Python Test — XAMPP Docker")
print("=" * 50)
for r in results:
    icon = "✓" if r["ok"] else "✗"
    print(f"  {icon}  {r['label']:<28} {r['value']}")
print("=" * 50)
print(f"  {sum(1 for r in results if r['ok'])}/{len(results)} checks OK")`,

  node: `#!/usr/bin/env node
// Node.js — Test de entorno
const os = require('os')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const results = []
const run = cmd => execSync(cmd, { stdio: 'pipe' }).toString().trim()

function check(label, fn) {
  try { results.push({ label, value: String(fn()), ok: true }) }
  catch (e) { results.push({ label, value: e.message.split('\\n')[0], ok: false }) }
}

check('Node.js version',   () => process.version)
check('V8 version',        () => process.versions.v8)
check('Platform',          () => \`\${os.platform()} \${os.arch()}\`)
check('Temp dir writable', () => {
  const p = path.join(os.tmpdir(), 'node_xampp')
  fs.writeFileSync(p, 'ok')
  const v = fs.readFileSync(p, 'utf8')
  fs.unlinkSync(p)
  return v === 'ok' ? 'writable' : 'FALLO'
})
check('npm version',       () => run('npm --version'))
check('pm2',               () => run('pm2 --version'))
check('nodemon',           () => run('nodemon --version'))
check('yarn',              () => run('yarn --version'))
check('TypeScript (tsc)',  () => run('tsc --version'))

const pad = (s, n) => String(s).padEnd(n)
console.log('='.repeat(52))
console.log('  Node.js Test — XAMPP Docker')
console.log('='.repeat(52))
for (const r of results) {
  console.log(\`  \${r.ok ? '✓' : '✗'}  \${pad(r.label, 26)} \${r.value}\`)
}
console.log('='.repeat(52))
console.log(\`  \${results.filter(r=>r.ok).length}/\${results.length} checks OK\`)`,
}

let currentLang = 'php'
let cmEditor = null

const CM_MODES = {
  php:    'application/x-httpd-php',
  php2:   'application/x-httpd-php',
  python: 'text/x-python',
  node:   'text/javascript',
}

function initCodeMirror() {
  cmEditor = CodeMirror(document.getElementById('lang-cm-editor'), {
    value: LANG_SNIPPETS.php,
    mode: CM_MODES.php,
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: false,
    autofocus: false,
    extraKeys: {
      Tab: cm => cm.execCommand('indentMore'),
      'Shift-Tab': cm => cm.execCommand('indentLess'),
    },
  })
}

function switchLang(lang) {
  currentLang = lang
  document.querySelectorAll('.lang-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.lang === lang)
  })
  if (cmEditor) {
    cmEditor.setValue(LANG_SNIPPETS[lang] || '')
    cmEditor.setOption('mode', CM_MODES[lang] || 'text/plain')
    cmEditor.refresh()
  }
  clearLangOutput()
}

function clearLangOutput() {
  const workspace = document.getElementById('lang-workspace')
  const panel     = document.getElementById('lang-output-panel')
  const pre       = document.getElementById('lang-out-pre')
  const frame     = document.getElementById('lang-out-frame')

  panel.style.display = 'none'
  workspace.classList.remove('has-output')
  pre.style.display   = 'none'
  frame.style.display = 'none'
  pre.textContent     = ''
  frame.src           = 'about:blank'

  // Let CodeMirror recalculate its height after layout change
  setTimeout(() => cmEditor && cmEditor.refresh(), 320)
}

async function runLangEditor() {
  if (!cmEditor) return
  const code    = cmEditor.getValue().trim()
  if (!code) return

  const apiLang  = currentLang === 'php2' ? 'php' : currentLang
  const workspace = document.getElementById('lang-workspace')
  const panel     = document.getElementById('lang-output-panel')
  const pre       = document.getElementById('lang-out-pre')
  const frame     = document.getElementById('lang-out-frame')

  // Show output panel — triggers CSS split
  panel.style.display = 'flex'
  workspace.classList.add('has-output')
  pre.style.display   = 'block'
  frame.style.display = 'none'
  pre.textContent     = 'Ejecutando…'
  setTimeout(() => cmEditor && cmEditor.refresh(), 320)

  try {
    const res  = await fetch('/api/languages/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: apiLang, code }),
    })
    const data = await res.json()
    if (data.error) {
      pre.textContent = '✗ Error: ' + data.error
      return
    }
    if (data.isHtml) {
      pre.style.display   = 'none'
      frame.style.display = 'block'
      const blob = new Blob([data.output], { type: 'text/html' })
      frame.src  = URL.createObjectURL(blob)
    } else {
      pre.textContent = data.output
    }
  } catch (e) {
    pre.textContent = '✗ ' + e.message
  }
}

// ── Browser ────────────────────────────────────────────────────────────────

let browserCurrentPath = '/'
let browserCmEditor    = null
let browserCurrentFile = null
let browserRunHow      = null
let browserRunLang     = null

const EXT_ICON = {
  php: '🐘', py: '🐍', js: '💚', html: '🌐', htm: '🌐',
  css: '🎨', json: '📋', md: '📝', sql: '🗄️', txt: '📄',
  ini: '⚙️', conf: '⚙️', cnf: '⚙️', sh: '⚡', xml: '📋',
  ts: '💙', yaml: '📋', yml: '📋', env: '🔑',
  htaccess: '🔒', htpasswd: '🔒', gitignore: '🙈',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
  svg: '🖼️', ico: '🖼️', bmp: '🖼️', avif: '🖼️',
}
const EXT_CM_MODE = {
  php:  'application/x-httpd-php',
  py:   'text/x-python',
  js:   'text/javascript',
  ts:   'text/typescript',
  html: 'text/html',
  htm:  'text/html',
  css:  'text/css',
  json: 'application/json',
  xml:  'text/xml',
  sh:   'text/x-sh',
  sql:  'text/x-sql',
  md:   'text/x-markdown',
  ini:  'text/x-properties',
  conf: 'text/x-properties',
  cnf:  'text/x-properties',
  env:  'text/x-properties',
}

function fmtSize(bytes) {
  if (bytes === null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function browserNavTo(section) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
  const link = document.querySelector(`[data-section="${section}"]`)
  if (link) link.classList.add('active')
  document.getElementById(`section-${section}`)?.classList.add('active')
}

async function browseDir(dirPath) {
  // Switch to browser section if not already there
  if (!document.getElementById('section-browser').classList.contains('active')) {
    browserNavTo('browser')
  }

  browserCurrentPath = dirPath
  const list = document.getElementById('browser-list')
  list.innerHTML = '<div style="padding:12px;color:var(--text-muted)">Cargando…</div>'

  // Render breadcrumb
  renderBreadcrumb(dirPath)

  try {
    const res  = await fetch(`/api/browser?path=${encodeURIComponent(dirPath)}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)

    list.innerHTML = ''

    // Show gallery button if any images exist (recursively would be slow — just check current dir)
    const hasImages = data.entries.some(e => e.image)
    document.getElementById('gallery-btn').style.display = hasImages ? '' : 'none'

    // Back row
    if (dirPath !== '/') {
      const parent = dirPath.split('/').slice(0, -1).join('/') || '/'
      const back = document.createElement('div')
      back.className = 'browser-entry'
      back.innerHTML = `<span class="browser-entry-icon">⬆️</span>
        <span class="browser-entry-name is-dir browser-back">..</span>`
      back.onclick = () => browseDir(parent)
      list.appendChild(back)
    }

    for (const e of data.entries) {
      const row = document.createElement('div')
      row.className = 'browser-entry'

      const icon = e.type === 'dir' ? '📁' : (EXT_ICON[e.ext] || '📄')
      const nameClass = e.type === 'dir' ? 'browser-entry-name is-dir' : 'browser-entry-name'

      const filePath = `${dirPath}/${e.name}`
      let actions = ''
      // "Abrir" always visible when applicable (url-runnable: PHP, HTML)
      if (e.type === 'file' && e.runnable && e.runHow === 'url') {
        actions += `<button class="browser-entry-btn open" onclick="event.stopPropagation();window.open('http://localhost${filePath}','_blank')" title="Abrir en navegador">↗</button>`
      }
      // "Ejecutar" always visible for exec types (py, js)
      if (e.type === 'file' && e.runnable && e.runHow === 'exec') {
        actions += `<button class="browser-entry-btn run" onclick="event.stopPropagation();execBrowserFile('${filePath}','${e.runLang}')">▶</button>`
      }

      row.innerHTML = `
        <span class="browser-entry-icon">${icon}</span>
        <span class="${nameClass}">${e.name}</span>
        <span class="browser-entry-size">${fmtSize(e.size)}</span>
        <span class="browser-entry-actions">${actions}</span>`

      if (e.type === 'dir') {
        row.onclick = () => browseDir(dirPath + '/' + e.name)
      } else if (e.image) {
        row.onclick = () => openBrowserImage(filePath)
      } else if (e.editable) {
        row.onclick = () => openBrowserFileEditor(filePath, e.ext, e.runnable, e.runHow || '', e.runLang || '')
      }

      list.appendChild(row)
    }
  } catch (err) {
    list.innerHTML = `<div style="padding:12px;color:var(--red)">${err.message}</div>`
  }
}

function renderBreadcrumb(dirPath) {
  const bc   = document.getElementById('browser-breadcrumb')
  const parts = dirPath.split('/').filter(Boolean)
  let html = `<span class="breadcrumb-part ${parts.length === 0 ? 'current' : ''}" onclick="browseDir('/')">htdocs</span>`
  let accum = ''
  parts.forEach((p, i) => {
    accum += '/' + p
    const isCurrent = i === parts.length - 1
    const path = accum
    html += `<span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-part ${isCurrent ? 'current' : ''}"
        ${isCurrent ? '' : `onclick="browseDir('${path}')"`}>${p}</span>`
  })
  bc.innerHTML = html
}

function initBrowserCm(content, ext) {
  const container = document.getElementById('browser-cm')
  const mode = EXT_CM_MODE[ext] || 'text/plain'

  if (browserCmEditor) {
    browserCmEditor.setValue(content)
    browserCmEditor.setOption('mode', mode)
    browserCmEditor.refresh()
    return
  }

  browserCmEditor = CodeMirror(container, {
    value: content,
    mode,
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: false,
    extraKeys: {
      Tab: cm => cm.execCommand('indentMore'),
      'Shift-Tab': cm => cm.execCommand('indentLess'),
    },
  })
}

async function openBrowserFileEditor(filePath, ext, runnable, runHow, runLang) {
  const panel = document.getElementById('browser-editor-panel')
  panel.style.display = 'flex'
  document.getElementById('browser-editor-filename').textContent = filePath.split('/').pop()
  document.getElementById('browser-flash').className = 'flash'
  closeBrowserOutput()

  browserCurrentFile = filePath
  browserRunHow      = runHow
  browserRunLang     = runLang

  // Show action buttons
  const runBtn  = document.getElementById('browser-run-btn')
  const openBtn = document.getElementById('browser-open-btn')
  // Show "Run" only for exec types; show "Open" for url types (always, not just on hover)
  runBtn.style.display  = (runnable && runHow === 'exec') ? '' : 'none'
  openBtn.style.display = (runHow === 'url') ? '' : 'none'

  // Restore text-editor buttons, hide image-only buttons
  document.getElementById('browser-save-btn').style.display   = ''
  document.getElementById('browser-rename-btn').style.display = 'none'
  document.getElementById('browser-delete-btn').style.display = 'none'
  browserCurrentImagePath = null

  // Ensure image frame is hidden and CM is visible
  const imgFrame = document.getElementById('browser-img-frame')
  if (imgFrame) imgFrame.style.display = 'none'
  document.getElementById('browser-cm').style.display = ''

  try {
    const res  = await fetch(`/api/browser/read?path=${encodeURIComponent(filePath)}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    initBrowserCm(data.content, ext)
    setTimeout(() => browserCmEditor && browserCmEditor.refresh(), 150)
  } catch (err) {
    initBrowserCm(`// Error loading file: ${err.message}`, 'txt')
  }
}

let browserCurrentImagePath = null

function openBrowserImage(filePath) {
  browserCurrentImagePath = filePath
  const panel = document.getElementById('browser-editor-panel')
  panel.style.display = 'flex'
  document.getElementById('browser-editor-filename').textContent = filePath.split('/').pop()
  document.getElementById('browser-flash').className = 'flash'
  document.getElementById('browser-save-btn').style.display  = 'none'
  document.getElementById('browser-run-btn').style.display   = 'none'
  document.getElementById('browser-open-btn').style.display  = 'none'
  document.getElementById('browser-rename-btn').style.display = ''
  document.getElementById('browser-delete-btn').style.display = ''
  closeBrowserOutput()

  browserCurrentFile = null

  const cm = document.getElementById('browser-cm')
  cm.style.display = 'none'

  let imgFrame = document.getElementById('browser-img-frame')
  if (!imgFrame) {
    imgFrame = document.createElement('iframe')
    imgFrame.id = 'browser-img-frame'
    imgFrame.style.cssText = 'flex:1;border:none;min-height:0;background:#111'
    cm.parentNode.insertBefore(imgFrame, cm.nextSibling)
  }
  imgFrame.style.display = 'block'

  const url = `/api/browser/image?path=${encodeURIComponent(filePath)}`
  imgFrame.srcdoc = `<!DOCTYPE html><html><head><style>
    body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
    img{max-width:100%;max-height:100vh;object-fit:contain;display:block}
  </style></head><body><img src="${url}"></body></html>`
}

async function deleteBrowserFile() {
  const filePath = browserCurrentImagePath || browserCurrentFile
  if (!filePath) return
  if (!confirm(`¿Borrar "${filePath.split('/').pop()}"?`)) return

  try {
    const res  = await fetch('/api/browser/delete', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: filePath }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    closeBrowserEditor()
    browseDir(browserCurrentPath)
  } catch (err) {
    alert('Error: ' + err.message)
  }
}

let renameTargetPath = null

function renameBrowserFile() {
  renameTargetPath = browserCurrentImagePath || browserCurrentFile
  if (!renameTargetPath) return
  const input = document.getElementById('rename-input')
  input.value = renameTargetPath.split('/').pop()
  document.getElementById('rename-modal').style.display = 'flex'
  setTimeout(() => { input.focus(); input.select() }, 50)
}

function closeRenameModal() {
  document.getElementById('rename-modal').style.display = 'none'
  renameTargetPath = null
}

async function confirmRename() {
  if (!renameTargetPath) return
  const newName = document.getElementById('rename-input').value.trim()
  if (!newName) return

  try {
    const res  = await fetch('/api/browser/rename', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: renameTargetPath, name: newName }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    closeRenameModal()
    closeBrowserEditor()
    browseDir(browserCurrentPath)
  } catch (err) {
    alert('Error: ' + err.message)
  }
}

async function openImageGallery() {
  const grid = document.getElementById('gallery-grid')
  grid.innerHTML = '<div style="color:var(--muted);padding:16px">Cargando…</div>'
  document.getElementById('gallery-modal').style.display = 'flex'

  // Collect all images recursively from current path
  const images = []
  await collectImages(browserCurrentPath, images)

  if (!images.length) {
    grid.innerHTML = '<div style="color:var(--muted);padding:16px">No hay imágenes en esta carpeta.</div>'
    return
  }

  grid.innerHTML = ''
  for (const img of images) {
    const url  = `/api/browser/image?path=${encodeURIComponent(img.path)}`
    const item = document.createElement('div')
    item.className = 'gallery-item'
    item.innerHTML = `
      <div class="gallery-item-thumb" onclick="galleryView('${img.path}')">
        <img src="${url}" alt="${img.name}" loading="lazy">
      </div>
      <div class="gallery-item-name" title="${img.path}">${img.name}</div>
      <div class="gallery-item-actions">
        <button onclick="galleryRename('${img.path}')">✏️</button>
        <button class="danger" onclick="galleryDelete('${img.path}')">🗑️</button>
      </div>`
    grid.appendChild(item)
  }
}

async function collectImages(dirPath, results) {
  try {
    const res  = await fetch(`/api/browser?path=${encodeURIComponent(dirPath)}`)
    const data = await res.json()
    if (data.error) return
    for (const e of data.entries) {
      if (e.type === 'dir') {
        await collectImages(`${dirPath}/${e.name}`, results)
      } else if (e.image) {
        results.push({ name: e.name, path: `${dirPath}/${e.name}` })
      }
    }
  } catch {}
}

function closeImageGallery() {
  document.getElementById('gallery-modal').style.display = 'none'
}

function galleryView(filePath) {
  closeImageGallery()
  openBrowserImage(filePath)
}

function galleryRename(filePath) {
  closeImageGallery()
  renameTargetPath = filePath
  const input = document.getElementById('rename-input')
  input.value = filePath.split('/').pop()
  document.getElementById('rename-modal').style.display = 'flex'
  setTimeout(() => { input.focus(); input.select() }, 50)
}

async function galleryDelete(filePath) {
  if (!confirm(`¿Borrar "${filePath.split('/').pop()}"?`)) return
  try {
    const res  = await fetch('/api/browser/delete', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: filePath }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    // Remove item from gallery grid
    openImageGallery()
  } catch (err) {
    alert('Error: ' + err.message)
  }
}

function closeBrowserEditor() {
  document.getElementById('browser-editor-panel').style.display = 'none'
  const imgFrame = document.getElementById('browser-img-frame')
  if (imgFrame) { imgFrame.style.display = 'none'; imgFrame.srcdoc = '' }
  document.getElementById('browser-cm').style.display = ''
  document.getElementById('browser-save-btn').style.display   = ''
  document.getElementById('browser-rename-btn').style.display = 'none'
  document.getElementById('browser-delete-btn').style.display = 'none'
  browserCurrentFile      = null
  browserCurrentImagePath = null
}

async function saveBrowserFile() {
  if (!browserCurrentFile || !browserCmEditor) return
  const content = browserCmEditor.getValue()
  const flash   = document.getElementById('browser-flash')
  flash.className = 'flash'

  try {
    const res  = await fetch('/api/browser/write', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: browserCurrentFile, content }),
    })
    const data = await res.json()
    if (data.ok) { flash.textContent = '✓ Guardado'; flash.className = 'flash ok' }
    else throw new Error(data.error)
  } catch (err) {
    flash.textContent = '✗ ' + err.message
    flash.className   = 'flash err'
  }
  setTimeout(() => { flash.className = 'flash' }, 3000)
}

function openBrowserUrl() {
  if (!browserCurrentFile) return
  window.open('http://localhost' + browserCurrentFile, '_blank')
}

async function execBrowserFile(filePath, lang) {
  // Read current content from editor if it's the open file, else fetch
  let code
  if (browserCurrentFile === filePath && browserCmEditor) {
    code = browserCmEditor.getValue()
  } else {
    const res  = await fetch(`/api/browser/read?path=${encodeURIComponent(filePath)}`)
    const data = await res.json()
    code = data.content
  }

  const wrap  = document.getElementById('browser-output-wrap')
  const pre   = document.getElementById('browser-out-pre')
  const frame = document.getElementById('browser-out-frame')
  const label = document.getElementById('browser-output-label')

  label.textContent = filePath.split('/').pop()
  wrap.style.display  = 'block'
  pre.style.display   = 'block'
  frame.style.display = 'none'
  pre.textContent     = 'Ejecutando…'

  try {
    const res  = await fetch('/api/languages/run', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lang, code }),
    })
    const data = await res.json()
    if (data.error) { pre.textContent = '✗ ' + data.error; return }
    if (data.isHtml) {
      pre.style.display   = 'none'
      frame.style.display = 'block'
      frame.src = URL.createObjectURL(new Blob([data.output], { type: 'text/html' }))
    } else {
      pre.textContent = data.output
    }
  } catch (e) {
    pre.textContent = '✗ ' + e.message
  }
}

async function runBrowserFile() {
  if (!browserCurrentFile) return
  await execBrowserFile(browserCurrentFile, browserRunLang)
}

function toggleTreePanel() {
  const panel = document.getElementById('browser-tree-panel')
  const btn   = document.getElementById('tree-toggle')
  const collapsed = panel.classList.toggle('collapsed-panel')
  btn.textContent = collapsed ? '▶' : '◀'
  btn.title = collapsed ? 'Expandir árbol' : 'Colapsar árbol'
  // Refresh CodeMirror after layout settles
  setTimeout(() => browserCmEditor && browserCmEditor.refresh(), 300)
}

function closeBrowserOutput() {
  const wrap  = document.getElementById('browser-output-wrap')
  const pre   = document.getElementById('browser-out-pre')
  const frame = document.getElementById('browser-out-frame')
  if (!wrap) return
  wrap.style.display  = 'none'
  pre.style.display   = 'none'
  frame.style.display = 'none'
  pre.textContent     = ''
  frame.src           = 'about:blank'
}
