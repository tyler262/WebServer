// ─────────────────────────────────────────────────────────────────────────────
// TW Troops — shows troop counts across all your villages
//
// Add to TW via Edit Links:
//   javascript:$.getScript('http://192.168.1.4:8888/tw/troops.js');
//
// Shows troops currently AT HOME in each village (not troops out on missions).
// ─────────────────────────────────────────────────────────────────────────────

(async function () {

  const PI_URL = 'http://192.168.1.4:8888';

  if (typeof game_data === 'undefined') {
    alert('Run from inside Tribal Wars.');
    return;
  }

  // ── loading indicator ────────────────────────────────────────────────────────
  const $loading = $('<div>').css({
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%,-50%)',
    background: '#1a1a1a', color: '#fff', padding: '16px 28px',
    borderRadius: '6px', zIndex: 99999, fontFamily: 'Verdana,sans-serif',
    fontSize: '13px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  }).text('⏳ Loading troops…').appendTo('body');

  try {
    const world     = game_data.world;
    const villageId = game_data.village.id;
    const base      = `https://${world}.tribalwars.net`;

    // Fetch the troops overview — page=-1 returns all villages at once
    const res  = await fetch(
      `${base}/game.php?village=${villageId}&screen=overview_villages&mode=troops&type=all&page=-1`
    );
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');

    // ── find the troops table ─────────────────────────────────────────────────
    const table = doc.querySelector('#troops_list')
               || doc.querySelector('table.overview_table')
               || [...doc.querySelectorAll('table')].find(t =>
                    t.querySelector('img[src*="unit_"]')
                  );

    if (!table) {
      $loading.text('⚠ Could not find troops table. Do you have multiple villages?');
      setTimeout(() => $loading.remove(), 4000);
      return;
    }

    // ── parse unit columns from header ────────────────────────────────────────
    const headerCells = [...(
      table.querySelector('thead tr') ||
      table.querySelector('tr')
    ).querySelectorAll('th, td')];

    const unitCols = [];
    headerCells.forEach((th, i) => {
      const img = th.querySelector('img');
      if (!img) return;
      const m = (img.src || img.getAttribute('src') || '').match(/unit_(\w+)\./);
      if (m) unitCols.push({ index: i, unit: m[1] });
    });

    // Friendly display names
    const UNIT_NAMES = {
      spear: 'Spear', sword: 'Sword', axe: 'Axe', archer: 'Archer',
      spy: 'Scout', light: 'LC', marcher: 'MA', heavy: 'HC',
      ram: 'Ram', catapult: 'Cat', knight: 'Paladin', snob: 'Noble',
    };

    // ── parse village rows ────────────────────────────────────────────────────
    const villages = [];
    const bodyRows = [...(table.querySelector('tbody') || table)
      .querySelectorAll('tr')]
      .filter(r => r.querySelector('a'));

    for (const row of bodyRows) {
      const cells    = [...row.querySelectorAll('td')];
      const nameCell = cells[0];
      if (!nameCell) continue;

      const link       = nameCell.querySelector('a');
      const name       = link?.textContent?.trim() || '?';
      const coordMatch = nameCell.textContent.match(/\((\d+)\|(\d+)\)/);
      const x          = coordMatch ? parseInt(coordMatch[1]) : null;
      const y          = coordMatch ? parseInt(coordMatch[2]) : null;

      const troops = {};
      unitCols.forEach(({ index, unit }) => {
        troops[unit] = parseInt(cells[index]?.textContent?.trim()) || 0;
      });

      villages.push({ name, x, y, troops });
    }

    if (villages.length === 0) {
      $loading.text('⚠ No village rows found in table.');
      setTimeout(() => $loading.remove(), 4000);
      return;
    }

    $loading.remove();

    // ── totals ────────────────────────────────────────────────────────────────
    const units  = unitCols.map(c => c.unit);
    const totals = Object.fromEntries(units.map(u => [u, 0]));
    villages.forEach(v => units.forEach(u => { totals[u] += v.troops[u] || 0; }));

    // ── build overlay ─────────────────────────────────────────────────────────
    const $overlay = $('<div>').css({
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.75)', zIndex: 99998, overflowY: 'auto',
    }).on('click', function (e) { if (e.target === this) $overlay.remove(); });

    const $modal = $('<div>').css({
      background: '#f4e4bc', border: '3px solid #7d5a28', borderRadius: '4px',
      margin: '30px auto', maxWidth: '98%', width: 'max-content',
      padding: '16px', fontFamily: 'Verdana,sans-serif', fontSize: '12px',
      position: 'relative', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }).appendTo($overlay);

    // Header row
    const $header = $('<div>').css({
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '12px',
    }).appendTo($modal);

    $('<h3>').html(
      `Troops at Home &nbsp;·&nbsp; ${villages.length} villages`
    ).css({ margin: 0, color: '#5a3a10', fontFamily: 'serif', fontSize: '16px' })
     .appendTo($header);

    const $btnRow = $('<div>').css({ display: 'flex', gap: '8px' }).appendTo($header);

    $('<button>').text('💾 Save to Pi').css({
      background: '#4a7a3a', color: '#fff', border: 'none',
      borderRadius: '3px', padding: '5px 12px', cursor: 'pointer',
    }).on('click', async function () {
      $(this).text('Saving…').prop('disabled', true);
      try {
        const r = await fetch(`${PI_URL}/api/tw/troops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ synced_at: new Date().toISOString(), villages, totals }),
        });
        $(this).text(r.ok ? '✓ Saved' : '✗ Failed');
      } catch (e) {
        $(this).text('✗ ' + e.message);
      }
    }).appendTo($btnRow);

    $('<button>').text('✕ Close').css({
      background: '#7d5a28', color: '#fff', border: 'none',
      borderRadius: '3px', padding: '5px 12px', cursor: 'pointer',
    }).on('click', () => $overlay.remove()).appendTo($btnRow);

    // ── table ─────────────────────────────────────────────────────────────────
    const $table = $('<table>').css({
      borderCollapse: 'collapse', width: '100%',
    }).appendTo($modal);

    // Head
    const $thead = $('<thead>').appendTo($table);
    const $hrow  = $('<tr>').css({ background: '#c8a96e' }).appendTo($thead);
    $('<th>').text('Village').css({ padding: '5px 10px', textAlign: 'left', whiteSpace: 'nowrap' }).appendTo($hrow);
    $('<th>').text('Coords').css({ padding: '5px 8px', textAlign: 'center' }).appendTo($hrow);
    units.forEach(u => {
      $('<th>').text(UNIT_NAMES[u] || u).css({
        padding: '5px 8px', textAlign: 'center', whiteSpace: 'nowrap',
      }).appendTo($hrow);
    });

    // Body
    const $tbody = $('<tbody>').appendTo($table);
    villages.forEach((v, i) => {
      const $row = $('<tr>').css({
        background: i % 2 === 0 ? '#fdf5e6' : '#ecdfc8',
      }).appendTo($tbody);

      $('<td>').text(v.name).css({ padding: '3px 10px', whiteSpace: 'nowrap' }).appendTo($row);
      $('<td>').text(v.x != null ? `(${v.x}|${v.y})` : '?').css({
        padding: '3px 8px', textAlign: 'center', whiteSpace: 'nowrap', color: '#666',
      }).appendTo($row);

      units.forEach(u => {
        const val = v.troops[u] || 0;
        $('<td>').text(val > 0 ? val.toLocaleString() : '–').css({
          padding: '3px 8px', textAlign: 'center',
          color: val > 0 ? '#2a2a2a' : '#bbb',
          fontWeight: u === 'snob' && val > 0 ? 'bold' : 'normal',
        }).appendTo($row);
      });
    });

    // Totals row
    const $trow = $('<tr>').css({
      background: '#a07840', color: '#fff', fontWeight: 'bold',
    }).appendTo($tbody);
    $('<td>').text('TOTAL').css({ padding: '5px 10px' }).appendTo($trow);
    $('<td>').appendTo($trow);
    units.forEach(u => {
      $('<td>').text(totals[u] > 0 ? totals[u].toLocaleString() : '–').css({
        padding: '3px 8px', textAlign: 'center',
      }).appendTo($trow);
    });

    $('body').append($overlay);

  } catch (e) {
    $loading.text('✗ Error: ' + e.message);
    setTimeout(() => $loading.remove(), 5000);
  }

})();
