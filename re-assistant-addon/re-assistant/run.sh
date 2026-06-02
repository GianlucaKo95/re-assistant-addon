#!/usr/bin/with-contenv bashio
# ==============================================================================
# RE-Assistent Add-on Start-Skript
# ==============================================================================

bashio::log.info "╔══════════════════════════════════════╗"
bashio::log.info "║     RE-Assistent v2.0.0 startet      ║"
bashio::log.info "╚══════════════════════════════════════╝"

# ── Konfiguration aus HA-Optionen lesen ──────────────────────
API_KEY="$(bashio::config 'anthropic_api_key')"
ADMIN_PW="$(bashio::config 'admin_password')"
LANGUAGE="$(bashio::config 'language')"
LOG_LEVEL="$(bashio::config 'log_level')"

# ── Pflichtfeld prüfen ────────────────────────────────────────
if bashio::var.is_empty "${API_KEY}"; then
    bashio::log.fatal ""
    bashio::log.fatal "  FEHLER: 'anthropic_api_key' ist nicht gesetzt!"
    bashio::log.fatal "  Bitte in Einstellungen → Add-ons → RE-Assistent"
    bashio::log.fatal "  → Konfiguration den API-Key eintragen."
    bashio::log.fatal ""
    exit 1
fi

# ── Persistentes Datenverzeichnis ─────────────────────────────
DATA_DIR="/data/re-assistant"
mkdir -p "${DATA_DIR}"
bashio::log.info "Datenverzeichnis: ${DATA_DIR}"

# ── Ingress-Einstiegspfad ─────────────────────────────────────
INGRESS_ENTRY="$(bashio::addon.ingress_entry 2>/dev/null || echo '/')"
bashio::log.info "Ingress-Pfad: ${INGRESS_ENTRY}"

# ── Umgebungsvariablen setzen ─────────────────────────────────
export PORT=3000
export DATA_DIR="${DATA_DIR}"
export ANTHROPIC_API_KEY="${API_KEY}"
export ADMIN_PASSWORD="${ADMIN_PW}"
export LANGUAGE="${LANGUAGE}"
export SESSION_SECRET="$(bashio::addon.uuid 2>/dev/null || echo $(head -c 32 /dev/urandom | base64))"
export INGRESS_PATH="${INGRESS_ENTRY}"
export NODE_ENV="production"
export LOG_LEVEL="${LOG_LEVEL}"

# ── Frontend statisch via nginx servieren ─────────────────────
# nginx läuft parallel auf Port 3000 und proxyt API-Anfragen zu Node (3001)
# Der Node-Server hört intern auf 3001

export NODE_PORT=3001

# Nginx-Konfiguration mit korrektem Pfad aktualisieren
sed -i "s|__INGRESS_PATH__|${INGRESS_ENTRY}|g" /etc/nginx/http.d/default.conf

bashio::log.info "Starte nginx..."
nginx -g "daemon on;"

bashio::log.info "Starte Node.js Backend auf Port ${NODE_PORT}..."
cd /app/backend
exec node server.js
