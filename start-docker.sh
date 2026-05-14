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

  # Fast probe that often surfaces credential helper issues early
  if docker manifest inspect php:8.4-apache >/dev/null 2>&1 \
    && docker manifest inspect debian:bookworm-slim >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Acceso al registry OK"
    echo ""
    return 0
  fi

  echo -e "  ${YELLOW}⚠ Possible Docker credential issue.${NC}"
  echo -e "  Trying anonymous mode..."
  local tmp_docker_cfg
  tmp_docker_cfg="$(mktemp -d)"
  printf '{ "auths": {} }\n' > "${tmp_docker_cfg}/config.json"

  if DOCKER_CONFIG="$tmp_docker_cfg" docker manifest inspect php:8.4-apache >/dev/null 2>&1 \
    && DOCKER_CONFIG="$tmp_docker_cfg" docker manifest inspect debian:bookworm-slim >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Anonymous mode OK. The script will retry build anonymously if needed."
    rm -rf "$tmp_docker_cfg"
    echo ""
    return 0
  fi

  rm -rf "$tmp_docker_cfg"
  echo ""
  echo -e "${RED}✗ No usable access to Docker Hub (neither authenticated nor anonymous).${NC}"
  echo "  Suggestions:"
  echo "   1) Open Docker Desktop and sign in again"
  echo "   2) Ejecuta: docker logout && docker login"
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

  $COMPOSE_CMD up -d --remove-orphans

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
  local dest="$REAL_HOME/xampp-data"
  local xampp_htdocs="/Applications/XAMPP/xamppfiles/htdocs"
  local xampp_mysql="/Applications/XAMPP/xamppfiles/var/mysql"
  local docker_config="$script_dir/config"
  local needs_copy=0

  # Check if any source data exists and hasn't been copied yet
  [[ -d "$xampp_htdocs" && ! -d "$dest/htdocs" ]] && needs_copy=1
  [[ -d "$xampp_mysql"  && ! -d "$dest/mysql"  ]] && needs_copy=1
  [[ ! -d "$dest/config" ]] && needs_copy=1

  [[ $needs_copy -eq 0 ]] && return 0

  echo -e "${BOLD}Copying XAMPP data to ${dest}...${NC}"
  echo ""

  mkdir -p "$dest/htdocs" "$dest/mysql" \
    "$dest/config/php" "$dest/config/apache" \
    "$dest/config/mysql" "$dest/config/proftpd"

  if [[ -d "$xampp_htdocs" && ! -d "$dest/htdocs/$(ls "$xampp_htdocs" 2>/dev/null | head -1)" ]]; then
    echo -n "  Copying htdocs... "
    cp -rp "$xampp_htdocs/." "$dest/htdocs/"
    echo -e "${GREEN}done${NC}"
  fi

  if [[ -d "$xampp_mysql" ]]; then
    echo -n "  Copying MySQL data... "
    cp -rp "$xampp_mysql/." "$dest/mysql/"
    echo -e "${GREEN}done${NC}"
  fi

  # Always sync config files from Docker/config so edits in panel persist
  echo -n "  Syncing configuration files... "
  [[ -f "$docker_config/php/php.ini"           ]] && cp "$docker_config/php/php.ini"           "$dest/config/php/"
  [[ -f "$docker_config/apache/httpd.conf"      ]] && cp "$docker_config/apache/httpd.conf"      "$dest/config/apache/"
  [[ -f "$docker_config/mysql/my.cnf"           ]] && cp "$docker_config/mysql/my.cnf"           "$dest/config/mysql/"
  [[ -f "$docker_config/proftpd/proftpd.conf"   ]] && cp "$docker_config/proftpd/proftpd.conf"   "$dest/config/proftpd/"
  echo -e "${GREEN}done${NC}"

  chown -R "$REAL_USER" "$dest"
  echo ""
  echo -e "  ${GREEN}✓ Datos disponibles en ${dest}${NC}"
  echo ""

  # Update .env with absolute paths (only if values differ)
  local env_file="$script_dir/.env"
  if [[ -f "$env_file" ]]; then
    sed -i.bak \
      -e "s|^HTDOCS_PATH=.*|HTDOCS_PATH=$dest/htdocs|" \
      -e "s|^MYSQL_DATA_PATH=.*|MYSQL_DATA_PATH=$dest/mysql|" \
      -e "s|^CONFIG_PATH=.*|CONFIG_PATH=$dest/config|" \
      "$env_file"
    # Add CONFIG_PATH if not present
    grep -q '^CONFIG_PATH=' "$env_file" || echo "CONFIG_PATH=$dest/config" >> "$env_file"
  fi
}

rebuild_from_scratch() {
  local script_dir="$1"

  echo -e "${RED}⚠  RECONSTRUCCIÓN COMPLETA${NC}"
  echo ""
  echo "  This will:"
  echo "    • Detener y eliminar todos los contenedores del stack"
  echo "    • Remove all stack containers"
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

  echo -e "${BOLD}[1/4] Deteniendo y eliminando contenedores...${NC}"
  $COMPOSE_CMD down --volumes --remove-orphans 2>/dev/null || true
  echo -e "      ${GREEN}✓${NC}"
  echo ""

  echo -e "${BOLD}[2/4] Removing locally built images...${NC}"
  # Only remove images built by this compose project (not pulled images like mariadb, phpmyadmin)
  local images
  images=$($COMPOSE_CMD images -q 2>/dev/null || true)
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
  if ! $COMPOSE_CMD build --no-cache --pull; then
    echo ""
    echo -e "${YELLOW}⚠ Build failed with Docker credentials. Retrying in anonymous mode...${NC}"
    local tmp_docker_cfg
    tmp_docker_cfg="$(mktemp -d)"
    printf '{ "auths": {} }\n' > "${tmp_docker_cfg}/config.json"
    if ! DOCKER_CONFIG="$tmp_docker_cfg" $COMPOSE_CMD build --no-cache --pull; then
      rm -rf "$tmp_docker_cfg"
      echo ""
      echo -e "${RED}✗ Could not rebuild images.${NC}"
      echo "  Suggestions:"
      echo "   1) Open Docker Desktop and sign in again to Docker Hub"
      echo "   2) Ejecuta: docker logout && docker login"
      echo "   3) Reintenta ./start-docker.sh"
      exit 1
    fi
    rm -rf "$tmp_docker_cfg"
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
    ensure_sudo "$@"
    rebuild_from_scratch "$SCRIPT_DIR"
    stop_xampp_if_running
    check_docker_file_sharing
    start_stack
    wait_for_services
    print_access_info
    ;;
  2)
    ensure_sudo "$@"
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
