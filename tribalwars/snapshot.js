// ─────────────────────────────────────────────────────────────────────────────
// TW Snapshot — deep game-state dump for AI-assisted scripting
//
// javascript:$.getScript('http://192.168.1.4:8888/tw/snapshot.js');
//
// Collects:
//   • World config (speed, unit_speed, morale, night bonus, map size, noble costs)
//   • Unit stats for THIS world  (attack, defense, speed, carry, pop)
//   • All villages: troops at home, building levels, training queues
//   • Incoming attacks (all pages, arrival time, from coords)
//   • Returning troops (separated from enemy incomings)
//   • Outgoing commands (attacks/supports in motion)
//   • ODA + ODD rankings (offensive/defensive points per player)
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

  // Building alt-text → internal identifier (CDN-agnostic)
  const BLDG_ALT = {
    'headquarters': 'main', 'main building': 'main', 'hq': 'main', 'main': 'main',
    'barracks': 'barracks',
    'stable': 'stable', 'stables': 'stable',
    'workshop': 'garage', 'garage': 'garage',
    'watchtower': 'watchtower', 'watch tower': 'watchtower',
    'academy': 'snob', 'noble residence': 'snob', 'nobleman residence': 'snob',
    'smithy': 'smith', 'smith': 'smith',
    'rally point': 'place', 'rallypoint': 'place',
    'statue': 'statue', 'paladin statue': 'statue', 'paladin': 'statue',
    'market': 'market',
    'timber camp': 'wood', 'lumber camp': 'wood', 'wood': 'wood',
    'clay pit': 'stone', 'clay': 'stone', 'stone': 'stone',
    'iron mine': 'iron', 'iron': 'iron',
    'farm': 'farm',
    'warehouse': 'storage', 'storage': 'storage',
    'hiding place': 'hide', 'hideout': 'hide', 'hide': 'hide',
    'wall': 'wall',
  };
  const KNOWN_BLDG = new Set([
    'main','barracks','stable','garage','watchtower','snob','smith',
    'place','statue','market','wood','stone','iron','farm','storage','hide','wall',
  ]);

  // 100ms delay between pages to avoid rate-limiting
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Loading toast ─────────────────────────────────────────────────────────
  const $t = $('<div>').css({
    position: 'fixed', bottom: '20px', right: '20px',
    background: '#1a1a1a', color: '#fff', padding: '12px 20px',
    borderRadius: '6px', zIndex: 99999, fontFamily: 'Verdana,sans-serif',
    fontSize: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    minWidth: '300px', lineHeight: '1.6',
  }).appendTo('body');
  const step = s => $t.html(s);

  try {

    // ── 1. World config + unit stats (public, no auth) ─────────────────────
    step('📊 <b>[1/5]</b> World config + unit stats…');
    const [configXml, unitXml] = await Promise.all([
      fetch(`${base}/interface.php?func=get_config`).then(r => r.text()),
      fetch(`${base}/interface.php?func=get_unit_info`).then(r => r.text()),
    ]);
    const worldConfig = parseWorldConfig(configXml);
    const unitInfo    = parseUnitInfo(unitXml);

    // ── 2. All-village overviews (troops + buildings + training queue) ──────
    // Uses smart pagination: tries page=-1 first, falls back to page=0,1,2,...
    step('📊 <b>[2/5]</b> Village overviews (all pages)…');
    const [troopsRows, buildingRows, trainingRows] = await Promise.all([
      fetchAllRows(base, myVid, 'troops',    'troops'),
      fetchAllRows(base, myVid, 'buildings', 'buildings'),
      fetchAllRows(base, myVid, 'units',     'training'),
    ]);
    const villages = mergeVillages(troopsRows, buildingRows, trainingRows);

    // ── 3. Incomings (explicit page=0,1,2... — page=-1 is AJAX-lazy on some servers)
    step('📊 <b>[3/5]</b> Incoming attacks…');
    let incomings = [], returning = [];
    try {
      const all = await fetchAllIncomings(base, myVid);
      incomings = all.filter(r => !r.is_return);
      returning = all.filter(r =>  r.is_return);
    } catch (e) {
      console.warn('[TW Snapshot] incomings failed:', e.message);
    }

    // ── 4. Outgoing commands + OD rankings ───────────────────────────────────
    step('📊 <b>[4/5]</b> Outgoing commands + OD rankings…');
    let outgoing = [], odRankings = { attack: {}, defense: {} };
    try {
      const [commandsHtml, odaText, oddText] = await Promise.all([
        fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=commands&page=-1`).then(r => r.text()),
        fetch(`${base}/map/kill_att.txt`).then(r => r.text()),
        fetch(`${base}/map/kill_def.txt`).then(r => r.text()),
      ]);
      outgoing           = parseOutgoing(commandsHtml);
      odRankings.attack  = parseOdCsv(odaText);
      odRankings.defense = parseOdCsv(oddText);
    } catch (e) {
      console.warn('[TW Snapshot] outgoing/OD failed:', e.message);
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
      _meta: {
        troops_villages:   troopsRows.length,
        building_villages: buildingRows.length,
        training_villages: trainingRows.length,
      },
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
        `Villages:  ${villages.length}  (troops: ${troopsRows.length}, bldgs: ${buildingRows.length}, training: ${trainingRows.length})\n` +
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
    setTimeout(() => $t.remove(), 8000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch helpers
  // ─────────────────────────────────────────────────────────────────────────

  // Fetch an overview_villages mode with automatic pagination.
  // Tries page=-1 first; if the response contains pagination links, paginates manually.
  async function fetchAllRows(base, myVid, mode, parseMode) {
    const makeUrl = p =>
      `${base}/game.php?village=${myVid}&screen=overview_villages&mode=${mode}&page=${p}`;

    // Attempt page=-1 (returns everything on most TW servers)
    const html0 = await fetch(makeUrl(-1)).then(r => r.text());
    const rows0 = parseOverviewTable(html0, parseMode);

    // If we got rows and there are no numbered page navigation links, page=-1 worked
    const doc0    = new DOMParser().parseFromString(html0, 'text/html');
    const hasMore = doc0.querySelector('a[href*="screen=overview_villages"][href*="page=1"]') != null
                 || doc0.querySelector('.paged-nav-item a[href*="page="]') != null;

    if (rows0.length > 0 && !hasMore) {
      return rows0;
    }

    // page=-1 didn't return everything — paginate manually
    const allRows = [];
    const seen    = new Set();

    for (let page = 0; ; page++) {
      const html     = await fetch(makeUrl(page)).then(r => r.text());
      const pageRows = parseOverviewTable(html, parseMode);

      // Break if this page returned no village rows
      if (!pageRows.length) break;

      // Add non-duplicate rows
      let added = 0;
      for (const r of pageRows) {
        if (!seen.has(r.vid)) { seen.add(r.vid); allRows.push(r); added++; }
      }

      // No new rows means we've wrapped around (shouldn't happen but be safe)
      if (!added) break;

      // Check if there's a next page link
      const doc      = new DOMParser().parseFromString(html, 'text/html');
      const nextPage = doc.querySelector(`a[href*="page=${page + 1}"]`);
      if (!nextPage) break;

      await sleep(100);
    }

    return allRows;
  }

  // Fetch all incomings using explicit page numbers (page=-1 returns empty table on some servers
  // because TW's CommandsOverview JS lazy-loads the data; explicit pages get server-rendered HTML).
  async function fetchAllIncomings(base, myVid) {
    const rows = [];
    for (let page = 0; ; page++) {
      const html = await fetch(
        `${base}/game.php?village=${myVid}&screen=overview_villages&mode=incomings&page=${page}`
      ).then(r => r.text());

      const doc   = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('#incomings_table, #incomings_list');
      if (!table) break;

      const pageRows = parseIncomingsTable(table);
      if (!pageRows.length) break;
      rows.push(...pageRows);

      const nextLink = doc.querySelector(`a[href*="page=${page + 1}"]`);
      if (!nextLink) break;
      await sleep(100);
    }
    return rows;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parsing helpers
  // ─────────────────────────────────────────────────────────────────────────

  function parseWorldConfig(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const get = (...path) => {
      let node = doc.documentElement;
      for (const tag of path) { node = node.querySelector(tag); if (!node) return null; }
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

  // Parses overview_villages tables for troops, buildings, or training queue.
  // mode: 'troops' | 'buildings' | 'training'
  function parseOverviewTable(html, mode) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Try specific table IDs first
    const idMap = { troops: '#troops_list', buildings: '#buildings_list', training: '#units_list' };
    let table = doc.querySelector(idMap[mode] || '');

    // Fallback: find a table that has BOTH images in header AND village links in data rows
    if (!table) {
      table = doc.querySelector('table.overview_table')
            || [...doc.querySelectorAll('table')].find(t => {
                 const hrow = t.querySelector('thead tr, tr:first-child');
                 if (!hrow || !hrow.querySelector('img')) return false;
                 const dataRow = t.querySelector('tbody tr, tr:nth-child(2)');
                 return dataRow?.querySelector('a[href*="village="]') != null;
               });
    }
    if (!table) return [];

    const hrow = table.querySelector('thead tr') || table.querySelector('tr');
    if (!hrow) return [];

    // Identify column keys from header images
    const cols = [];
    [...hrow.querySelectorAll('th, td')].forEach((th, i) => {
      const img = th.querySelector('img');
      if (!img) return;
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') ||
                   img.getAttribute('title') ||
                   img.getAttribute('data-title') ||
                   img.getAttribute('data-tooltip') || '').toLowerCase().trim();

      // unit_axe.png → "axe"
      const mUnit = src.match(/unit_(\w+)\./);
      // /buildings/barracks.png, buildrow_barracks.png, main_buildrow_barracks.png → "barracks"
      const mBld  = src.match(/(?:buildings?\/|(?:main_)?buildrow_)(\w+)\./);

      let key = (mUnit || mBld)?.[1]?.toLowerCase() || null;

      if (!key && alt) {
        key = BLDG_ALT[alt] || (KNOWN_BLDG.has(alt) ? alt : null);
      }
      // Last resort: stem of image filename
      if (!key) {
        const stem = src.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
        if (KNOWN_BLDG.has(stem)) key = stem;
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

      // Strip coord suffix: "Village Name (580|476) K45" → "Village Name"
      const rawName = link?.textContent?.trim() || '?';
      const name    = rawName.replace(/\s*\(\d+\|\d+\).*$/, '').trim();

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

  // Merge troops / buildings / training_queue into per-village objects
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

  // Parse rows from an already-located incomings table element.
  // Uses link-finding (not fixed cell positions) since TW column order varies.
  function parseIncomingsTable(table) {
    const rows = [];
    for (const row of table.querySelectorAll('tr')) {
      // Skip header rows (no village links)
      const vilLinks = [...row.querySelectorAll('a[href*="village="]')];
      if (!vilLinks.length) continue;

      // First link = attacker's village, last link = your target village
      const fromLink = vilLinks[0];
      const toLink   = vilLinks[vilLinks.length - 1] !== vilLinks[0] ? vilLinks[vilLinks.length - 1] : null;

      const fromVid   = fromLink.getAttribute('href').match(/village=(\d+)/)?.[1];
      const fromRaw   = fromLink.textContent.trim();
      const fromName  = fromRaw.replace(/\s*\(\d+\|\d+\).*$/, '').trim() || '?';
      const fromCoord = fromRaw.match(/\((\d+)\|(\d+)\)/);

      const toVid   = toLink?.getAttribute('href')?.match(/village=(\d+)/)?.[1];
      const toRaw   = toLink?.textContent?.trim() || '';
      const toName  = toRaw.replace(/\s*\(\d+\|\d+\).*$/, '').trim() || '?';

      // Type icon: look for an img in the row
      const typeImg = row.querySelector('td img');
      const typeAlt = (typeImg?.getAttribute('alt') || typeImg?.getAttribute('title') || '').toLowerCase();
      const type    = typeImg?.getAttribute('title') || typeImg?.getAttribute('alt') || '?';

      const isReturn = row.classList.contains('return') ||
                       typeAlt.includes('return') ||
                       (row.querySelector('td')?.textContent || '').toLowerCase().trim().startsWith('return');
      const isNoble  = typeAlt.includes('snob') || typeAlt.includes('noble');

      // Arrival time: prefer data-endtime, then look for time text
      const countdownEl = row.querySelector('[data-endtime]');
      const arrives_ts  = countdownEl ? parseInt(countdownEl.getAttribute('data-endtime')) || null : null;
      const cells       = [...row.querySelectorAll('td')];
      const timeCell    = cells.find(c => /today at|tomorrow at|on \d{2}\.\d{2}\./.test(c.textContent))
                       || countdownEl?.closest('td');
      const arrives     = timeCell?.textContent?.trim().replace(/\s+/g, ' ') || '?';

      rows.push({
        type,
        is_return:  isReturn,
        is_noble:   isNoble,
        arrives_ts,
        from_vid:   fromVid   ? parseInt(fromVid)   : null,
        from_coord: fromCoord ? `${fromCoord[1]}|${fromCoord[2]}` : null,
        to_vid:     toVid     ? parseInt(toVid)     : null,
        to_name:    toName,
        arrives,
      });
    }
    return rows;
  }

  // Parse outgoing commands.
  // In TW's commands table, first village link = destination (target), second = source (your village).
  function parseOutgoing(html) {
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const rows = [];

    const table = doc.querySelector('#commands_table, #commands_list, #outgoing_table')
                || [...doc.querySelectorAll('table')].find(t =>
                     t.querySelector('tbody tr td a[href*="village="]')
                   );
    if (!table) return rows;

    for (const row of table.querySelectorAll('tbody tr')) {
      const vilLinks = [...row.querySelectorAll('a[href*="village="]')];
      if (!vilLinks.length) continue;

      // TW commands table: first link = destination (enemy/barb village)
      //                    second link = source (your village)
      const toLink   = vilLinks[0];
      const fromLink = vilLinks.length > 1 ? vilLinks[1] : null;

      const toVid   = toLink.getAttribute('href').match(/village=(\d+)/)?.[1];
      const toRaw   = toLink.textContent.trim();
      const toName  = toRaw.replace(/\s*\(\d+\|\d+\).*$/, '').trim() || toVid || '?';
      const toCoord = toRaw.match(/\((\d+)\|(\d+)\)/);

      const fromVid   = fromLink?.getAttribute('href')?.match(/village=(\d+)/)?.[1];
      const fromRaw   = fromLink?.textContent?.trim() || '';
      const fromName  = fromRaw.replace(/\s*\(\d+\|\d+\).*$/, '').trim() || fromVid || '?';
      const fromCoord = fromRaw.match(/\((\d+)\|(\d+)\)/);

      // Command type from icon
      const typeImg = row.querySelector('td img');
      const typeAlt = (typeImg?.getAttribute('alt') || typeImg?.getAttribute('title') || '').toLowerCase();
      const type    = typeImg?.getAttribute('title') || typeImg?.getAttribute('alt') || '?';

      // Also grab the action description text (e.g. "Attack on Barbarian village")
      // from the cell that contains the first (destination) link
      const descCell = toLink.closest('td');
      const desc     = descCell?.textContent?.trim().replace(/\s+/g, ' ') || '';

      // Arrival time
      const countdownEl = row.querySelector('[data-endtime]');
      const arrives_ts  = countdownEl ? parseInt(countdownEl.getAttribute('data-endtime')) || null : null;
      const cells       = [...row.querySelectorAll('td')];
      const timeCell    = cells.find(c => /today at|tomorrow at|on \d{2}\.\d{2}\./.test(c.textContent))
                       || countdownEl?.closest('td');
      const arrives     = timeCell?.textContent?.trim().replace(/\s+/g, ' ') || '?';

      rows.push({
        type,
        desc,
        is_noble:   typeAlt.includes('snob') || typeAlt.includes('noble'),
        is_return:  typeAlt.includes('return') || row.classList.contains('return') ||
                    desc.toLowerCase().includes('return'),
        arrives_ts,
        from_vid:   fromVid   ? parseInt(fromVid)   : null,
        from_name:  fromName,
        from_coord: fromCoord ? `${fromCoord[1]}|${fromCoord[2]}` : null,
        to_vid:     toVid     ? parseInt(toVid)     : null,
        to_name:    toName,
        to_coord:   toCoord   ? `${toCoord[1]}|${toCoord[2]}` : null,
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
