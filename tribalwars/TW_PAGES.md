# Tribal Wars Browser Scripting Reference

A comprehensive reference for writing `fetch()`-based scripts that run inside an authenticated Tribal Wars browser session. All examples assume the script runs in the context of a logged-in TW page (so cookies and session are already present).

---

## 1. The `game_data` Object

Every authenticated TW page exposes a global `game_data` object. It is injected as a JavaScript variable and is always available without any fetch.

```js
// Available on every game page:
game_data = {
  world:        "en111",          // world identifier (used in URLs)
  csrf:         "a3f9c2...",      // CSRF token; send as 'h' in every POST
  village: {
    id:         "12345",          // current village ID (string)
    name:       "My Village",     // village display name
    x:          "512",            // map X coordinate
    y:          "499",            // map Y coordinate
    points:     "3421",           // village points
    pop:        "8200",           // current population used
    pop_max:    "9000",           // max population (farm capacity)
    resources: {
      wood:     "12000",
      stone:    "8500",
      iron:     "6000",
      storage:  "30000",          // storage cap
      pop:      "8200",           // same as village.pop
      pop_max:  "9000"
    }
  },
  player: {
    id:         "99887",          // player ID (numeric string)
    name:       "PlayerName",     // player display name
    ally:       "42",             // ally/tribe ID (0 if none)
    ally_name:  "MyTribe",
    points:     "54321",
    incomings:  3,                // number of incoming attacks
    new_igm:    0,                // unread IGMs
    sitter:     "0"               // "1" if being sat
  },
  features: {
    Premium:    true,
    FarmAssistant: false,
    // ... other premium feature flags
  },
  screen:       "overview",       // current screen name
  mode:         null,             // current mode (or null)
  time_generated: 1700000000,     // Unix timestamp of page generation
  server_utc_diff: 3600           // server UTC offset in seconds
}
```

Access these fields directly in any script:

```js
const csrf    = game_data.csrf;
const vid     = game_data.village.id;
const world   = game_data.world;
const baseUrl = `https://${world}.tribalwars.net/game.php`;
```

---

## 2. URL Structure

### Base Pattern

```
https://{world}.tribalwars.net/game.php?village={vid}&screen={screen}
```

- `{world}` — world identifier, e.g. `en111`, `de123`, `nl45`
- `{vid}` — numeric village ID (from `game_data.village.id`)
- `{screen}` — the page/screen to load

### Common Parameters

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `screen`  | Which game page to load | `screen=train` |
| `mode`    | Sub-view within a screen | `mode=incomings` |
| `page`    | Pagination index (0-based) | `page=2` |
| `type`    | Filter type within a screen | `type=attack` |
| `view`    | Load a specific record by ID | `view=98765` |
| `id`      | Entity ID for info pages | `id=99887` |
| `subtype` | Further sub-filtering | `subtype=1` |

### The `page=-1` Trick

For `overview_villages` screens, passing `page=-1` returns **all villages** in a single response instead of paginating. This is the fastest way to scrape all village data.

```js
// Get all villages' troop data in one request
const url = `${baseUrl}?village=${vid}&screen=overview_villages&mode=troops&page=-1`;
const resp = await fetch(url);
const html = await resp.text();
```

> **Note:** `page=-1` only works on `overview_villages` sub-screens. It does not work on reports, the market, or most other screens.

---

## 3. Public Map Files (No Authentication Required)

These files are available without login and update roughly every hour.

### `/map/village.txt`

CSV: `id,name,x,y,player_id,points,rank`

```
12345,My%20Village,512,499,99887,3421,1
```

- `player_id` = 0 means the village is abandoned (barbarian)
- Names are URL-encoded

```js
const resp = await fetch(`https://${world}.tribalwars.net/map/village.txt`);
const text = await resp.text();
const villages = text.trim().split('\n').map(line => {
  const [id, name, x, y, player_id, points, rank] = line.split(',');
  return { id, name: decodeURIComponent(name), x: +x, y: +y, player_id, points: +points };
});
```

### `/map/player.txt`

CSV: `id,name,ally_id,villages,points,rank`

```
99887,PlayerName,42,7,54321,152
```

### `/map/ally.txt`

CSV: `id,name,tag,members,villages,points,all_points,rank`

```
42,My%20Tribe,MTB,15,98,4532100,4532100,3
```

### `/map/kill_att.txt`

CSV: `rank,player_id,od_points` — offensive OD ranking

### `/map/kill_def.txt`

CSV: `rank,player_id,od_points` — defensive OD ranking

```js
// Example: build a map of player_id -> OD points
const resp = await fetch(`https://${world}.tribalwars.net/map/kill_att.txt`);
const text = await resp.text();
const odMap = {};
text.trim().split('\n').forEach(line => {
  const [rank, player_id, points] = line.split(',');
  odMap[player_id] = { rank: +rank, points: +points };
});
```

---

## 4. Public Config APIs (No Authentication Required)

These XML endpoints return world configuration. No login needed.

### `/interface.php?func=get_config`

Returns world settings as XML.

```js
const resp = await fetch(`https://${world}.tribalwars.net/interface.php?func=get_config`);
const xml  = await resp.text();
const doc  = new DOMParser().parseFromString(xml, 'text/xml');

