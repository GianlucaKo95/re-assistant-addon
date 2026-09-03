#!/usr/bin/env bash
set -euo pipefail
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log "RE-Assistent v4.3.7 startet …"

# ── Konfiguration ──────────────────────────────────────────────
# API-Keys werden NUR in der Datenbank gespeichert (app_settings)
# Kein ANTHROPIC_API_KEY / GROK_API_KEY / GROQ_API_KEY aus Umgebung
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
export LANGUAGE="${LANGUAGE:-de}"
export DATABASE_URL="${DATABASE_URL:-}"
export TRUSTED_PROXY_HOPS="${TRUSTED_PROXY_HOPS:-1}"

VERSION_FILE="/data/app_version"
CURRENT_VERSION="4.3.7"
BACKUP_DIR="/data/backups"
mkdir -p "${BACKUP_DIR}"

# ── DB-Modus erkennen ──────────────────────────────────────────
if [ -n "${DATABASE_URL}" ]; then
    # ── EXTERNER Modus ─────────────────────────────────────────
    log "Externer Datenbank-Modus: ${DATABASE_URL%%@*}@…"
    log "Interne PostgreSQL wird NICHT gestartet"

    # SSL für Supabase/externe DBs automatisch aktivieren
    if echo "${DATABASE_URL}" | grep -q "supabase\|render\|railway\|neon\|heroku"; then
        export PGSSLMODE="require"
        log "SSL aktiviert (externe Cloud-DB erkannt)"
    fi

else
    # ── INTERNER Modus ─────────────────────────────────────────
    log "Interner PostgreSQL-Modus"

    PG_DATA="/data/postgres"
    export PGHOST="127.0.0.1"
    export PGPORT="5432"
    export PGUSER="reassistant"
    export PGDATABASE="reassistant"
    export PGPASSWORD="repassword"

    mkdir -p /run/postgresql
    chown postgres:postgres /run/postgresql

    PREV_VERSION=$(cat "${VERSION_FILE}" 2>/dev/null || echo "")

    if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
        log "Neue Installation — Initialisiere PostgreSQL …"
        mkdir -p "${PG_DATA}"
        chown -R postgres:postgres "${PG_DATA}"
        su postgres -s /bin/sh -c "initdb -D ${PG_DATA} --auth=trust --username=postgres" 2>&1
        log "PostgreSQL initialisiert"
    else
        log "Vorhandene Datenbank (v${PREV_VERSION:-?}) — Daten bleiben erhalten"

        # Automatisches Backup bei Versions-Update
        if [ -n "${PREV_VERSION}" ] && [ "${PREV_VERSION}" != "${CURRENT_VERSION}" ]; then
            log "Update v${PREV_VERSION} → v${CURRENT_VERSION} erkannt"
            BACKUP_FILE="${BACKUP_DIR}/pre-update-${PREV_VERSION}-$(date +%Y%m%d-%H%M%S).sql"
            log "Erstelle Backup: ${BACKUP_FILE} …"
        fi

        # chown nur wenn nötig
        OWNER=$(stat -c '%U' "${PG_DATA}" 2>/dev/null || echo "unknown")
        if [ "${OWNER}" != "postgres" ]; then
            chown -R postgres:postgres "${PG_DATA}"
        fi
    fi

    # PostgreSQL starten
    log "Starte PostgreSQL …"
    su postgres -s /bin/sh -c \
        "pg_ctl -D ${PG_DATA} -o '-p 5432 -h 127.0.0.1' -l ${PG_DATA}/server.log start" 2>&1 || {
        log "PostgreSQL Start fehlgeschlagen:"
        cat "${PG_DATA}/server.log" 2>/dev/null || echo "(kein Log)"
        exit 1
    }

    # Warten
    WAIT=0
    until pg_isready -h 127.0.0.1 -p 5432 -U postgres &>/dev/null; do
        WAIT=$((WAIT+1))
        [ $WAIT -ge 30 ] && { log "FEHLER: Timeout"; exit 1; }
        sleep 1
    done
    log "PostgreSQL bereit (${WAIT}s)"

    # Backup ausführen (nach Start)
    if [ -n "${PREV_VERSION}" ] && [ "${PREV_VERSION}" != "${CURRENT_VERSION}" ]; then
        su postgres -s /bin/sh -c \
            "pg_dump -h 127.0.0.1 -p 5432 -U postgres reassistant > '${BACKUP_FILE}'" 2>/dev/null && \
            log "✅ Backup erstellt" || log "⚠ Backup fehlgeschlagen (nicht kritisch)"
    fi

    # DB einrichten
    log "Richte Datenbank ein …"
    su postgres -s /bin/sh -c "psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c \
        \"DO \\\$\\\$ BEGIN \
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename='reassistant') \
        THEN CREATE USER reassistant WITH PASSWORD 'repassword'; END IF; END \\\$\\\$;\""

    su postgres -s /bin/sh -c "psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c \
        \"SELECT 'exists' FROM pg_database WHERE datname='reassistant'\" \
        | grep -q exists || psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c \
        \"CREATE DATABASE reassistant OWNER reassistant;\""

    su postgres -s /bin/sh -c "psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c \
        \"GRANT ALL PRIVILEGES ON DATABASE reassistant TO reassistant;\""

    log "Datenbank bereit"
fi

# Version speichern
echo "${CURRENT_VERSION}" > "${VERSION_FILE}"

# ── Migrationen ────────────────────────────────────────────────
log "Führe Migrationen aus …"
cd /app/backend && node migrate.js
log "Migrationen OK"

# ── Nginx ──────────────────────────────────────────────────────
nginx &
NGINX_PID=$!

# ── Backend ────────────────────────────────────────────────────
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
    if [ -z "${DATABASE_URL}" ]; then
        su postgres -s /bin/sh -c "pg_ctl -D ${PG_DATA} -m fast stop" 2>/dev/null || true
    fi
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
