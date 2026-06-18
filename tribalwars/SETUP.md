# Tribal Wars Scripts — Setup Guide

This document covers everything needed to get the TW script system running
from scratch and hand it off to another player or admin.

---

## Overview

A Raspberry Pi runs a small Flask web server (port 8888) that does two things:

1. **Serves JavaScript files** — scripts are fetched by the TW browser session
   and execute inside the game. No browser extension needed.
2. **Receives data POSTed back** — scripts collect game state and send it to
   the Pi, which stores it and generates readable summaries.

The dashboard at `http://192.168.1.4:8888/tw` shows the collected data
(villages, incomings, troops, world config) in a live view.

---

## Prerequisites

- Raspberry Pi on your local network (this guide assumes IP `192.168.1.4`)
- The Pi Home Dashboard installed and running (see `install.sh` in repo root)
- A Tribal Wars account on any world
- A browser with access to TW (desktop or mobile — scripts run in TW's own jQuery)

---

## Step 1 — Verify the server is running

Open a browser and go to:
```
http://192.168.1.4:8888/tw
```

You should see the Tribal Wars dashboard page (empty until you run a script).
If it doesn't load, start the server:
```bash
sudo systemctl start pi-dashboard
```

Check it's running:
```bash
sudo systemctl status pi-dashboard
```

---

## Step 2 — Check scripts are served

Open this URL in a browser — you should see raw JavaScript:
```
http://192.168.1.4:8888/tw/snapshot.js
```

Any `.js` file placed in the `tribalwars/` folder is automatically served
at `http://192.168.1.4:8888/tw/<filename>.js`.

---

## Step 3 — Update the Pi IP in each script

Every script has a `PI_URL` constant near the top. If your Pi's IP address
is different from `192.168.1.4`, update it:

**`snapshot.js`**:
```javascript
const PI_URL = 'http://192.168.1.4:8888';  // ← update this
```

**`attack.js`**:
```javascript
javascript:$.getScript('http://192.168.1.4:8888/tw/attack.js');  // ← update this
```

> **Tip**: Check your Pi's IP with `hostname -I` on the Pi. It's usually
> static if you've set a DHCP reservation on your router (recommended).

---

## Step 4 — Add scripts to Tribal Wars

Scripts are added as **Edit Links** — custom sidebar links in TW that run
JavaScript when clicked.

### How to add a link

1. Log in to Tribal Wars
2. Click the **pencil / Edit Links** icon on your in-game sidebar
3. Click **Add new link**
4. Fill in:
   - **Entry name**: e.g. `Snapshot`
   - **Target URL**: the bookmarklet line below
5. Click Save

### Bookmarklet URLs

| Script | Entry name | Target URL |
|--------|-----------|-----------|
| `snapshot.js` | `Snapshot` | `javascript:$.getScript('http://192.168.1.4:8888/tw/snapshot.js');` |
| `attack.js` | `Farm Scan` | `javascript:$.getScript('http://192.168.1.4:8888/tw/attack.js');` |
| `troops.js` | `Troops` | `javascript:$.getScript('http://192.168.1.4:8888/tw/troops.js');` |
| `sync.js` | `Sync` | `javascript:$.getScript('http://192.168.1.4:8888/tw/sync.js');` |

> The dashboard at `/tw` has a **Scripts** card that lists all `.js` files
> with a Copy button — you can copy the bookmarklet directly from there
> instead of typing it manually.

### Alternative: browser console

Press **F12** → Console → paste the bookmarklet and hit Enter.
Works on any page in TW without adding a link.

---

## Step 5 — Take a snapshot

1. Log in to Tribal Wars and go to any village
2. Click the **Snapshot** link you added (or run it from the console)
3. A progress alert will appear — the script fetches all pages of your
   villages, incomings, and outgoing commands (may take 30–60 seconds
   for large accounts)
4. A final alert confirms success: `Snapshot saved. 443 villages, 91 incomings.`

Open the dashboard to see the results:
```
http://192.168.1.4:8888/tw
```

You should see:
- Status bar: snapshot time, village count, incoming count
- Incoming attacks card (if any), sorted by arrival time with countdown timers
- Villages list (collapsible, shows buildings / troops / training queue)
- World config + unit stats

---

## What `snapshot.js` collects

| Data | How |
|------|-----|
| World speed, unit speed, morale, night bonus | `interface.php` (public, no login) |
| Unit stats — attack/defense/speed/carry/pop | `interface.php` (public, no login) |
| All villages — building levels | Authenticated overview (paginated) |
| All villages — troops at home | Authenticated overview (paginated) |
| All villages — training queues | Authenticated overview (paginated) |
| Incoming attacks — time, from-coord, target | Authenticated, all pages |
| Outgoing commands — from, to, type, arrival | Authenticated |
| Returning own troops | Authenticated (split from enemy incomings) |
| ODA + ODD kill rankings | Public map files |

The script handles **pagination automatically** — for a 443-village account
it will fetch multiple pages per overview mode and deduplicate results.

---

## What `attack.js` collects and does

1. Reads your reports for the last N pages (default: 5 pages ≈ 75 reports)
2. Identifies **empty villages** (≤ 10 total defenders) and **offensive villages**
   (few defensive units, high offensive ratio)
3. Finds your nearest village with enough troops to send
4. Shows an in-game modal with targets, troop fields, and "Send" / "Rally" buttons

**Nothing fires automatically** — you review the list and click Send per row.

Configurable at the top of `attack.js`:
```javascript
const CONFIG = {
  reportPages:    5,      // pages of reports to scan
  emptyThreshold: 10,     // max total defenders to count as "empty"
  offRatio:       0.25,   // def/total ratio to count as "offensive"
  minOffTroops:   50,     // skip villages with fewer than this many offensive troops
  sendTroops: { axe: 200, light: 100, ram: 5 },
  attackDelay:    1500,   // ms between attacks
};
```

---

## File locations on the Pi

```
/home/<user>/WebServer/
├── app.py                    ← Flask server (all routes)
├── config.json               ← server configuration (IP, passwords, etc.)
├── tribalwars/
│   ├── snapshot.js           ← deep game-state dump (run this)
│   ├── attack.js             ← farm scan + attack sender
│   ├── troops.js             ← troop overview overlay
│   ├── sync.js               ← account/world data sync
│   ├── snapshot.json         ← raw snapshot data (gitignored)
│   ├── SNAPSHOT.md           ← human-readable summary (gitignored)
│   ├── WORLD.md              ← world config reference (gitignored)
│   ├── README.md             ← script usage reference
│   └── TW_PAGES.md           ← TW page structure / selector reference
```

---

## API endpoints

These are served by the Pi and usable by scripts, the dashboard, or AI tools:

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/tw/<name>.js` | Serve a script file |
| `GET` | `/api/tw/scripts` | List all scripts with copy-ready bookmarklets |
| `POST` | `/api/tw/snapshot` | Receive snapshot data from `snapshot.js` |
| `GET` | `/api/tw/snapshot` | Return the latest snapshot as JSON |
| `GET` | `/api/tw/snapshot/text` | Download `SNAPSHOT.md` as a file |
| `POST` | `/api/tw/sync` | Receive sync data from `sync.js` |
| `GET` | `/api/tw/data` | Return the latest sync data as JSON |

---

## Adding a new script

1. Create `tribalwars/yourscript.js`
2. Start the file with a comment line (used as the description in the Scripts card):
   ```javascript
   // Short description of what this script does
   ```
3. Include `PI_URL` if the script needs to talk to the Pi:
   ```javascript
   const PI_URL = 'http://192.168.1.4:8888';
   ```
4. The script is immediately available at `http://192.168.1.4:8888/tw/yourscript.js`
   — no server restart needed.

---

## Troubleshooting

**Script alert says "Run from inside Tribal Wars"**
The script checks for `game_data` — a global TW sets on every page.
Make sure you're actually on a Tribal Wars page, not the forum or wiki.

**Snapshot completes but shows 0 villages or 0 incomings**
- The script may be running on a world you're not active on. Check the
  confirmation alert — it will say `world: enXXX` or similar.
- For incomings: TW lazy-loads the incomings table via AJAX on page=-1.
  The script uses explicit page numbers (0, 1, 2…) to work around this.

**"Failed to POST to Pi" error**
- Confirm the Pi is reachable: open `http://192.168.1.4:8888` in the same browser
- Confirm `PI_URL` in the script matches your Pi's actual IP
- Check that port 8888 isn't blocked by a firewall:
  ```bash
  sudo ufw status          # should show 8888 allowed, or ufw inactive
  ```

**Script runs but nothing shows on the dashboard (`/tw`)**
Open DevTools (F12) → Network and check if `/api/tw/snapshot` returns 200.
If it returns 404, the POST never reached the Pi — see "Failed to POST" above.

**CORS error in browser console**
All TW script endpoints on the Pi include `Access-Control-Allow-Origin: *` headers.
If you see CORS errors, confirm you're hitting the right IP/port and that the
Pi server is actually running (not a cached error page).

---

## Security note

Scripts require a manual click to run and only communicate with the Pi on
your local network. No credentials or session tokens leave your browser —
the scripts use TW's own authenticated session to fetch overview pages, then
POST only game-state data (not passwords or cookies) to the Pi.
