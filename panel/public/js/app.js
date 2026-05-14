// i18n
let lang = localStorage.getItem('lang') || 'es'
let i18n = {}
let theme = localStorage.getItem('theme') || 'dark'
let cmEditor = null
let browserCmEditor = null

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
  document.querySelectorAll('.lang-selector .lang-btn').forEach(b => {
    b.classList.toggle('active', b.id === `lang-${lang}`)
  })
}

function cmTheme() {
  return theme === 'light' ? 'eclipse' : 'dracula'
}

function applyTheme() {
  document.body.classList.toggle('light-theme', theme === 'light')
  localStorage.setItem('theme', theme)
  const btn = document.getElementById('theme-toggle')
  if (btn) btn.textContent = theme === 'light' ? '🌞' : '🌙'
  if (cmEditor) cmEditor.setOption('theme', cmTheme())
  if (browserCmEditor) browserCmEditor.setOption('theme', cmTheme())
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light'
  applyTheme()
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
    if (section === 'config')    loadPhpRuntimeOptions()
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

function setButtonLoading(btn, on = true) {
  if (!btn) return
  btn.classList.toggle('is-loading', !!on)
  btn.disabled = !!on
}

async function serviceAction(service, action, btn = null) {
  setButtonLoading(btn, true)
  try {
    await fetch(`/api/services/${service}/${action}`, { method: 'POST' })
    setTimeout(loadServices, 1200)
  } catch (err) {
    console.error(err)
  } finally {
    setTimeout(() => setButtonLoading(btn, false), 350)
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

function actionIcon(kind) {
  const icons = {
    info: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 4.75a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 12 6.75Zm1.5 10.5h-3a.75.75 0 0 1 0-1.5h.75v-4h-.75a.75.75 0 0 1 0-1.5H12a.75.75 0 0 1 .75.75v4.75h.75a.75.75 0 0 1 0 1.5Z"/></svg>`,
    files: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.75A2.75 2.75 0 0 1 5.75 3h4.19a2 2 0 0 1 1.41.59l1.06 1.06a.5.5 0 0 0 .35.15h5.49A2.75 2.75 0 0 1 21 7.55v10.7A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25V5.75Z"/></svg>`,
    admin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 7v6c0 5.05 3.4 9.78 9 11 5.6-1.22 9-5.95 9-11V7l-9-5Zm0 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 11c-2.2 0-4.15-.9-5.5-2.35.03-1.83 3.67-2.84 5.5-2.84 1.82 0 5.47 1 5.5 2.84C16.14 18.1 14.2 19 12 19Z"/></svg>`,
    db: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C7.03 3 3 4.79 3 7v10c0 2.21 4.03 4 9 4s9-1.79 9-4V7c0-2.21-4.03-4-9-4Zm0 2c4.42 0 7 .99 7 2s-2.58 2-7 2-7-.99-7-2 2.58-2 7-2Zm0 14c-4.42 0-7-.99-7-2v-2.2c1.63 1.01 4.33 1.7 7 1.7s5.37-.69 7-1.7V17c0 1.01-2.58 2-7 2Zm0-5c-4.42 0-7-.99-7-2v-2.2c1.63 1.01 4.33 1.7 7 1.7s5.37-.69 7-1.7V12c0 1.01-2.58 2-7 2Z"/></svg>`,
    delete: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4a1 1 0 1 1 0-2h4V4a1 1 0 0 1 1-1Zm1 2v0h4V5h-4Zm-1 5a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm6 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Z"/></svg>`
  }
  return icons[kind] || ''
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
      const cmsIcon = CMS_SVG[s.cms] || `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/></svg>`
      const siteUrl = s.url || `http://localhost/${s.name}`

      card.innerHTML = `
        <div class="site-card-header">
          <div class="site-cms-badge">${cmsIcon}</div>
          <div class="site-header-info">
            <a class="site-name" href="${siteUrl}" target="_blank">${s.name}</a>
            <div class="site-cms-label">${s.cms || 'Unknown'}</div>
          </div>
        </div>
        <div class="site-card-body">
          <div class="site-url">${siteUrl}</div>
          <div class="site-actions site-actions-inline">
            <button class="site-icon-btn" title="${t('sites_info') || 'Info'}" onclick="showSiteInfo('${s.name}', this)">${actionIcon('info')} Info</button>
            <button class="site-icon-btn" title="${t('browser_title') || 'Archivos'}" onclick="browseDir('/${s.name}')">${actionIcon('files')} Files</button>
            <button class="site-icon-btn" title="${t('sites_admin') || 'Admin'}" onclick="window.open('${s.adminUrl}','_blank')">${actionIcon('admin')} Admin</button>
            <button class="site-icon-btn" title="${t('sites_db') || 'Database'}" onclick="window.open('${s.phpmyadminUrl}','_blank')">${actionIcon('db')} DB</button>
            <button class="site-icon-btn danger" title="${t('sites_delete') || 'Eliminar'}" onclick="deleteSite('${s.name}', this)">${actionIcon('delete')}</button>
          </div>
        </div>
      `
      grid.appendChild(card)
    }
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red)">${err.message}</p>`
  }
}

