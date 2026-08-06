# 🌬️ AirWatch

> A production-grade, end-to-end indoor air quality monitoring platform — built on a Raspberry Pi 5 with a Sensirion SEN54 sensor, streaming through Apache Kafka, persisting to PostgreSQL, served by FastAPI, and visualized in a React dashboard.

AirWatch turns a $70 air quality sensor and a Raspberry Pi into a real-time, multi-user, alert-capable air quality platform you can access securely from anywhere. PM1/2.5/4/10, VOC, temperature, and humidity are sampled every 2 seconds, streamed through a real Kafka pipeline, scored against the US EPA AQI formula, and surfaced through a polished dashboard with live charts, a calendar heatmap, week-over-week insights, and a 48-hour outdoor forecast.

---

## 📑 Table of Contents

- [What it does](#-what-it-does)
- [Screenshots](#-screenshots)
- [Hardware](#-hardware)
- [Software stack](#-software-stack)
- [System architecture](#-system-architecture)
- [Data flow](#-data-flow)
- [Pages walk-through](#-pages-walk-through)
- [Setup from scratch](#-setup-from-scratch)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Remote access (Tailscale)](#-remote-access-tailscale)
- [Maintenance & troubleshooting](#-maintenance--troubleshooting)
- [Project structure](#-project-structure)
- [Roadmap](#-roadmap)
- [Credits & license](#-credits--license)

---

## ✨ What it does

| Capability | How |
|---|---|
| **Live air quality** | SEN54 sensor publishes PM1/PM2.5/PM4/PM10/VOC/temp/humidity every 2 s |
| **Real-time UI** | WebSocket fan-out from Kafka → browser, no polling |
| **US EPA AQI** | Computed in a dedicated microservice from PM2.5 breakpoints |
| **Multi-user, multi-device** | JWT auth, device ownership table, claim codes |
| **Custom alerts** | Per-device threshold rules + email notifications via Resend |
| **Historical analysis** | Stats, daily/hourly aggregates, CSV export |
| **Pattern insights** | Auto-detected "worst hour", "worst day", week-over-week trends |
| **Forecast** | 48 h outdoor AQI + weather via Open-Meteo (no API key) |
| **Calendar heatmap** | GitHub-style 365-day view, one tile per day, colored by AQI |
| **Achievements** | Streaks of healthy-air days, milestones |
| **Recommendations** | Live actionable advice ("VOC high → open a window") |
| **Themes & mobile** | Light/dark toggle, fully responsive |
| **Secure remote access** | Tailscale (zero public exposure) |

---

## 📸 Screenshots

> *Screenshots coming soon — the dashboard, insights, history heatmap, and forecast pages will be added here.*

```
docs/screenshots/
├── login.png
├── dashboard.png
├── insights.png
├── history.png
├── forecast.png
├── alerts.png
└── settings.png
```

---

## 🔧 Hardware

| # | Item | Why | Approx. cost |
|---|---|---|---|
| 1 | **Raspberry Pi 5** (4 GB or 8 GB) | Runs Kafka + Postgres + API + 6 microservices comfortably. A Pi 4 works but Kafka is happier on a 5. | $60–80 |
| 2 | **Sensirion SEN54** | Particulate (PM1/2.5/4/10) + VOC index + temp + humidity in one I²C module. Best price/performance air sensor on the market. | $30 |
| 3 | **microSD card (32 GB+ A2)** | OS + database. Class A2 cards reduce IO contention with the database. | $10 |
| 4 | **5 V / 5 A USB-C PSU** (official Pi 5 PSU) | The Pi 5 *will* throttle on weaker supplies. | $12 |
| 5 | **Active cooler / case** | Kafka + JVM = heat. Active cooling keeps the Pi quiet and stable. | $10 |
| 6 | **5-wire JST cable** (SEN54 → Pi I²C) | Carries SDA, SCL, SEL, VCC, GND. The SEN54 ships with a JST-XH 6-pin header. | $5 |
| 7 | *(Optional)* Ethernet cable | Wi-Fi is fine, but wired is more reliable for 24/7 streaming. | — |

### SEN54 wiring (I²C)

```
SEN54 pin   →  Raspberry Pi GPIO (BCM)
─────────────────────────────────────────
1  VDD  (5 V)   →  Pin 2  (5 V)
2  GND          →  Pin 6  (GND)
3  SDA          →  Pin 3  (GPIO 2 / SDA1)
4  SCL          →  Pin 5  (GPIO 3 / SCL1)
5  SEL          →  GND  (forces I²C mode)
6  NC           →  —
```

Enable I²C on the Pi with `sudo raspi-config → Interface Options → I²C`.
Verify the sensor responds at `0x69`:

```bash
sudo i2cdetect -y 1
```

---

## 🧱 Software stack

| Layer | Tech | Why |
|---|---|---|
| OS | Raspberry Pi OS (64-bit Bookworm) | Best Pi 5 compatibility |
| Streaming bus | **Apache Kafka 3.7 (KRaft)** in Docker | No ZooKeeper, real production-grade messaging, lets you scale horizontally |
| Database | **PostgreSQL 15** (native, not Docker) | Async with `asyncpg`, persists readings, AQI, alerts, users |
| API | **FastAPI** + Uvicorn (async) | Type-safe, OpenAPI docs, websocket support out of the box |
| ORM | **SQLAlchemy 2.0** async + Pydantic v2 | Modern typed ORM |
| Auth | JWT (python-jose) + bcrypt | Industry-standard, no third-party auth dep |
| Frontend | **React 18 + TypeScript + Vite** | Fast HMR dev, tiny prod bundle |
| Charts | **Recharts** | Composable, performant for live data |
| Reverse proxy | **nginx** on port 8080 (Pi-hole occupies 80) | Static SPA + REST + WebSocket upgrade |
| Email | **Resend.com** | Cleanest free-tier transactional email |
| Outdoor data | **Open-Meteo** | Free, no API key, global air quality + weather |
| Tunnel | **Tailscale** | Zero-config WireGuard mesh, no public exposure |
| Process supervision | **systemd** | Auto-restart, journald logging |

---

## 🏗️ System architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                      RASPBERRY PI 5                                   │
│                                                                       │
│   ┌──────────┐    I²C                                                 │
│   │  SEN54   │──────────┐                                             │
│   └──────────┘          │                                             │
│                         ▼                                             │
│              ┌─────────────────┐                                      │
│              │ sensor-collector│  (Python, reads SEN54 @ 0.5 Hz)      │
│              └────────┬────────┘                                      │
│                       │ publishes JSON                                │
│                       ▼                                               │
│    ╔═══════════════════════════════════════════════╗                  │
│    ║                APACHE KAFKA                    ║                 │
│    ║                                                ║                 │
│    ║   sensor.raw  ──┬──▶ storage_consumer ──┐     ║                 │
│    ║                 ├──▶ aqi_processor      │     ║                 │
│    ║                 └──▶ device_health ──┐  │     ║                 │
│    ║                                      │  │     ║                 │
│    ║   aqi.computed ──┬──▶ alert_engine   │  │     ║                 │
│    ║                  │                   │  │     ║                 │
│    ║   alerts  ──────▶ notification ──┐   │  │     ║                 │
│    ║                                  │   │  │     ║                 │
│    ║   system.health ◀────────────────┼───┘  │     ║                 │
│    ╚══════════════════════════════════│══════│═════╝                 │
│                                       │      │                       │
│                                       ▼      ▼                       │
│                                  ┌────────────────┐                  │
│                                  │   PostgreSQL   │                  │
│                                  │  ─────────────  │                 │
│                                  │  users          │                 │
│                                  │  ownership      │                 │
│                                  │  device_registry│                 │
│                                  │  sensor_readings│                 │
│                                  │  aqi_results    │                 │
│                                  │  alerts         │                 │
│                                  │  alert_rules    │                 │
│                                  │  notif_prefs    │                 │
│                                  └────────┬───────┘                  │
│                                           ▲                          │
│                                           │ async asyncpg            │
│                            ┌──────────────┴──────────────┐           │
│                            │       FASTAPI / Uvicorn      │          │
│                            │  REST + WebSocket fan-out    │          │
│                            └──────────────┬───────────────┘          │
│                                           │                          │
│                            ┌──────────────▼───────────────┐          │
│                            │           NGINX  :8080       │          │
│                            │  /  → React SPA              │          │
│                            │  /api/  → FastAPI            │          │
│                            │  /api/ws/  → WebSocket       │          │
│                            └──────────────┬───────────────┘          │
└───────────────────────────────────────────│──────────────────────────┘
                                            │ Tailscale (encrypted)
                                            ▼
                              ╭─────────────────────────╮
                              │ Browser anywhere on the  │
                              │ user's Tailscale network │
                              ╰─────────────────────────╯
                                            │
                              ╭─────────────▼───────────╮
                              │   Open-Meteo API        │
                              │ (outdoor AQI + weather) │
                              ╰─────────────────────────╯
                                            ▲
                                            │
                              ╭─────────────┴───────────╮
                              │       Resend.com        │
                              │   (transactional email) │
                              ╰─────────────────────────╯
```

### Why Kafka for a single-sensor home project?

Honest answer: you don't *need* Kafka to run one SEN54 — you could write directly to Postgres. But Kafka was chosen because:

1. **Decoupling** — sensor publishes blindly, doesn't care who consumes. Add a Grafana sink, a TimescaleDB sink, a Slack bot — none of them require touching the collector.
2. **Replay** — every reading is durably logged. If the AQI processor crashes for an hour, it can catch up by replaying from `sensor.raw`.
3. **Real production patterns** — this is the same architecture used at scale. Running it on one Pi means you can scale to hundreds of devices without re-architecting.
4. **Backpressure isolation** — slow consumers (e.g., a busy email sender) can't block the sensor.

---

## 🔄 Data flow

### 1. Sensor → Kafka (every 2 seconds)

`sensor/collector.py` reads the SEN54 over I²C and publishes JSON to the `sensor.raw` topic:

```json
{
  "device_id": "pi-001",
  "timestamp": "2026-05-14T20:00:00Z",
  "pm1":   2.1,
  "pm25":  3.4,
  "pm4":   3.9,
  "pm10":  4.2,
  "temperature": 22.6,
  "humidity":    47.3,
  "voc": 105
}
```

### 2. Fan-out to four consumers

| Consumer | Subscribes to | Writes to |
|---|---|---|
| **storage_consumer** | `sensor.raw` | `sensor_readings` table |
| **aqi_processor** | `sensor.raw` | `aqi_results` table + `aqi.computed` topic |
| **device_health** | `sensor.raw` | tracks last-seen, fires `system.health` events after 30 s silence |
| **alert_engine** | `aqi.computed` | evaluates thresholds, writes to `alerts` topic + `alerts` table |
| **notification** | `alerts` | renders HTML email and sends via Resend |

### 3. Browser → FastAPI

- **REST**: history, analytics, settings, achievements, insights, weather
- **WebSocket** (`/api/ws/{device_id}`): a single Kafka consumer per device fans out to every connected browser. Adding 100 viewers doesn't add 100 Kafka consumers.

### 4. AQI calculation

`aqi_processor` applies the **US EPA piecewise-linear** formula to PM2.5:

```
AQI = ((I_hi - I_lo) / (C_hi - C_lo)) * (C - C_lo) + I_lo
```

with the six breakpoints (0–12, 12.1–35.4, 35.5–55.4, …, 250.5–500). The category (Good / Moderate / Unhealthy for Sensitive Groups / Unhealthy / Very Unhealthy / Hazardous) is set from the same breakpoints.

---

## 🗺️ Pages walk-through

### `/login`
- Full-bleed sky photo background (sourced from Unsplash, included in `frontend/public/`)
- Frosted-glass auth card (always dark, regardless of theme)
- Sign-In + Register tabs
- Hero panel (left): tagline, three glassmorphic feature highlights

### `/dashboard` — the heart of the app
- **AQI gauge** (custom SVG, 240° arc) with color-graded zone segments and a triangular needle
- **Device health card** + **active alerts count**
- **Outdoor AQI** (from Open-Meteo, if location is set in Settings) with indoor-vs-outdoor delta
- **Smart Recommendations** — derived from the live reading (e.g., "PM2.5 elevated — run a purifier", "Humidity below 30% — consider a humidifier")
- **7 sensor cards**: PM2.5, PM10, PM1, PM4, VOC, Temperature, Humidity — each color-coded by status
- **4 live charts** (Recharts): PM2.5+PM10 history, VOC history, Temp+Humidity, AQI history
- **Achievements grid**: current streak, healthy days, total readings, longest streak, alerts resolved, devices linked
- **Recent alerts** list
- Live "second-by-second" indicator pulsing in the topbar

### `/insights`
- 6 narrative finding cards auto-generated from 30 days of data
  - "Healthy 87 % of the last 7 days"
  - "PM2.5 down 12 % vs last week"
  - "Worst air around 19:00"
  - "Mondays are your worst day"
  - VOC / humidity flags
- **PM2.5 by hour of day** bar chart (color-graded by AQI band)
- **PM2.5 by day of week** bar chart

### `/history`
- **GitHub-style calendar heatmap** of the past 365 days, one tile per day
- Color scale: green (Good) → yellow (Moderate) → orange (USG) → red (Unhealthy) → purple (Very Unhealthy)
- Summary chips: Days Tracked, Good Days, Moderate Days, Unhealthy Days, avg annual AQI
- Hover any tile for that day's stats

### `/forecast`
- 48-hour outdoor air quality from Open-Meteo (free, no API key required)
- Daily outlook cards with weather emoji + temp range + peak AQI
- Hourly AQI bar chart (color-coded by EPA bands)
- Temperature + humidity line chart
- Hour-by-hour table (AQI, PM2.5, temp, humidity, wind, precip)

### `/analytics`
- Time range selector: 24 h / 7 d / 30 d
- Summary stats table (min / max / mean / sample count per metric)
- Daily PM2.5 bar chart with WHO threshold reference line
- Daily AQI bar chart with EPA reference lines
- Hourly heatmap-style PM2.5 chart
- Daily temperature & humidity trend lines
- **CSV export** for the selected time range

### `/alerts`
- **History** tab: list of past alerts, color-coded by severity, resolve button
- **Rules** tab: create custom threshold rules (`metric` + `above|below` + value), enable/disable/delete

### `/settings`
- **Profile**: change email + change password (verifies current password)
- **Location**: search any city (Open-Meteo geocoding), use browser geolocation, clears outdoor AQI when removed
- **Devices**: rename, view claim code, remove
- **Notifications**: toggle email alerts, set quiet hours, minimum interval between alerts

---

## 🚀 Setup from scratch

### 1. Prepare the Pi

```bash
# Flash Pi OS 64-bit, then on first boot:
sudo apt update && sudo apt upgrade -y
sudo apt install -y git python3-pip python3-venv \
                    postgresql postgresql-contrib \
                    nginx i2c-tools \
                    docker.io docker-compose-plugin
sudo usermod -aG docker $USER
sudo raspi-config   # → Interface Options → enable I²C → reboot
```

### 2. Verify the sensor

```bash
sudo i2cdetect -y 1
# Expect to see `69` in the grid
```

### 3. Clone the repo

```bash
cd ~
git clone https://github.com/PradipShrees/AirWatch.git
cd AirWatch
```

### 4. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE airwatch;
CREATE USER airwatch_app WITH PASSWORD 'change-me';
GRANT ALL PRIVILEGES ON DATABASE airwatch TO airwatch_app;
\c airwatch
GRANT ALL ON SCHEMA public TO airwatch_app;
SQL
```

### 5. Python venv + deps

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 6. Configure environment

```bash
cp .env.example .env
# Edit .env: set SECRET_KEY (openssl rand -hex 32), DATABASE_URL,
# RESEND_API_KEY, ALERT_TO_EMAIL
```

### 7. Start Kafka

```bash
docker compose -f docker/docker-compose.yml up -d
docker logs airwatch-kafka --tail 20   # confirm it's healthy
```

### 8. Build the frontend

```bash
cd frontend
npm install
npm run build       # outputs to ../nginx/dist
cd ..
chmod -R o+rX nginx/dist   # let nginx (www-data) read it
```

### 9. Nginx

```bash
sudo cp nginx/airwatch.conf /etc/nginx/sites-available/airwatch
sudo ln -s /etc/nginx/sites-available/airwatch /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 10. systemd services

```bash
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now \
  airwatch-api airwatch-sensor airwatch-storage \
  airwatch-health airwatch-aqi airwatch-alerts airwatch-notify
```

### 11. First user + first device

```bash
# Register your first user via the UI at http://<pi-ip>:8080
# Then provision the device using the admin endpoint:
TOKEN=$(curl -sX POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpass"}' | jq -r .access_token)

curl -X POST http://localhost:8000/api/devices/provision \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"pi-001"}'
# Note the returned auth_code. Add the device in the UI sidebar with that code.
```

---

## ⚙️ Configuration

All secrets live in `.env` (never committed). See `.env.example` for the full template.

| Var | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/airwatch` |
| `KAFKA_BOOTSTRAP` | typically `localhost:9092` |
| `SECRET_KEY` | random 32-byte hex; signs JWTs. **Rotate to invalidate all sessions.** |
| `RESEND_API_KEY` | from resend.com |
| `ALERT_TO_EMAIL` | where alert emails are sent |
| `ALERT_FROM_EMAIL` | `Name <verified-sender@your-domain>` |
| `DEVICE_ID` | logical name for the sensor (e.g., `pi-001`) |

---

## 📦 Deployment

### systemd units

| Unit | Source file | Restart policy |
|---|---|---|
| `airwatch-api` | `api/main.py` via uvicorn | `Restart=always` |
| `airwatch-sensor` | `sensor/collector.py` | `Restart=always` |
| `airwatch-storage` | `services/storage_consumer/main.py` | `Restart=always` |
| `airwatch-aqi` | `services/aqi_processor/main.py` | `Restart=always` |
| `airwatch-alerts` | `services/alert_engine/main.py` | `Restart=always` |
| `airwatch-notify` | `services/notification/main.py` | `Restart=always` |
| `airwatch-health` | `services/device_health/main.py` | `Restart=always` |

All units share `EnvironmentFile=/home/raspberry/airwatch/.env` and run as the `raspberry` user.

### nginx config (port 8080)

Pi-hole occupies port 80 on many home networks, so AirWatch listens on 8080.

```
/  →  /home/raspberry/airwatch/nginx/dist (React SPA, SPA-fallback)
/api/  →  proxy_pass 127.0.0.1:8000
/api/ws/  →  proxy_pass + WebSocket upgrade
```

Cache headers are configured so `index.html` is never cached (browser always picks up the latest bundle hash) and `/assets/*` files are cached for 1 year (safe because they're content-hashed).

---

## 🔒 Remote access (Tailscale)

There's no public exposure. To reach your Pi from your laptop, phone, or anywhere else:

```bash
# On the Pi
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# (Authenticate with your Tailscale account)
```

Now `http://<your-pi-tailscale-ip>:8080` works from any device on your Tailscale network. No DDNS, no port forwarding, no certificate gymnastics.

---

## 🛠️ Maintenance & troubleshooting

### Health checks

```bash
curl -s http://localhost:8000/api/health      # → {"status":"ok"}
systemctl is-active airwatch-api              # → active
docker ps | grep airwatch-kafka               # → up
sudo -u postgres psql airwatch -c "SELECT COUNT(*) FROM sensor_readings;"
```

### Live logs

```bash
journalctl -u airwatch-api    -f
journalctl -u airwatch-sensor -f
docker logs -f airwatch-kafka
```

### "I don't see live readings"

1. `sudo i2cdetect -y 1` — is the sensor at `0x69`?
2. `journalctl -u airwatch-sensor -n 30` — is the collector publishing?
3. `docker exec airwatch-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic sensor.raw --from-beginning --max-messages 1` — is Kafka receiving?
4. Browser devtools → Network tab → WebSocket frames — is the WS open?

### "Alerts aren't firing"

- The alert engine only fires on **boundary crossings** to avoid spam — e.g., it fires once when PM2.5 *crosses* into "Unhealthy", not on every reading while it stays there.
- Check `notification_preferences` table for the user's `min_interval_minutes` and `quiet_hours_*`.

### Rebuilding the frontend

```bash
cd frontend && npm run build
chmod -R o+rX ../nginx/dist
sudo nginx -s reload
```

The new content-hashed bundle filename is automatically picked up by `index.html`. No nginx config change needed.

---

## 📁 Project structure

```
airwatch/
├── api/                       # FastAPI app
│   ├── main.py                # entrypoint, registers routers, runs migrations
│   ├── auth.py                # JWT + bcrypt
│   ├── database.py            # async SQLAlchemy engine
│   ├── models.py              # ORM models (8 tables)
│   └── routers/
│       ├── auth.py            # /api/auth — register, login, me
│       ├── devices.py         # /api/devices — list, add, remove, provision
│       ├── readings.py        # /api/readings — latest, history, AQI, alerts
│       ├── ws.py              # /api/ws/{device_id} — WebSocket fan-out
│       ├── analytics.py       # /api/analytics — stats, daily, hourly, CSV
│       ├── alert_rules.py     # /api/alerts — history + rules CRUD
│       ├── settings.py        # /api/settings — profile, location, devices, notif prefs
│       ├── weather.py         # /api/weather — outdoor, forecast, geocode (Open-Meteo)
│       ├── achievements.py    # /api/achievements — streaks, totals
│       └── insights.py        # /api/insights — hourly/dow patterns, trends
│
├── sensor/
│   └── collector.py           # I²C → sensor.raw producer
│
├── services/                  # Kafka consumers (each runs as its own systemd unit)
│   ├── config.py
│   ├── storage_consumer/      # → sensor_readings
│   ├── aqi_processor/         # → aqi_results + aqi.computed
│   ├── alert_engine/          # → alerts table + alerts topic
│   ├── notification/          # → Resend
│   └── device_health/         # online/offline watchdog → system.health
│
├── frontend/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── login-bg.jpg
│   └── src/
│       ├── App.tsx            # routes
│       ├── UIContext.tsx      # theme + mobile sidebar context
│       ├── api.ts             # axios instance with auth header
│       ├── index.css          # all styles, CSS vars for light/dark
│       ├── components/
│       │   ├── Icons.tsx          # 30+ inline SVG icons
│       │   ├── Sidebar.tsx
│       │   ├── AQIGauge.tsx       # custom SVG gauge
│       │   ├── SensorCard.tsx
│       │   ├── OutdoorAQI.tsx
│       │   ├── Recommendations.tsx
│       │   └── Achievements.tsx
│       └── pages/
│           ├── Login.tsx
│           ├── Dashboard.tsx
│           ├── Insights.tsx
│           ├── History.tsx        # 365-day calendar heatmap
│           ├── Forecast.tsx
│           ├── Analytics.tsx
│           ├── Alerts.tsx
│           └── Settings.tsx
│
├── docker/
│   └── docker-compose.yml     # Kafka 3.7 KRaft mode
│
├── nginx/
│   └── airwatch.conf          # reverse proxy + SPA fallback + cache headers
│
├── systemd/
│   └── airwatch-*.service     # 7 systemd units
│
├── .env.example               # template (real .env is gitignored)
├── .gitignore
├── requirements.txt
└── README.md                  # ← you are here
```

---

## 🛣️ Roadmap

Already shipped:

- ✅ Multi-user, multi-device
- ✅ Custom alert rules + email
- ✅ Achievements / streaks
- ✅ Insights, History heatmap, Forecast
- ✅ Light/dark theme + mobile responsive
- ✅ Outdoor AQI (Open-Meteo)
- ✅ Smart Recommendations
- ✅ Per-room location (Open-Meteo geocoding)

Ideas worth building:

- 📊 **PDF weekly/monthly reports** auto-emailed to users
- 🗺️ **Map view** for multi-device setups (pins coloured by current AQI)
- 🔗 **Public share links** (read-only dashboard for a single device, no login)
- 🤝 **Compare mode** — overlay two devices' charts ("Living room vs Bedroom")
- 🪟 **"Open windows now" suggestions** — comparing indoor vs outdoor AQI continuously
- 📱 **PWA** — install on phone, offline cache for last reading
- 🏠 **Home Assistant webhook** out, so a high-VOC reading can flip an air purifier on
- 🎓 **Education page** — explain PM2.5, VOCs, AQI ranges, mitigation

---

## 📚 Credits & license

- **Sensor library**: [Sensirion's `sensirion-i2c-sen5x`](https://github.com/Sensirion/python-i2c-sen5x)
- **Outdoor data**: [Open-Meteo](https://open-meteo.com) — free, no API key, generous limits
- **Email**: [Resend](https://resend.com)
- **Icons**: hand-rolled inline SVG in [Feather](https://feathericons.com)/Lucide style
- **Login background**: [photo on Unsplash](https://unsplash.com/photos/calm-sky-during-daytime-1h2Pg97SXfA)
- **Charts**: [Recharts](https://recharts.org)

This project is [MIT licensed](LICENSE) — fork it, build on it, send a PR if you make something cool.

---

<sub>Built on a Raspberry Pi 5 with a Sensirion SEN54, somewhere with breathable air. 🫁</sub>
