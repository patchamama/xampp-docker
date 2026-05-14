#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_banner() {
  echo -e "${CYAN}"
  echo "  ██╗  ██╗ █████╗ ███╗   ███╗██████╗ ██████╗ "
  echo "  ╚██╗██╔╝██╔══██╗████╗ ████║██╔══██╗██╔══██╗"
  echo "   ╚███╔╝ ███████║██╔████╔██║██████╔╝██████╔╝"
  echo "   ██╔██╗ ██╔══██║██║╚██╔╝██║██╔═══╝ ██╔═══╝ "
  echo "  ██╔╝ ██╗██║  ██║██║ ╚═╝ ██║██║     ██║     "
  echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝     "
  echo -e "${NC}"
  echo -e "${BOLD}  Docker Stack — XAMPP Replacement${NC}"
  echo "  ─────────────────────────────────────────────"
  echo ""
}

check_docker_installed() {
  if command -v docker &>/dev/null; then
    return 0
  fi
  return 1
}

check_docker_compose() {
  if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    return 0
  elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
    return 0
  fi
  return 1
}

compose_cmd() {
  if [[ "${COMPOSE_CMD:-}" == "docker compose" ]]; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

print_install_instructions() {
  local os
  os=$(uname -s)

  echo -e "${RED}✗ Docker not found.${NC}"
  echo ""
  echo -e "${BOLD}Install Docker:${NC}"
  echo ""

  if [[ "$os" == "Darwin" ]]; then
    echo -e "${BOLD}  macOS${NC}"
    echo ""
    echo "  Option 1 — Docker Desktop (GUI, recommended):"
    echo "    https://www.docker.com/products/docker-desktop/"
    echo ""
    echo "  Option 2 — Homebrew:"
    echo "    brew install --cask docker"
    echo ""
    echo "  After install, open Docker Desktop once to complete setup,"
    echo "  then run this script again."
    echo ""
  elif [[ "$os" == "Linux" ]]; then
    echo -e "${BOLD}  Linux (Ubuntu/Debian)${NC}"
    echo ""
    echo "    curl -fsSL https://get.docker.com | sh"
    echo "    sudo usermod -aG docker \$USER"
    echo "    newgrp docker"
    echo ""
    echo -e "${BOLD}  Linux (Fedora/RHEL/CentOS)${NC}"
    echo ""
    echo "    sudo dnf install docker-ce docker-ce-cli containerd.io"
    echo "    sudo systemctl enable --now docker"
    echo "    sudo usermod -aG docker \$USER"
    echo ""
    echo "  Full docs: https://docs.docker.com/engine/install/"
    echo ""
  else
    echo "  Visit: https://docs.docker.com/get-docker/"
    echo ""
  fi

  exit 1
}

check_docker_running() {
  if ! docker info &>/dev/null 2>&1; then
    echo -e "${YELLOW}⚠  Docker is installed but not running.${NC}"
    echo ""
    local os
    os=$(uname -s)
    if [[ "$os" == "Darwin" ]]; then
      echo "  Starting Docker Desktop..."
      open -a Docker 2>/dev/null || true
      echo ""
      echo -n "  Waiting for Docker to start"
      local attempts=0
      while ! docker info &>/dev/null 2>&1; do
        echo -n "."
        sleep 2
        attempts=$((attempts + 1))
        if [[ $attempts -ge 30 ]]; then
          echo ""
          echo -e "${RED}  Timed out. Open Docker Desktop manually and try again.${NC}"
          exit 1
        fi
      done
      echo ""
      echo -e "${GREEN}  Docker is ready.${NC}"
      echo ""
    else
      echo "  Run: sudo systemctl start docker"
      exit 1
    fi
  fi
}

preflight_registry_access() {
  echo -e "${BOLD}Checking Docker Hub access...${NC}"

  # Use docker pull (not manifest inspect) — manifest inspect uses BuildKit's
  # credential helper which fails intermittently on Docker Desktop macOS.
  if docker pull php:8.4-apache >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Registry access OK"
    echo ""
    return 0
  fi

  echo ""
  echo -e "${RED}✗ No usable access to Docker Hub.${NC}"
  echo "  Suggestions:"
  echo "   1) Open Docker Desktop and sign in again"
  echo "   2) Run: docker logout && docker login"
  echo "   3) Check your network/corporate proxy/VPN"
  echo ""
  return 1
}

stop_xampp_if_running() {
  if [[ -f /Applications/XAMPP/xamppfiles/ctlscript.sh ]]; then
    local mysql_pid
    mysql_pid=$(pgrep -f "xamppfiles.*mysqld" 2>/dev/null || true)
    local apache_pid
    apache_pid=$(pgrep -f "xamppfiles.*httpd" 2>/dev/null || true)

    if [[ -n "$mysql_pid" || -n "$apache_pid" ]]; then
      echo -e "${YELLOW}⚠  XAMPP services detected running.${NC}"
      echo "   MySQL and Apache use ports 3306/80 — conflict with Docker."
      echo ""
      read -r -p "   Stop XAMPP now? [Y/n] " answer
      answer=${answer:-Y}
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        /Applications/XAMPP/xamppfiles/ctlscript.sh stop 2>/dev/null || true
        sleep 2
        echo -e "${GREEN}   XAMPP stopped.${NC}"
        echo ""
      else
        echo -e "${YELLOW}   Skipping. Port conflicts may occur.${NC}"
        echo ""
      fi
    fi
  fi
}

check_docker_file_sharing() {
  # Only relevant on macOS with Docker Desktop
  [[ "$(uname -s)" != "Darwin" ]] && return 0

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # Load current .env to know which paths are mounted
  local htdocs_path mysql_path
  htdocs_path=$(grep -E '^HTDOCS_PATH=' "$script_dir/.env" 2>/dev/null | cut -d= -f2 | sed "s|^\.\.|$script_dir/..|")
  mysql_path=$(grep -E '^MYSQL_DATA_PATH=' "$script_dir/.env" 2>/dev/null | cut -d= -f2 | sed "s|^\.\.|$script_dir/..|")

  # Resolve to absolute paths
  htdocs_path=$(cd "$htdocs_path" 2>/dev/null && pwd || echo "$htdocs_path")
  mysql_path=$(cd "$mysql_path" 2>/dev/null && pwd || echo "$mysql_path")

  # Test if Docker can actually mount the path by running a throwaway container
  local test_path
  test_path=$(dirname "$mysql_path")

  echo -e "${BOLD}Checking Docker file sharing...${NC}"

  if docker run --rm -v "${test_path}:/test-mount" alpine true 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} File sharing OK for ${test_path}"
    echo ""
    return 0
  fi

  # Mount failed — path not shared
  echo -e "  ${YELLOW}⚠  Docker cannot access: ${test_path}${NC}"
  echo ""
  echo "  Docker Desktop requires explicit permission to access this directory."
  echo ""
  echo "  You have two options:"
  echo ""
  echo -e "  ${BOLD}[1] Add path in Docker Desktop (recommended)${NC}"
  echo "      Docker Desktop → Settings → Resources → File Sharing"
  echo "      Add: ${test_path}"
  echo "      Then click Apply & Restart, and run this script again."
  echo ""
  echo -e "  ${BOLD}[2] Move data to your home folder${NC}"
  echo "      Copies htdocs and MySQL data to ~/xampp-data/"
  echo "      Updates .env automatically. Your data is NOT deleted from XAMPP."
  echo ""
  read -r -p "  Choose [1/2]: " choice

  if [[ "$choice" == "2" ]]; then
    local dest="$HOME/xampp-data"
    echo ""
    echo "  Copying data to ${dest}..."
    mkdir -p "$dest/htdocs" "$dest/mysql"

    if [[ -d "$htdocs_path" ]]; then
      echo -n "  Copying htdocs... "
      cp -r "$htdocs_path/." "$dest/htdocs/"
      echo -e "${GREEN}done${NC}"
    fi

    if [[ -d "$mysql_path" ]]; then
      echo -n "  Copying MySQL data... "
      cp -r "$mysql_path/." "$dest/mysql/"
      echo -e "${GREEN}done${NC}"
    fi

    # Update .env
    sed -i.bak \
      -e "s|^HTDOCS_PATH=.*|HTDOCS_PATH=$dest/htdocs|" \
      -e "s|^MYSQL_DATA_PATH=.*|MYSQL_DATA_PATH=$dest/mysql|" \
      "$script_dir/.env"

    echo ""
    echo -e "  ${GREEN}✓ .env updated. Data is now at ${dest}${NC}"
    echo ""
  else
    echo ""
    echo "  Open Docker Desktop, add the path, and run this script again."
    exit 1
  fi
}

