# XAMPP Docker Stack

A modern Docker-based replacement for XAMPP on macOS, with a built-in multilingual control panel (ES / EN / DE), CMS installer, and full support for migrating existing XAMPP databases and sites.

---

## Tech Stack

| Service | Image / Version | Port |
|---------|----------------|------|
| **Apache + PHP** | `php:8.2-apache` | 80, 443 |
| **MariaDB** | `mariadb:10.4` | 3306 |
| **phpMyAdmin** | `phpmyadmin:5.2` | 8081 |
| **ProFTPD** | Debian Bookworm (custom build) | 21 |
| **Control Panel** | Node.js 20 LTS (custom build) | 8080 |
| **Python** | 3.13 (inside php-apache container) | — |
| **Node.js** | 20 LTS (inside php-apache container) | — |

### PHP Extensions included
`pdo_mysql` · `mysqli` · `mbstring` · `gd` · `zip` · `curl` · `opcache` · `intl` · `soap` · `xml` · `bcmath` · `imagick`

### Global npm packages included
`pm2` · `nodemon` · `yarn` · `typescript`

---

## Control Panel Features

- **Services** — Start / Stop / Restart Apache, MySQL, ProFTPD with live status indicators
- **Sites** — Auto-detects CMS type from htdocs (WordPress, Joomla, MediaWiki, Drupal, PHP); shows favicon/CMS logo and direct links
- **phpMyAdmin** — Direct link to database admin UI
- **Configuration** — Edit `php.ini`, `httpd.conf`, `my.cnf` with CodeMirror in-browser editor; saves and restarts the service automatically
- **Install CMS** — One-click installer for WordPress, Joomla, MediaWiki, Drupal (always fetches latest version, creates DB automatically, real-time progress via SSE)
- **Files (Browser)** — Full file tree explorer for htdocs with collapsible tree panel and breadcrumb navigation:
  - Edit any text file with CodeMirror (syntax highlight for PHP, JS, CSS, Python, SQL, JSON, XML, Markdown, `.htaccess`, `.env`, INI, shell, and more)
  - Run PHP and HTML files directly in the browser via Apache
  - Execute Python and Node.js scripts inline and see output
  - View images inline (PNG, JPG, GIF, WebP, SVG, ICO, BMP, AVIF)
  - Image gallery mosaic with rename and delete per image
  - Rename and delete files
- **Languages** — Interactive code editor (PHP, phpinfo(), Python, Node.js) with CodeMirror syntax highlighting; output panel expands on run
- **Live Logs** — Tail logs from Apache, MySQL, ProFTPD, or the panel itself in real time via SSE
- **Multilingual UI** — Spanish, English, German; language persists via localStorage

---

## Prerequisites

