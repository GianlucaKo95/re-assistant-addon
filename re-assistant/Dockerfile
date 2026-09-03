ARG BUILD_FROM
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# System-Pakete: nginx, node, postgresql (komplett, inkl. Server + pgvector
# für echte ANN-Vektorsuche statt JS-seitigem Scan)
RUN apk add --no-cache \
    nginx bash curl \
    nodejs npm \
    postgresql postgresql-client postgresql-contrib postgresql-pgvector \
    python3 make g++

# PostgreSQL Datenverzeichnis wird zur Laufzeit in run.sh erstellt
# NICHT im Build — /data ist ein persistenter HA-Mount

WORKDIR /app

# Backend
COPY backend/package.json ./backend/
RUN cd backend \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY backend/server.js        ./backend/
COPY backend/db.js            ./backend/
COPY backend/migrate.js       ./backend/
COPY backend/notifications.js ./backend/
COPY backend/websocket.js     ./backend/
COPY backend/dna.js           ./backend/
COPY backend/token-tracker.js ./backend/
COPY backend/migrations/      ./backend/migrations/

# Frontend bauen
COPY frontend/ ./frontend-src/
RUN cd frontend-src \
    && npm install --no-audit --no-fund \
    && npm run build \
    && mkdir -p /app/frontend \
    && mv /app/frontend-src/dist /app/frontend/dist \
    && cd / && rm -rf /app/frontend-src

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh

LABEL \
    io.hass.name="RE-Assistent" \
    io.hass.description="KI-gestütztes Requirements Engineering" \
    io.hass.type="addon" \
    io.hass.version="4.3.6"

CMD ["/run.sh"]