const speed      = doc.querySelector('speed').textContent;       // world speed multiplier
const unitSpeed  = doc.querySelector('unit_speed').textContent;  // unit travel speed multiplier
const morale     = doc.querySelector('moral').textContent;       // "1" if morale enabled
const nightBonus = doc.querySelector('night > active').textContent; // "1" if night bonus active
const mapSize    = doc.querySelector('map > width').textContent; // map dimension
const nobleCost  = doc.querySelector('snob > gold').textContent; // coins per noble
```

Key XML paths:

| Path | Meaning |
|------|---------|
| `config > speed` | World speed (1.0 = normal) |
| `config > unit_speed` | Unit travel speed (lower = faster) |
| `config > moral` | Morale on/off (1/0) |
| `config > night > active` | Night bonus active (1/0) |
| `config > night > start_hour` | Night bonus start hour |
| `config > night > end_hour` | Night bonus end hour |
| `config > map > width` | Map width (tiles) |
| `config > map > height` | Map height (tiles) |
| `config > snob > gold` | Gold coins per noble |
| `config > game > archer` | Archers enabled (1/0) |

### `/interface.php?func=get_unit_info`

Returns stats for every unit as XML.

```js
const resp = await fetch(`https://${world}.tribalwars.net/interface.php?func=get_unit_info`);
const xml  = await resp.text();
const doc  = new DOMParser().parseFromString(xml, 'text/xml');

// Example: get axe fighter attack power
const axeAtk = doc.querySelector('unit_info > axe > attack').textContent;
```

Each unit node contains: `build_time`, `pop`, `speed`, `attack`, `defence`, `defence_cavalry`, `defence_archer`, `carry`.

### `/interface.php?func=get_building_info`

Returns building info including max levels.

```js
const resp = await fetch(`https://${world}.tribalwars.net/interface.php?func=get_building_info`);
const xml  = await resp.text();
const doc  = new DOMParser().parseFromString(xml, 'text/xml');

const barrackMaxLevel = doc.querySelector('building_info > barracks > max_level').textContent;
```

---

## 5. Authenticated Screens

All requests below require a valid session cookie (automatic when running inside the browser).

---

### `screen=overview`

Main village overview. Primarily used to read current resources and village state via `game_data` (no parse needed).

**URL:**
```
game.php?village={vid}&screen=overview
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#wood` | Current wood amount |
| `#stone` | Current stone amount |
| `#iron` | Current iron amount |
| `#pop_current_label` | Current population |
| `#pop_max_label` | Max population |
| `#storage` | Storage capacity |
| `.res.wood` | Wood (alternate selector) |
| `#show_incoming_units` | Incoming attack count badge |

> Prefer reading resources from `game_data.village.resources` — it is always present and requires no DOM parsing.

---

### `screen=overview_villages&mode=troops`

Shows troops **at home** for all villages. Use `page=-1` to get all villages at once.

**URL:**
```
game.php?village={vid}&screen=overview_villages&mode=troops&page=-1
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#troops_list` | Main table |
| `#troops_list thead tr` | Header row with unit images |
| `#troops_list tbody tr` | One row per village |
| `td.unit-item` | Individual unit count cell |

**Unit Image Pattern:**

Unit images in the header use a src pattern like:
```
/graphic/unit/unit_axe.png
/graphic/unit/unit_spear.png
/graphic/unit/unit_sword.png
```

Extract unit type from image src:

```js
const unitName = img.src.match(/unit_(\w+)\.png/)?.[1]; // e.g. "axe"
```

**Parsing the troops table:**