async function deleteSite(siteName, btn = null) {
  const dropDb = confirm(`${t('sites_confirm_delete') || '¿Eliminar este sitio?'}\n\n${siteName}\n\n${t('sites_confirm_dropdb') || '¿También eliminar la base de datos? (Aceptar = sí, Cancelar = no)'}`)
  const proceed = confirm(`${t('sites_confirm_delete_final') || 'Confirmación final: ¿Seguro que quieres eliminar el sitio?'}\n\n${siteName}`)
  if (!proceed) return
  setButtonLoading(btn, true)
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(siteName)}?dropDb=${dropDb ? '1' : '0'}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Delete failed')
    alert(`${t('sites_deleted') || 'Sitio eliminado'}: ${siteName}`)
    loadSites()
  } catch (err) {
    alert(err.message)
  } finally {
    setButtonLoading(btn, false)
  }
}

function formatSiteInfoText(info) {
  return [
    `CMS: ${info.cms || ''}`,
    `Sitio: ${info.site || ''}`,
    '',
    `Frontend URL: ${info.urls?.frontend || ''}`,
    `Admin URL: ${info.urls?.admin || ''}`,
    `phpMyAdmin URL: ${info.urls?.phpmyadmin || ''}`,
    '',
    `DB Host: ${info.db?.host || ''}`,
    `DB Name: ${info.db?.name || ''}`,
    `DB User: ${info.db?.user || ''}`,
    `DB Password: ${info.db?.password ?? ''}`,
    '',
    `Admin User: ${info.admin?.username || ''}`,
    `Admin Password: ${info.admin?.password ?? ''}`,
    `Admin Email: ${info.admin?.email || ''}`,
    '',
    `Theme: ${info.currentTheme || ''}`,
    `Active Plugins: ${(info.activePlugins || []).join(', ')}`
  ].join('\n')
}

async function showSiteInfo(siteName, btn = null) {
  setButtonLoading(btn, true)
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(siteName)}/info`)
    const info = await res.json()
    if (!res.ok) throw new Error(info.error || 'Error')
    const text = formatSiteInfoText(info)
    window.currentSiteInfo = info
    openSiteInfoModal(siteName, text, info)
  } catch (err) {
    alert(err.message)
  } finally {
    setButtonLoading(btn, false)
  }
}

function infoRow(label, value, copyable = false) {
  if (!value && value !== 0) return ''
  const id = `ir-${Math.random().toString(36).slice(2)}`
  const copy = copyable
    ? `<button class="info-copy-btn" onclick="navigator.clipboard.writeText('${String(value).replace(/'/g, "\\'")}')">⎘</button>`
    : ''
  return `<div class="info-row"><span class="info-label">${label}</span><span class="info-value" id="${id}">${value}</span>${copy}</div>`
}

