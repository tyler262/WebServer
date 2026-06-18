/*
 * FANG SENDER
 * Reads cached targets from fangScanner.js and fills the Rally Point
 * attack form with a configurable fang composition.
 *
 * Run from: Rally Point (game.php?screen=place)
 *
 * HOW IT WORKS:
 *   1. Script detects which "phase" the place screen is in.
 *   2. Coord phase  — shows target list; clicking Attack fills x/y and
 *      submits. A MutationObserver watches for the troop form to appear
 *      and fills troops automatically (no re-run needed in most worlds).
 *   3. Troop phase  — if the troop form is already visible (e.g. after a
 *      page reload), the script reads the pending target from sessionStorage
 *      and fills troops immediately.
 *
 * After each attack the target is removed from the cache automatically.
 */

if (!window.location.href.includes('screen=place')) {
    UI.ErrorMessage('Run from the Rally Point (screen=place)');
    throw new Error('wrong page');
}

const FD_CACHE_KEY   = game_data.world + '_fangTargets';
const FD_PENDING_KEY = game_data.world + '_fangPending';

/* ── Step 2 (troop form already visible on page load) ───────────────
   Handles worlds where coord submission causes a full page reload.    */
const fdPending      = JSON.parse(sessionStorage.getItem(FD_PENDING_KEY) || 'null');
const fdTroopVisible = !!$('input[name="light"], input[name="catapult"]').length;

if (fdPending && fdTroopVisible) {
    _fdFillTroops(fdPending);
    sessionStorage.removeItem(FD_PENDING_KEY);
    _fdRemoveFromCache(fdPending.coords);
    throw new Error('fang filled');  // stop — no need to build the UI
}

/* ── Helpers (used by both Step 1 and Step 2) ───────────────────── */

function _fdFillTroops(comp) {
    // Zero all unit inputs first to avoid accidental inclusions
    const unitNames = /^(spear|sword|axe|archer|spy|light|marcher|heavy|ram|catapult|knight|snob)$/;
    $('input[name]').filter((_, el) => unitNames.test(el.name)).val(0);

    if (comp.light)    $('input[name="light"]').val(comp.light);
    if (comp.catapult) $('input[name="catapult"]').val(comp.catapult);
    if (comp.spy)      $('input[name="spy"]').val(comp.spy);

    // Set catapult target building — match option text (e.g. "Wall (Lv 4)")
    const catTarget = comp.catTarget || 'wall';
    const $bldSelect = $('select[name="building"]');
    if ($bldSelect.length) {
        $bldSelect.find('option').each((_, opt) => {
            if ($(opt).text().toLowerCase().includes(catTarget.toLowerCase())) {
                $(opt).prop('selected', true);
                $bldSelect.trigger('change');
                return false;
            }
        });
    }

    UI.SuccessMessage(
        `Fang loaded: ${comp.name} (${comp.coords}) — ` +
        `${comp.light}L / ${comp.catapult}C / ${comp.spy}spy → ${catTarget}`
    );
}

function _fdRemoveFromCache(coords) {
    const cache = JSON.parse(localStorage.getItem(FD_CACHE_KEY) || '[]')
        .filter(t => t.coords !== coords);
    localStorage.setItem(FD_CACHE_KEY, JSON.stringify(cache));
}

/* ── Load cache & build UI ─────────────────────────────────────── */

$('#fd_modal').remove();

let fdCache = JSON.parse(localStorage.getItem(FD_CACHE_KEY) || '[]');

// Restore last-used troop amounts
const fdDefaultLight = +(localStorage.getItem('fd_light')     || 150);
const fdDefaultCat   = +(localStorage.getItem('fd_catapult')  || 150);
const fdDefaultSpy   = +(localStorage.getItem('fd_spy')       || 5);
const fdDefaultTgt   =   localStorage.getItem('fd_catTarget') || 'wall';