```js
const resp = await fetch(`${baseUrl}?village=${vid}&screen=overview_villages&mode=troops&page=-1`);
const html = await resp.text();
const doc  = new DOMParser().parseFromString(html, 'text/html');

// Extract unit column order from header
const headers = [...doc.querySelectorAll('#troops_list thead tr img')];
const unitOrder = headers.map(img => img.src.match(/unit_(\w+)\.png/)?.[1]).filter(Boolean);

// Parse each village row
const rows = doc.querySelectorAll('#troops_list tbody tr');
rows.forEach(row => {
  const villageLink = row.querySelector('a[href*="village="]');
  const villageId   = villageLink?.href.match(/village=(\d+)/)?.[1];
  const cells       = [...row.querySelectorAll('td.unit-item')];
  const troops      = {};
  unitOrder.forEach((unit, i) => {
    troops[unit] = parseInt(cells[i]?.textContent.trim()) || 0;
  });
  console.log(villageId, troops);
});
```

---

### `screen=overview_villages&mode=buildings`

Shows building levels across all villages.

**URL:**
```
game.php?village={vid}&screen=overview_villages&mode=buildings&page=-1
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#buildings_list` | Main table |
| `#buildings_list thead tr` | Header row with building images |
| `#buildings_list tbody tr` | One row per village |

**Building Image CDN Note:**

Building image paths vary by world (server region). Known patterns:

```
/graphic/buildings/barracks.png          (some servers)
/graphic/build/buildrow_barracks.png     (some servers)
/graphic/main_buildrow_barracks.png      (some servers)
```

Because the path is inconsistent, **always use the `alt` attribute as the authoritative source**:

```js
const buildingName = img.alt.toLowerCase().trim();
// e.g. "barracks", "stable", "smithy"
```

Known canonical building names (alt text / internal names):

`main`, `barracks`, `stable`, `garage`, `watchtower`, `snob`, `smith`, `place`, `statue`, `market`, `wood`, `stone`, `iron`, `farm`, `storage`, `hide`, `wall`

**Parsing example:**

```js
const resp = await fetch(`${baseUrl}?village=${vid}&screen=overview_villages&mode=buildings&page=-1`);
const html = await resp.text();
const doc  = new DOMParser().parseFromString(html, 'text/html');

const headers = [...doc.querySelectorAll('#buildings_list thead tr img')];
const buildingOrder = headers.map(img => img.alt.toLowerCase().trim());

doc.querySelectorAll('#buildings_list tbody tr').forEach(row => {
  const villageId = row.querySelector('a[href*="village="]')?.href.match(/village=(\d+)/)?.[1];
  const cells = [...row.querySelectorAll('td')];
  // First cell is village name/link; building levels start at index 1
  const levels = {};
  buildingOrder.forEach((b, i) => {
    levels[b] = parseInt(cells[i + 1]?.textContent.trim()) || 0;
  });
  console.log(villageId, levels);
});
```

---

### `screen=overview_villages&mode=units`

Shows the **training queue** (units currently being trained) across all villages. This is not the same as the research screen.

**URL:**
```
game.php?village={vid}&screen=overview_villages&mode=units&page=-1
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#units_list` | Main table |
| `#units_list thead tr` | Unit images (same `unit_axe.png` pattern) |
| `#units_list tbody tr` | One row per village |

Parsing is identical to the troops table — extract unit names from `img[src*="unit_"]` in the header, then read cell values per row.

---

### `screen=overview_villages&mode=incomings`

Shows **both incoming enemy attacks and your own returning troops** in the same table. This is a critical distinction.

**URL:**
```
game.php?village={vid}&screen=overview_villages&mode=incomings
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#incomings_table` | Main table body |
| `#incomings_table tr` | One row per movement |
| `tr.return` | Rows with CSS class `return` are YOUR returning troops |

**Row Structure:**

Each row has 4 cells in this order:

| Cell index | Content |
|------------|---------|
| 0 | Movement type icon (sword = attack, shield = support, etc.) |
| 1 | Origin village name + "return" text if it's a return movement |
| 2 | Destination village name/link |
| 3 | Arrival time |

**Distinguishing incoming attacks from returning troops:**

