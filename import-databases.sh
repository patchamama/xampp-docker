#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

XAMPP_MYSQL="/Applications/XAMPP/xamppfiles/bin/mysql"
XAMPP_MYSQLDUMP="/Applications/XAMPP/xamppfiles/bin/mysqldump"
XAMPP_DATA="/Applications/XAMPP/xamppfiles/var/mysql"

SKIP_DBS="performance_schema|information_schema"

echo ""
echo -e "${BOLD}XAMPP → Docker: Database Import${NC}"
echo "  ────────────────────────────────────"
echo ""

# Check MariaDB container is running
if ! docker exec xampp-mariadb mysqladmin ping -u root --silent 2>/dev/null; then
  echo -e "${RED}✗ xampp-mariadb container is not running.${NC}"
  echo "  Run ./start-docker.sh first."
  exit 1
fi

# Detect databases from XAMPP data directory
DBS=()
for dir in "$XAMPP_DATA"/*/; do
  db=$(basename "$dir")
  if echo "$db" | grep -qE "^($SKIP_DBS)$"; then continue; fi
  if [[ ! -d "$dir" ]]; then continue; fi
  DBS+=("$db")
done

if [[ ${#DBS[@]} -eq 0 ]]; then
  echo -e "${YELLOW}No databases found in $XAMPP_DATA${NC}"
  exit 0
fi

echo "  Databases found in XAMPP:"
for db in "${DBS[@]}"; do
  echo "    • $db"
done
echo ""

# Check if XAMPP MySQL is available for dump
USE_XAMPP_DUMP=false
if [[ -f "$XAMPP_MYSQLDUMP" ]]; then
  # Try connecting — XAMPP must be running for this
  if "$XAMPP_MYSQL" -u root -e "SELECT 1" &>/dev/null 2>&1; then
    USE_XAMPP_DUMP=true
  fi
fi

if [[ "$USE_XAMPP_DUMP" == "false" ]]; then
  echo -e "${YELLOW}⚠  XAMPP MySQL is not running — cannot dump live data.${NC}"
  echo ""
  echo "  To import your databases:"
  echo "  1. Start XAMPP MySQL"
  echo "  2. Run this script again"
  echo ""
  echo "  Or manually import .sql files:"
  echo "    docker exec -i xampp-mariadb mysql -u root < your-dump.sql"
  exit 1
fi

TMPDIR_DUMP=$(mktemp -d)
echo -e "${BOLD}Exporting from XAMPP...${NC}"
echo ""

for db in "${DBS[@]}"; do
  echo -n "  Exporting '$db'... "
  "$XAMPP_MYSQLDUMP" -u root \
    --single-transaction \
    --routines \
    --triggers \
    --skip-lock-tables \
    "$db" > "$TMPDIR_DUMP/$db.sql" 2>/dev/null
  echo -e "${GREEN}✓${NC}"
done

echo ""
echo -e "${BOLD}Importing into Docker MariaDB...${NC}"
echo ""

for db in "${DBS[@]}"; do
  echo -n "  Creating database '$db'... "
  docker exec xampp-mariadb mysql -u root -e \
    "CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
  echo -n "importing... "
  docker exec -i xampp-mariadb mysql -u root "$db" < "$TMPDIR_DUMP/$db.sql"
  echo -e "${GREEN}✓${NC}"
done

rm -rf "$TMPDIR_DUMP"

echo ""
echo -e "${GREEN}✓ All databases imported successfully.${NC}"
echo ""
echo "  Access via phpMyAdmin: http://localhost:8081"
echo "  User: root  |  Password: (empty)"
echo ""