function openSiteInfoModal(siteName, text, info) {
  const old = document.getElementById('site-info-modal')
  if (old) old.remove()

  const plugins = (info.activePlugins || [])
  const pluginBadges = plugins.length
    ? plugins.map(p => `<span class="info-badge">${p}</span>`).join('')
    : '<span style="color:var(--muted)">—</span>'

  const isWP = info.cms === 'WordPress'

  const modal = document.createElement('div')
  modal.id = 'site-info-modal'
  modal.innerHTML = `
    <div class="site-info-box">
      <div class="site-info-header">
        <strong>${siteName}</strong>
        <span class="info-cms-tag">${info.cms || ''}</span>
        <button class="info-close-btn" onclick="document.getElementById('site-info-modal').remove()">✕</button>
      </div>
      <div class="site-info-scroll">
        <div class="info-section">
          <div class="info-section-title">URLs</div>
          ${infoRow('Frontend', `<a href="${info.urls?.frontend}" target="_blank">${info.urls?.frontend}</a>`)}
          ${infoRow('Admin', `<a href="${info.urls?.admin}" target="_blank">${info.urls?.admin}</a>`)}
          ${infoRow('phpMyAdmin', `<a href="${info.urls?.phpmyadmin}" target="_blank">Abrir phpMyAdmin</a>`)}
        </div>
        <div class="info-section">
          <div class="info-section-title">Base de datos</div>
          ${infoRow('Nombre', info.db?.name, true)}
          ${infoRow('Host', info.db?.host)}
          ${infoRow('Usuario', info.db?.user, true)}
          ${infoRow('Contraseña', info.db?.password !== undefined ? (info.db.password || '(vacía)') : '', true)}
        </div>
        ${info.admin?.username ? `
        <div class="info-section">
          <div class="info-section-title">Admin</div>
          ${infoRow('Usuario', info.admin.username, true)}
          ${infoRow('Contraseña', info.admin.password || '', true)}
          ${infoRow('Email', info.admin.email || '')}
        </div>` : ''}
        ${isWP ? `
        <div class="info-section">
          <div class="info-section-title">WordPress</div>
          ${infoRow('Tema activo', info.currentTheme)}
          <div class="info-row info-row-wrap">
            <span class="info-label">Plugins activos</span>
            <span class="info-badges">${pluginBadges}</span>
          </div>
        </div>` : ''}
      </div>
      <div class="site-info-actions">
        <button onclick="copySiteInfo()">${t('copy') || 'Copiar todo'}</button>
        ${isWP ? `
        <button onclick="openUserAction('${siteName}','change_password')">${t('site_change_pass') || 'Cambiar contraseña'}</button>
        <button onclick="openUserAction('${siteName}','add_user')">${t('site_add_user') || 'Agregar usuario'}</button>` : ''}
      </div>
      <div id="site-user-action"></div>
    </div>`

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
  document.body.appendChild(modal)
}

function copySiteInfo() {
  const ta = document.getElementById('site-info-text')
  ta.select()
  document.execCommand('copy')
}

function openUserAction(siteName, action) {
  const box = document.getElementById('site-user-action')
  if (action === 'change_password') {
    const users = Array.isArray(window.currentSiteInfo?.users) ? window.currentSiteInfo.users : []
    const usersOptions = users.map(u => `<option value="${u}">${u}</option>`).join('')
    box.innerHTML = `
      <div class="site-user-form">
        <select id="su-username">${usersOptions || '<option value="">(sin usuarios)</option>'}</select>
        <input id="su-password" placeholder="new password">
        <button onclick="submitUserAction('${siteName}','change_password')">${t('terminal_run') || 'Ejecutar'}</button>
      </div>`
  } else {
    box.innerHTML = `
      <div class="site-user-form">
        <input id="su-username" placeholder="username">
        <input id="su-email" placeholder="email">
        <input id="su-password" placeholder="password">
        <select id="su-role">
          <option value="subscriber">subscriber</option>
          <option value="contributor">contributor</option>
          <option value="author" selected>author</option>
          <option value="editor">editor</option>
          <option value="administrator">administrator</option>
        </select>
        <button onclick="submitUserAction('${siteName}','add_user')">${t('terminal_run') || 'Ejecutar'}</button>
      </div>`
  }
}