```js
const resp = await fetch(`${baseUrl}?village=${vid}&screen=overview_villages&mode=incomings`);
const html = await resp.text();
const doc  = new DOMParser().parseFromString(html, 'text/html');

doc.querySelectorAll('#incomings_table tr').forEach(row => {
  const isReturn = row.classList.contains('return');
  const cells    = row.querySelectorAll('td');
  if (cells.length < 4) return;

  const fromText    = cells[1].textContent.trim();
  const toText      = cells[2].textContent.trim();
  const arrivalTime = cells[3].textContent.trim();

  // Parse coords from village link text — format: "Village Name (xxx|yyy)"
  const coords = fromText.match(/\((\d+)\|(\d+)\)/);

  if (isReturn) {
    console.log('RETURNING:', fromText, '->', toText, 'arrives', arrivalTime);
  } else {
    console.log('INCOMING ATTACK:', fromText, '->', toText, 'arrives', arrivalTime);
  }
});
```

> Returning rows also typically contain the text "return" somewhere in cell 1 (e.g., inside a span or as alt text on the icon). The `tr.return` class is the most reliable selector.

---

### `screen=main`

Village headquarters / building overview page.

**URL:**
```
game.php?village={vid}&screen=main
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#main_buildingrow_{name}` | Container div for each building |
| `#main_buildingrow_barracks` | Barracks building row |
| `#main_buildingrow_stable` | Stable building row |
| `.main_buildrow_act` | Currently upgrading building |

Building row IDs follow the pattern `main_buildingrow_{building_name}`.

```js
// Get barracks level from the page
const resp = await fetch(`${baseUrl}?village=${vid}&screen=main`);
const html = await resp.text();
const doc  = new DOMParser().parseFromString(html, 'text/html');

const barrackRow = doc.querySelector('#main_buildingrow_barracks');
const levelText  = barrackRow?.querySelector('.level')?.textContent.trim();
```

---

### `screen=train` (Barracks)

Train infantry units.

**URL:**
```
game.php?village={vid}&screen=train
```

**Form:**

| Property | Value |
|----------|-------|
| Form selector | `form#train_form` |
| Method | POST |
| Action | `game.php` (same page) |

**Inputs:**

| Input name | Unit |
|------------|------|
| `unit_spear` | Spearfighter |
| `unit_sword` | Swordsman |
| `unit_axe` | Axe Fighter |
| `unit_archer` | Archer (if archers enabled) |
| `unit_spy` | Scout (if on barracks form) |
| `h` | CSRF token (`game_data.csrf`) |

```js
const params = new URLSearchParams({
  village: vid,
  screen:  'train',
  action:  'train',
  h:       game_data.csrf,
  unit_spear: 10,
  unit_axe:   5,
});

const resp = await fetch(`${baseUrl}`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body:    params.toString()
});
```

---

### `screen=stable`

Train cavalry units.

**URL:**
```
game.php?village={vid}&screen=stable
```

**Form:** Same pattern as barracks (`form#train_form` or equivalent).

**Inputs:**

| Input name | Unit |
|------------|------|
| `unit_spy` | Scout (on some worlds, spy is in stable) |
| `unit_light` | Light Cavalry |
| `unit_marcher` | Mounted Archer (if archers enabled) |
| `unit_heavy` | Heavy Cavalry |
| `h` | CSRF token |

---

### `screen=garage` (Workshop)

Train siege units.

**URL:**
```
game.php?village={vid}&screen=garage
```

**Inputs:**

| Input name | Unit |
|------------|------|
| `unit_ram` | Ram |
| `unit_catapult` | Catapult |
| `h` | CSRF token |

---

### `screen=smith` (Smithy)

Research units. Each researchable unit has its own form.

**URL:**
```
game.php?village={vid}&screen=smith
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `form.research_form` | One form per researchable unit |
| `input[name="type"]` | Unit name to research (e.g. `axe`) |
| `input[name="h"]` | CSRF token |

```js
// Research axe fighters
const params = new URLSearchParams({
  village: vid,
  screen:  'smith',
  action:  'research',
  type:    'axe',
  h:       game_data.csrf,
});

