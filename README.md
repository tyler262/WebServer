# Pi Home Dashboard

A local-network home dashboard hosted on a Raspberry Pi. Accessible from any
phone, laptop, or tablet on your Wi-Fi — no internet required to reach it.

---

## What it looks like

The dashboard is a single dark-mode page with cards arranged in a grid:

```
┌─────────────────┬─────────────────┐
│   🌤 Weather    │  📺 TV Controls │
├─────────────────┼─────────────────┤
│  🛡 Pi-hole     │   🖥 System     │
├─────────────────┼─────────────────┤
│  ✨ Quote       │  😂 Joke        │
├─────────────────┴─────────────────┤
│        📷 Photo of the Day        │
├─────────────────┬─────────────────┤
│  ✅ To-Do List  │  🛒 Grocery     │
├─────────────────┴─────────────────┤
│           💬 Suggestions          │
├───────────────────────────────────┤
│           📡 Network Devices      │
├───────────────────────────────────┤
│             📰 News               │
└───────────────────────────────────┘
```

Everything auto-refreshes in the background. No page reload needed.

---

## Features

### 🌤 Weather
Current conditions pulled from [Open-Meteo](https://open-meteo.com/) — a free
weather API that needs no account or API key. Shows temperature, feels-like,
humidity, and wind speed. Refreshes every 10 minutes.

You set your city and coordinates in `config.json`. To find your coordinates,
go to [latlong.net](https://www.latlong.net), type your city, and copy the
latitude/longitude numbers.

Supports Fahrenheit or Celsius.

---

### 📺 TV Controls
Sends a sleep/standby command to your Hisense Google TVs over your Wi-Fi using
**ADB** (Android Debug Bridge) — the same tool developers use to talk to Android
devices. The TVs just need to be on the same network as the Pi.

You get one "Turn Off" button per TV. Each button sends the `KEYCODE_SLEEP`
keyevent, which puts the TV into standby exactly like pressing the power button
on the remote.

See the **TV Setup** section below for the one-time pairing steps.

---

### 🛡 Pi-hole
Pulls live stats from Pi-hole's local API. Shows queries, block rate,
blocklist size, and whether blocking is enabled.

**Pi-hole v6 (current):** Uses the new REST API with password authentication.
Set `pihole.password` in `config.json` to your Pi-hole web password.

**Pi-hole v5 (older):** Uses `api_key`. Leave `password` blank and set
`api_key` from Pi-hole admin → Settings → API/Privacy → Show API token.

The dashboard auto-detects which to use based on which field is set.

---

### 🖥 System
Live stats about the Pi itself. Refreshes every 10 seconds.

- **CPU** — current usage percentage
- **Memory** — used vs total RAM
- **Disk** — used vs total storage on the root partition
- **Temperature** — CPU temperature in °C (reads from `/sys/class/thermal`)
- **Uptime** — how long the Pi has been running
- **Hostname** — the Pi's name on the network

The progress bars turn yellow above 70% and red above 90% as a visual warning.

---

### ✨ Quote of the Day
Fetches a random inspirational quote from [ZenQuotes](https://zenquotes.io/).
Cached on the server for 1 hour so the free API isn't hammered. There's a
"New" button to fetch a fresh quote whenever you want.

---

### 😂 Daily Joke
Fetches a safe-mode joke from [JokeAPI](https://v2.jokeapi.dev/). For two-part
jokes (setup + punchline), the punchline is hidden behind a "Reveal punchline"
button so you actually get to read the setup first. Cached for 1 hour. "New"
button fetches a fresh one.

---

### 📷 Photo of the Day
A full-width photo that changes daily. **"Next" button** picks a random new
photo immediately. Two sources:


**Picsum Photos (default)** — no setup needed. Pulls a beautiful landscape/nature
photo seeded by the current date, so it changes every day automatically.

**NASA Astronomy Picture of the Day** — requires a free API key from
[api.nasa.gov](https://api.nasa.gov/). Shows whatever NASA chose that day
(space photos, nebulae, solar events, etc.) with the title and a short
description. Cached for 6 hours.

To switch to NASA APOD, see the **Optional: NASA Photo** section below.

---

### ✅ To-Do List
Shared household task list with **three states** — click the circle button to
cycle through them:

| State | Indicator | What it means |
|-------|-----------|---------------|
| Pending | ○ gray circle | Not started yet |
| In Progress | ▶ yellow | Someone is working on it |
| Done | ✓ green | Finished — moves to bottom with strikethrough |

If you have ntfy configured (see Notifications below), advancing a task sends
a push notification to your phones.

Stored in `dashboard.db`, refreshes every 15 seconds.

---

### 🛒 Grocery List
Shared grocery list. Add items, check them off when you grab them in the store,
delete them when done. Checked items drop to the bottom. If ntfy is set up,
adding an item sends a notification. Stored in `dashboard.db`, refreshes every
15 seconds.

---

### 💬 Suggestions
A household message/suggestion box. Leave a note with your name (optional) and
a message. If ntfy is configured, posting a suggestion sends a notification.
Newest entries appear at the top. Stored in `dashboard.db`, refreshes every
15 seconds.

---

### 📡 Network Devices
Pings every device in your `config.json` devices list and shows online/offline
status with a green or red dot. Refreshes every 30 seconds.

**Tip for Android phones:** by default your phone gets a different IP address
each time it reconnects to Wi-Fi. To make the status reliable, assign each
phone a **static/reserved IP** in your router settings using the phone's MAC
address (usually found in Settings → Wi-Fi → your network → Advanced). Once
reserved, that phone always gets the same IP.

---

### 📰 News
Pulls headlines from RSS feeds. Default sources are AP News, NPR, and BBC
(5 articles each, 15 total). Displayed in two columns. Refreshes every 30
minutes. You can add, remove, or swap feeds in `config.json` — any standard
RSS feed URL works.

---

## Prerequisites

- Raspberry Pi running Raspberry Pi OS (or any Debian-based Linux)
- Pi-hole already installed and running
- Python 3.9 or newer (`python3 --version` to check)
- Connected to your home network via Wi-Fi or Ethernet
- `sudo` access

---

## AI Agent Installation Instructions

> **This section is for AI agents performing installation or updates on behalf of the user.**

### First-time install

1. **Check you are in the repo directory** — if not, `cd ~/WebServer` (or wherever it was cloned)
2. **Check for local changes** — run `git status`. Note any modified files.
3. **Preserve `config.json`** — this file contains the user's personal settings (coordinates, IPs, passwords). If it has been edited locally (or contains non-placeholder values), back it up before pulling:
   ```bash
   cp config.json config.json.bak
   ```
4. **Pull the latest code** — use rebase to avoid the divergent-branch error:
   ```bash
   git pull --rebase origin claude/setup-pi-dashboard-j0879
   ```
   If that fails due to conflicts on `config.json`, abort and do a hard reset instead, then restore the backup:
   ```bash
   git rebase --abort
   git fetch origin claude/setup-pi-dashboard-j0879
   git reset --hard origin/claude/setup-pi-dashboard-j0879
   cp config.json.bak config.json
   ```
5. **Do NOT overwrite `config.json`** if it already has real values (city, IPs, passwords). Only overwrite it if it still contains placeholder values like `"Your City"`.
6. **Do NOT touch `dashboard.db`** — this file is excluded from git and contains the user's live data (todos, grocery list, suggestions). Never delete or overwrite it.
7. **Run the installer**:
   ```bash
   bash install.sh
   ```
8. Confirm the service is running: `sudo systemctl status pi-dashboard`

### Updating an existing install

Same as above from step 2. The installer is safe to re-run — it will update the venv, restart the service, and re-register the DNS entry.

### Key files not to touch

| File | Reason |
|------|--------|
| `config.json` | User's personal settings — preserve across pulls |
| `dashboard.db` | Live SQLite data — never delete, not tracked in git |
| `/etc/pihole/custom.list` | Managed by `install.sh` — don't edit manually |

---

## Quick Start

**1. Clone the repo onto the Pi**
```bash
git clone https://github.com/tyler262/WebServer.git
cd WebServer
```

**2. Edit the config file**
```bash
nano config.json
```
Fill in at minimum: your city, coordinates, TV IPs, and device IPs.
See the **Configuration** section below for a full breakdown.

**3. Run the installer**
```bash
bash install.sh
```

That's it. The installer handles everything else automatically and prints the
URL when it's done.

---

## Configuration

All settings live in `config.json`. Here's every field explained:

### Weather
```json
"weather": {
  "city": "Austin",
  "latitude": 30.2672,
  "longitude": -97.7431,
  "units": "fahrenheit"
}
```
| Field | Description |
|-------|-------------|
| `city` | Display name shown on the weather card — can be anything |
| `latitude` | Your latitude — find it at [latlong.net](https://www.latlong.net) |
| `longitude` | Your longitude — find it at [latlong.net](https://www.latlong.net) |
| `units` | `"fahrenheit"` or `"celsius"` |

---

### TVs
```json
"tvs": [
  { "name": "Living Room TV", "ip": "192.168.1.100" },
  { "name": "Bedroom TV",     "ip": "192.168.1.101" }
]
```
Add one entry per TV. The `name` is just a label for the button.
To find each TV's IP address: **Settings → Network → Status** on the TV.

You can add more TVs or remove the ones you don't need. The dashboard
generates one "Turn Off" button per entry.

---

### Network Devices
```json
"devices": [
  { "name": "Router",          "ip": "192.168.1.1"   },
  { "name": "My Phone",        "ip": "192.168.1.50"  },
  { "name": "Partner's Phone", "ip": "192.168.1.51"  },
  { "name": "Living Room TV",  "ip": "192.168.1.100" },
  { "name": "Bedroom TV",      "ip": "192.168.1.101" }
]
```
Any device you want to see a ping status for. Add as many as you want.
The `name` is just a label. Common things to include: router, phones,
smart home hubs, NAS drives, game consoles.

---

### Pi-hole
```json
"pihole": {
  "host": "localhost",
  "password": "",
  "api_key": ""
}
```
| Field | Description |
|-------|-------------|
| `host` | `"localhost"` if Pi-hole is on this Pi. Otherwise the Pi-hole's IP. |
| `password` | **Pi-hole v6:** Your Pi-hole web password. Set this and leave `api_key` blank. |
| `api_key` | **Pi-hole v5 (older):** Your API token from Pi-hole admin → Settings → API/Privacy → Show API token. Leave blank for v6. |

The dashboard auto-detects v6 vs v5 based on which field you fill in. If you're on Pi-hole v6 (current), set `password` and leave `api_key` empty.

---

### Notifications (ntfy)
```json
"ntfy": {
  "topic": "",
  "server": "https://ntfy.sh"
}
```
| Field | Description |
|-------|-------------|
| `topic` | Your unique channel name — pick something random so others don't stumble onto it, e.g. `smithfamily-dashboard-abc123`. Leave blank to disable notifications. |
| `server` | The ntfy server. Leave as `https://ntfy.sh` to use the free public server. |

**To set up push notifications:**

1. Install the **ntfy** app on your Android phones ([play.google.com](https://play.google.com/store/apps/details?id=io.heckel.ntfy) or F-Droid)
2. Open the app and subscribe to your topic name (e.g. `smithfamily-dashboard-abc123`)
3. Add that same topic name to `config.json` under `ntfy.topic`
4. Restart the service: `sudo systemctl restart pi-dashboard`

Notifications fire automatically when:
- A to-do item is marked **In Progress** or **Done**
- A new **grocery item** is added
- A new **suggestion** is posted

---

### SMS (text messages)
```json
"sms": {
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_user": "youremail@gmail.com",
  "smtp_password": "your-app-password",
  "recipients": [
    "5551234567@vtext.com",
    "5559876543@vtext.com"
  ]
}
```

SMS is sent free via your carrier's email-to-SMS gateway — no third-party service needed. The Pi emails the gateway address and it converts it to a text.

**Carrier gateway addresses** (use the 10-digit number with no spaces or dashes):

| Carrier | SMS gateway |
|---------|-------------|
| Verizon | `number@vtext.com` |
| Xfinity Mobile | `number@vtext.com` (uses Verizon towers) |
| AT&T | `number@txt.att.net` |
| T-Mobile | `number@tmomail.net` |

**To set up (Gmail):**

1. Go to your Google Account → Security → **2-Step Verification** → **App passwords**
2. Create an app password (name it "Pi Dashboard" or anything)
3. Copy the 16-character password it gives you
4. Fill in `config.json`:
   - `smtp_user` — your Gmail address
   - `smtp_password` — the 16-character app password (not your regular Gmail password)
   - `recipients` — each phone as `number@vtext.com`
5. Restart the service: `sudo systemctl restart pi-dashboard`

The same events that trigger ntfy notifications also send SMS. You can use both at the same time, or just one, or neither — each is independent.

---

### Photo
```json
"photo": {
  "source": "picsum",
  "nasa_api_key": ""
}
```
| Field | Description |
|-------|-------------|
| `source` | `"picsum"` for random daily photos (no key needed). `"nasa_apod"` for NASA's Astronomy Picture of the Day. |
| `nasa_api_key` | Only needed if `source` is `"nasa_apod"`. Get a free key at [api.nasa.gov](https://api.nasa.gov/). |

---

### News
```json
"news": {
  "feeds": [
    { "name": "AP News", "url": "https://feeds.apnews.com/rss/apf-topnews" },
    { "name": "NPR",     "url": "https://feeds.npr.org/1001/rss.xml"       },
    { "name": "BBC",     "url": "http://feeds.bbci.co.uk/news/rss.xml"     }
  ],
  "articles_per_feed": 5
}
```
You can add any RSS feed URL. Most major news sites have one — usually findable
by searching "[site name] RSS feed". Set `articles_per_feed` to control how
many headlines to pull from each source.

---

## TV Setup (one-time per TV)

Your Hisense Google TVs are Android devices and support ADB (Android Debug
Bridge) over Wi-Fi. You just need to enable it once per TV.

**On the TV, using your remote:**

1. Go to **Settings → Device Preferences → About**
2. Navigate to **Build** and press OK **7 times in a row** until you see
   "You are now a developer!"
3. Go back to **Settings → Device Preferences → Developer Options**
4. Enable **USB debugging** (this enables ADB over the network)
5. Go to **Settings → Network → Status** and note the IP address

**On the Pi:**

```bash
adb connect 192.168.1.100:5555
```
Replace the IP with your TV's actual IP. A dialog will appear on the TV screen
asking to authorize the connection — navigate to it with your remote and
press OK.

Repeat for the second TV. After that, the "Turn Off" buttons on the dashboard
will work. The Pi remembers the authorization, so you only need to do this once
unless you factory reset the TV.

---

## Pretty URL

The installer sets up `http://dashboard.home:8888` so you can reach the
dashboard from any device on your Wi-Fi by name instead of IP address.

**How it works:**

```
Your phone                    Pi-hole            Raspberry Pi
─────────────                 ────────           ────────────
Opens                         Resolves           Flask on port 8888
http://dashboard.home:8888 ──→ dashboard.home ──→ serves the dashboard
                              to Pi's IP         directly
```

Pi-hole is already running on port 80, so the dashboard runs directly on
port 8888 — no nginx needed. The only piece the installer adds is a Pi-hole
DNS record so the name `dashboard.home` resolves to the Pi's IP.

**To change the hostname** (e.g. to `home.lan` or `pi.home`), edit the
`DASHBOARD_HOSTNAME` line near the top of `install.sh` and re-run it.

---

## What the Installer Does

Running `bash install.sh` does these steps in order:

1. Checks Python 3 and sudo are available
2. Runs `apt install python3-venv android-tools-adb` if not already present
3. Creates a Python virtualenv at `.venv/` and installs packages into it
4. Writes a systemd service to `/etc/systemd/system/pi-dashboard.service`
   with your exact username and project path baked in, then enables and
   starts it
5. Adds `<Pi IP> dashboard.home` to `/etc/pihole/custom.list` and restarts
   Pi-hole's DNS
6. Checks if `config.json` still has placeholder values and warns you if so
7. Prints the dashboard URL

The installer is safe to re-run if anything goes wrong or if you change the
hostname.

---

## Managing the Service

Flask runs as a background service that starts automatically when the Pi boots.

```bash
# Check if it's running
sudo systemctl status pi-dashboard

# Restart it (e.g. after editing app.py or config.json)
sudo systemctl restart pi-dashboard

# View live logs
sudo journalctl -u pi-dashboard -f

# Stop it
sudo systemctl stop pi-dashboard
```

---

## Optional: NASA Photo of the Day

To replace the random Picsum photo with NASA's Astronomy Picture of the Day:

1. Go to [https://api.nasa.gov/](https://api.nasa.gov/) and click
   **"Generate API Key"** — it's free and instant
2. Open `config.json` and change the photo section:

```json
"photo": {
  "source": "nasa_apod",
  "nasa_api_key": "your-key-here"
}
```

3. Restart the service:

```bash
sudo systemctl restart pi-dashboard
```

The photo will update daily and show the title and a short description below it.
Some days NASA posts a video instead of a photo — on those days the card will
show an error, which is normal.

---

## File Structure

```
WebServer/
├── app.py              # Flask server — all API routes and logic
├── config.json         # Your settings — edit this
├── install.sh          # One-command installer
├── requirements.txt    # Python package list
├── dashboard.db        # SQLite database (created on first run, not in git)
├── templates/
│   └── index.html      # Dashboard HTML
└── static/
    ├── style.css       # Dark theme styles
    └── script.js       # Frontend fetch logic and auto-refresh
```

`dashboard.db` is excluded from git (via `.gitignore`) because it contains your
personal data — todos and suggestions. It lives only on the Pi.

---

## Troubleshooting

**Dashboard won't load at `http://dashboard.home:8888`**
- Check Flask is running: `sudo systemctl status pi-dashboard`
- Try the direct IP first: `http://192.168.x.x:8888` — if that works, the issue is DNS
- Make sure port 8888 is in the URL — there's no nginx proxy, Flask serves directly
- Make sure your device is using Pi-hole as its DNS (it should be if Pi-hole is your router's DNS)

**Weather shows an error**
- The Pi needs internet access for weather, news, quotes, and jokes
- Test with: `curl "https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.00&current=temperature_2m"`

**TV Turn Off button fails**
- Make sure ADB pairing was done (see TV Setup above)
- Test manually: `adb connect <TV_IP>:5555` then `adb devices`
- If the TV IP changed, update `config.json` and restart the service

**Pi-hole card shows an error**
- **Pi-hole v6:** Set `pihole.password` in `config.json` to your Pi-hole web password, and leave `api_key` blank
- **Pi-hole v5:** Set `pihole.api_key` to the token from Pi-hole admin → Settings → API/Privacy, and leave `password` blank
- Check the Pi-hole admin panel is reachable at `http://localhost/admin`
- Test the v6 API manually: `curl http://localhost/api/stats/summary`

**Todo list or suggestions disappeared**
- They're in `dashboard.db` in the project folder
- Check it exists: `ls -lh ~/WebServer/dashboard.db`
- If the service user changed, the file permissions might need fixing:
  `sudo chown $USER:$USER ~/WebServer/dashboard.db`

**Service won't start after a reboot**
- Check the logs: `sudo journalctl -u pi-dashboard -n 30`
- Most common cause: wrong path in the service file. Re-run `bash install.sh`