async function submitUserAction(siteName, action) {
  const payload = { action, username: document.getElementById('su-username')?.value?.trim() }
  if (action === 'change_password') {
    payload.password = document.getElementById('su-password')?.value || ''
  } else {
    payload.email = document.getElementById('su-email')?.value?.trim() || ''
    payload.password = document.getElementById('su-password')?.value || ''
    payload.role = document.getElementById('su-role')?.value?.trim() || ''
  }
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(siteName)}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error')
    alert(data.message || 'OK')
    showSiteInfo(siteName)
  } catch (err) {
    alert(err.message)
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

async function loadPhpRuntimeOptions() {
  const sel = document.getElementById('php-runtime-select')
  const cur = document.getElementById('php-runtime-current')
  if (!sel) return
  try {
    const res = await fetch('/api/config/php-runtime/options')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error')
    sel.innerHTML = ''
    for (const op of (data.options || [])) {
      const o = document.createElement('option')
      o.value = op.key
      o.textContent = op.label
      if (op.key === data.current) o.selected = true
      sel.appendChild(o)
    }
    if (cur) {
      cur.textContent = data.runtime_php_version
        ? `${t('config_php_runtime_current') || 'Versión PHP actual'}: ${data.runtime_php_version}`
        : (t('config_php_runtime_current_unknown') || 'No se pudo detectar la versión PHP en runtime')
    }
  } catch (err) {
    console.error(err)
  }
}

async function savePhpRuntime() {
  const sel = document.getElementById('php-runtime-select')
  const flash = document.getElementById('php-runtime-flash')
  if (!sel || !flash) return
  flash.className = 'flash'
  try {
    const res = await fetch('/api/config/php-runtime/options', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ php_base_image: sel.value }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error')
    flash.textContent = `${data.message} ${data.apply_commands?.join(' ; ')}`
    flash.className = 'flash ok'
  } catch (err) {
    flash.textContent = err.message
    flash.className = 'flash err'
  }
}

// CMS Installer
async function installCMS(btn = null) {
  const body = {
    cms: document.getElementById('i-cms').value,
    version: document.getElementById('i-version')?.value || '',
    customUrl: document.getElementById('i-custom-url')?.value?.trim() || '',
    dir: document.getElementById('i-dir').value.trim(),
    title: document.getElementById('i-title').value.trim(),
    adminUser: document.getElementById('i-user').value.trim(),
    adminPass: document.getElementById('i-pass').value,
    adminEmail: document.getElementById('i-email').value.trim(),
    overwrite: !!document.getElementById('i-overwrite')?.checked,
  }

  if (!body.dir || !body.title || !body.adminUser || !body.adminPass || !body.adminEmail) {
    return alert('Please fill all fields.')
  }
  const cms = body.cms?.toLowerCase()
  if ((cms === 'joomla' || cms === 'drupal') && body.adminPass.length < 12) {
    return alert(`${body.cms} requires a password of at least 12 characters.`)
  }

  const log = document.getElementById('install-log')
  const installBtn = btn || document.getElementById('install-btn')
  log.innerHTML = ''
  log.classList.add('visible')
  setButtonLoading(installBtn, true)

  const addLine = (cls, msg) => {
    const el = document.createElement('div')
    el.className = cls
    el.textContent = msg
    log.appendChild(el)
    log.scrollTop = log.scrollHeight
  }

  const runInstallStream = async (payload) => {
    let dirExists = false
    const res = await fetch('/api/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
            if (ev.code === 'DIR_EXISTS') {
              dirExists = true
            } else {
              addLine('err', `✗ ${ev.error}`)
            }
          } else if (ev.step === 'done') {
            addLine('done', `✓ ${t('install_done')}`)
            addLine('done', `→ ${ev.url}`)
            const link = document.createElement('a')
            link.href = ev.url
            link.target = '_blank'
            link.textContent = t('install_visit')
            link.style.color = 'var(--accent2)'
            log.appendChild(link)
            if (ev.adminUrl) {
              const sep = document.createTextNode(' · ')
              const adminLink = document.createElement('a')
              adminLink.href = ev.adminUrl
              adminLink.target = '_blank'
              adminLink.textContent = t('install_visit_admin')
              adminLink.style.color = 'var(--accent)'
              log.appendChild(sep)
              log.appendChild(adminLink)
            }
          } else if (ev.step === 'summary' && ev.summary) {
            const summaryBlock = document.createElement('textarea')
            summaryBlock.className = 'install-summary'
            summaryBlock.readOnly = true
            summaryBlock.value = formatSiteInfoText(ev.summary)
            log.appendChild(summaryBlock)
          } else {
            addLine('step', `[${ev.step}] ${ev.message}`)
          }
        } catch {}
      }
    }
    return { dirExists }
  }

  try {
    const first = await runInstallStream(body)
    if (first.dirExists) {
      if (body.overwrite) {
        addLine('step', '[prepare] Sobrescribiendo directorio existente...')
        await runInstallStream(body)
      } else {
        const ok = confirm(`El directorio "${body.dir}" ya existe. ¿Deseas sobreescribirlo?`)
        if (ok) {
          addLine('step', '[prepare] Sobrescribiendo directorio existente...')
          body.overwrite = true
          await runInstallStream(body)
        } else {
          addLine('err', `✗ Directory ${body.dir} already exists in htdocs`)
        }
      }
    }
  } catch (err) {
    addLine('err', `✗ ${err.message}`)
  } finally {
    setButtonLoading(installBtn, false)
  }
}

