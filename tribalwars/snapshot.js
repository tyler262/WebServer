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
//   • All-village unit research    (which units unlocked/upgraded)
//   • Incoming attacks             (arrival time, from, target)
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

    // ── 2. All-village overviews (troops + buildings + research) ──────────
    step('📊 <b>[2/5]</b> Village overviews…');
    const [troopsHtml, buildingsHtml, researchHtml] = await Promise.all([
      fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=troops&type=all&page=-1`).then(r => r.text()),
      fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=buildings&page=-1`).then(r => r.text()),
      fetch(`${base}/game.php?village=${myVid}&screen=overview_villages&mode=units&page=-1`).then(r => r.text()),
    ]);
    const troopsRows    = parseOverviewTable(troopsHtml);
    const buildingRows  = parseOverviewTable(buildingsHtml);
    const researchRows  = parseOverviewTable(researchHtml);
    const villages      = mergeVillages(troopsRows, buildingRows, researchRows);

    // ── 3. Incomings ──────────────────────────────────────────────────────
    step('📊 <b>[3/5]</b> Incoming attacks…');
    let incomings = [];
    try {
      const incomingHtml = await fetch(
        `${base}/game.php?village=${myVid}&screen=overview_villages&mode=incomings&page=-1`
      ).then(r => r.text());
      incomings = parseIncomings(incomingHtml);
    } catch (e) {
      console.warn('[TW Snapshot] incomings parse failed:', e.message);
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
      snapped_at:  new Date().toISOString(),
      world,
      player_name: game_data.player.name,
      player_id:   String(game_data.player.id),
      world_config: worldConfig,
      unit_info:    unitInfo,
      villages,
      incomings,
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
        `Incomings: ${incomings.length}\n\n` +
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
      map_size:          parseInt(get('coord', 'map_size'))  || 1000,
      noble_max_distance: parseInt(get('snob', 'max_dist')) || 100,
      noble_coin_cost: {
        wood:  parseInt(get('snob', 'gold_coin_wood'))  || 0,
        stone: parseInt(get('snob', 'gold_coin_stone')) || 0,
        iron:  parseInt(get('snob', 'gold_coin_iron'))  || 0,
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

  // Parses any overview_villages table: troops, buildings, or units (research).
  // Header cells contain unit/building images; data rows have village name + counts.
  function parseOverviewTable(html) {
    const doc   = new DOMParser().parseFromString(html, 'text/html');
    // Find the table that has images in its header
    const table = doc.querySelector('#troops_list')
                || doc.querySelector('table.overview_table')
                || [...doc.querySelectorAll('table')].find(t => {
                     const hrow = t.querySelector('thead tr') || t.querySelector('tr');
                     return hrow && hrow.querySelector('img');
                   });
    if (!table) return [];

    const hrow = table.querySelector('thead tr') || table.querySelector('tr');
    if (!hrow) return [];

    // Identify column keys from image filenames or alt text
    const cols = [];
    [...hrow.querySelectorAll('th, td')].forEach((th, i) => {
      const img = th.querySelector('img');
      if (!img) return;
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || img.getAttribute('title') || '').toLowerCase().replace(/\s+/g, '_');

      // unit_axe.png  →  "axe"
      const mUnit = src.match(/unit_(\w+)\./);
      // buildings/barracks.png  or  buildrow_barracks.png  →  "barracks"
      const mBld  = src.match(/(?:buildings?\/|buildrow_)(\w+)\./);

      const key = (mUnit || mBld)?.[1] || alt || null;
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

      const data = {};
      cols.forEach(({ i, key }) => {
        const txt = (cells[i]?.textContent || '').trim().replace(/[.,\s]/g, '');
        const n   = parseInt(txt);
        if (!isNaN(n) && n > 0) data[key] = n;
      });

      rows.push({
        vid:  parseInt(vidMatch[1]),
        name: link?.textContent?.trim() || '?',
        x:    coordMatch ? parseInt(coordMatch[1]) : null,
        y:    coordMatch ? parseInt(coordMatch[2]) : null,
        data,
      });
    }
    return rows;
  }

  // Merge troops / buildings / research rows into per-village objects
  function mergeVillages(troops, buildings, research) {
    const map = {};
    const set = (vid, name, x, y) => {
      if (!map[vid]) map[vid] = { vid, name, x, y };
    };
    for (const r of troops)    { set(r.vid, r.name, r.x, r.y); map[r.vid].troops    = r.data; }
    for (const r of buildings) { set(r.vid, r.name, r.x, r.y); map[r.vid].buildings = r.data; }
    for (const r of research)  { set(r.vid, r.name, r.x, r.y); map[r.vid].research  = r.data; }
    return Object.values(map);
  }

  function parseIncomings(html) {
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const rows = [];

    // Try common incomings table IDs
    const table = doc.querySelector('#incomings_table')
                || doc.querySelector('#incomings_list')
                || [...doc.querySelectorAll('table')].find(t =>
                     t.textContent.includes('incoming') || t.textContent.includes('Incoming')
                   );
    if (!table) return rows;

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 3) continue;

      // Type: read from image title/alt or text
      const typeImg = cells[0]?.querySelector('img');
      const type    = typeImg?.getAttribute('title') || typeImg?.getAttribute('alt')
                    || cells[0]?.textContent?.trim() || '?';

      // From village (cell 1)
      const fromCell  = cells[1];
      const fromCoord = fromCell?.textContent?.match(/\((\d+)\|(\d+)\)/);
      const fromLink  = fromCell?.querySelector('a[href*="village="]');
      const fromVid   = fromLink?.getAttribute('href')?.match(/village=(\d+)/)?.[1];

      // To your village (cell 2)
      const toCell = cells[2];
      const toLink = toCell?.querySelector('a[href*="village="]');
      const toVid  = toLink?.getAttribute('href')?.match(/village=(\d+)/)?.[1];
      const toName = toLink?.textContent?.trim() || toCell?.textContent?.match(/[^()]+/)?.[0]?.trim() || '?';

      // Arrival time (cell 3)
      const arrives = cells[3]?.textContent?.trim().replace(/\s+/g, ' ') || '?';

      rows.push({
        type,
        from_vid:   fromVid ? parseInt(fromVid) : null,
        from_coord: fromCoord ? `${fromCoord[1]}|${fromCoord[2]}` : null,
        to_vid:     toVid ? parseInt(toVid) : null,
        to_name:    toName,
        arrives,
      });
    }
    return rows;
  }

  // kill_att.txt / kill_def.txt:  rank,player_id,od_points
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