- **Docker Desktop** for macOS — [download](https://www.docker.com/products/docker-desktop/)
- macOS 12+ (Apple Silicon or Intel)

> On Linux, install Docker Engine: `curl -fsSL https://get.docker.com | sh`

---

## Quick Start

```bash
cd /Applications/XAMPP/Docker
./start-docker.sh
```

The script presents an interactive menu:

```
[1] Start the stack          (normal — fastest)
[2] Copy XAMPP data first    (first run from existing XAMPP)
[3] Rebuild everything       (clean rebuild from scratch, no cache)
```

**Option 1** — normal start. Assumes data and config are already in place.

**Option 2** — copies htdocs and MySQL data from XAMPP to `~/xampp-data/`, updates `.env` with absolute paths, then starts. Requires `sudo` to read XAMPP-owned files.

**Option 3** — full teardown: stops containers, removes locally built images, clears Docker build cache, rebuilds all images with `--no-cache --pull`, then starts. Data in `~/xampp-data/` is never touched.

The script also:
- Checks Docker is installed and running (auto-starts Docker Desktop on macOS)
- Detects and stops conflicting XAMPP services (ports 80, 3306)
- Verifies Docker file sharing permissions
- Waits for each service to be healthy before printing access URLs

---

## Scenario A — Migrating from an existing XAMPP installation

Follow these steps **in order** if you have an existing XAMPP with databases and sites you want to preserve.

### Step 1 — Add file sharing in Docker Desktop

Docker Desktop on macOS restricts which directories containers can access.

Go to: **Docker Desktop → Settings → Resources → File Sharing**

Add: `/Applications/XAMPP`

Click **Apply & Restart**.

### Step 2 — Copy MySQL data to your home directory

Docker Desktop's virtiofs filesystem (used for `/Applications`) does **not** support the low-level file operations InnoDB requires (`fallocate`, file locking). The home directory uses gRPC FUSE which works correctly.

```bash
mkdir -p ~/xampp-data/mysql
sudo cp -rp /Applications/XAMPP/xamppfiles/var/mysql/. ~/xampp-data/mysql/
sudo chown -R $(whoami) ~/xampp-data/mysql/
```

> **Why?** MariaDB crashes with `OS error 22 / Invalid argument` when `ibdata1` is on a virtiofs mount. Copying to `~/xampp-data/mysql` solves this permanently.

### Step 3 — Configure .env

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
SSL_PATH=./ssl
EOF
```

Replace `YOUR_USERNAME` with your macOS username (`whoami` to check).

### Step 4 — Fix buildx permissions (if needed)

If you see `open /Users/.../.docker/buildx/current: permission denied`:

```bash
sudo chown $(whoami) ~/.docker/buildx/current
```

### Step 5 — Start the stack

```bash
./start-docker.sh
```

### Step 6 — Verify databases

```bash
docker exec xampp-mariadb mysql -u root -e "SHOW DATABASES;"
```

You should see your original databases (`espirales`, `odc`, `sallydb`, etc.).

---

## Scenario B — Fresh installation (no existing XAMPP)

### Step 1 — Configure .env

```bash
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
SSL_PATH=./ssl
EOF
```

Set `HTDOCS_PATH` to any directory where you want your web projects to live.

### Step 2 — Create the data directories

```bash
mkdir -p ~/xampp-data/mysql
mkdir -p ~/Sites
```

### Step 3 — Add file sharing in Docker Desktop

**Docker Desktop → Settings → Resources → File Sharing**

Add the paths you set in `.env` (e.g. `/Users/YOUR_USERNAME/Sites`). The home directory `~` is shared by default, so `~/xampp-data` does not need to be added.

### Step 4 — Start the stack

```bash
./start-docker.sh
```

MariaDB will initialize a fresh empty database on first run.

### Step 5 — Install a CMS via the control panel

Open `http://localhost:8080` → **Install CMS** → fill the form → click Install.

The panel will download the latest version, create the database, and complete the silent installation automatically.

---

## Access URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| **Control Panel** | http://localhost:8080 | — |
| **Web Server** | http://localhost | — |
| **Web Server (HTTPS)** | https://localhost | self-signed cert |
| **phpMyAdmin** | http://localhost:8081 | root / *(empty)* |
| **FTP** | ftp://localhost:21 | configured in proftpd.conf |

---

## Directory Structure

```
Docker/
├── docker-compose.yml          # Service definitions
├── .env                        # Paths and port configuration
├── Dockerfile.php              # PHP 8.2 + Apache + Python + Node.js
├── Dockerfile.proftpd          # ProFTPD on Debian Bookworm
├── Makefile                    # Helper commands
├── start-docker.sh             # Interactive startup script (3 options)
├── config/
│   ├── apache/httpd.conf       # Apache virtual host config
│   ├── php/php.ini             # PHP configuration
│   ├── mysql/my.cnf            # MariaDB configuration
│   └── proftpd/proftpd.conf    # FTP server configuration
├── ssl/
│   ├── server.crt              # SSL certificate
│   └── server.key              # SSL private key
└── panel/                      # Control panel (Node.js/Express)
    ├── server.js
    ├── package.json
    ├── Dockerfile
    ├── public/
    │   ├── index.html
    │   ├── css/style.css
    │   ├── js/app.js
    │   └── i18n/               # es.json · en.json · de.json
    └── routes/
        ├── services.js         # Container start/stop via Docker socket
        ├── config.js           # Read/write config files
        ├── sites.js            # CMS auto-detection + favicon
        ├── phpinfo.js          # Live phpinfo() output
        ├── installer.js        # CMS silent installer (SSE progress)
        ├── languages.js        # PHP/Python/Node.js code execution
        ├── browser.js          # File tree, editor, image server
        └── logs.js             # Live log streaming (SSE)
```

---

## Useful Commands

```bash
# Start (interactive menu)
./start-docker.sh

# Stop all containers
docker compose down

# Restart a single service
docker compose restart php-apache
docker compose restart mariadb
docker compose restart control-panel

# Follow all logs
docker compose logs -f

# Follow logs for one service
docker compose logs -f mariadb

# Open a shell in the PHP container
docker exec -it xampp-php bash

# MySQL CLI (root, no password)
docker exec -it xampp-mariadb mysql -u root

# Check Python version
docker exec xampp-php python3 --version

# Check Node.js version
docker exec xampp-php node --version

# Rebuild only the control panel (after editing panel source)
docker compose build control-panel && docker compose up -d control-panel

# Full clean rebuild
docker compose down --volumes
docker compose build --no-cache --pull
docker compose up -d
```

---

## CMS Auto-Detection

The control panel scans `htdocs` on every request and identifies the CMS by its config file:

| File found | Detected as |
|-----------|-------------|
| `wp-config.php` | WordPress |
| `LocalSettings.php` | MediaWiki |
| `configuration.php` + `libraries/` | Joomla |
| `composer.json` with `drupal/core` | Drupal |
| `index.php` (anything else) | PHP site |

---

## Editing Configuration Files

From the control panel (**Configuration** section), you can edit:

| File | Affects | Restart |
|------|---------|---------|
| `php.ini` | PHP settings, extensions, limits | Apache |
| `httpd.conf` | Virtual hosts, rewrites, SSL | Apache |
| `my.cnf` | MariaDB memory, charset, timeouts | MariaDB |

Changes are saved and the relevant container is restarted automatically.

---

## File Browser

The **Files** section in the control panel is a full htdocs explorer.

### Editing files

Click any text file to open it in the CodeMirror editor. Supported formats with syntax highlighting:

| Extension | Mode |
|-----------|------|
| `.php` | PHP (with HTML mixed) |
| `.js` / `.ts` | JavaScript / TypeScript |
| `.css` | CSS |
| `.json` | JSON |
| `.xml` | XML |
| `.html` / `.htm` | HTML mixed |
| `.py` | Python |
| `.sql` | SQL |
| `.md` | Markdown |
| `.sh` | Shell |
| `.ini` / `.conf` / `.cnf` / `.env` | Properties |
| `.htaccess` / `.htpasswd` | Text (editable) |
| `.gitignore` / `.editorconfig` | Text (editable) |
| `.yaml` / `.yml` / `.toml` | Text (editable) |

### Running files

| Extension | Action |
|-----------|--------|
| `.php` / `.html` | Opens in browser via Apache (↗ button) |
| `.py` | Executes via Python inside the container, output shown inline |
| `.js` | Executes via Node.js inside the container, output shown inline |

### Images

Click an image file to view it fullscreen in the editor panel. Use the ⊞ button in the header to open a mosaic gallery of all images in the current directory (recursively). From the gallery you can:
- Click a thumbnail to view it
- ✏️ Rename the file
- 🗑️ Delete the file

Binary files (`.exe`, `.zip`, `.pdf`, media files, fonts) are listed but not editable.

---

## Troubleshooting

### Docker Desktop file sharing error

```
Mounts denied: The path ... is not shared from the host
```

**Fix:** Docker Desktop → Settings → Resources → File Sharing → add the missing path → Apply & Restart.

### MariaDB crashes with `OS error 22`

```
InnoDB: Operating system error number 22 in a file operation.
```

**Cause:** The MySQL data directory is on a virtiofs mount (`/Applications`), which does not support InnoDB file operations.

**Fix:** Copy the data to your home directory (see Scenario A, Step 2).

### `permission denied` on `.docker/buildx/current`

```bash
sudo chown $(whoami) ~/.docker/buildx/current
```

### Databases not visible after start

The named volume from a previous run may be taking precedence. Remove it:

```bash
docker compose down
docker volume rm xampp_mariadb_data
docker compose up -d
```

Then verify the correct mount is active:

```bash
docker inspect xampp-mariadb --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

The source should point to `~/xampp-data/mysql`, not `/var/lib/docker/volumes/...`.

### Containers stuck in `Created` state (never start)

```bash
sudo chown $(whoami) ~/.docker/buildx/current
docker compose up -d
```

### WordPress "Error establishing a database connection"

WordPress installed under the old XAMPP uses `DB_HOST=localhost` (socket), which doesn't work inside Docker. Fix the wp-config.php:

```bash
sed -i "s/'DB_HOST', 'localhost'/'DB_HOST', 'mariadb'/" /path/to/htdocs/your-site/wp-config.php
```

Or edit it directly from the control panel **Files** section.

### Panel changes (HTML/CSS/JS) not reflected

The control panel's static files are baked into the Docker image at build time. After any change to `panel/public/` you must rebuild:

```bash
docker compose build control-panel && docker compose up -d control-panel
```

### phpMyAdmin "Host not allowed" error

MariaDB root user may not have a wildcard host grant. Fix:

```bash
docker exec -it xampp-mariadb mysql -u root -e \
  "GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED VIA mysql_native_password USING '' WITH GRANT OPTION; FLUSH PRIVILEGES;"
```

### sudo: start-docker.sh: command not found

This happens when `$0` is a relative path. The script resolves its own absolute path automatically — just run it as:

```bash
./start-docker.sh
# or
bash /Applications/XAMPP/Docker/start-docker.sh
```

---

## Data Locations

| Data | Location |
|------|----------|
| Web files (htdocs) | `HTDOCS_PATH` in `.env` (default: XAMPP htdocs) |
| MySQL databases | `MYSQL_DATA_PATH` in `.env` (default: `~/xampp-data/mysql`) |
| PHP config | `Docker/config/php/php.ini` |
| Apache config | `Docker/config/apache/httpd.conf` |
| MariaDB config | `Docker/config/mysql/my.cnf` |
| SSL certificates | `Docker/ssl/` |

> MySQL data is stored **outside** the container. Removing or recreating containers will **not** delete your databases.
