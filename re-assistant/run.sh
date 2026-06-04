#!/usr/bin/env bash
set -euo pipefail
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log "RE-Assistent v4.2 startet …"

# ── Konfiguration ─────────────────────────────────────────────
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
LANGUAGE="${LANGUAGE:-de}"
export ANTHROPIC_API_KEY ADMIN_PASSWORD LANGUAGE

# ── PostgreSQL Setup ──────────────────────────────────────────
PG_DATA="/data/postgres"
PG_LOG="/tmp/postgres.log"
PG_RUN="/tmp/pg_run"
mkdir -p "${PG_RUN}"
chown postgres:postgres "${PG_RUN}"

export PGHOST="127.0.0.1"
export PGPORT="5432"
export PGUSER="reassistant"
export PGDATABASE="reassistant"
export PGPASSWORD="repassword"

# Initialisieren falls nötig
if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
    log "Initialisiere PostgreSQL …"
    mkdir -p "${PG_DATA}"
    chown postgres:postgres "${PG_DATA}"
    su postgres -s /bin/sh -c "initdb -D ${PG_DATA} --auth=trust --username=postgres" >> "${PG_LOG}" 2>&1
    log "PostgreSQL initialisiert"
fi

# Rechte sicherstellen
chown -R postgres:postgres "${PG_DATA}" "${PG_RUN}"

# Starten
log "Starte PostgreSQL …"
su postgres -s /bin/sh -c \
    "pg_ctl -D ${PG_DATA} \
     -o \"-p 5432 -k ${PG_RUN} -h 127.0.0.1\" \
     -l ${PG_LOG} start" 2>&1 || {
    log "PostgreSQL Start fehlgeschlagen — Log:"
    cat "${PG_LOG}" || true
    exit 1
}

# Warten
WAIT=0
until pg_isready -h 127.0.0.1 -p 5432 -U postgres &>/dev/null; do
    WAIT=$((WAIT+1))
    if [ $WAIT -ge 30 ]; then
        log "FEHLER: PostgreSQL startet nicht nach 30s"
        cat "${PG_LOG}" || true
        exit 1
    fi
    sleep 1
done
log "PostgreSQL bereit (${WAIT}s)"

# Datenbank & User anlegen
log "Prüfe Datenbank …"
su postgres -s /bin/sh -c "psql -h 127.0.0.1 -p 5432 -c \"
    DO \\\$\\\$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_user WHERE usename='reassistant') THEN
        CREATE USER reassistant WITH PASSWORD 'repassword';
      END IF;
    END \\\$\\\$;
    SELECT 1 FROM pg_database WHERE datname='reassistant';
\" postgres" 2>/dev/null || true

su postgres -s /bin/sh -c "psql -h 127.0.0.1 -p 5432 -tc \
    \"SELECT 1 FROM pg_database WHERE datname='reassistant'\" postgres \
    | grep -q 1 || psql -h 127.0.0.1 -p 5432 -c \
    \"CREATE DATABASE reassistant OWNER reassistant\" postgres" 2>/dev/null || true

su postgres -s /bin/sh -c \
    "psql -h 127.0.0.1 -p 5432 -c \
    \"GRANT ALL PRIVILEGES ON DATABASE reassistant TO reassistant\" postgres" 2>/dev/null || true

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

# Health-Check
for i in $(seq 1 30); do
    curl -sf "http://127.0.0.1:${PORT}/api/health" &>/dev/null && {
        log "RE-Assistent bereit"
        break
    }
    sleep 1
done

log "RE-Assistent läuft"
wait "${NODE_PID}"