await fetch(baseUrl, {
  method:  'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body:    params.toString()
});
```

---

### `screen=place` (Rally Point)

Send attacks or support. This is a **two-step process**.

**URL:**
```
game.php?village={vid}&screen=place
```

#### Step 1: Submit Attack

POST to the rally point with target coordinates and troop counts.

**Form inputs (Step 1):**

| Input name | Value |
|------------|-------|
| `x` | Target X coordinate |
| `y` | Target Y coordinate |
| `unit_spear` | Number of spearmen |
| `unit_sword` | Number of swordsmen |
| `unit_axe` | Number of axe fighters |
| `unit_light` | Number of light cavalry |
| `unit_heavy` | Number of heavy cavalry |
| `unit_ram` | Number of rams |
| `unit_catapult` | Number of catapults |
| `unit_knight` | Number of paladins |
| `unit_snob` | Number of nobles |
| `attack` | `1` (for attack); omit or use `support` for support |
| `h` | CSRF token (`game_data.csrf`) |

```js
const step1Params = new URLSearchParams({
  village:    vid,
  screen:     'place',
  action:     'cmd',
  x:          '501',
  y:          '499',
  unit_axe:   '100',
  unit_light: '50',
  unit_ram:   '10',
  attack:     '1',
  h:          game_data.csrf,
});

const step1Resp = await fetch(baseUrl, {
  method:  'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body:    step1Params.toString()
});
const confirmHtml = await step1Resp.text();
```

#### Step 2: Confirm Attack

The response is a confirmation page. Parse the `ch` token and resubmit.

**Confirm page elements:**

| Selector | Content |
|----------|---------|
| `form[name="command-data-form"]` | The confirmation form |
| `input[name="ch"]` | One-time confirmation token (single-use) |
| `input[name="action"]` | Should be `confirm` |
| `input[name="h"]` | CSRF token (re-use same value) |

```js
const confirmDoc = new DOMParser().parseFromString(confirmHtml, 'text/html');
const confirmForm = confirmDoc.querySelector('form[name="command-data-form"]');

// Extract all hidden fields from the confirm form
const confirmParams = new URLSearchParams();
confirmForm.querySelectorAll('input').forEach(input => {
  confirmParams.set(input.name, input.value);
});

// The ch token is the critical one — it is single-use
const chToken = confirmParams.get('ch');
console.log('Confirmation token:', chToken);

// Add the confirm action
confirmParams.set('action', 'confirm');

const finalResp = await fetch(baseUrl, {
  method:  'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body:    confirmParams.toString()
});
```

> **Warning:** The `ch` token is single-use. If the confirm POST fails or you need to retry, you must go back to Step 1 and get a fresh `ch` token.

---

### `screen=report`

Report list page.

**URL:**
```
game.php?village={vid}&screen=report
game.php?village={vid}&screen=report&mode=attack          (attack reports)
game.php?village={vid}&screen=report&mode=defense         (defense reports)
game.php?village={vid}&screen=report&mode=scouting        (scout reports)
game.php?village={vid}&screen=report&mode=support         (support reports)
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#report_list` | Main report table |
| `#report_list tbody tr` | One row per report |
| `a[href*="view="]` | Link to individual report; extract ID from href |
| `.report-link` | Report title/subject link |
| `.color_react_c1` | Green dot — clean victory |
| `.color_react_c2` | Yellow dot — victory with losses |
| `.color_react_c3` | Red dot — defeat |

**Extract report IDs:**

```js
const resp = await fetch(`${baseUrl}?village=${vid}&screen=report&mode=attack`);
const html = await resp.text();
const doc  = new DOMParser().parseFromString(html, 'text/html');

const reportLinks = [...doc.querySelectorAll('a[href*="view="]')];
const reportIds   = reportLinks
  .map(a => a.href.match(/view=(\d+)/)?.[1])
  .filter(Boolean);
```

---

### `screen=report&view={id}`

Individual combat report.

**URL:**
```
game.php?village={vid}&screen=report&view=98765
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#attack_info_att` | Attacker's unit table |
| `#attack_info_def` | Defender's unit table |
| `#attack_info_att thead tr` | Header row with unit images |
| `#attack_info_att tbody tr:nth-child(1)` | Unit counts that were sent |
| `#attack_info_att tbody tr:nth-child(2)` | Unit counts that survived |
| `#attack_info_def thead tr` | Defender header row (unit images) |
| `#attack_info_def tbody tr:nth-child(1)` | Defender's unit counts |
| `#attack_info_def tbody tr:nth-child(2)` | Defender's surviving units |
| `.report-attack-result` | Summary (e.g. "The attacker won") |

**Parsing a combat report:**

