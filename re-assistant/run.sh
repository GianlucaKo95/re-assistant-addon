#!/usr/bin/env bash
set -euo pipefail
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log "RE-Assistent v4.0 startet …"

# Home Assistant bashio
if command -v bashio &>/dev/null; then
  ANTHROPIC_API_KEY=$(bashio::config 'anthropic_api_key' || true)
  ADMIN_PASSWORD=$(bashio::config    'admin_password'    || echo 'admin123')
  LANGUAGE=$(bashio::config          'language'          || echo 'de')
  PGHOST=$(bashio::config            'pg_host'           || echo 'localhost')
  PGPORT=$(bashio::config            'pg_port'           || echo '5432')
  PGDATABASE=$(bashio::config        'pg_database'       || echo 'reassistant')
  PGUSER=$(bashio::config            'pg_user'           || echo 'reassistant')
  PGPASSWORD=$(bashio::config        'pg_password'       || echo 'repassword')
  export ANTHROPIC_API_KEY ADMIN_PASSWORD LANGUAGE PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
fi

PGHOST="${PGHOST:-localhost}"; PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-reassistant}"; PGDATABASE="${PGDATABASE:-reassistant}"

# PostgreSQL warten
log "Warte auf PostgreSQL ${PGHOST}:${PGPORT} …"
WAIT=0
until pg_isready -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" &>/dev/null; do
  WAIT=$((WAIT+1)); [ $WAIT -ge 60 ] && { log "FEHLER: DB nicht erreichbar"; exit 1; }; sleep 1
done
log "PostgreSQL bereit (${WAIT}s)"

# Migrationen
log "Führe Migrationen aus …"
cd /app/backend && node migrate.js
log "Migrationen OK"

# Nginx
nginx &; NGINX_PID=$!

# Backend
export PORT="${NODE_PORT:-3001}" DATA_DIR="${DATA_DIR:-/data/re-assistant}"
mkdir -p "${DATA_DIR}"
node server.js &; NODE_PID=$!

cleanup() { kill "${NODE_PID}" "${NGINX_PID}" 2>/dev/null || true; wait; }
trap cleanup SIGTERM SIGINT

# Health-Check
for i in $(seq 1 30); do
  curl -sf "http://127.0.0.1:${PORT}/api/health" &>/dev/null && { log "Backend bereit"; break; }
  sleep 1
done
log "RE-Assistent läuft"
wait "${NODE_PID}"
