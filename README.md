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
│  ✅ To-Do List  │  💬 Suggestions │
├─────────────────┴─────────────────┤
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
Pulls live stats from Pi-hole's local API. Shows:

- **Queries today** — total DNS lookups made by all devices
- **Blocked today** — how many were blocked as ads/trackers
- **Block rate** — percentage blocked
- **Blocklist size** — total number of domains being blocked
- **Status** — whether Pi-hole is enabled or paused (shown with a green/red dot)

If Pi-hole is on the same Pi, `host` should stay `localhost`. If it's on a
different machine, set the IP address. The `api_key` is optional but needed if
you've locked down the Pi-hole API (Pi-hole admin → Settings → API/Privacy).

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
A full-width photo that changes daily. Two options:

**Picsum Photos (default)** — no setup needed. Pulls a beautiful landscape/nature
photo seeded by the current date, so it changes every day automatically.

**NASA Astronomy Picture of the Day** — requires a free API key from
[api.nasa.gov](https://api.nasa.gov/). Shows whatever NASA chose that day
(space photos, nebulae, solar events, etc.) with the title and a short
description. Cached for 6 hours.

To switch to NASA APOD, see the **Optional: NASA Photo** section below.

---

### 📷 Live Camera
A live MJPEG video feed from a USB webcam plugged into the Pi, shown full-width
at the top of the dashboard. The feed is captured with OpenCV and streamed to
every device on your network — open the dashboard on a phone to use it as a
quick baby monitor, doorway cam, workshop view, etc.

To keep the camera from running 24/7, the Pi only opens the device while
someone is actually watching and releases it a few seconds after the last
viewer closes the page. If no camera is plugged in (or the camera support
isn't installed yet), the card shows a friendly message instead of an error and
the rest of the dashboard keeps working normally.

Configure it under `camera` in `config.json` (device index, resolution, frame
rate). Set `enabled` to `false` to hide the card entirely.

---

### ✅ To-Do List
A shared household task list. Anyone on the network can add, check off, or
delete tasks through the dashboard. Data is stored in a local SQLite database
(`dashboard.db`) so it persists when the Pi restarts. Refreshes every 15
seconds, so changes made on one phone show up on other devices shortly after.

Completed tasks move to the bottom with a strikethrough. Incomplete tasks stay
at the top.

---

### 💬 Suggestions
A household message/suggestion box. Leave a note with your name (optional) and
a message. Useful for things like "we're out of milk" or "can someone let the
dog out." Newest entries appear at the top. Also stored in `dashboard.db`.
Refreshes every 15 seconds.

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
  "api_key": ""
}
```
| Field | Description |
|-------|-------------|
| `host` | `"localhost"` if Pi-hole is on this Pi. Otherwise the Pi-hole's IP. |
| `api_key` | Optional. Find it in Pi-hole admin → Settings → API/Privacy → Show API token. Leave blank if you haven't restricted the API. |

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

### Camera
```json
"camera": {
  "enabled": true,
  "name": "USB Camera",
  "device": 0,
  "width": 1280,
  "height": 720,
  "fps": 15
}
```
| Field | Description |
|-------|-------------|
| `enabled` | `true` to show the Live Camera card. Set to `false` to hide it. |
| `name` | Label shown under the video feed. |
| `device` | Camera index — the number in `/dev/videoN` (usually `0`). If you have more than one camera, try `1`, `2`, etc. |
| `width` / `height` | Capture resolution. Lower it (e.g. `640` × `480`) if the stream is laggy on a Pi Zero / older model. |
| `fps` | Target frames per second. `10`–`15` is plenty for a dashboard and keeps CPU usage low. |

Camera support uses OpenCV, which the installer adds via `sudo apt install
python3-opencv`. If you didn't run `install.sh`, install it manually and make
sure the dashboard's user is in the `video` group (`sudo usermod -aG video
$USER`, then reboot).

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

The installer sets up `http://dashboard.home` so you can reach the dashboard
from any device on your network without remembering an IP address or port number.

**How it works:**

```
Your phone               Pi-hole            Raspberry Pi
─────────────            ────────           ────────────
Opens                    Resolves           nginx on port 80
http://dashboard.home ──→ dashboard.home ──→ proxies to Flask
                         to Pi's IP         on port 5000
```

1. **Pi-hole DNS** — The installer adds `dashboard.home → Pi's IP` to
   `/etc/pihole/custom.list`. Since Pi-hole is the DNS server for your whole
   network, every device on your Wi-Fi resolves that name to the Pi.

2. **nginx reverse proxy** — The installer puts nginx in front of Flask.
   nginx listens on port 80 (the default HTTP port), so there's no `:5000`
   in the URL. It forwards requests to Flask running locally on port 5000.

**To change the hostname** (e.g. to `home.lan` or `pi.home`), edit the
`DASHBOARD_HOSTNAME` line near the top of `install.sh` and re-run it.

---

## What the Installer Does

Running `bash install.sh` does these steps in order:

1. Checks Python 3 and sudo are available
2. Runs `apt install nginx android-tools-adb python3-pip`
3. Runs `pip install flask requests feedparser psutil`
4. Writes an nginx config to `/etc/nginx/sites-available/pi-dashboard`
   that proxies port 80 to Flask on port 5000
5. Writes a systemd service to `/etc/systemd/system/pi-dashboard.service`
   with your exact username and project path baked in, then enables and
   starts it
6. Adds `<Pi IP> dashboard.home` to `/etc/pihole/custom.list` and restarts
   Pi-hole's DNS
7. Checks if `config.json` still has placeholder values and warns you if so
8. Prints the dashboard URL

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

nginx also starts on boot automatically. If you change the nginx config:
```bash
sudo nginx -t                   # test the config first
sudo systemctl reload nginx     # apply without dropping connections
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
├── camera.py           # USB webcam capture + MJPEG streaming
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

**Dashboard won't load at `http://dashboard.home`**
- Check nginx is running: `sudo systemctl status nginx`
- Check Flask is running: `sudo systemctl status pi-dashboard`
- Try the direct IP first: `http://192.168.x.x` — if that works, the issue is DNS
- Make sure your device is using Pi-hole as its DNS (it should be if Pi-hole is your router's DNS)

**Weather shows an error**
- The Pi needs internet access for weather, news, quotes, and jokes
- Test with: `curl "https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.00&current=temperature_2m"`

**TV Turn Off button fails**
- Make sure ADB pairing was done (see TV Setup above)
- Test manually: `adb connect <TV_IP>:5555` then `adb devices`
- If the TV IP changed, update `config.json` and restart the service

**Pi-hole card shows an error**
- If you recently updated Pi-hole to v6, the API format changed
- Try leaving `api_key` blank first — v6 may require a different key format
- Check the Pi-hole admin panel is reachable at `http://localhost/admin`

**Todo list or suggestions disappeared**
- They're in `dashboard.db` in the project folder
- Check it exists: `ls -lh ~/WebServer/dashboard.db`
- If the service user changed, the file permissions might need fixing:
  `sudo chown $USER:$USER ~/WebServer/dashboard.db`

**Service won't start after a reboot**
- Check the logs: `sudo journalctl -u pi-dashboard -n 30`
- Most common cause: wrong path in the service file. Re-run `bash install.sh`

**Live Camera card shows "Camera support isn't installed"**
- Install OpenCV: `sudo apt install python3-opencv`, then restart the service

**Live Camera card is blank or shows "Could not open camera"**
- Confirm the camera is detected: `ls /dev/video*` (you should see `/dev/video0`)
- List cameras and capabilities: `v4l2-ctl --list-devices`
- Make sure the dashboard user can read the device: `sudo usermod -aG video $USER`
  then reboot (group membership only applies to new logins)
- If you have multiple `/dev/videoN` devices, set the right `camera.device`
  index in `config.json` and restart the service
- Some webcams only support certain resolutions — try `640` × `480` in config