```js
const resp = await fetch(`${baseUrl}?village=${vid}&screen=report&view=${reportId}`);
const html = await resp.text();
const doc  = new DOMParser().parseFromString(html, 'text/html');

function parseUnitTable(tableEl) {
  if (!tableEl) return null;
  const headerImgs = [...tableEl.querySelectorAll('thead tr img')];
  const unitNames  = headerImgs.map(img => img.src.match(/unit_(\w+)\.png/)?.[1]).filter(Boolean);
  const rows       = tableEl.querySelectorAll('tbody tr');
  const sent       = {};
  const survived   = {};

  const sentCells     = [...rows[0]?.querySelectorAll('td') ?? []];
  const survivedCells = [...rows[1]?.querySelectorAll('td') ?? []];

  unitNames.forEach((unit, i) => {
    const sentText     = sentCells[i]?.textContent.trim();
    const survivedText = survivedCells[i]?.textContent.trim();
    // "?" means spy report — unknown count
    sent[unit]     = sentText === '?' ? null : (parseInt(sentText) || 0);
    survived[unit] = survivedText === '?' ? null : (parseInt(survivedText) || 0);
  });

  return { sent, survived };
}

const attacker = parseUnitTable(doc.querySelector('#attack_info_att'));
const defender = parseUnitTable(doc.querySelector('#attack_info_def'));
console.log('Attacker:', attacker);
console.log('Defender:', defender);
```

> A count of `"?"` means the enemy had units whose type was unknown (typical in spy/scout reports with insufficient intelligence). Always handle `?` explicitly.

---

### `screen=map`

The interactive map. Not practical to scrape via fetch — the map is canvas/tile-based.

**Use `/map/village.txt` instead** for coordinate and ownership data.

---

### `screen=market`

Trade resources with other villages or NPCs.

**URL:**
```
game.php?village={vid}&screen=market
game.php?village={vid}&screen=market&mode=send       (send resources)
game.php?village={vid}&screen=market&mode=exchange    (NPC merchant)
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `form#send_resource_form` | Form to send resources |
| `input[name="wood"]` | Wood to send |
| `input[name="stone"]` | Stone to send |
| `input[name="iron"]` | Iron to send |
| `input[name="x"]` | Target X coord |
| `input[name="y"]` | Target Y coord |
| `input[name="h"]` | CSRF token |

```js
const params = new URLSearchParams({
  village: vid,
  screen:  'market',
  mode:    'send',
  action:  'submit',
  wood:    5000,
  stone:   0,
  iron:    0,
  x:       501,
  y:       499,
  h:       game_data.csrf,
});

await fetch(baseUrl, {
  method:  'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body:    params.toString()
});
```

---

### `screen=snob` (Academy)

Train nobles.

**URL:**
```
game.php?village={vid}&screen=snob
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `form#train_form` (or equivalent) | Noble training form |
| `input[name="units[snob]"]` | Number of nobles to train |
| `input[name="h"]` | CSRF token |
| `.snob_coin_count` | Current coin count |

```js
const params = new URLSearchParams({
  village:       vid,
  screen:        'snob',
  action:        'train',
  'units[snob]': 1,
  h:             game_data.csrf,
});

await fetch(baseUrl, {
  method:  'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body:    params.toString()
});
```

---

### `screen=wall`

Wall upgrades.

**URL:**
```
game.php?village={vid}&screen=wall
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#main_buildingrow_wall` | Wall building row |
| `.level` within wall row | Current wall level |
| `a.build_up` | Upgrade link/button |

Wall upgrades typically use a GET link with parameters like:
```
game.php?village={vid}&screen=wall&action=upgrade&h={csrf}
```

---

### `screen=info_player&id={player_id}`

Public player profile page. No special authentication beyond normal session needed.

**URL:**
```
game.php?village={vid}&screen=info_player&id=99887
```

**Key Elements:**

| Selector | Content |
|----------|---------|
| `#player_villages` | Table of player's villages |
| `#player_villages tbody tr` | One row per village |
| `a[href*="info_village"]` | Link to village info |
| `.points` | Village points |
| `#player_data` | Player stats block |
| `#content_value table` | General info tables |
| `.rank` | Player rank |
| `.tribe` | Tribe/ally link |

**Extracting all villages for a player:**

```js
const resp = await fetch(`${baseUrl}?village=${vid}&screen=info_player&id=${playerId}`);
const html = await resp.text();
const doc  = new DOMParser().parseFromString(html, 'text/html');

const villages = [...doc.querySelectorAll('#player_villages tbody tr')].map(row => {
  const link      = row.querySelector('a[href*="village="]');
  const villageId = link?.href.match(/village=(\d+)/)?.[1];
  const text      = link?.textContent.trim() ?? '';
  const coords    = text.match(/\((\d+)\|(\d+)\)/);
  return {
    id:     villageId,
    name:   text.replace(/\(\d+\|\d+\)/, '').trim(),
    x:      coords ? +coords[1] : null,
    y:      coords ? +coords[2] : null,
    points: parseInt(row.querySelector('.points')?.textContent) || 0,
  };
});
```

