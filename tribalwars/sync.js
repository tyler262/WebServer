// ─────────────────────────────────────────────────────────────────────────────
// TW Sync — push your game data to the Pi dashboard
//
// HOW TO RUN (pick one):
//   1. Script URL field (Premium): enter  http://192.168.1.4:8888/tw/sync.js
//   2. Browser console (F12):      paste the whole file and hit Enter
//   3. Bookmarklet:                see README.md
//
// Collects public map data + your game_data and POSTs it to the Pi.
// The Pi writes tribalwars/CONTEXT.md and stores tw_data.json.
// Run whenever you want to refresh the agent's context.
// ─────────────────────────────────────────────────────────────────────────────

(async function () {

  // ── config ──────────────────────────────────────────────────────────────────
  const PI_URL         = 'http://192.168.1.4:8888';  // ← your Pi's IP:port
  const NEIGHBOR_RADIUS = 25;                          // tiles to scan for neighbors

  // ── sanity check ────────────────────────────────────────────────────────────
  if (typeof game_data === 'undefined') {
    alert('Run this script from inside Tribal Wars.');
    return;
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  const decode = s => {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); }
    catch { return s; }
  };

  const parseCSV = text =>
    text.trim().split('\n').map(line => line.split(','));

  const dist = (x1, y1, x2, y2) =>
    Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);

  // ── fetch public map files ───────────────────────────────────────────────────
  const world    = game_data.world;
  const base     = `https://${world}.tribalwars.net`;
  const playerId = parseInt(game_data.player.id);

  console.log('[TW Sync] Fetching map data…');

  let playersTxt, alliesTxt, villagesTxt;
  try {
    [playersTxt, alliesTxt, villagesTxt] = await Promise.all([
      fetch(`${base}/map/player.txt`).then(r => r.text()),
      fetch(`${base}/map/ally.txt`).then(r => r.text()),
      fetch(`${base}/map/village.txt`).then(r => r.text()),
    ]);
  } catch (e) {
    alert(`Failed to fetch map data: ${e.message}`);
    return;
  }

  // ── parse ────────────────────────────────────────────────────────────────────
  // player.txt:  id, name, ally_id, villages, points, rank
  const allPlayers = parseCSV(playersTxt).map(p => ({
    id:       parseInt(p[0]),
    name:     decode(p[1]),
    tribe_id: parseInt(p[2]),
    villages: parseInt(p[3]),
    points:   parseInt(p[4]),
    rank:     parseInt(p[5]),
  }));

  // ally.txt:  id, name, tag, members, villages, points, all_points, rank
  const allTribes = parseCSV(alliesTxt).map(a => ({
    id:         parseInt(a[0]),
    name:       decode(a[1]),
    tag:        decode(a[2]),
    members:    parseInt(a[3]),
    villages:   parseInt(a[4]),
    points:     parseInt(a[5]),
    all_points: parseInt(a[6]),
    rank:       parseInt(a[7]),
  }));

  // village.txt:  id, name, x, y, player_id, points, rank
  const allVillages = parseCSV(villagesTxt).map(v => ({
    id:        parseInt(v[0]),
    name:      decode(v[1]),
    x:         parseInt(v[2]),
    y:         parseInt(v[3]),
    player_id: parseInt(v[4]),
    points:    parseInt(v[5]),
  }));

  // ── my data ──────────────────────────────────────────────────────────────────
  const me         = allPlayers.find(p => p.id === playerId);
  const myTribe    = me?.tribe_id ? allTribes.find(t => t.id === me.tribe_id) : null;
  const myVillages = allVillages.filter(v => v.player_id === playerId);
  const myCoords   = myVillages.map(v => ({ x: v.x, y: v.y }));

  const tribeMembers = myTribe
    ? allPlayers.filter(p => p.tribe_id === myTribe.id && p.id !== playerId)
    : [];

  // ── neighbors ────────────────────────────────────────────────────────────────
  // Players (not me, not same tribe) with a village within NEIGHBOR_RADIUS tiles
  const neighborIds = new Set();
  for (const v of allVillages) {
    if (!v.player_id || v.player_id === playerId) continue;
    const pData = allPlayers.find(p => p.id === v.player_id);
    if (myTribe && pData?.tribe_id === myTribe.id) continue;
    for (const mine of myCoords) {
      if (dist(mine.x, mine.y, v.x, v.y) <= NEIGHBOR_RADIUS) {
        neighborIds.add(v.player_id);
        break;
      }
    }
  }

  const neighbors = allPlayers
    .filter(p => neighborIds.has(p.id))
    .map(p => {
      const tribeData = p.tribe_id ? allTribes.find(t => t.id === p.tribe_id) : null;
      const nearVils  = allVillages
        .filter(v => v.player_id === p.id)
        .map(v => ({
          ...v,
          dist: Math.round(Math.min(...myCoords.map(m => dist(m.x, m.y, v.x, v.y)))),
        }))
        .filter(v => v.dist <= NEIGHBOR_RADIUS)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);
      return {
        id:           p.id,
        name:         p.name,
        rank:         p.rank,
        points:       p.points,
        villages:     p.villages,
        tribe_tag:    tribeData?.tag || '',
        tribe_name:   tribeData?.name || '',
        near_villages: nearVils,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  // ── payload ──────────────────────────────────────────────────────────────────
  const payload = {
    synced_at:     new Date().toISOString(),
    world,
    player:        me,
    tribe:         myTribe,
    my_villages:   myVillages,
    tribe_members: tribeMembers.sort((a, b) => a.rank - b.rank),
    top_tribes:    [...allTribes].sort((a, b) => a.rank - b.rank).slice(0, 30),
    top_players:   [...allPlayers].sort((a, b) => a.rank - b.rank).slice(0, 100),
    neighbors,
  };

  console.log(
    `[TW Sync] ${myVillages.length} villages, ` +
    `${tribeMembers.length} tribe members, ` +
    `${neighbors.length} neighbors. Sending to Pi…`
  );

  // ── POST to Pi ───────────────────────────────────────────────────────────────
  try {
    const res = await fetch(`${PI_URL}/api/tw/sync`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json();
      alert(
        `✓ TW Sync complete!\n\n` +
        `Player:    ${me?.name} (Rank #${me?.rank})\n` +
        `Tribe:     [${myTribe?.tag || 'none'}]\n` +
        `Villages:  ${myVillages.length}\n` +
        `Neighbors: ${neighbors.length}\n\n` +
        `CONTEXT.md updated on Pi.`
      );
    } else {
      const txt = await res.text().catch(() => '');
      alert(`Sync failed: HTTP ${res.status}\n${txt}`);
    }
  } catch (e) {
    alert(
      `Sync failed: ${e.message}\n\n` +
      `Is the Pi running at ${PI_URL}?\n` +
      `Try opening ${PI_URL} in a new tab to check.`
    );
  }

})();
