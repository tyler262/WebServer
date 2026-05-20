# Tribal Wars Scripts

Scripts that run inside the Tribal Wars browser session and sync data
back to the Pi dashboard. All scripts are plain JavaScript — no installs,
no extensions required.

---

## How to run a script

### Method 1 — Script URL (recommended, requires Premium)
1. Open any village in Tribal Wars
2. Go to the **Overview** screen
3. Find the **Script** field (bottom of the page)
4. Enter the URL: `http://192.168.1.4:8888/tw/sync.js`
5. Click the arrow/run button

The Pi serves the scripts directly, so changes take effect immediately
without needing to copy/paste anything.

### Method 2 — Browser console
1. Press **F12** to open developer tools
2. Go to the **Console** tab
3. Paste the entire contents of the `.js` file
4. Press Enter

### Method 3 — Bookmarklet
1. Create a new browser bookmark
2. Set the URL to:
   ```
   javascript:(function(){var s=document.createElement('script');s.src='http://192.168.1.4:8888/tw/sync.js?_='+Date.now();document.head.appendChild(s);})();
   ```
3. Click the bookmark while on any Tribal Wars page

---

## Scripts

### `sync.js` — Data sync
**Run this first.** Collects your villages, tribe, neighbors, and world
rankings from public map data and POSTs it to the Pi.

What it sends to the Pi:
- Your player info (rank, points, tribe)
- All your villages with coordinates
- Your tribe members
- Top 30 tribes and top 100 players
- All players with villages within 25 tiles of yours (neighbors)

After running, the Pi updates:
- `tribalwars/CONTEXT.md` — human/agent-readable summary
- `tribalwars/tw_data.json` — raw JSON (gitignored)

Run it whenever your situation changes significantly (new villages,
wars start, etc.).

---

## Adding more scripts

Drop any `.js` file into this folder. It will be automatically served
at `http://192.168.1.4:8888/tw/<filename>.js`.

For portability (sharing with a friend), put a configurable constant
at the top of each script:

```javascript
const PI_URL = 'http://192.168.1.4:8888';  // ← change to your Pi's IP
```

---

## Rules

Tribal Wars explicitly permits player-triggered scripts. These scripts:
- Are triggered manually by you clicking run
- Do not automate gameplay or send attacks on a timer
- Only read data and display/export it

Bots that act without user input are banned. These scripts are not bots.

---

## For AI agents

See `CONTEXT.md` for the current game state. It is auto-generated when
`sync.js` is run. The raw data is in `tw_data.json` (not in git).

To read raw data programmatically:
```
GET http://192.168.1.4:8888/api/tw/data
```
