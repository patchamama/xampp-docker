<div align="center">

# XAMPP Docker Stack

**A modern Docker-based replacement for XAMPP on macOS**

Built-in multilingual control panel · CMS auto-detection · One-click installers · Live file editor

[![PHP](https://img.shields.io/badge/PHP-8.2-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![Apache](https://img.shields.io/badge/Apache-2.4-D22128?logo=apache&logoColor=white)](https://httpd.apache.org/)
[![MariaDB](https://img.shields.io/badge/MariaDB-10.4-003545?logo=mariadb&logoColor=white)](https://mariadb.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## Stack

| Service | Version | Port |
|---------|---------|------|
| **Apache** | 2.4 | 80, 443 |
| **PHP** | 8.2.x | — |
| **MariaDB** | 10.4.x | 3306 |
| **phpMyAdmin** | 5.2.x | 8081 |
| **ProFTPD** | 1.3.x (Debian Bookworm) | 21 |
| **Python** | 3.13.x | — |
| **Node.js** | 20 LTS | — |
| **Control Panel** | Node.js 20 / Express 4 | 8080 |

<details>
<summary><strong>PHP extensions included</strong></summary>

`pdo_mysql` · `mysqli` · `mbstring` · `gd` · `zip` · `curl` · `opcache` · `intl` · `soap` · `xml` · `bcmath` · `imagick`

</details>

<details>
<summary><strong>Global npm packages included</strong></summary>

`pm2` · `nodemon` · `yarn` · `typescript`

</details>

---

## Control Panel

Open **http://localhost:8080** after starting the stack.

| Section | What it does |
|---------|-------------|
| ⚡ **Services** | Start / Stop / Restart Apache, MySQL, ProFTPD with live green/red indicators |
| 🌐 **Sites** | Scans htdocs, detects CMS type, shows favicon and direct link per site |
| 🗄️ **phpMyAdmin** | One-click link to the database admin UI |
| ⚙️ **Configuration** | Edit `php.ini`, `httpd.conf`, `my.cnf` in CodeMirror; saves and restarts the service |
| 📦 **Install CMS** | Silent installer for WordPress, Joomla, MediaWiki, Drupal — always latest version |
| 📁 **Files** | Full htdocs browser with CodeMirror editor, file execution, and image gallery |
| 🔬 **Languages** | Interactive PHP / Python / Node.js scratchpad with syntax highlighting |
| 📋 **Logs** | Live log tail (Apache, MySQL, ProFTPD, Panel) via Server-Sent Events |

The UI is available in **🇪🇸 Spanish**, **🇬🇧 English**, and **🇩🇪 German** — language persists across sessions.

---

## Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| **Docker Desktop** | 4.x+ | [Download](https://www.docker.com/products/docker-desktop/) |
| **macOS** | 12 Monterey+ | Apple Silicon and Intel supported |

> **Linux:** `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER`

---

## Quick Start

```bash
cd /Applications/XAMPP/Docker
./start-docker.sh
```

The script shows an interactive menu:

```
  [1] Start the stack          (normal — fastest)
  [2] Copy XAMPP data first    (first run with existing XAMPP)
  [3] Rebuild everything       (clean rebuild from scratch, no cache)
```

| Option | When to use |
|--------|------------|
| **1** | Day-to-day start — data already in place |
| **2** | First run — copies htdocs and MySQL from XAMPP to `~/xampp-data/`, updates `.env` automatically. Requires `sudo`. |
| **3** | After `Dockerfile` changes — stops containers, removes local images, clears build cache, rebuilds with `--no-cache --pull`. Data is never touched. |

The script also auto-starts Docker Desktop if not running, stops conflicting XAMPP services, and waits for each container to be healthy before printing the access URLs.

---

## Access URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| 🖥️ **Control Panel** | http://localhost:8080 | — |
| 🌐 **Web Server** | http://localhost | — |
| 🔒 **HTTPS** | https://localhost | self-signed cert |
| 🗄️ **phpMyAdmin** | http://localhost:8081 | `root` / *(empty)* |
| 📂 **FTP** | ftp://localhost:21 | see `proftpd.conf` |

---

## Migration from XAMPP

Follow these steps if you have an existing XAMPP installation with databases and sites to preserve.

### 1 — Add file sharing in Docker Desktop

**Docker Desktop → Settings → Resources → File Sharing** → add `/Applications/XAMPP` → **Apply & Restart**

### 2 — Copy MySQL data

Docker Desktop's virtiofs (`/Applications`) does not support InnoDB file operations (`fallocate`, file locking). The home directory uses gRPC FUSE which works correctly.

```bash
mkdir -p ~/xampp-data/mysql
sudo cp -rp /Applications/XAMPP/xamppfiles/var/mysql/. ~/xampp-data/mysql/
sudo chown -R $(whoami) ~/xampp-data/mysql/
```

### 3 — Configure .env

```bash
cat > /Applications/XAMPP/Docker/.env << 'EOF'
MYSQL_ALLOW_EMPTY_PASSWORD=yes
MYSQL_HOST=mariadb

PANEL_PORT=8080
PHPMYADMIN_PORT=8081
HTTP_PORT=80
HTTPS_PORT=443
FTP_PORT=21

HTDOCS_PATH=/Applications/XAMPP/xamppfiles/htdocs
MYSQL_DATA_PATH=/Users/YOUR_USERNAME/xampp-data/mysql
CONFIG_PATH=/Users/YOUR_USERNAME/xampp-data/config
SSL_PATH=./ssl
EOF
```

Replace `YOUR_USERNAME` with your macOS username (`whoami`).

### 4 — Start with option 2

```bash
./start-docker.sh   # choose [2]
```

### 5 — Verify

```bash
docker exec xampp-mariadb mysql -u root -e "SHOW DATABASES;"
```

---

## Fresh Installation

```bash
mkdir -p ~/xampp-data/mysql ~/Sites

cat > /Applications/XAMPP/Docker/.env << 'EOF'
MYSQL_ALLOW_EMPTY_PASSWORD=yes
MYSQL_HOST=mariadb
PANEL_PORT=8080
PHPMYADMIN_PORT=8081
HTTP_PORT=80
HTTPS_PORT=443
FTP_PORT=21
HTDOCS_PATH=/Users/YOUR_USERNAME/Sites
MYSQL_DATA_PATH=/Users/YOUR_USERNAME/xampp-data/mysql
CONFIG_PATH=/Users/YOUR_USERNAME/xampp-data/config
SSL_PATH=./ssl
EOF

./start-docker.sh   # choose [1]
```

Then open **http://localhost:8080 → Install CMS** to set up your first site.

---

## File Browser

The **Files** section is a full htdocs explorer built into the control panel.

### Editor

Click any text file to open it in **CodeMirror 5** with syntax highlighting:

| Extension(s) | Language |
|-------------|---------|
| `.php` | PHP + HTML mixed |
| `.js` / `.ts` | JavaScript / TypeScript |
| `.css` | CSS |
| `.json` | JSON |
| `.xml` | XML |
| `.html` / `.htm` | HTML mixed |
| `.py` | Python |
| `.sql` | SQL |
| `.md` | Markdown |
| `.sh` | Shell / Bash |
| `.ini` / `.conf` / `.cnf` / `.env` | Properties / INI |
| `.htaccess` / `.htpasswd` / `.gitignore` | Plain text |
| `.yaml` / `.yml` / `.toml` / `.twig` / `.blade` | Plain text |

### Running files

| Extension | Action |
|-----------|--------|
| `.php` / `.html` | Opens via Apache in a new tab (↗) |
| `.py` | Executes via Python 3.13 inside the container |
| `.js` | Executes via Node.js 20 inside the container |

### Image viewer

Click an image (PNG, JPG, GIF, WebP, SVG, ICO, BMP, AVIF) to view it fullscreen inside the editor panel.

Use the **⊞** button to open a **mosaic gallery** of all images in the current directory tree. From the gallery:
- Click a thumbnail → view fullscreen
- ✏️ → rename
- 🗑️ → delete

---

## CMS Auto-Detection

| File detected | CMS |
|--------------|-----|
| `wp-config.php` | WordPress |
| `LocalSettings.php` | MediaWiki |
| `configuration.php` + `libraries/` | Joomla |
| `composer.json` with `drupal/core` | Drupal |
| `index.php` (fallback) | Generic PHP site |

---

## Configuration Files

| File | Affects | Auto-restart |
|------|---------|-------------|
| `php.ini` | PHP limits, extensions, error reporting | Apache |
| `httpd.conf` | Virtual hosts, mod_rewrite, SSL | Apache |
| `my.cnf` | MariaDB memory, charset, InnoDB tuning | MariaDB |

Edit from **Control Panel → Configuration** — changes are saved and the container restarts automatically.

---

## Directory Structure

```
Docker/
├── docker-compose.yml          # Service definitions
├── .env                        # Local paths and ports (git-ignored)
├── Dockerfile.php              # PHP 8.2 + Apache + Python 3.13 + Node.js 20
├── Dockerfile.proftpd          # ProFTPD on Debian Bookworm
├── start-docker.sh             # Interactive startup script
├── config/
│   ├── apache/httpd.conf
│   ├── php/php.ini
│   ├── mysql/my.cnf
│   └── proftpd/proftpd.conf
├── ssl/
│   ├── server.crt              # git-ignored
│   └── server.key              # git-ignored
└── panel/                      # Control panel — Node.js / Express
    ├── server.js
    ├── package.json
    ├── Dockerfile
    ├── public/
    │   ├── index.html
    │   ├── css/style.css
    │   ├── js/app.js
    │   └── i18n/               # es.json  en.json  de.json
    └── routes/
        ├── services.js         # Container start/stop via Docker socket
        ├── config.js           # Read/write config files
        ├── sites.js            # CMS detection + favicon
        ├── phpinfo.js          # Live phpinfo() execution
        ├── installer.js        # CMS silent installer (SSE progress)
        ├── languages.js        # PHP / Python / Node.js execution
        ├── browser.js          # File tree, editor, image server
        └── logs.js             # Live log streaming (SSE)
```

---

## Commands

```bash
# Start (interactive menu)
./start-docker.sh

# Stop
docker compose down

# Restart one service
docker compose restart php-apache
docker compose restart mariadb
docker compose restart control-panel

# Logs
docker compose logs -f
docker compose logs -f mariadb

# Shell access
docker exec -it xampp-php bash
docker exec -it xampp-mariadb mysql -u root

# Runtime versions
docker exec xampp-php php --version
docker exec xampp-php python3 --version
docker exec xampp-php node --version

# Rebuild control panel after editing panel/public/*
docker compose build control-panel && docker compose up -d control-panel

# Full clean rebuild
docker compose down --volumes --remove-orphans
docker compose build --no-cache --pull
docker compose up -d
```

---

## Troubleshooting

<details>
<summary><strong>Mounts denied — Docker file sharing error</strong></summary>

```
Mounts denied: The path ... is not shared from the host
```

**Fix:** Docker Desktop → Settings → Resources → File Sharing → add the missing path → Apply & Restart.

</details>

<details>
<summary><strong>MariaDB crashes with OS error 22</strong></summary>

```
InnoDB: Operating system error number 22 in a file operation.
```

**Cause:** MySQL data is on a virtiofs mount (`/Applications`), which doesn't support InnoDB's `fallocate` calls.

**Fix:** Copy data to your home directory — see [Migration from XAMPP](#migration-from-xampp), Step 2.

</details>

<details>
<summary><strong>permission denied on .docker/buildx/current</strong></summary>

```bash
sudo chown $(whoami) ~/.docker/buildx/current
```

</details>

<details>
<summary><strong>Databases not visible after start</strong></summary>

A Docker named volume from a previous run may be shadowing the bind mount:

```bash
docker compose down
docker volume rm xampp_mariadb_data
docker compose up -d
```

Verify the correct mount:

```bash
docker inspect xampp-mariadb --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

The source must point to `~/xampp-data/mysql`, not `/var/lib/docker/volumes/...`.

</details>

<details>
<summary><strong>WordPress "Error establishing a database connection"</strong></summary>

WordPress migrated from XAMPP uses `DB_HOST=localhost` (Unix socket), which doesn't resolve inside Docker. Fix:

```bash
sed -i "s/'DB_HOST', 'localhost'/'DB_HOST', 'mariadb'/" /path/to/htdocs/your-site/wp-config.php
```

Or edit `wp-config.php` directly from **Control Panel → Files**.

</details>

<details>
<summary><strong>Panel changes (HTML/CSS/JS) not visible</strong></summary>

Static files are baked into the image at build time. Rebuild after any change to `panel/public/`:

```bash
docker compose build control-panel && docker compose up -d control-panel
```

</details>

<details>
<summary><strong>phpMyAdmin "Host not allowed" error</strong></summary>

The MariaDB root user may lack a wildcard host grant:

```bash
docker exec -it xampp-mariadb mysql -u root -e \
  "GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED VIA mysql_native_password USING '' WITH GRANT OPTION; FLUSH PRIVILEGES;"
```

</details>

---

## Data Locations

| Data | Location |
|------|----------|
| Web files (htdocs) | `HTDOCS_PATH` in `.env` |
| MySQL databases | `MYSQL_DATA_PATH` in `.env` |
| Config files | `CONFIG_PATH` in `.env` |
| SSL certificates | `Docker/ssl/` (git-ignored) |

> Data directories are bind-mounted from your host. **Removing or recreating containers does not delete your databases or files.**

---

<div align="center">
<sub>Built as a drop-in replacement for XAMPP · macOS · Docker Desktop · Apache · MariaDB · PHP · Python · Node.js</sub>
</div>
