#!/usr/bin/env bash
set -euo pipefail
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log "RE-Assistent v4.2 startet …"

# ── Konfiguration aus HA Umgebungsvariablen ───────────────────
# HA setzt diese automatisch aus config.json options
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
LANGUAGE="${LANGUAGE:-de}"
export ANTHROPIC_API_KEY ADMIN_PASSWORD LANGUAGE

# ── Interne PostgreSQL-Instanz ────────────────────────────────
PG_DATA="${PG_DATA:-/data/postgres}"
PG_PORT=5432
export PGHOST="127.0.0.1"
export PGPORT="${PG_PORT}"
export PGUSER="reassistant"
export PGDATABASE="reassistant"
export PGPASSWORD="repassword"

# PostgreSQL initialisieren falls noch nicht geschehen
if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
    log "Initialisiere PostgreSQL Datenbank …"
    mkdir -p "${PG_DATA}"
    chown -R postgres:postgres "${PG_DATA}"
    su postgres -s /bin/sh -c "initdb -D ${PG_DATA} --auth=trust --username=postgres"
    log "PostgreSQL initialisiert"
fi

# PostgreSQL starten
log "Starte PostgreSQL …"
chown -R postgres:postgres "${PG_DATA}"
su postgres -s /bin/sh -c "pg_ctl -D ${PG_DATA} -o '-p ${PG_PORT}' -l /tmp/postgres.log start"

# Warten bis PostgreSQL bereit ist
WAIT=0
until pg_isready -h 127.0.0.1 -p "${PG_PORT}" -U postgres &>/dev/null; do
    WAIT=$((WAIT+1))
    [ $WAIT -ge 30 ] && { log "FEHLER: PostgreSQL startet nicht"; cat /tmp/postgres.log; exit 1; }
    sleep 1
done
log "PostgreSQL bereit (${WAIT}s)"

# Datenbank und User anlegen falls nicht vorhanden
su postgres -s /bin/sh -c "psql -p ${PG_PORT} -tc \"SELECT 1 FROM pg_user WHERE usename='reassistant'\" | grep -q 1 || \
    psql -p ${PG_PORT} -c \"CREATE USER reassistant WITH PASSWORD 'repassword';\""
su postgres -s /bin/sh -c "psql -p ${PG_PORT} -tc \"SELECT 1 FROM pg_database WHERE datname='reassistant'\" | grep -q 1 || \
    psql -p ${PG_PORT} -c \"CREATE DATABASE reassistant OWNER reassistant;\""
su postgres -s /bin/sh -c "psql -p ${PG_PORT} -c \"GRANT ALL PRIVILEGES ON DATABASE reassistant TO reassistant;\""
log "Datenbank bereit"

# ── Migrationen ───────────────────────────────────────────────
log "Führe Migrationen aus …"
cd /app/backend && node migrate.js
log "Migrationen OK"

# ── Nginx ─────────────────────────────────────────────────────
log "Starte Nginx …"
nginx &
NGINX_PID=$!

# ── Backend ───────────────────────────────────────────────────
export PORT="${NODE_PORT:-3001}"
export DATA_DIR="${DATA_DIR:-/data/re-assistant}"
mkdir -p "${DATA_DIR}"

log "Starte RE-Assistent Backend …"
cd /app/backend
node server.js &
NODE_PID=$!

cleanup() {
    log "Beende RE-Assistent …"
    kill "${NODE_PID}" "${NGINX_PID}" 2>/dev/null || true
    su postgres -s /bin/sh -c "pg_ctl -D ${PG_DATA} stop" 2>/dev/null || true
    wait
}
trap cleanup SIGTERM SIGINT

# Health-Check
log "Warte auf Backend …"
for i in $(seq 1 30); do
    curl -sf "http://127.0.0.1:${PORT}/api/health" &>/dev/null && { log "RE-Assistent bereit auf Port ${PORT}"; break; }
    sleep 1
done

log "RE-Assistent läuft"
wait "${NODE_PID}"
