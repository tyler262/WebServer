# Tribal Wars Scripts

Scripts that run inside the Tribal Wars browser session. TW has jQuery
loaded on every page, so scripts are loaded with `$.getScript()` — no
extensions or installs needed.

---

## How to add a script (Edit Link dialog)

1. In-game, go to **Edit Links** (the pencil icon on your sidebar links)
2. Click **Add new link**
3. Fill in:
   - **Entry name**: whatever you want to call it (e.g. `TW Sync`)
   - **Target URL**: `javascript:$.getScript('http://192.168.1.4:8888/tw/sync.js');`
4. Save — the link appears in your sidebar and runs the script on click

The Pi serves the scripts directly at `http://192.168.1.4:8888/tw/<name>.js`,
so any edit you make to the file takes effect immediately without touching
the in-game link.

### Quick-copy link targets

| Script | Target URL |
|--------|-----------|
| `sync.js` | `javascript:$.getScript('http://192.168.1.4:8888/tw/sync.js');` |
| `snapshot.js` | `javascript:$.getScript('http://192.168.1.4:8888/tw/snapshot.js');` |
| `troops.js` | `javascript:$.getScript('http://192.168.1.4:8888/tw/troops.js');` |
| `attack.js` | `javascript:$.getScript('http://192.168.1.4:8888/tw/attack.js');` |

---

## Alternate run methods

**Browser console** — press F12, paste the file contents, hit Enter.

**Direct script URL** (Premium feature) — on the Overview screen, find
the Script field and enter `http://192.168.1.4:8888/tw/sync.js`.

---

## Scripts

### `sync.js` — Account data sync
**Run this first, and whenever your situation changes.**

Fetches public map data, extracts your slice of it, and POSTs a JSON
summary to the Pi. The Pi stores it and regenerates `CONTEXT.md`.

What it collects:
- Your player info (rank, points, tribe)
- All your villages and coordinates
- Your tribe members
- Top 30 tribes and top 100 players world-wide
- All players with a village within 25 tiles of yours (neighbors)

After running:
- `tribalwars/CONTEXT.md` is updated — readable by agents and humans
- `tribalwars/tw_data.json` is updated — raw data, gitignored

### `snapshot.js` — Deep game-state dump for AI context
**Run this before asking an AI to write TW scripts.**

Fetches everything needed to reason about your game state:

| Data | Source |
|------|--------|
| World speed, unit speed, morale, night bonus hours | `interface.php` (public) |
| Unit stats — attack, defense, speed, carry, pop — **for this world** | `interface.php` (public) |
| Building levels for every village (barracks, stable, workshop, farm, …) | Authenticated |
| Troops at home in every village | Authenticated |
| Training queues for every village (units currently being trained) | Authenticated |
| Incoming attacks (time, from, target) | Authenticated |
| Returning own troops (separated from enemy incomings) | Authenticated |
| ODA + ODD kill rankings (offensive + defensive points per player) | Public map files |

After running:
- `tribalwars/SNAPSHOT.md` — human/AI-readable summary (gitignored)
- `tribalwars/WORLD.md` — persistent world config + unit stats (gitignored)
- `tribalwars/snapshot.json` — raw JSON (gitignored)
- `GET http://192.168.1.4:8888/api/tw/snapshot` — API endpoint

The key thing `snapshot.js` adds over `sync.js`: **unit travel times**.
With world speed × unit speed × unit base speed, any AI can calculate
exactly when an attack or support will arrive — crucial for noble trains,
coordinated attacks, and defense timing.

### `attack.js` — Farm scout + attack sender
Scans your recent reports for enemy villages that were **empty** (≤10 troops)
or **offensive** (few defensive units), then lets you send attacks with one click.

1. Fetches your troops overview to find villages with offensive stacks at home
2. Scans N pages of your reports and reads each report's defender table
3. Filters targets by empty threshold or offensive-troop ratio
4. Shows an in-game modal — target name, coords, troops seen, type (empty/offensive),
   closest source village, distance, and links to the Rally Point and original report
5. Editable troop amounts and inter-attack delay before you send anything
6. "⚔ Rally" link per row opens the pre-filled Rally Point for manual confirmation instead

**CONFIG** (edit at the top of `attack.js`):

| Setting | Default | Description |
|---------|---------|-------------|
| `reportPages` | 5 | Pages of reports to scan (~15 reports each) |
| `emptyThreshold` | 10 | Total defender troops ≤ this = "empty" |
| `offRatio` | 0.25 | Def troops / total ≤ this = "offensive village" |
| `minOffTroops` | 50 | Min offensive troops needed in your source village |
| `sendTroops` | axe:200, LC:100, ram:5 | Default troops to send (also editable in modal) |
| `attackDelay` | 1500ms | Delay between consecutive attacks |

### `troops.js` — Troop overview
Shows a table of troops **currently at home** in each of your villages.
Fetches the authenticated troops overview page from TW, parses it, and
displays an in-game overlay with every unit type and a totals row.

Has a **Save to Pi** button that stores the snapshot at
`tribalwars/troops_data.json` (gitignored) and serves it at
`GET http://192.168.1.4:8888/api/tw/troops`.

Note: only shows troops currently at home — troops out on attacks or
support missions won't appear until they return.

---

## Adding new scripts

Drop any `.js` file into this `tribalwars/` folder and it's immediately
available at `http://192.168.1.4:8888/tw/<filename>.js`.

Put this at the top of every script for portability:

```javascript
const PI_URL = 'http://192.168.1.4:8888';  // ← change if your Pi IP differs
```

The in-game link target becomes:
```
javascript:$.getScript('http://192.168.1.4:8888/tw/yourscript.js');
```

---

## Rules

Tribal Wars permits player-triggered scripts. The rule is simple:
- **Allowed**: scripts you manually click to run
- **Banned**: bots that act automatically without your input

Everything in this folder requires a deliberate click to run.

---

## For AI agents

**Start with `SNAPSHOT.md`** — it has everything needed to write accurate scripts:
unit travel times for this world, building levels, troops, incomings, and OD rankings.
Run `snapshot.js` to generate it.

**`CONTEXT.md`** has player profile, villages, tribe, neighbors, and world rankings.
Run `sync.js` to generate it.

Both files have a **Notes** section that survives re-runs — add enemies, wars,
diplomacy, and strategy context there.

Data endpoints:
```
GET http://192.168.1.4:8888/api/tw/snapshot   ← rich game state (from snapshot.js)
GET http://192.168.1.4:8888/api/tw/data       ← map + player data (from sync.js)
GET http://192.168.1.4:8888/api/tw/troops     ← troop snapshot (from troops.js)
```
