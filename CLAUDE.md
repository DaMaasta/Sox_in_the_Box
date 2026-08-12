# Kistle – Projektkontext für Claude

## Was ist Kistle?
Inventar- und Lagerverwaltungs-PWA (React/TypeScript). Nutzer verwalten hierarchische Lager (Gruppen → Boxen → Produkte), können Artikel ausleihen/zurückgeben und Dokumente hochladen.

---

## Server "heaven"

| | |
|---|---|
| **IP** | `10.10.30.167` (WLAN, neuer Standort) |
| **SSH** | `ssh damaasta@ssh.kistle.uk` (via Cloudflare Tunnel) |
| **OS** | Ubuntu Server + Docker |
| **Domain** | `https://kistle.uk` via Cloudflare Tunnel |

### Docker Container
| Container | Port | Wichtige Pfade |
|---|---|---|
| `nginx` | 80/443 | `/opt/docker/nginx/conf.d/kistle.conf` |
| `postgres:16` | 5432 | DB: `webapp`, Zugangsdaten ausschließlich aus der Server-`.env` |
| `webapp` (Node.js/Express) | 3000 | `/opt/docker/webapp/.env` |
| `cloudflared` | — | Tunnel: `heaven-tunnel` |
| `homeassistant` | 8123 | — |
| `mosquitto` | 1883 | — |

### Häufige Server-Befehle
```bash
# Backend neu bauen (vorher DB-Dump anlegen)
cd ~/kistle/server
npm test
docker tag kistle-webapp kistle-webapp:before-deploy
docker build -t kistle-webapp .
cd /opt/docker/webapp
sudo docker compose up -d --force-recreate

# Nginx neu laden
sudo docker exec nginx nginx -s reload

# Logs prüfen
sudo docker logs webapp --tail 20
sudo docker logs nginx --tail 20
```

---

## Frontend (Mac)

| | |
|---|---|
| **Pfad** | `/Users/danielengel/React/App/Kistle/` |
| **Stack** | React 18, TypeScript, Vite, Lucide Icons, Neumorphic Design |
| **Deploy** | `npm run deploy` → bump version + build + scp nach server |
| **API URL** | `https://kistle.uk/api` (in `.env.local`) |

### Deploy-Voraussetzung
SSH-Key muss eingerichtet sein: `ssh-copy-id damaasta@192.168.0.71`

### Version-Schema
`4.XX` — bump-version.js erhöht Minor automatisch um 1 bei jedem Deploy.

### Umgebungsvariablen (.env.local)
```
VITE_API_URL=https://kistle.uk/api
VITE_GOOGLE_CLIENT_ID=741879030804-ceq6tg0fjqicjg5k15q0o2b0gaaimlgs.apps.googleusercontent.com
VITE_MQTT_URL=wss://5ea10b68b9354c649b6fde9702eaa968.s1.eu.hivemq.cloud:8884/mqtt
DEPLOY_HOST=192.168.0.71
DEPLOY_USER=damaasta
DEPLOY_PATH=/mnt/data/www
```

---

## Backend (Node.js/Express)

| | |
|---|---|
| **Lokaler Produktionsstand** | `server-production/` (CommonJS, maßgeblich für Deployments) |
| **Alter lokaler Stand** | `server/` (TypeScript, nicht mit Produktion synchron) |
| **Pfad auf Server** | `/home/damaasta/kistle/server/` |
| **Auth** | E-Mail/Passwort oder Google-ID-Token → JWT, 7 Tage (localStorage: `kistle_token`) |
| **Routes** | `/api/auth`, `/api/spaces`, `/api/products`, `/api/bookings`, `/api/documents`, `/api/notifications` |

### Produktions-Sicherheitsmodell
- Leserechte: `viewer`, `editor`, `admin`; Kind-Boxen erben die Gruppenrolle.
- Schreibrechte für Lagerbestand: `editor`, `admin`.
- Mitglieder- und Rollenverwaltung: nur `admin` bzw. Besitzer.
- Nuki: nur Editor/Admin der in `NUKI_SPACE_ID` konfigurierten Gruppe.
- Autorisierungshelfer liegen zentral in `server-production/authorization.js`.
- Vor Backend-Deployments immer `npm test` in `server-production/` ausführen.

### Backups
- Täglicher PostgreSQL-Dump um 02:15 UTC via Benutzer-Crontab.
- Ziel: `/mnt/data/backups/kistle-postgres/` auf separatem Datenträger.
- Format: PostgreSQL Custom Format; Aufbewahrung: 30 Tage.
- Manuell: `/home/damaasta/kistle/server/ops/backup-postgres.sh`.

### Datenbank-Tabellen
`users`, `spaces`, `space_members`, `products`, `bookings`, `booking_items`, `folders`, `documents`, `notifications`, `lock_errors`

---

## Smart Lock / IoT

| | |
|---|---|
| **Gerät** | Nuki Pro, HA-Entity: `lock.lager` |
| **MQTT Bridge** | `/home/damaasta/mqtt-bridge.py` → `mqtt-bridge.service` |
| **HiveMQ** | `5ea10b68b9354c649b6fde9702eaa968.s1.eu.hivemq.cloud:8883` |
| **Topic** | `kistle/nuki/status` |

---

## App-Architektur

### Navigation
- Kein React Router — eigenes SPA-Routing via `useState` in `App.tsx`
- `PAGE_DEPTH` bestimmt Slide-Animation (forward/back/lateral)
- Bottom-Nav-Tabs wechseln immer mit **Fade** (`"lateral"`), nie Slide

### Wichtige Design-Entscheidungen
- Alle Styles als inline `CSSProperties` (kein Tailwind in Komponenten)
- Neumorphic Design: CSS-Variablen `--neu-raised`, `--neu-inset` etc.
- iOS PWA: `visualViewport` für Keyboard-Nav, `100dvh` + flex layout (kein `overflow:hidden` auf body)
- Firebase wurde vollständig durch eigenes Backend ersetzt — `src/config/firebase.ts` existiert nicht mehr

### Service-Schicht
- `src/config/api.ts` — zentraler HTTP-Client mit JWT-Header
- WebSocket-Invalidierung über `/ws`; 30-Sekunden-Polling als Fallback
- `src/services/` — auth, spaces, products, bookings, notifications, documents, mqtt

### Contexts
- `AuthContext` — User-State via `/api/auth/me`
- `CartContext` — lokaler Warenkorb-State
- `HeaderContext` — dynamischer Header-Titel + Back-Button
- `ThemeContext` — Dark/Light Mode
