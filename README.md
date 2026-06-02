# RE-Assistent — Home Assistant Add-on

KI-gestütztes Requirements Engineering direkt in Home Assistant.

## Installation in Home Assistant

### Schritt 1: Repository zu HA hinzufügen

1. **Einstellungen** → **Add-ons** → **Add-on Store** öffnen
2. Oben rechts auf die **⋮ Drei-Punkte-Menü** klicken
3. **"Repositories"** wählen
4. Diese URL einfügen:
   ```
   https://github.com/DEIN_GITHUB_USER/re-assistant-addon
   ```
5. **Hinzufügen** klicken

### Schritt 2: Add-on installieren

1. Im Add-on Store nach **"RE-Assistent"** suchen
2. **Installieren** klicken (Buildzeit: 3–5 Minuten beim ersten Mal)

### Schritt 3: Konfiguration

Im Add-on unter **Konfiguration** eintragen:

```yaml
anthropic_api_key: "sk-ant-api03-..."   # PFLICHT
admin_password: "sicheres-passwort"     # Login für admin@re.local
language: de                            # de oder en
log_level: info
```

### Schritt 4: Starten

1. **Starten** klicken
2. In der Seitenleiste erscheint **RE-Assistent**
3. Login: `admin@re.local` / dein `admin_password`

---

## Demo-Zugänge

| E-Mail | Passwort | Rolle |
|--------|----------|-------|
| admin@re.local | *(dein admin_password)* | Administrator |
| anna@re.local | test123 | Business |
| marcus@re.local | test123 | Business Analyst |
| tobias@re.local | test123 | Projektmanager |
| laura@re.local | test123 | Entwickler |

---

## Datenspeicherung

Alle Daten werden persistent unter `/data/re-assistant/database.json` gespeichert — bleibt auch nach Add-on Updates erhalten.

---

## Für Entwickler: Lokaler Build-Test

```bash
git clone https://github.com/DEIN_GITHUB_USER/re-assistant-addon
cd re-assistant-addon

# Frontend bauen
cd re-assistant/frontend && npm install && npm run build && cd ../..

# Docker-Image lokal bauen (amd64)
docker build \
  --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base-nodejs:20 \
  -t re-assistant-addon-test .

# Lokal testen
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e ADMIN_PASSWORD=admin123 \
  -e NODE_PORT=3001 \
  -e PORT=3001 \
  -e DATA_DIR=/tmp/re-data \
  re-assistant-addon-test
```

---

## GitHub Actions

Bei jedem Push auf `main` werden automatisch Docker-Images für **amd64**, **aarch64** und **armv7** gebaut und in die GitHub Container Registry (GHCR) gepusht.

**Wichtig:** Damit HA die Images aus GHCR pullen kann, müssen die Packages im GitHub Repository auf **Public** gestellt sein:  
Repo → **Packages** → `homeassistant-addon-re-assistant-amd64` → **Package settings** → **Make public**