$(`
<style>
  #fd_modal * { box-sizing: border-box; margin: 0; padding: 0; }
  #fd_modal {
    position: fixed; top: 80px; right: 30px; width: 400px; z-index: 9999;
    background: #202225; border: 1px solid #40444b; border-radius: 12px;
    padding: 22px; color: #dcddde; font-family: Arial, sans-serif; font-size: 13px;
    box-shadow: rgba(0,0,0,.55) 3px 3px 16px;
    display: flex; flex-direction: column; gap: 12px;
    animation: fd-in 0.3s ease-out;
  }
  @keyframes fd-in { from { opacity:0; transform:scale(.9) } to { opacity:1; transform:scale(1) } }
  #fd_modal h3 {
    text-align: center; background: #2b2d31; padding: 10px 14px;
    border-radius: 8px; color: #fff; cursor: move; font-size: 14px;
  }
  .fd-row { display: flex; align-items: center; gap: 10px; }
  .fd-lbl { flex: 1; font-size: 12px; color: #b9bbbe; }
  #fd_modal input[type=number] {
    width: 72px; background: #40444b; border: none; border-radius: 6px;
    color: #fff; padding: 5px 8px; font-size: 13px; text-align: center;
  }
  #fd_modal input[type=number]:focus { outline: 2px solid #7289da; }
  #fd_modal input[type=text] {
    flex: 1; background: #40444b; border: none; border-radius: 6px;
    color: #fff; padding: 5px 8px; font-size: 13px;
  }
  #fd_modal input[type=text]:focus { outline: 2px solid #7289da; }
  #fd_status {
    text-align: center; font-size: 12px; color: #b9bbbe;
    background: #2b2d31; padding: 7px 10px; border-radius: 6px;
  }
  #fd_scroll { max-height: 260px; overflow-y: auto; }
  #fd_modal table { width: 100%; border-collapse: collapse; font-size: 12px; }
  #fd_modal th {
    background: #2b2d31; color: #fff; padding: 6px 4px;
    text-align: center; position: sticky; top: 0;
  }
  #fd_modal td { padding: 5px 4px; text-align: center; border-bottom: 1px solid #2b2d31; }
  #fd_modal tbody tr:hover { background: #2b2d31; }
  .fd-atk-btn {
    background: #43b581; color: #fff; border: none; border-radius: 5px;
    padding: 4px 9px; cursor: pointer; font-size: 12px; font-weight: bold;
  }
  .fd-atk-btn:hover { background: #3a9e71; }
  .fd-rm-btn {
    background: #f04747; color: #fff; border: none; border-radius: 4px;
    padding: 3px 7px; cursor: pointer; font-size: 11px;
  }
  #fd_close {
    position: absolute; top: -9px; right: -9px;
    background: #f04747; color: #fff; border: none; border-radius: 50%;
    width: 26px; height: 26px; cursor: pointer; font-size: 16px; line-height: 26px;
  }
  .fd-badge { background: #7289da; border-radius: 10px; padding: 1px 8px; font-size: 12px; margin-left: 6px; }
  #fd_modal hr { border: none; border-top: 1px solid #40444b; }
</style>

<div id="fd_modal">
  <button id="fd_close" onclick="$('#fd_modal').remove()">×</button>

  <h3 id="fd_drag">⚔ Fang Sender <span class="fd-badge" id="fd_badge">${fdCache.length}</span></h3>

  <!-- Fang composition -->
  <div class="fd-row">
    <span class="fd-lbl">🐴 Light cavalry</span>
    <input type="number" id="fd_light" value="${fdDefaultLight}" min="0">
  </div>
  <div class="fd-row">
    <span class="fd-lbl">💥 Catapults</span>
    <input type="number" id="fd_cat"   value="${fdDefaultCat}"   min="0">
  </div>
  <div class="fd-row">
    <span class="fd-lbl">🕵️ Spies</span>
    <input type="number" id="fd_spy"   value="${fdDefaultSpy}"   min="0">
  </div>
  <div class="fd-row">
    <span class="fd-lbl">🏰 Cat target (building name)</span>
    <input type="text"   id="fd_cattgt" value="${fdDefaultTgt}" placeholder="wall">
  </div>

  <hr>

  <div id="fd_status">
    ${fdCache.length ? `${fdCache.length} target(s) ready` : 'No targets — run Fang Scanner on the Reports page first'}
  </div>

  <div id="fd_scroll">
    <table>
      <thead>
        <tr>
          <th style="text-align:left;padding-left:8px">Village</th>
          <th>Def</th><th>Wall</th><th>Date</th><th></th><th></th>
        </tr>
      </thead>
      <tbody id="fd_tbody"></tbody>
    </table>
  </div>
</div>
`).appendTo('body').eq(0).draggable({ handle: '#fd_drag' });