---

## 6. Parsing Patterns

### Unit Tables (Header + Count Row Pattern)

Most unit tables follow the same structure: a `thead` with unit images, and `tbody` rows with counts.

```js
function parseUnitTableHeader(tableEl) {
  return [...tableEl.querySelectorAll('thead tr img')]
    .map(img => img.src.match(/unit_(\w+)\.png/)?.[1])
    .filter(Boolean);
}

function parseUnitRow(rowEl) {
  return [...rowEl.querySelectorAll('td')].map(td => {
    const text = td.textContent.trim();
    return text === '?' ? null : (parseInt(text) || 0);
  });
}
```

### Building Tables (Alt Attribute Fallback)

```js
function parseBuildingTableHeader(tableEl) {
  return [...tableEl.querySelectorAll('thead tr img')].map(img => {
    // Try src first, fall back to alt
    const fromSrc = img.src.match(/(?:buildrow_|buildings\/)(\w+)\.png/)?.[1];
    const fromAlt = img.alt?.toLowerCase().trim();
    return fromSrc || fromAlt;
  }).filter(Boolean);
}
```

### Village Links and Coordinates

Village links throughout the game follow consistent patterns:

```js
// Extract village ID from any anchor href
const vid = anchor.href.match(/village=(\d+)/)?.[1];

// Extract coordinates from display text like "My Village (512|499)"
const coords = element.textContent.match(/\((\d+)\|(\d+)\)/);
if (coords) {
  const x = +coords[1];
  const y = +coords[2];
}
```

### CSRF Token in POST Requests

Every POST request to the game requires the `h` parameter set to `game_data.csrf`.

```js
const h = game_data.csrf;

// Always include in POST body
const params = new URLSearchParams({ h, /* ...other params */ });

// Or as a header/field in FormData
const form = new FormData();
form.set('h', game_data.csrf);
```

### Pagination — `page=-1`

```js
// BAD: Only gets page 0 (first 25 rows by default)
const url = `${baseUrl}?village=${vid}&screen=overview_villages&mode=troops`;

// GOOD: Gets all rows at once
const url = `${baseUrl}?village=${vid}&screen=overview_villages&mode=troops&page=-1`;
```

### Generic Fetch Helper

```js
async function twFetch(screen, extraParams = {}) {
  const params = new URLSearchParams({
    village: game_data.village.id,
    screen,
    ...extraParams,
  });
  const resp = await fetch(
    `https://${game_data.world}.tribalwars.net/game.php?${params}`
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for screen=${screen}`);
  const html = await resp.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

// Usage
const doc = await twFetch('overview_villages', { mode: 'troops', page: -1 });
```

---

## 7. Common Gotchas

### The `ch` Token is Single-Use

When sending an attack or support from the rally point (`screen=place`), Step 1 returns a confirmation page with a `ch` (challenge) token embedded as a hidden input. This token **expires after one use**. If the confirmation POST fails for any reason (network error, timeout, server error), you must repeat Step 1 to get a new `ch` token before retrying Step 2.

```js
// WRONG — reusing a stale ch token will silently fail
await confirmAttack(storedChToken);

// RIGHT — always get a fresh ch from a new Step 1
const confirmHtml = await sendAttackStep1(target, troops);
const ch = parseChToken(confirmHtml);
await confirmAttackStep2(ch, confirmHtml);
```

### Troop Counts of `"?"`

In combat reports (`screen=report&view=ID`), a count of `"?"` in a unit cell means the report did not have sufficient intelligence to reveal that unit type. This is common in spy reports, or when the attacker did not send scouts. Always parse `?` as `null` (unknown), not as `0` (zero).

```js
const count = cell.textContent.trim() === '?' ? null : parseInt(cell.textContent);
```

### `mode=incomings` Shows Both Attacks AND Returns

The incoming overview screen (`overview_villages&mode=incomings`) shows **both incoming enemy attacks and your own troops returning home** in the same table. Do not assume every row is an incoming attack.

Distinguish them by:
1. **CSS class** — returning rows have the class `return` on the `<tr>` element.
2. **Cell 1 text** — returning rows contain "return" text (localized) somewhere in the origin cell.

