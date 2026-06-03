// ─────────────────────────────────────────────────────────────────────────────
// TW Attack — scan reports for empty/offensive targets and send troops
//
// Add to TW via Edit Links:
//   javascript:$.getScript('http://192.168.1.4:8888/tw/attack.js');
//
// Manual click required — never fires automatically.
// ─────────────────────────────────────────────────────────────────────────────

(async function () {

  if (typeof game_data === 'undefined') {
    alert('Run from inside Tribal Wars.');
    return;
  }

  // ── CONFIG ────────────────────────────────────────────────────────────────
  const CONFIG = {
    reportPages:    5,      // pages of reports to scan (≈15 reports each)
    batchSize:      5,      // concurrent report fetches
    emptyThreshold: 10,     // total defender troops ≤ this = "empty"
    offRatio:       0.25,   // def_troops / (total+1) ≤ this = "offensive village"
    minOffTroops:   50,     // skip source villages with fewer total offensive troops
    sendTroops: {           // default troops to send per attack (edit in the modal too)
      axe:   200,
      light: 100,
      ram:   5,
    },
    attackDelay:    1500,   // ms between consecutive attacks
  };

  const DEF_UNITS  = new Set(['spear', 'sword', 'archer', 'heavy']);
  const OFF_UNITS  = new Set(['axe', 'light', 'marcher', 'ram', 'catapult']);
  const UNIT_LABEL = {
    spear: 'Spear', sword: 'Sword', axe: 'Axe', archer: 'Arch',
    spy: 'Scout', light: 'LC', marcher: 'MA', heavy: 'HC',
    ram: 'Ram', catapult: 'Cat', knight: 'Pal', snob: 'Noble',
  };

  const world = game_data.world;
  const myVid = game_data.village.id;
  const base  = `https://${world}.tribalwars.net`;

  // ── Status toast ──────────────────────────────────────────────────────────
  const $toast = $('<div>').css({
    position: 'fixed', bottom: '20px', right: '20px',
    background: '#1a1a1a', color: '#fff', padding: '12px 20px',
    borderRadius: '6px', zIndex: 99999, fontFamily: 'Verdana,sans-serif',
    fontSize: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    minWidth: '260px', lineHeight: '1.6',
  }).appendTo('body');
  const toast = msg => $toast.html(msg);

  try {

    // ── 1. Find source villages with offensive troops ──────────────────────
    toast('⏳ <b>Step 1/3</b> — fetching your troops…');
    const troopsHtml = await fetch(
      `${base}/game.php?village=${myVid}&screen=overview_villages&mode=troops&type=all&page=-1`
    ).then(r => r.text());

    const sources = parseSources(troopsHtml);
    if (!sources.length) {
      toast('⚠ No villages with enough offensive troops found at home.');
      setTimeout(() => $toast.remove(), 4000);
      return;
    }

    // ── 2. Gather report page links ───────────────────────────────────────
    toast(`⏳ <b>Step 2/3</b> — scanning ${CONFIG.reportPages} page(s) of reports…`);
    const reportLinks = await gatherReportLinks(CONFIG.reportPages);
    if (!reportLinks.length) {
      toast('⚠ No reports found. Have you attacked any villages recently?');
      setTimeout(() => $toast.remove(), 4000);
      return;
    }

    // ── 3. Fetch and parse each report ────────────────────────────────────
    const rawTargets = [];
    for (let i = 0; i < reportLinks.length; i += CONFIG.batchSize) {
      const n     = Math.min(i + CONFIG.batchSize, reportLinks.length);
      toast(`⏳ <b>Step 3/3</b> — reading report ${i + 1}–${n} of ${reportLinks.length}…`);
      const batch   = reportLinks.slice(i, i + CONFIG.batchSize);
      const settled = await Promise.allSettled(batch.map(l => parseReport(l.id)));
      settled.forEach(r => { if (r.status === 'fulfilled' && r.value) rawTargets.push(r.value); });
    }

    // ── 4. Filter → dedupe → match to nearest source ───────────────────────
    const filtered = rawTargets.filter(t =>
      t.totalTroops <= CONFIG.emptyThreshold ||
      t.defTroops / (t.totalTroops + 1) <= CONFIG.offRatio
    );

    const seen   = new Set();
    const unique = filtered.filter(t => {
      if (seen.has(t.vid)) return false;
      seen.add(t.vid);
      return true;
    });

    const attacks = unique.map(t => {
      const src  = sources.reduce((best, s) =>
        dist(s.x, s.y, t.x, t.y) < dist(best.x, best.y, t.x, t.y) ? s : best
      );
      const type = t.totalTroops <= CONFIG.emptyThreshold ? 'empty' : 'offensive';
      return { ...t, src, dist: +dist(src.x, src.y, t.x, t.y).toFixed(1), type };
    }).sort((a, b) => a.dist - b.dist);

    $toast.remove();

    if (!attacks.length) {
      alert(
        `Scanned ${reportLinks.length} report(s) — no qualifying targets.\n\n` +
        `Current thresholds:\n` +
        `  Empty      : ≤ ${CONFIG.emptyThreshold} total troops\n` +
        `  Offensive  : ≤ ${Math.round(CONFIG.offRatio * 100)}% def troops\n\n` +
        `Try increasing reportPages or raising emptyThreshold in CONFIG.`
      );
      return;
    }

    renderModal(attacks, CONFIG);

  } catch (err) {
    toast('✗ Error: ' + err.message);
    console.error('[TW Attack]', err);
    setTimeout(() => $toast.remove(), 6000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parsing helpers
  // ─────────────────────────────────────────────────────────────────────────

  function dist(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  }

  // Extract your villages that have enough offensive troops at home
  function parseSources(html) {
    const doc   = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('#troops_list')
                || doc.querySelector('table.overview_table')
                || [...doc.querySelectorAll('table')].find(t => t.querySelector('img[src*="unit_"]'));
    if (!table) return [];

    const hrow  = table.querySelector('thead tr') || table.querySelector('tr');
    const cols  = [];
    if (hrow) {
      [...hrow.querySelectorAll('th, td')].forEach((th, i) => {
        const src = th.querySelector('img')?.getAttribute('src') || '';
        const m   = src.match(/unit_(\w+)\./);
        if (m) cols.push({ i, unit: m[1] });
      });
    }

    return [...(table.querySelector('tbody') || table).querySelectorAll('tr')]
      .filter(r => r.querySelector('a'))
      .flatMap(row => {
        const cells      = [...row.querySelectorAll('td')];
        const link       = cells[0]?.querySelector('a');
        const vidMatch   = link?.getAttribute('href')?.match(/village=(\d+)/);
        const coordMatch = cells[0]?.textContent?.match(/\((\d+)\|(\d+)\)/);
        if (!vidMatch || !coordMatch) return [];

        const troops = {};
        cols.forEach(({ i, unit }) => {
          troops[unit] = parseInt(cells[i]?.textContent?.trim()) || 0;
        });

        const offCount = cols
          .filter(c => OFF_UNITS.has(c.unit))
          .reduce((s, c) => s + (troops[c.unit] || 0), 0);
        if (offCount < CONFIG.minOffTroops) return [];

        return [{
          vid:      parseInt(vidMatch[1]),
          name:     link.textContent.trim(),
          x:        parseInt(coordMatch[1]),
          y:        parseInt(coordMatch[2]),
          troops,
          offCount,
        }];
      });
  }

  // Collect report view IDs across N pages of the reports screen
  async function gatherReportLinks(pages) {
    const links = [];
    const seen  = new Set();

    for (let p = 0; p < pages; p++) {
      const html = await fetch(
        `${base}/game.php?village=${myVid}&screen=report&page=${p}`
      ).then(r => r.text());
      const doc  = new DOMParser().parseFromString(html, 'text/html');
      let found  = 0;

      doc.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (!href.includes('screen=report') && !href.includes('view=')) return;
        const m = href.match(/[?&]view=(\d+)/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        links.push({ id: m[1] });
        found++;
      });

      if (found === 0) break;
    }
    return links;
  }

  // Fetch one report and extract target village + defender troop counts
  async function parseReport(reportId) {
    const html = await fetch(
      `${base}/game.php?village=${myVid}&screen=report&view=${reportId}`
    ).then(r => r.text());
    const doc  = new DOMParser().parseFromString(html, 'text/html');

    // Find the target village: a link with coords that isn't one of ours
    let targetVid = null, targetName = '?', targetX = null, targetY = null;
    for (const a of doc.querySelectorAll('a[href]')) {
      const href       = a.getAttribute('href') || '';
      const vidMatch   = href.match(/village=(\d+)/);
      const coordMatch = a.textContent.match(/\((\d+)\|(\d+)\)/);
      if (!vidMatch || !coordMatch) continue;
      const vid = parseInt(vidMatch[1]);
      if (vid === myVid) continue;
      targetVid  = vid;
      targetName = a.textContent.replace(/\s*\(\d+\|\d+\).*/, '').trim() || '?';
      targetX    = parseInt(coordMatch[1]);
      targetY    = parseInt(coordMatch[2]);
      break;
    }
    if (!targetVid) return null;

    // Tables with unit images — we want the defender section (2nd table)
    const unitTables = [...doc.querySelectorAll('table')].filter(t =>
      t.querySelector('img[src*="unit_"]')
    );
    if (unitTables.length < 2) return null;

    const defTable = doc.querySelector('#attack_info_def')
                   || doc.querySelector('[id*="def"]')
                   || unitTables[1];

    const troops = parseUnitTable(defTable);
    if (!troops) return null;

    const totalTroops = Object.values(troops).reduce((s, n) => s + n, 0);
    const defCount    = Object.entries(troops)
      .filter(([u]) => DEF_UNITS.has(u))
      .reduce((s, [, n]) => s + n, 0);

    return {
      vid: targetVid, name: targetName,
      x: targetX,     y: targetY,
      totalTroops, defTroops: defCount, reportId,
    };
  }

  // Parse troop counts from a unit table (header row has unit images, next row has numbers)
  function parseUnitTable(table) {
    if (!table) return null;
    const rows = [...table.querySelectorAll('tr')];
    const hrow = rows.find(r => r.querySelector('img[src*="unit_"]'));
    if (!hrow) return null;

    const cols = [...hrow.querySelectorAll('td, th')].reduce((acc, th, i) => {
      const m = (th.querySelector('img')?.getAttribute('src') || '').match(/unit_(\w+)\./);
      if (m) acc.push({ i, unit: m[1] });
      return acc;
    }, []);
    if (!cols.length) return null;

    // First row after the header that contains digits
    const hi    = rows.indexOf(hrow);
    const cRow  = rows.slice(hi + 1).find(r => /\d/.test(r.textContent));
    if (!cRow) return null;
    const cells = [...cRow.querySelectorAll('td, th')];

    const troops = {};
    cols.forEach(({ i, unit }) => {
      const txt = (cells[i]?.textContent || '').trim().replace(/[.,\s]/g, '');
      if (txt === '?' || txt === '') return;
      const n = parseInt(txt);
      if (!isNaN(n)) troops[unit] = n;
    });
    return troops;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Modal UI
  // ─────────────────────────────────────────────────────────────────────────

  function renderModal(attacks, cfg) {
    const sendUnits = Object.entries(cfg.sendTroops);

    const $ov = $('<div>').css({
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.75)', zIndex: 99998, overflowY: 'auto',
    }).on('click', e => { if (e.target === $ov[0]) $ov.remove(); }).appendTo('body');

    const $box = $('<div>').css({
      background: '#f4e4bc', border: '3px solid #7d5a28', borderRadius: '4px',
      margin: '24px auto', padding: '16px',
      maxWidth: '98%', width: 'max-content', minWidth: '700px',
      fontFamily: 'Verdana,sans-serif', fontSize: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }).appendTo($ov);

    // Title bar
    const $hdr = $('<div>').css({
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: '10px',
    }).appendTo($box);
    $('<h3>').html(`⚔ Farm Scout &nbsp;·&nbsp; ${attacks.length} target(s) found`)
      .css({ margin: 0, color: '#5a3a10', fontFamily: 'serif', fontSize: '16px' })
      .appendTo($hdr);
    $('<button>').text('✕ Close')
      .css(btnCss('#7d5a28'))
      .on('click', () => $ov.remove())
      .appendTo($hdr);

    // Config strip: editable troop counts + delay
    const $strip = $('<div>').css({
      background: '#ecdfc8', borderRadius: '3px', padding: '8px 12px',
      marginBottom: '10px', display: 'flex', gap: '14px',
      flexWrap: 'wrap', alignItems: 'center', fontSize: '11px',
    }).appendTo($box);

    $('<b>').text('Troops per attack:').appendTo($strip);
    const $unitInputs = {};
    sendUnits.forEach(([unit, def]) => {
      const $lbl = $('<label>').css({ display: 'flex', alignItems: 'center', gap: '4px' }).appendTo($strip);
      $('<span>').text(UNIT_LABEL[unit] || unit).appendTo($lbl);
      const $inp = $('<input>').attr({ type: 'number', min: 0, max: 99999, value: def })
        .css({ width: '58px', padding: '2px 4px', border: '1px solid #a88050', borderRadius: '3px', fontFamily: 'inherit' });
      $unitInputs[unit] = $inp;
      $inp.appendTo($lbl);
    });
    $('<b>').text('Delay (ms):').css({ marginLeft: '6px' }).appendTo($strip);
    const $delayInp = $('<input>').attr({ type: 'number', min: 500, max: 30000, value: cfg.attackDelay })
      .css({ width: '64px', padding: '2px 4px', border: '1px solid #a88050', borderRadius: '3px', fontFamily: 'inherit' })
      .appendTo($strip);

    // Attack table
    const $tbl  = $('<table>').css({ borderCollapse: 'collapse', width: '100%' }).appendTo($box);
    const $head = $('<thead>').appendTo($tbl);
    const $hr   = $('<tr>').css({ background: '#c8a96e' }).appendTo($head);
    const th    = (txt, align = 'left') =>
      $('<th>').html(txt).css({ padding: '5px 8px', textAlign: align, whiteSpace: 'nowrap' });

    th('', 'center').css({ width: '24px' }).appendTo($hr);
    th('#', 'center').css({ width: '24px' }).appendTo($hr);
    th('Target').appendTo($hr);
    th('Coords', 'center').appendTo($hr);
    th('Seen (def)', 'center').appendTo($hr);
    th('Type', 'center').appendTo($hr);
    th('Source', 'center').appendTo($hr);
    th('Dist', 'center').appendTo($hr);
    th('Links').appendTo($hr);

    const $body = $('<tbody>').appendTo($tbl);
    const $cbs  = [];

    attacks.forEach((atk, i) => {
      const $row = $('<tr>').css({ background: i % 2 === 0 ? '#fdf5e6' : '#ecdfc8' }).appendTo($body);
      const $cb  = $('<input>').attr({ type: 'checkbox', checked: true });
      $cbs.push($cb);

      $('<td>').css({ textAlign: 'center', padding: '4px 6px' }).append($cb).appendTo($row);
      $('<td>').text(i + 1).css({ textAlign: 'center', padding: '3px 6px', color: '#888' }).appendTo($row);
      $('<td>').text(atk.name).css({
        padding: '3px 8px', whiteSpace: 'nowrap',
        maxWidth: '190px', overflow: 'hidden', textOverflow: 'ellipsis',
      }).appendTo($row);
      $('<td>').text(`(${atk.x}|${atk.y})`).css({
        padding: '3px 8px', textAlign: 'center', color: '#555', whiteSpace: 'nowrap',
      }).appendTo($row);
      $('<td>').text(
        atk.totalTroops === 0 ? '0' : `${atk.totalTroops} (${atk.defTroops} def)`
      ).css({
        padding: '3px 8px', textAlign: 'center',
        color: atk.totalTroops <= cfg.emptyThreshold ? '#2a7a2a' : '#7a4a1a',
      }).appendTo($row);
      $('<td>').css({ padding: '3px 8px', textAlign: 'center' }).append(
        $('<span>').text(atk.type).css({
          background: atk.type === 'empty' ? '#2a7a2a' : '#7a4a1a',
          color: '#fff', borderRadius: '3px', padding: '1px 6px',
          fontSize: '10px', whiteSpace: 'nowrap',
        })
      ).appendTo($row);
      $('<td>').text(atk.src.name).css({
        padding: '3px 8px', textAlign: 'center', color: '#444',
        whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis',
      }).appendTo($row);
      $('<td>').text(atk.dist).css({ padding: '3px 8px', textAlign: 'center' }).appendTo($row);

      const $lnks = $('<td>').css({ padding: '3px 8px', whiteSpace: 'nowrap' }).appendTo($row);
      $('<a>').attr({
        href: `${base}/game.php?village=${atk.src.vid}&screen=place&target=${atk.vid}`,
        target: '_blank',
      }).text('⚔ Rally').css({
        color: '#7d5a28', marginRight: '6px', textDecoration: 'none', fontSize: '11px',
      }).appendTo($lnks);
      $('<a>').attr({
        href: `${base}/game.php?village=${myVid}&screen=report&view=${atk.reportId}`,
        target: '_blank',
      }).text('📋 Report').css({
        color: '#7d5a28', textDecoration: 'none', fontSize: '11px',
      }).appendTo($lnks);
    });

    // Footer: select helpers + send button
    const $ft = $('<div>').css({
      marginTop: '12px', display: 'flex', gap: '8px',
      alignItems: 'center', flexWrap: 'wrap',
    }).appendTo($box);

    $('<button>').text('✓ All').css(btnCss('#5a8a3a'))
      .on('click', () => $cbs.forEach($c => $c.prop('checked', true))).appendTo($ft);
    $('<button>').text('✗ None').css(btnCss('#8a6a3a'))
      .on('click', () => $cbs.forEach($c => $c.prop('checked', false))).appendTo($ft);

    const $send = $('<button>').text(`⚔ Send ${attacks.length} Attack(s)`)
      .css({ ...btnCss('#8a2a2a'), marginLeft: 'auto', fontWeight: 'bold' })
      .appendTo($ft);

    const $prog = $('<div>').css({
      width: '100%', marginTop: '6px', fontSize: '11px', color: '#555', minHeight: '16px',
    }).appendTo($ft);

    // Send handler
    $send.on('click', async () => {
      const queue   = attacks.filter((_, i) => $cbs[i].prop('checked'));
      if (!queue.length) { $prog.text('No attacks selected.'); return; }

      const delayMs = parseInt($delayInp.val()) || cfg.attackDelay;
      const troops  = Object.fromEntries(
        Object.entries($unitInputs).map(([u, $i]) => [u, parseInt($i.val()) || 0])
      );

      $send.prop('disabled', true).text('Sending…').css({ background: '#666' });
      let ok = 0, fail = 0;

      for (const atk of queue) {
        $prog.html(
          `Sending ${ok + fail + 1}/${queue.length}: ` +
          `<b>${atk.name}</b> from <b>${atk.src.name}</b>…`
        );
        try {
          await sendAttack(atk.src.vid, atk.vid, troops);
          ok++;
        } catch (e) {
          fail++;
          console.warn('[TW Attack] failed:', atk.name, '—', e.message);
        }
        if (ok + fail < queue.length) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }

      $prog.html(
        `<span style="color:${fail ? '#a04020' : '#2a7a2a'}">` +
        `Done — ${ok} sent${fail ? `, ${fail} failed (see console)` : ''}.` +
        `</span>`
      );
      $send.text('✓ Done').css({ background: '#3a7a3a' }).prop('disabled', false);
    });
  }

  function btnCss(bg) {
    return {
      background: bg, color: '#fff', border: 'none',
      borderRadius: '3px', padding: '5px 10px', cursor: 'pointer',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2-step attack send
  // ─────────────────────────────────────────────────────────────────────────

  async function sendAttack(srcVid, targetVid, troops) {
    const url = `${base}/game.php?village=${srcVid}&screen=place`;

    // Step 1: POST to rally point to get the confirmation page
    const p1 = new URLSearchParams({
      target: targetVid,
      type:   'attack',
      attack: 'Attack',
      h:      game_data.csrf,
    });
    for (const [unit, n] of Object.entries(troops)) {
      if (n > 0) p1.set(`unit_${unit}`, n);
    }

    const r1   = await fetch(url, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:        p1.toString(),
      credentials: 'include',
    });
    const doc1 = new DOMParser().parseFromString(await r1.text(), 'text/html');

    const ch = doc1.querySelector('input[name="ch"]')?.value;
    if (!ch) throw new Error(`No confirmation token — check troop counts (${srcVid} → ${targetVid})`);

    // Step 2: POST confirmation form with the ch token
    const form = doc1.querySelector('form');
    if (!form) throw new Error('No confirmation form found');

    const p2 = new URLSearchParams();
    form.querySelectorAll('input').forEach(inp => {
      if (inp.name) p2.set(inp.name, inp.value || '');
    });
    const btn = form.querySelector('input[type="submit"]');
    if (btn?.name) p2.set(btn.name, btn.value || '');

    await fetch(url, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:        p2.toString(),
      credentials: 'include',
    });
  }

})();
