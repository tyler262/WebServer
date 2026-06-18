/*
 * FANG TARGET SCANNER
 * Scans your attack & scout reports for villages with low / no defense.
 * Run from: Reports page  (game.php?screen=report)
 *
 * Targets are saved to localStorage and read by fangSender.js.
 */

if (!window.location.href.includes('screen=report')) {
    UI.ErrorMessage('Run from the Reports page (screen=report)');
    throw new Error('wrong page');
}

const FS_CACHE_KEY = game_data.world + '_fangTargets';

$('#fs_modal').remove();

let fsCache = JSON.parse(localStorage.getItem(FS_CACHE_KEY) || '[]');

/* ── UI ────────────────────────────────────────────────────────────── */

$(`
<style>
  #fs_modal * { box-sizing: border-box; margin: 0; padding: 0; }
  #fs_modal {
    position: fixed; top: 80px; left: 30px; width: 460px; z-index: 9999;
    background: #202225; border: 1px solid #40444b; border-radius: 12px;
    padding: 22px; color: #dcddde; font-family: Arial, sans-serif; font-size: 13px;
    box-shadow: rgba(0,0,0,.55) 3px 3px 16px;
    display: flex; flex-direction: column; gap: 12px;
    animation: fs-in 0.3s ease-out;
  }
  @keyframes fs-in { from { opacity:0; transform:scale(.9) } to { opacity:1; transform:scale(1) } }
  #fs_modal h3 {
    text-align: center; background: #2b2d31; padding: 10px 14px;
    border-radius: 8px; color: #fff; cursor: move; font-size: 14px;
  }
  .fs-row { display: flex; align-items: center; gap: 10px; }
  .fs-lbl { flex: 1; font-size: 12px; color: #b9bbbe; }
  #fs_modal input[type=number] {
    width: 75px; background: #40444b; border: none; border-radius: 6px;
    color: #fff; padding: 5px 8px; font-size: 13px; text-align: center;
  }
  #fs_modal input[type=number]:focus { outline: 2px solid #7289da; }
  .fs-btn {
    width: 100%; padding: 9px; border: none; border-radius: 8px;
    cursor: pointer; font-size: 13px; font-weight: bold; color: #fff; transition: filter .15s;
  }
  .fs-btn:hover { filter: brightness(1.15); }
  .fs-btn-scan  { background: #7289da; }
  .fs-btn-clear { background: #f04747; }
  #fs_status {
    text-align: center; font-size: 12px; color: #b9bbbe;
    background: #2b2d31; padding: 7px 10px; border-radius: 6px; min-height: 30px;
  }
  #fs_scroll { max-height: 220px; overflow-y: auto; }
  #fs_modal table { width: 100%; border-collapse: collapse; font-size: 12px; }
  #fs_modal th {
    background: #2b2d31; color: #fff; padding: 6px 4px;
    text-align: center; position: sticky; top: 0;
  }
  #fs_modal td { padding: 5px 4px; text-align: center; border-bottom: 1px solid #2b2d31; }
  #fs_modal tbody tr:hover { background: #2b2d31; }
  .fs-rm {
    background: #f04747; color: #fff; border: none; border-radius: 4px;
    padding: 2px 7px; cursor: pointer; font-size: 11px;
  }
  #fs_close {
    position: absolute; top: -9px; right: -9px;
    background: #f04747; color: #fff; border: none; border-radius: 50%;
    width: 26px; height: 26px; cursor: pointer; font-size: 16px; line-height: 26px;
  }
  .fs-badge {
    background: #43b581; border-radius: 10px; padding: 1px 8px; font-size: 12px; margin-left: 6px;
  }
  .fs-mode { display: flex; gap: 6px; }
  .fs-mode label { flex: 1; display: flex; align-items: center; gap: 5px; font-size: 12px; color: #b9bbbe; cursor: pointer; }
</style>

<div id="fs_modal">
  <button id="fs_close" onclick="$('#fs_modal').remove()">×</button>

  <h3 id="fs_drag">⚔ Fang Target Scanner <span class="fs-badge" id="fs_badge">${fsCache.length}</span></h3>

  <!-- Scan modes -->
  <div class="fs-row fs-mode">
    <label><input type="checkbox" id="fs_chk_attack" checked> Attack reports</label>
    <label><input type="checkbox" id="fs_chk_scout"  checked> Scout reports</label>
  </div>

  <div class="fs-row">
    <span class="fs-lbl">Max defender troops (sum)</span>
    <input type="number" id="fs_max_def"  value="200" min="0">
  </div>
  <div class="fs-row">
    <span class="fs-lbl">Max report age (days)</span>
    <input type="number" id="fs_max_days" value="3"   min="1" max="60">
  </div>
  <div class="fs-row">
    <span class="fs-lbl">Pages to scan per mode</span>
    <input type="number" id="fs_pages"    value="1"   min="1" max="10">
  </div>

  <button class="fs-btn fs-btn-scan" onclick="FangScanner.scan()">▶ Scan Reports</button>

  <div id="fs_status">Ready — ${fsCache.length} target(s) in cache</div>

  <div id="fs_scroll">
    <table>
      <thead>
        <tr>
          <th style="text-align:left">Village</th>
          <th>Def</th><th>Wall</th><th>Date</th><th></th>
        </tr>
      </thead>
      <tbody id="fs_tbody"></tbody>
    </table>
  </div>

  <button class="fs-btn fs-btn-clear" onclick="FangScanner.clearCache()">🗑 Clear All Targets</button>
</div>
`).appendTo('body').eq(0).draggable({ handle: '#fs_drag' });

