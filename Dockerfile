ARG BUILD_FROM
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# System-Pakete (python3 + make + g++ für better-sqlite3 native build)
RUN apk add --no-cache \
    nginx bash curl \
    nodejs npm \
    python3 make g++ \
    sqlite

WORKDIR /app

# Backend-Abhängigkeiten (better-sqlite3 braucht native build)
COPY re-assistant/backend/package.json ./backend/
RUN cd backend \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY re-assistant/backend/server.js ./backend/
COPY re-assistant/backend/db.js ./backend/

# Frontend bauen
COPY re-assistant/frontend/ ./frontend-src/
RUN cd frontend-src \
    && npm install --no-audit --no-fund \
    && npm run build \
    && mv dist /app/frontend/dist \
    && cd / \
    && rm -rf /app/frontend-src

# Nginx + Start
COPY re-assistant/nginx.conf /etc/nginx/http.d/default.conf
COPY re-assistant/run.sh /run.sh
RUN chmod +x /run.sh

LABEL \
    io.hass.name="RE-Assistent" \
    io.hass.description="KI-gestütztes Requirements Engineering mit SQLite + RAG" \
    io.hass.type="addon" \
    io.hass.version="3.0.0"

CMD ["/run.sh"]