start_stack() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  cd "$script_dir"

  # Load .env manually so vars are available as real env vars for docker compose
  if [[ -f "$script_dir/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$script_dir/.env"
    set +a
  fi

  echo -e "${BOLD}Starting services...${NC}"
  echo ""

  compose_cmd up -d --remove-orphans

  echo ""
}

wait_for_services() {
  echo -e "${BOLD}Waiting for services to be healthy...${NC}"
  echo ""

  local timeout=60
  local elapsed=0

  # Wait for MariaDB
  echo -n "  MySQL/MariaDB "
  while ! docker exec xampp-mariadb mysqladmin ping -u root --silent 2>/dev/null; do
    echo -n "."
    sleep 2
    elapsed=$((elapsed + 2))
    if [[ $elapsed -ge $timeout ]]; then
      echo -e " ${YELLOW}(timeout — may still be initializing)${NC}"
      break
    fi
  done
  if [[ $elapsed -lt $timeout ]]; then
    echo -e " ${GREEN}✓${NC}"
  fi

  # Wait for Apache
  elapsed=0
  echo -n "  Apache        "
  while ! curl -sk http://localhost &>/dev/null; do
    echo -n "."
    sleep 2
    elapsed=$((elapsed + 2))
    if [[ $elapsed -ge $timeout ]]; then
      echo -e " ${YELLOW}(timeout — check logs)${NC}"
      break
    fi
  done
  if [[ $elapsed -lt $timeout ]]; then
    echo -e " ${GREEN}✓${NC}"
  fi

  # Wait for Control Panel
  elapsed=0
  echo -n "  Control Panel "
  while ! curl -sk http://localhost:8080 &>/dev/null; do
    echo -n "."
    sleep 2
    elapsed=$((elapsed + 2))
    if [[ $elapsed -ge $timeout ]]; then
      echo -e " ${YELLOW}(timeout — check logs)${NC}"
      break
    fi
  done
  if [[ $elapsed -lt $timeout ]]; then
    echo -e " ${GREEN}✓${NC}"
  fi

  echo ""
}

print_access_info() {
  echo "  ─────────────────────────────────────────────"
  echo ""
  echo -e "${BOLD}  🚀 Stack is running. Access points:${NC}"
  echo ""
  echo -e "  ${GREEN}●${NC} ${BOLD}Control Panel${NC}   http://localhost:8080"
  echo "                   Start/stop services, PHP config, CMS installer,"
  echo "                   site detection, live logs  (ES / EN / DE)"
  echo ""
  echo -e "  ${GREEN}●${NC} ${BOLD}Web Server${NC}      http://localhost"
  echo "                   https://localhost  (self-signed cert)"
  echo ""
  echo -e "  ${GREEN}●${NC} ${BOLD}phpMyAdmin${NC}      http://localhost:8081"
  echo "                   User: root  |  Password: (empty)"
  echo ""
  echo -e "  ${GREEN}●${NC} ${BOLD}FTP${NC}             ftp://localhost:21"
  echo ""
  echo "  ─────────────────────────────────────────────"
  echo ""
  echo -e "${BOLD}  Useful commands:${NC}"
  echo ""
  echo "    make stop      — stop all containers"
  echo "    make restart   — restart all containers"
  echo "    make logs      — follow all logs"
  echo "    make shell     — bash into PHP/Apache container"
  echo "    make mysql     — MariaDB CLI (root, no password)"
  echo ""
  echo "  ─────────────────────────────────────────────"
  echo ""
}

ensure_sudo() {
  if [[ $EUID -ne 0 ]]; then
    SCRIPT_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
    echo -e "${YELLOW}⚠  This script needs sudo to copy XAMPP data.${NC}"
    echo "   Re-ejecutando con sudo..."
    echo ""
    exec sudo bash "$SCRIPT_ABS" "$@"
  fi
  # Running as root — resolve the real user who invoked sudo
  REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"
  REAL_HOME=$(eval echo "~$REAL_USER")
}

copy_xampp_data() {
  local script_dir="$1"
  local current_user="$USER"
  local dest="$HOME/xampp-data"
  local xampp_htdocs="/Applications/XAMPP/xamppfiles/htdocs"
  local xampp_mysql="/Applications/XAMPP/xamppfiles/var/mysql"
  local docker_config="$script_dir/config"
  local needs_sudo=0
  local needs_copy=0

  # Check if any source data exists and hasn't been copied yet
  [[ -d "$xampp_htdocs" && ! -d "$dest/htdocs" ]] && needs_copy=1
  [[ -d "$xampp_mysql"  && ! -d "$dest/mysql"  ]] && needs_copy=1
  [[ ! -d "$dest/config" ]] && needs_copy=1

  [[ $needs_copy -eq 0 ]] && return 0

  # Check if XAMPP dirs need sudo to read
  if [[ -d "$xampp_htdocs" ]] && ! test -r "$xampp_htdocs"; then needs_sudo=1; fi
  if [[ -d "$xampp_mysql"  ]] && ! test -r "$xampp_mysql";  then needs_sudo=1; fi

  echo -e "${BOLD}Copying XAMPP data to ${dest}...${NC}"
  echo ""

  mkdir -p "$dest/htdocs" "$dest/mysql" \
    "$dest/config/php" "$dest/config/apache" \
    "$dest/config/mysql" "$dest/config/proftpd"

  local CP="cp"
  local CHOWN_CMD=""
  if [[ $needs_sudo -eq 1 ]]; then
    echo -e "  ${YELLOW}⚠ XAMPP data requires sudo to read.${NC}"
    CP="sudo cp"
    CHOWN_CMD="sudo chown -R ${current_user} ${dest}"
  fi

  if [[ -d "$xampp_htdocs" && ! -d "$dest/htdocs/$(ls "$xampp_htdocs" 2>/dev/null | head -1)" ]]; then
    echo -n "  Copying htdocs... "
    $CP -rp "$xampp_htdocs/." "$dest/htdocs/"
    echo -e "${GREEN}done${NC}"
  fi

  if [[ -d "$xampp_mysql" ]]; then
    echo -n "  Copying MySQL data... "
    $CP -rp "$xampp_mysql/." "$dest/mysql/"
    echo -e "${GREEN}done${NC}"
  fi

  # Sync config files (always readable — no sudo needed)
  echo -n "  Syncing configuration files... "
  [[ -f "$docker_config/php/php.ini"           ]] && cp "$docker_config/php/php.ini"           "$dest/config/php/"
  [[ -f "$docker_config/apache/httpd.conf"      ]] && cp "$docker_config/apache/httpd.conf"      "$dest/config/apache/"
  [[ -f "$docker_config/mysql/my.cnf"           ]] && cp "$docker_config/mysql/my.cnf"           "$dest/config/mysql/"
  [[ -f "$docker_config/proftpd/proftpd.conf"   ]] && cp "$docker_config/proftpd/proftpd.conf"   "$dest/config/proftpd/"
  echo -e "${GREEN}done${NC}"

  [[ -n "$CHOWN_CMD" ]] && $CHOWN_CMD
  echo ""
  echo -e "  ${GREEN}✓ Data available at ${dest}${NC}"
  echo ""

  # Update .env with absolute paths
  local env_file="$script_dir/.env"
  if [[ -f "$env_file" ]]; then
    sed -i.bak \
      -e "s|^HTDOCS_PATH=.*|HTDOCS_PATH=$dest/htdocs|" \
      -e "s|^MYSQL_DATA_PATH=.*|MYSQL_DATA_PATH=$dest/mysql|" \
      -e "s|^CONFIG_PATH=.*|CONFIG_PATH=$dest/config|" \
      "$env_file"
    grep -q '^CONFIG_PATH=' "$env_file" || echo "CONFIG_PATH=$dest/config" >> "$env_file"
  fi
}

rebuild_from_scratch() {
  local script_dir="$1"

  echo -e "${RED}⚠  FULL REBUILD${NC}"
  echo ""
  echo "  This will:"
  echo "    • Stop and remove all stack containers"
  echo "    • Remove locally built images (not third-party images)"
  echo "    • Remove stack Docker volumes"
  echo "    • Rebuild all images from scratch (--no-cache)"
  echo "    • Start the stack again"
  echo ""
  echo -e "  ${YELLOW}Data in ~/xampp-data/ will NOT be touched.${NC}"
  echo ""
  read -r -p "  Continue? [y/N] " confirm
  confirm=${confirm:-N}
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "  Cancelled."
    exit 0
  fi

  echo ""
  cd "$script_dir"

  # Load .env so compose knows which project/volumes to target
  if [[ -f "$script_dir/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$script_dir/.env"
    set +a
  fi

  echo -e "${BOLD}[1/4] Stopping and removing containers...${NC}"
  compose_cmd down --volumes --remove-orphans 2>/dev/null || true
  echo -e "      ${GREEN}✓${NC}"
  echo ""

  echo -e "${BOLD}[2/4] Removing locally built images...${NC}"
  # Only remove images built by this compose project (not pulled images like mariadb, phpmyadmin)
  local images
  images=$(compose_cmd images -q 2>/dev/null || true)
  if [[ -n "$images" ]]; then
    docker rmi $images 2>/dev/null || true
  fi
  # Also remove by known names in case compose images -q misses them
  docker rmi xampp-php-apache xampp-control-panel xampp-proftpd 2>/dev/null || true
  echo -e "      ${GREEN}✓${NC}"
  echo ""

  echo -e "${BOLD}[3/4] Cleaning build cache...${NC}"
  docker builder prune -f --filter type=exec.cachemount 2>/dev/null || true
  echo -e "      ${GREEN}✓${NC}"
  echo ""

  echo -e "${BOLD}[4/4] Rebuilding images from scratch...${NC}"

  # Fix buildx/current ownership if a previous root run corrupted it
  local buildx_current="$HOME/.docker/buildx/current"
  if [[ -f "$buildx_current" ]] && ! test -r "$buildx_current"; then
    echo -e "  ${YELLOW}⚠ Fixing buildx permissions (requires sudo)...${NC}"
    sudo chown "$USER" "$buildx_current"
  fi

  # Pull base images explicitly so BuildKit credential helper issues don't
  # abort the build. compose config resolves all env vars (e.g. $PHP_BASE_IMAGE)
  # correctly — parsing .env directly leaves them empty.
  local resolved_php_img
  resolved_php_img=$(compose_cmd config 2>/dev/null | awk '/PHP_BASE_IMAGE:/{print $2}')

  local base_images=()
  while IFS= read -r img; do
    [[ -n "$img" ]] && base_images+=("$img")
  done < <(
    # FROM lines in Dockerfiles, substituting resolved PHP image
    grep -h '^FROM' "$script_dir"/Dockerfile* "$script_dir"/panel/Dockerfile 2>/dev/null \
      | awk '{print $2}' \
      | while read -r img; do
          [[ "$img" == *'PHP_BASE_IMAGE'* || "$img" == '${PHP_BASE_IMAGE}' || "$img" == '$PHP_BASE_IMAGE' ]] \
            && img="$resolved_php_img"
          [[ -n "$img" && "$img" != *'$'* ]] && echo "$img"
        done \
      | sort -u
  )

  for img in "${base_images[@]}"; do
    echo -e "  Pulling ${img}..."
    if ! docker pull "$img"; then
      echo -e "  ${YELLOW}⚠ Could not pull ${img} — will use cached layer if available${NC}"
    fi
  done

  # Build without --pull: base images are already in daemon cache from pulls above
  if ! compose_cmd build --no-cache; then
    echo ""
    echo -e "${RED}✗ Could not rebuild images.${NC}"
    echo "  Suggestions:"
    echo "   1) Open Docker Desktop and sign in again to Docker Hub"
    echo "   2) Run: docker logout && docker login"
    echo "   3) Retry ./start-docker.sh"
    exit 1
  fi
  echo ""
  echo -e "      ${GREEN}✓ Rebuild completed.${NC}"
  echo ""
}

show_menu() {
  echo -e "${BOLD}  What do you want to do?${NC}"
  echo ""
  echo "    [1] Start the stack (normal)"
  echo "    [2] Copy XAMPP data and then start"
  echo "    [3] Rebuild everything from scratch and then start"
  echo ""
  read -r -p "  Option [1]: " menu_choice
  menu_choice=${menu_choice:-1}
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────

print_banner

if ! check_docker_installed; then
  print_install_instructions
fi

check_docker_running

if ! check_docker_compose; then
  echo -e "${RED}✗ docker-compose not found.${NC}"
  echo "  Install: https://docs.docker.com/compose/install/"
  exit 1
fi

show_menu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$menu_choice" in
  3)
    preflight_registry_access || exit 1
    rebuild_from_scratch "$SCRIPT_DIR"
    stop_xampp_if_running
    check_docker_file_sharing
    start_stack
    wait_for_services
    print_access_info
    ;;
  2)
    stop_xampp_if_running
    copy_xampp_data "$SCRIPT_DIR"
    check_docker_file_sharing
    start_stack
    wait_for_services
    print_access_info
    ;;
  *)
    stop_xampp_if_running
    check_docker_file_sharing
    start_stack
    wait_for_services
    print_access_info
    ;;
esac
