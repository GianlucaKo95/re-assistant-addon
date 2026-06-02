# syntax=docker/dockerfile:1
ARG BUILD_FROM
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# ── System-Pakete ────────────────────────────────────────────
RUN apk add --no-cache nginx nodejs npm bash curl

# ── App-Verzeichnis ───────────────────────────────────────────
WORKDIR /app

# ── Backend: Abhängigkeiten installieren ─────────────────────
COPY re-assistant/backend/package.json ./backend/
RUN cd backend \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# ── Backend: Quellcode kopieren ───────────────────────────────
COPY re-assistant/backend/server.js ./backend/

# ── Frontend: Quellcode + Build ───────────────────────────────
# Wir nutzen eine temporäre Node-Instanz für den Vite-Build
COPY re-assistant/frontend/ ./frontend-src/

RUN cd frontend-src \
    && npm install --no-audit --no-fund \
    && npm run build \
    && mv dist ../frontend/dist \
    && cd .. \
    && rm -rf frontend-src

# ── Nginx-Konfiguration ───────────────────────────────────────
COPY re-assistant/nginx.conf /etc/nginx/http.d/default.conf
RUN rm -f /etc/nginx/http.d/nginx.conf 2>/dev/null; true

# ── Start-Skript ──────────────────────────────────────────────
COPY re-assistant/run.sh /run.sh
RUN chmod +x /run.sh

# ── Labels ────────────────────────────────────────────────────
LABEL \
    io.hass.name="RE-Assistent" \
    io.hass.description="KI-gestütztes Requirements Engineering" \
    io.hass.type="addon" \
    io.hass.version="2.0.0"

CMD ["/run.sh"]