async function loadInstallVersions() {
  const cms = document.getElementById('i-cms')?.value
  const sel = document.getElementById('i-version')
  if (!cms || !sel) return
  sel.innerHTML = `<option value="">${t('install_version_latest') || 'Latest compatible'}</option>`
  try {
    const res = await fetch(`/api/install/versions?cms=${encodeURIComponent(cms)}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error loading versions')
    for (const v of (data.versions || [])) {
      const op = document.createElement('option')
      op.value = v.version
      const tag = (v.channel || '').toLowerCase()
      const label = tag === 'lts'
        ? 'LTS'
        : (tag === 'stable' ? 'Stable' : (tag === 'legacy' ? 'Legacy' : ''))
      op.textContent = label ? `${v.version} (${label})` : v.version
      sel.appendChild(op)
    }
  } catch (err) {
    console.error(err)
  }
}

let terminalSessionId = null
let terminalSource = null
let xtermInstance = null
let xtermFit = null

function initXterm() {
  if (xtermInstance) return
  const container = document.getElementById('terminal-xterm')
  if (!container || typeof Terminal === 'undefined') return
  xtermInstance = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'Fira Code', 'Cascadia Code', monospace",
    theme: {
      background: '#0d0d0d',
      foreground: '#e0e0e0',
      cursor: '#f97316',
      selectionBackground: 'rgba(249,115,22,0.3)',
    },
    scrollback: 2000,
  })
  xtermFit = new FitAddon.FitAddon()
  xtermInstance.loadAddon(xtermFit)
  xtermInstance.open(container)
  xtermFit.fit()
  xtermInstance.onData((data) => {
    if (!terminalSessionId) return
    fetch(`/api/terminal/input/${terminalSessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    }).catch(() => {})
  })
  window.addEventListener('resize', () => { if (xtermFit) xtermFit.fit() })
}

async function startTerminalSession(btn = null) {
  const cwd = document.getElementById('term-cwd').value.trim() || '/'
  if (terminalSessionId) await stopTerminalSession()
  setButtonLoading(btn, true)
  initXterm()
  try {
    const res = await fetch('/api/terminal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Terminal start failed')
    terminalSessionId = data.session_id
    terminalSource = new EventSource(`/api/terminal/stream/${terminalSessionId}`)
    terminalSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data)
        if (payload.output && xtermInstance) xtermInstance.write(payload.output)
      } catch {}
    }
  } catch (err) {
    if (xtermInstance) xtermInstance.writeln(`\r\nError: ${err.message}`)
  } finally {
    setButtonLoading(btn, false)
    setTimeout(() => { if (xtermFit) xtermFit.fit() }, 50)
  }
}

async function sendTerminalCtrlC() {
  if (!terminalSessionId) return
  await fetch(`/api/terminal/input/${terminalSessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: '\u0003' }),
  })
}

async function stopTerminalSession() {
  if (terminalSource) { terminalSource.close(); terminalSource = null }
  if (!terminalSessionId) return
  const id = terminalSessionId
  terminalSessionId = null
  await fetch(`/api/terminal/stop/${id}`, { method: 'POST' }).catch(() => {})
  if (xtermInstance) xtermInstance.writeln('\r\n[disconnected]')
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
  applyTheme()
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
loadInstallVersions()
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
phpinfo();
?>`,

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
    theme: cmTheme(),
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
    theme: cmTheme(),
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
        <span class="gallery-item-res"></span>
      </div>
      <div class="gallery-item-name" title="${img.path}">${img.name}</div>
      <div class="gallery-item-actions">
        <button onclick="galleryRename('${img.path}')">✏️</button>
        <button class="danger" onclick="galleryDelete('${img.path}')">🗑️</button>
      </div>`
    const imgEl = item.querySelector('img')
    const resEl = item.querySelector('.gallery-item-res')
    imgEl.addEventListener('load', () => {
      resEl.textContent = `${imgEl.naturalWidth}×${imgEl.naturalHeight}`
    })
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
