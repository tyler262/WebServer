// ─────────────────────────────────────────────────────────────────────────────
// TW Snapshot — deep game-state dump for AI-assisted scripting
//
// javascript:$.getScript('http://192.168.1.4:8888/tw/snapshot.js');
//
// Collects:
//   • World config (speed, unit_speed, morale, night bonus, map size, noble costs)
//   • Unit stats for THIS world  (attack, defense, speed, carry, pop)
//   • All-village troops overview  (what you have at home)
//   • All-village building levels  (barracks/stable/workshop/farm/…)
//   • All-village training queues  (units currently being trained)
//   • Incoming attacks             (arrival time, from, target)
//   • Returning troops             (your own troops on their way home)
//   • ODA + ODD rankings           (offensive/defensive points per player)
//
// Sends to Pi → writes tribalwars/SNAPSHOT.md (AI-readable summary)
// and tribalwars/snapshot.json (raw data).
// ─────────────────────────────────────────────────────────────────────────────

(async function () {

  if (typeof game_data === 'undefined') {
    alert('Run from inside Tribal Wars.');
    return;
  }

  const PI_URL = 'http://192.168.1.4:8888';
  const world  = game_data.world;
  const myVid  = game_data.village.id;
  const base   = `https://${world}.tribalwars.net`;

  // Building alt-text → identifier map (CDN-agnostic, alt is always reliable)
  const BLDG_ALT = {
    'headquarters': 'main', 'main building': 'main',
    'barracks': 'barracks',
    'stable': 'stable',
    'workshop': 'garage', 'garage': 'garage',
    'watchtower': 'watchtower',
    'academy': 'snob', 'noble residence': 'snob',
    'smithy': 'smith',
    'rally point': 'place',
    'statue': 'statue', 'paladin': 'statue',
    'market': 'market',
    'timber camp': 'wood', 'lumber camp': 'wood',
    'clay pit': 'stone',
    'iron mine': 'iron',
    'farm': 'farm',
    'warehouse': 'storage',
    'hiding place': 'hide',
    'wall': 'wall',
  };

  // ── Loading toast ─────────────────────────────────────────────────────────
  const $t = $('<div>').css({
    position: 'fixed', bottom: '20px', right: '20px',
    background: '#1a1a1a', color: '#fff', padding: '12px 20px',
    borderRadius: '6px', zIndex: 99999, fontFamily: 'Verdana,sans-serif',
    fontSize: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    minWidth: '270px', lineHeight: '1.6',
  }).appendTo('body');
  const step = s => $t.html(s);

  try {

    // ── 1. World config + unit stats (public, no auth needed) ─────────────
    step('📊 <b>[1/5]</b> World config + unit stats…');
    const [configXml, unitXml] = await Promise.all([
      fetch(`${base}/interface.php?func=get_config`).then(r => r.text()),
      fetch(`${base}/interface.php?func=get_unit_info`).then(r => r.text()),
    ]);
    const worldConfig = parseWorldConfig(configXml);
    const unitInfo    = parseUnitInfo(unitXml);

    // ── 2. All-village overviews (troops + buildings + training queue) ─────
    step('📊 <b>[2/5]</b> Village overviews…');
    const [troopsHtml, buildingsHtml, trainingHtml] = await Promise.all([
      fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=troops&type=all&page=-1`).then(r => r.text()),
      fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=buildings&page=-1`).then(r => r.text()),
      fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=units&page=-1`).then(r => r.text()),
    ]);
    const troopsRows   = parseOverviewTable(troopsHtml,    'troops');
    const buildingRows = parseOverviewTable(buildingsHtml, 'buildings');
    const trainingRows = parseOverviewTable(trainingHtml,  'training');
    const villages     = mergeVillages(troopsRows, buildingRows, trainingRows);

    // ── 3. Incomings + outgoing commands (fetch in parallel) ─────────────
    step('📊 <b>[3/5]</b> Incoming attacks + outgoing commands…');
    let incomings = [], returning = [], outgoing = [];
    try {
      const [incomingHtml, commandsHtml] = await Promise.all([
        fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=incomings&page=-1`).then(r => r.text()),
        fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=commands&page=-1`).then(r => r.text()),
      ]);
      const all = parseIncomings(incomingHtml);
      incomings = all.filter(r => !r.is_return);
      returning = all.filter(r =>  r.is_return);
      outgoing  = parseOutgoing(commandsHtml);
    } catch (e) {
      console.warn('[TW Snapshot] incomings/outgoing fetch failed:', e.message);
    }

    // ── 4. ODA + ODD kill rankings (public) ───────────────────────────────
    step('📊 <b>[4/5]</b> OD rankings…');
    let odRankings = { attack: {}, defense: {} };
    try {
      const [odaText, oddText] = await Promise.all([
        fetch(`${base}/map/kill_att.txt`).then(r => r.text()),
        fetch(`${base}/map/kill_def.txt`).then(r => r.text()),
      ]);
      odRankings.attack  = parseOdCsv(odaText);
      odRankings.defense = parseOdCsv(oddText);
    } catch (e) {
      console.warn('[TW Snapshot] OD rankings fetch failed:', e.message);
    }

    // ── 5. POST to Pi ─────────────────────────────────────────────────────
    step('📊 <b>[5/5]</b> Saving to Pi…');

    const payload = {
      snapped_at:   new Date().toISOString(),
      world,
      player_name:  game_data.player.name,
      player_id:    String(game_data.player.id),
      world_config: worldConfig,
      unit_info:    unitInfo,
      villages,
      incomings,
      returning,
      outgoing,
      od_rankings:  odRankings,
    };

    const res = await fetch(`${PI_URL}/api/tw/snapshot`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    $t.remove();

    if (res.ok) {
      alert(
        `✓ Snapshot saved!\n\n` +
        `Player:    ${game_data.player.name}\n` +
        `World:     ${world}\n` +
        `Villages:  ${villages.length}\n` +
        `Incomings: ${incomings.length} enemy attack(s)\n` +
        `Returning: ${returning.length} movement(s)\n` +
        `Outgoing:  ${outgoing.length} command(s)\n\n` +
        `SNAPSHOT.md updated on Pi.`
      );
    } else {
      const txt = await res.text().catch(() => '');
      alert(`Snapshot failed: HTTP ${res.status}\n${txt}`);
    }

  } catch (e) {
    $t.text('✗ Error: ' + e.message);
    console.error('[TW Snapshot]', e);
    setTimeout(() => $t.remove(), 6000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parsing helpers
  // ─────────────────────────────────────────────────────────────────────────

  function parseWorldConfig(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const get = (...path) => {
      let node = doc.documentElement;
      for (const tag of path) {
        node = node.querySelector(tag);
        if (!node) return null;
      }
      return node.textContent.trim() || null;
    };
    return {
      speed:      parseFloat(get('speed'))      || 1,
      unit_speed: parseFloat(get('unit_speed')) || 1,
      morale:     get('moral') === '1',
      night: {
        active:     get('night', 'active') === '1',
        start_hour: get('night', 'start_hour'),
        end_hour:   get('night', 'end_hour'),
      },
      map_size:           parseInt(get('coord', 'map_size'))  || 1000,
      noble_max_distance: parseInt(get('snob', 'max_dist'))   || 100,
      noble_coin_cost: {
        wood:  parseInt(get('snob', 'coin_wood'))  || 0,
        stone: parseInt(get('snob', 'coin_stone')) || 0,
        iron:  parseInt(get('snob', 'coin_iron'))  || 0,
      },
    };
  }

  function parseUnitInfo(xmlText) {
    const doc   = new DOMParser().parseFromString(xmlText, 'text/xml');
    const units = {};
    for (const el of doc.documentElement.children) {
      if (el.tagName === 'parsererror') continue;
      const stats = {};
      for (const s of el.children) {
        const v = s.textContent.trim();
        stats[s.tagName] = isNaN(v) || v === '' ? v : parseFloat(v);
      }
      units[el.tagName] = stats;
    }
    return units;
  }

  // Parses any overview_villages table: troops, buildings, or training queue.
  // mode: 'troops' | 'buildings' | 'training'
  function parseOverviewTable(html, mode) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Try mode-specific table IDs, then generic fallback
    const idMap = { troops: '#troops_list', buildings: '#buildings_list', training: '#units_list' };
    let table = doc.querySelector(idMap[mode] || '');
    if (!table) {
      table = doc.querySelector('table.overview_table')
            || [...doc.querySelectorAll('table')].find(t => {
                 const hrow = t.querySelector('thead tr') || t.querySelector('tr');
                 return hrow && hrow.querySelector('img');
               });
    }
    if (!table) return [];

    const hrow = table.querySelector('thead tr') || table.querySelector('tr');
    if (!hrow) return [];

    // Build column key list from header images
    const cols = [];
    [...hrow.querySelectorAll('th, td')].forEach((th, i) => {
      const img = th.querySelector('img');
      if (!img) return;
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || img.getAttribute('title') || '').toLowerCase().trim();

      // unit_axe.png → "axe"
      const mUnit = src.match(/unit_(\w+)\./);
      // /buildings/barracks.png, buildrow_barracks.png, main_buildrow_barracks.png → "barracks"
      const mBld  = src.match(/(?:buildings?\/|(?:main_)?buildrow_)(\w+)\./);

      let key = (mUnit || mBld)?.[1]?.toLowerCase() || null;

      // Alt-text fallback (always reliable, CDN-agnostic)
      if (!key && alt) {
        key = BLDG_ALT[alt] || alt.replace(/\s+/g, '_') || null;
      }

      if (key) cols.push({ i, key });
    });
    if (!cols.length) return [];

    const rows = [];
    for (const row of (table.querySelector('tbody') || table).querySelectorAll('tr')) {
      const cells    = [...row.querySelectorAll('td')];
      const link     = cells[0]?.querySelector('a');
      const href     = link?.getAttribute('href') || '';
      const vidMatch = href.match(/village=(\d+)/);
      const coordMatch = cells[0]?.textContent?.match(/\((\d+)\|(\d+)\)/);
      if (!vidMatch) continue;

      // Strip coord suffix from link text: "Village Name (580|476) K45" → "Village Name"
      const rawName = link?.textContent?.trim() || '?';
      const name = rawName.replace(/\s*\(\d+\|\d+\).*$/, '').trim();

      const data = {};
      cols.forEach(({ i, key }) => {
        const txt = (cells[i]?.textContent || '').trim().replace(/[.,\s]/g, '');
        const n   = parseInt(txt);
        if (!isNaN(n) && n > 0) data[key] = n;
      });

      rows.push({
        vid:  parseInt(vidMatch[1]),
        name,
        x:    coordMatch ? parseInt(coordMatch[1]) : null,
        y:    coordMatch ? parseInt(coordMatch[2]) : null,
        data,
      });
    }
    return rows;
  }

  // Merge troops / buildings / training_queue rows into per-village objects
  function mergeVillages(troops, buildings, training) {
    const map = {};
    const set = (vid, name, x, y) => {
      if (!map[vid]) map[vid] = { vid, name, x, y };
    };
    for (const r of troops)    { set(r.vid, r.name, r.x, r.y); map[r.vid].troops         = r.data; }
    for (const r of buildings) { set(r.vid, r.name, r.x, r.y); map[r.vid].buildings      = r.data; }
    for (const r of training)  { set(r.vid, r.name, r.x, r.y); map[r.vid].training_queue = r.data; }
    return Object.values(map);
  }

  function parseIncomings(html) {
    const doc   = new DOMParser().parseFromString(html, 'text/html');
    const rows  = [];

    const table = doc.querySelector('#incomings_table')
                || doc.querySelector('#incomings_list')
                || [...doc.querySelectorAll('table')].find(t =>
                     t.textContent.includes('incoming') || t.textContent.includes('Incoming')
                   );
    if (!table) return rows;

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 3) continue;

      // Row class "return" = your own troops coming home, not an attack
      const typeImg = cells[0]?.querySelector('img');
      const typeAlt = (typeImg?.getAttribute('alt') || typeImg?.getAttribute('title') || '').toLowerCase();
      const isReturn = row.classList.contains('return') ||
                       typeAlt.includes('return') ||
                       (cells[0]?.textContent || '').toLowerCase().trim().startsWith('return');

      const type = typeImg?.getAttribute('title') || typeImg?.getAttribute('alt')
                 || cells[0]?.textContent?.trim() || '?';

      // Noble detection: nobleman attacks have a different icon alt text
      const isNoble = typeAlt.includes('snob') || typeAlt.includes('noble');

      const fromCell  = cells[1];
      const fromCoord = fromCell?.textContent?.match(/\((\d+)\|(\d+)\)/);
      const fromLink  = fromCell?.querySelector('a[href*="village="]');
      const fromVid   = fromLink?.getAttribute('href')?.match(/village=(\d+)/)?.[1];

      const toCell = cells[2];
      const toLink = toCell?.querySelector('a[href*="village="]');
      const toVid  = toLink?.getAttribute('href')?.match(/village=(\d+)/)?.[1];
      const toRaw  = toLink?.textContent?.trim() || toCell?.textContent?.match(/[^()]+/)?.[0]?.trim() || '?';
      const toName = toRaw.replace(/\s*\(\d+\|\d+\).*$/, '').trim();

      // Arrival time — grab Unix timestamp from TW's countdown element if available
      const timeCell = cells[3];
      const countdownEl = timeCell?.querySelector('[data-endtime]');
      const arrives_ts  = countdownEl ? parseInt(countdownEl.getAttribute('data-endtime')) || null : null;
      const arrives     = timeCell?.textContent?.trim().replace(/\s+/g, ' ') || '?';

      rows.push({
        type,
        is_return:  isReturn,
        is_noble:   isNoble,
        arrives_ts,
        from_vid:   fromVid ? parseInt(fromVid) : null,
        from_coord: fromCoord ? `${fromCoord[1]}|${fromCoord[2]}` : null,
        to_vid:     toVid ? parseInt(toVid) : null,
        to_name:    toName,
        arrives,
      });
    }
    return rows;
  }

  // Parses outgoing commands (overview_villages&mode=commands).
  // Shows your attacks/supports currently in motion across all villages.
  function parseOutgoing(html) {
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const rows = [];

    // TW may use various table IDs for the commands overview
    const table = doc.querySelector('#commands_table, #commands_list, #outgoing_table')
                || [...doc.querySelectorAll('table.vis, table')].find(t =>
                     t.querySelector('tbody tr td a[href*="village="]')
                   );
    if (!table) return rows;

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 3) continue;

      const typeImg = cells[0]?.querySelector('img');
      const typeAlt = (typeImg?.getAttribute('alt') || typeImg?.getAttribute('title') || '').toLowerCase();
      const isNoble  = typeAlt.includes('snob') || typeAlt.includes('noble');
      const isReturn = typeAlt.includes('return') || row.classList.contains('return');
      const type     = typeImg?.getAttribute('title') || typeImg?.getAttribute('alt') || '?';

      // From village (cell 1)
      const fromLink = cells[1]?.querySelector('a[href*="village="]');
      const fromVid  = fromLink?.getAttribute('href')?.match(/village=(\d+)/)?.[1];
      const fromRaw  = fromLink?.textContent?.trim() || '?';
      const fromName = fromRaw.replace(/\s*\(\d+\|\d+\).*$/, '').trim();

      // To village (cell 2)
      const toLink  = cells[2]?.querySelector('a[href*="village="]');
      const toVid   = toLink?.getAttribute('href')?.match(/village=(\d+)/)?.[1];
      const toRaw   = toLink?.textContent?.trim() || cells[2]?.textContent?.trim() || '?';
      const toName  = toRaw.replace(/\s*\(\d+\|\d+\).*$/, '').trim();
      const toCoord = cells[2]?.textContent?.match(/\((\d+)\|(\d+)\)/);

      // Arrival/return time — prefer data-endtime countdown if present
      const timeCell    = cells[3] || cells[cells.length - 1];
      const countdownEl = timeCell?.querySelector('[data-endtime]');
      const arrives_ts  = countdownEl ? parseInt(countdownEl.getAttribute('data-endtime')) || null : null;
      const arrives     = timeCell?.textContent?.trim().replace(/\s+/g, ' ') || '?';

      rows.push({
        type,
        is_noble:  isNoble,
        is_return: isReturn,
        arrives_ts,
        from_vid:  fromVid ? parseInt(fromVid) : null,
        from_name: fromName,
        to_vid:    toVid ? parseInt(toVid) : null,
        to_name:   toName,
        to_coord:  toCoord ? `${toCoord[1]}|${toCoord[2]}` : null,
        arrives,
      });
    }
    return rows;
  }

  // kill_att.txt / kill_def.txt: rank,player_id,od_points
  function parseOdCsv(text) {
    const map = {};
    text.trim().split('\n').forEach(line => {
      const parts = line.split(',');
      if (parts.length < 3) return;
      const [rank, pid, od] = parts;
      map[pid.trim()] = { rank: parseInt(rank), od: parseInt(od) };
    });
    return map;
  }

})();
