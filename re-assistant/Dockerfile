ARG BUILD_FROM
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# System-Pakete: nginx, node, postgresql-client (für pg_isready + migrate)
RUN apk add --no-cache \
    nginx bash curl \
    nodejs npm \
    postgresql-client \
    python3 make g++

WORKDIR /app

# Backend
COPY re-assistant/backend/package.json ./backend/
RUN cd backend \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY re-assistant/backend/server.js   ./backend/
COPY re-assistant/backend/db.js       ./backend/
COPY re-assistant/backend/migrate.js  ./backend/
COPY re-assistant/backend/notifications.js ./backend/
COPY re-assistant/backend/websocket.js     ./backend/
COPY re-assistant/backend/migrations/ ./backend/migrations/

# Frontend
COPY re-assistant/frontend/ ./frontend-src/
RUN cd frontend-src \
    && npm install --no-audit --no-fund \
    && npm run build \
    && mv dist /app/frontend/dist \
    && cd / && rm -rf /app/frontend-src

COPY re-assistant/nginx.conf /etc/nginx/http.d/default.conf
COPY re-assistant/run.sh /run.sh
RUN chmod +x /run.sh

LABEL \
    io.hass.name="RE-Assistent" \
    io.hass.description="KI-gestütztes Requirements Engineering mit PostgreSQL" \
    io.hass.type="addon" \
    io.hass.version="4.0.0"

CMD ["/run.sh"]