```js
const isReturn = row.classList.contains('return');
```

### Building Image CDN Path Varies by World

The path to building images in `overview_villages&mode=buildings` is not consistent across all TW servers. English servers, German servers, and others may use different CDN paths like:

- `/graphic/buildings/barracks.png`
- `/graphic/build/buildrow_barracks.png`
- `/graphic/main_buildrow_barracks.png`

**Always use `img.alt` as the fallback** to identify building type. The alt text is the canonical building name and is consistent across all servers.

```js
// Fragile — path varies
const name = img.src.match(/\/(\w+)\.png$/)?.[1];

// Robust — alt is always correct
const name = img.alt.toLowerCase().trim();
```

### `page=-1` Only Works on `overview_villages` Screens

The `page=-1` trick to retrieve all rows at once is specific to `screen=overview_villages` sub-screens (troops, buildings, units, incomings). It does **not** work on:

- `screen=report` (use normal pagination)
- `screen=market`
- `screen=info_player`
- Other screens

Attempting `page=-1` on unsupported screens will typically return the first page or an error response.

### Resources Are Snapshotted at Page Load Time

Resource values in `game_data.village.resources` (and in `#wood`, `#stone`, `#iron` in the DOM) reflect the state at **page generation time**. Resources accumulate in real time (shown by the live counter in the UI), but the `game_data` value is static. For precise current resources, re-fetch the overview page.

### village ID vs Coordinates in Links

Many links in the TW game contain both the village ID and the coordinates, but some links only have one. Always extract both if available:

```js
const href   = anchor.href;
const vid    = href.match(/village=(\d+)/)?.[1];
const coords = anchor.textContent.match(/\((\d+)\|(\d+)\)/);
```

---

## 8. Quick Reference

### URL Cheat Sheet

```
overview:         game.php?village=VID&screen=overview
all troop data:   game.php?village=VID&screen=overview_villages&mode=troops&page=-1
all buildings:    game.php?village=VID&screen=overview_villages&mode=buildings&page=-1
all training:     game.php?village=VID&screen=overview_villages&mode=units&page=-1
incomings:        game.php?village=VID&screen=overview_villages&mode=incomings
village HQ:       game.php?village=VID&screen=main
barracks:         game.php?village=VID&screen=train
stable:           game.php?village=VID&screen=stable
workshop:         game.php?village=VID&screen=garage
smithy:           game.php?village=VID&screen=smith
rally point:      game.php?village=VID&screen=place
reports:          game.php?village=VID&screen=report
atk reports:      game.php?village=VID&screen=report&mode=attack
one report:       game.php?village=VID&screen=report&view=REPORT_ID
market:           game.php?village=VID&screen=market
academy:          game.php?village=VID&screen=snob
wall:             game.php?village=VID&screen=wall
player info:      game.php?village=VID&screen=info_player&id=PLAYER_ID

map data:         /map/village.txt
player data:      /map/player.txt
tribe data:       /map/ally.txt
OD attack:        /map/kill_att.txt
OD defense:       /map/kill_def.txt
world config:     /interface.php?func=get_config
unit stats:       /interface.php?func=get_unit_info
building info:    /interface.php?func=get_building_info
```

### Unit Internal Names

| Internal name | Unit |
|---------------|------|
| `spear` | Spearfighter |
| `sword` | Swordsman |
| `axe` | Axe Fighter |
| `archer` | Archer |
| `spy` | Scout |
| `light` | Light Cavalry |
| `marcher` | Mounted Archer |
| `heavy` | Heavy Cavalry |
| `ram` | Ram |
| `catapult` | Catapult |
| `knight` | Paladin |
| `snob` | Nobleman/Noble |
| `militia` | Militia (defensive only, not trainable) |

### Building Internal Names

| Internal name | Building |
|---------------|---------|
| `main` | Headquarters |
| `barracks` | Barracks |
| `stable` | Stable |
| `garage` | Workshop |
| `watchtower` | Watchtower |
| `snob` | Academy |
| `smith` | Smithy |
| `place` | Rally Point |
| `statue` | Statue (Paladin) |
| `market` | Market |
| `wood` | Timber Camp |
| `stone` | Clay Pit |
| `iron` | Iron Mine |
| `farm` | Farm |
| `storage` | Warehouse |
| `hide` | Hiding Place |
| `wall` | Wall |