/* Persist troop amounts whenever they change */
$('#fd_light, #fd_cat, #fd_spy, #fd_cattgt').on('change input', () => {
    localStorage.setItem('fd_light',     $('#fd_light').val());
    localStorage.setItem('fd_catapult',  $('#fd_cat').val());
    localStorage.setItem('fd_spy',       $('#fd_spy').val());
    localStorage.setItem('fd_catTarget', $('#fd_cattgt').val());
});

/* ── FangSender object ─────────────────────────────────────────── */

window.FangSender = {
    cache: fdCache,

    getComp() {
        return {
            light:     +$('#fd_light').val()  || 150,
            catapult:  +$('#fd_cat').val()    || 150,
            spy:       +$('#fd_spy').val()    || 5,
            catTarget:  $('#fd_cattgt').val() || 'wall',
        };
    },

    attack(i) {
        const target = this.cache[i];
        if (!target) return;
        const comp = { ...target, ...this.getComp() };

        /* Case A — coord + troop inputs both on page (single-page worlds) */
        if ($('input[name="x"]').length && fdTroopVisible) {
            $('input[name="x"]').val(target.x);
            $('input[name="y"]').val(target.y);
            _fdFillTroops(comp);
            this.markSent(i);
            return;
        }

        /* Case B — troop form already visible (re-run after page reload) */
        if (fdTroopVisible) {
            _fdFillTroops(comp);
            this.markSent(i);
            return;
        }

        /* Case C — only coord inputs visible; fill them, submit, watch for troop form */
        const $xInput = $('input[name="x"]');
        const $yInput = $('input[name="y"]');

        if ($xInput.length) {
            $xInput.val(target.x);
            $yInput.val(target.y);

            // Save pending fill so a page-reload fallback still works
            sessionStorage.setItem(FD_PENDING_KEY, JSON.stringify(comp));

            // Watch for troop inputs to appear (AJAX / dynamic worlds)
            const obs = new MutationObserver(() => {
                if ($('input[name="light"]').length) {
                    obs.disconnect();
                    clearTimeout(obsTimeout);
                    setTimeout(() => {
                        _fdFillTroops(comp);
                        sessionStorage.removeItem(FD_PENDING_KEY);
                        this.markSent(i);
                    }, 150);
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });

            // Timeout: if troop form never appears via AJAX, the page reload
            // will trigger the Step 2 path at the top of this file.
            const obsTimeout = setTimeout(() => obs.disconnect(), 5000);

            // Submit the coord form
            const $coordForm = $xInput.closest('form');
            $coordForm.find('input[type="submit"]').first().click() ||
            $coordForm.submit();

            this.setStatus(`Navigating to attack form for ${target.name}…`);
        } else {
            /* Fallback: no coord input found — navigate with query params */
            sessionStorage.setItem(FD_PENDING_KEY, JSON.stringify(comp));
            window.location.href = `${game_data.link_base_pure}place&x=${target.x}&y=${target.y}`;
        }
    },

    markSent(i) {
        const coords = this.cache[i] && this.cache[i].coords;
        this.cache.splice(i, 1);
        localStorage.setItem(FD_CACHE_KEY, JSON.stringify(this.cache));
        this.render();
        this.setStatus(`Sent to ${coords} — ${this.cache.length} target(s) remaining`);
    },

    remove(i) {
        this.cache.splice(i, 1);
        localStorage.setItem(FD_CACHE_KEY, JSON.stringify(this.cache));
        this.render();
    },

    render() {
        const $tbody = $('#fd_tbody');
        $tbody.empty();
        $('#fd_badge').text(this.cache.length);

        if (!this.cache.length) {
            $tbody.html('<tr><td colspan="6" style="color:#666;padding:12px;text-align:center">No cached targets</td></tr>');
            this.setStatus('Cache empty — run Fang Scanner on the Reports page');
            return;
        }

        this.cache.forEach((t, i) => {
            $tbody.append(`
                <tr>
                  <td style="text-align:left;padding-left:8px">
                    ${t.name}<br><small style="color:#888">${t.coords}</small>
                  </td>
                  <td>${t.defPop}</td>
                  <td>${t.wallLevel || '?'}</td>
                  <td style="font-size:11px;color:#888;white-space:nowrap">${t.date}</td>
                  <td><button class="fd-atk-btn" onclick="FangSender.attack(${i})">Attack</button></td>
                  <td><button class="fd-rm-btn"  onclick="FangSender.remove(${i})">✕</button></td>
                </tr>`);
        });
    },

    setStatus(m) { $('#fd_status').text(m); },
};

FangSender.render();
