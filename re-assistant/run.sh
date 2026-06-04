#!/usr/bin/env bash
set -euo pipefail
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log "RE-Assistent v4.2 startet …"

# ── Konfiguration ─────────────────────────────────────────────
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
export LANGUAGE="${LANGUAGE:-de}"

# ── PostgreSQL Setup ──────────────────────────────────────────
PG_DATA="/data/postgres"
export PGHOST="127.0.0.1"
export PGPORT="5432"
export PGUSER="reassistant"
export PGDATABASE="reassistant"
export PGPASSWORD="repassword"

# /run/postgresql anlegen — PostgreSQL braucht das für Lock-Dateien
mkdir -p /run/postgresql
chown postgres:postgres /run/postgresql

# Initialisieren falls nötig
if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
    log "Initialisiere PostgreSQL …"
    mkdir -p "${PG_DATA}"
    chown -R postgres:postgres "${PG_DATA}"
    su postgres -s /bin/sh -c "initdb -D ${PG_DATA} --auth=trust --username=postgres" 2>&1
    log "PostgreSQL initialisiert"
fi

chown -R postgres:postgres "${PG_DATA}"

# Starten
log "Starte PostgreSQL …"
su postgres -s /bin/sh -c \
    "pg_ctl -D ${PG_DATA} -o '-p 5432 -h 127.0.0.1' -l ${PG_DATA}/server.log start" 2>&1 || {
    log "PostgreSQL Start fehlgeschlagen — Log:"
    cat "${PG_DATA}/server.log" 2>/dev/null || echo "(kein Log)"
    exit 1
}

# Warten
WAIT=0
until pg_isready -h 127.0.0.1 -p 5432 -U postgres &>/dev/null; do
    WAIT=$((WAIT+1))
    [ $WAIT -ge 30 ] && { log "FEHLER: Timeout"; cat "${PG_DATA}/server.log" 2>/dev/null; exit 1; }
    sleep 1
done
log "PostgreSQL bereit (${WAIT}s)"

# Datenbank & User anlegen
su postgres -s /bin/sh -c "psql -h 127.0.0.1 -p 5432 postgres -tc \
    \"SELECT 1 FROM pg_user WHERE usename='reassistant'\" | grep -q 1 || \
    psql -h 127.0.0.1 -p 5432 postgres -c \
    \"CREATE USER reassistant WITH PASSWORD 'repassword';\""

su postgres -s /bin/sh -c "psql -h 127.0.0.1 -p 5432 postgres -tc \
    \"SELECT 1 FROM pg_database WHERE datname='reassistant'\" | grep -q 1 || \
    psql -h 127.0.0.1 -p 5432 postgres -c \
    \"CREATE DATABASE reassistant OWNER reassistant;\""

su postgres -s /bin/sh -c \
    "psql -h 127.0.0.1 -p 5432 postgres -c \
    \"GRANT ALL PRIVILEGES ON DATABASE reassistant TO reassistant;\""

log "Datenbank bereit"

# ── Migrationen ───────────────────────────────────────────────
log "Führe Migrationen aus …"
cd /app/backend && node migrate.js
log "Migrationen OK"

# ── Nginx ─────────────────────────────────────────────────────
nginx &
NGINX_PID=$!

# ── Backend ───────────────────────────────────────────────────
export PORT="${NODE_PORT:-3001}"
export DATA_DIR="${DATA_DIR:-/data/re-assistant}"
mkdir -p "${DATA_DIR}"

log "Starte Backend …"
cd /app/backend
node server.js &
NODE_PID=$!

cleanup() {
    log "Beende …"
    kill "${NODE_PID}" "${NGINX_PID}" 2>/dev/null || true
    su postgres -s /bin/sh -c "pg_ctl -D ${PG_DATA} -m fast stop" 2>/dev/null || true
    wait
}
trap cleanup SIGTERM SIGINT

for i in $(seq 1 30); do
    curl -sf "http://127.0.0.1:${PORT}/api/health" &>/dev/null && {
        log "RE-Assistent bereit"
        break
    }
    sleep 1
done

log "RE-Assistent läuft"
wait "${NODE_PID}"