/* ── Scanner logic ─────────────────────────────────────────────────── */

window.FangScanner = {
    cache: fsCache,

    async scan() {
        const maxDef  = +$('#fs_max_def').val()  || 200;
        const maxDays = +$('#fs_max_days').val()  || 3;
        const pages   = Math.min(+$('#fs_pages').val() || 1, 10);
        const cutoff  = Date.now() - maxDays * 86400000;

        const modes = [];
        if ($('#fs_chk_attack').is(':checked')) modes.push('attack');
        if ($('#fs_chk_scout').is(':checked'))  modes.push('scouting');
        if (!modes.length) { this.setStatus('Select at least one report mode'); return; }

        let added = 0;

        for (const mode of modes) {
            for (let p = 0; p < pages; p++) {
                this.setStatus(`Fetching ${mode} reports page ${p + 1}/${pages}…`);

                let pageHtml;
                try {
                    pageHtml = await $.get(`${game_data.link_base_pure}report&mode=${mode}&page=${p}`);
                } catch (e) {
                    this.setStatus(`Failed to load ${mode} page ${p + 1}`);
                    break;
                }

                const links = this.extractLinks($(pageHtml), cutoff);
                if (!links.length) break; // no more reports in this date range

                for (let li = 0; li < links.length; li++) {
                    this.setStatus(`${mode} p${p + 1}: checking ${li + 1}/${links.length}…`);
                    await this.sleep(350); // be polite to the server

                    let repHtml;
                    try { repHtml = await $.get(links[li]); }
                    catch (e) { continue; }

                    const target = this.parseReport($(repHtml.toString()), maxDef);
                    if (!target) continue;
                    if (this.cache.some(t => t.coords === target.coords)) continue; // dedupe

                    this.cache.push(target);
                    this.save();
                    added++;
                    this.render();
                }
            }
        }

        this.setStatus(`Scan complete — ${added} new target(s). Total: ${this.cache.length}`);
    },

    extractLinks($page, cutoff) {
        const links = [];
        $page.find('#report_list tbody tr').each((_, row) => {
            const $row = $(row);
            const href = $row.find('a[href*="view="]').attr('href');
            if (!href) return;

            // Try to parse date from the last cell to skip old reports
            const dateText = $row.find('td').last().text().trim();
            // TW dates vary by language, so we do a best-effort parse
            // If we can't parse, include the report anyway
            const parsed = Date.parse(dateText.replace(/\./g, '/'));
            if (!isNaN(parsed) && parsed < cutoff) return;

            links.push(href);
        });
        return links;
    },

    parseReport($doc, maxDef) {
        /* ── Defender coords ─────────────────────────────────── */
        // h2 title is usually "AttackerVillage (X1|Y1) on DefenderVillage (X2|Y2)"
        const titleText = $doc.find('h2').first().text();
        const allCoords = titleText.match(/\d{1,3}\|\d{1,3}/g) || [];

        // Take the second coord match (defender). Fall back to first if only one.
        let defCoords = allCoords[1] || allCoords[0];

        // Final fallback: scan whole page text for two coord patterns
        if (!defCoords) {
            const bodyCoords = $doc.text().match(/\d{1,3}\|\d{1,3}/g) || [];
            defCoords = bodyCoords[1] || bodyCoords[0];
        }
        if (!defCoords) return null;

        const [x, y] = defCoords.split('|');

        /* ── Defender village name ───────────────────────────── */
        let name = defCoords;
        // Try dedicated header element first
        const $defHdr = $doc.find('#attack_info_def_header, .report-def-header');
        if ($defHdr.length) {
            name = $defHdr.text().replace(/Defender.*?:/i, '').replace(/\(.*?\)/g, '').trim().substring(0, 32);
        } else {
            const vsMatch = titleText.match(/(?:on|vs|→)\s+(.+?)\s*\(\d{1,3}\|\d{1,3}\)/i);
            if (vsMatch) name = vsMatch[1].trim().substring(0, 32);
        }

        /* ── Defender troop count ────────────────────────────── */
        let defPop = 0;

        // Primary: look inside #attack_info_def for the first all-numeric table row
        const $defSection = $doc.find('#attack_info_def');
        if ($defSection.length) {
            defPop = this.sumFirstNumericRow($defSection);
        }

        // Fallback: second .vis table on the page is usually the defender
        if (defPop === 0) {
            const $vis = $doc.find('table.vis');
            if ($vis.length >= 2) defPop = this.sumFirstNumericRow($vis.eq(1));
        }

        if (defPop > maxDef) return null;

        /* ── Wall level ──────────────────────────────────────── */
        let wallLevel = '?';
        // Wall info often appears in a buildings table row
        $doc.find('td, th').each((_, el) => {
            const text = $(el).text();
            const m = text.match(/wall\s*(?:level)?\s*(\d+)/i) || text.match(/(\d+)\s*wall/i);
            if (m) { wallLevel = m[1]; return false; }
        });

        /* ── Report date ─────────────────────────────────────── */
        const date = $doc.find('.attack-date, .report-date, #attack_date').first().text().trim()
                  || $doc.find('td').filter((_, el) => /\d{2}:\d{2}:\d{2}/.test($(el).text())).first().text().trim()
                  || '—';

        return { coords: defCoords, x, y, name: name || defCoords, defPop, wallLevel, date };
    },

    sumFirstNumericRow($container) {
        let total = 0;
        $container.find('tr').each((_, row) => {
            const $cells = $(row).find('td');
            if (!$cells.length) return;
            let sum = 0, allNumeric = true;
            $cells.each((_, cell) => {
                const v = $(cell).text().trim();
                if (!/^\d+$/.test(v)) { allNumeric = false; return false; }
                sum += +v;
            });
            if (allNumeric) { total = sum; return false; } // break — first numeric row only
        });
        return total;
    },

    render() {
        const $tbody = $('#fs_tbody');
        $tbody.empty();
        $('#fs_badge').text(this.cache.length);

        if (!this.cache.length) {
            $tbody.html('<tr><td colspan="5" style="color:#666;padding:12px;text-align:center">No targets cached yet</td></tr>');
            return;
        }

        this.cache.forEach((t, i) => {
            $tbody.append(`
                <tr>
                  <td style="text-align:left;padding-left:8px">
                    ${t.name}<br><small style="color:#888">${t.coords}</small>
                  </td>
                  <td>${t.defPop}</td>
                  <td>${t.wallLevel}</td>
                  <td style="font-size:11px;color:#888;white-space:nowrap">${t.date}</td>
                  <td><button class="fs-rm" onclick="FangScanner.remove(${i})">✕</button></td>
                </tr>`);
        });
    },

    remove(i) {
        this.cache.splice(i, 1);
        this.save();
        this.render();
    },

    clearCache() {
        if (!confirm(`Clear all ${this.cache.length} cached fang target(s)?`)) return;
        this.cache = [];
        this.save();
        this.render();
        this.setStatus('Cache cleared');
    },

    save()       { localStorage.setItem(FS_CACHE_KEY, JSON.stringify(this.cache)); },
    setStatus(m) { $('#fs_status').text(m); },
    sleep(ms)    { return new Promise(r => setTimeout(r, ms)); },
};

FangScanner.render();
