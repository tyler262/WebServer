// ==UserScript==
// @name         TW Page Parser
// @namespace    https://github.com/tyler262/webserver
// @version      0.1.0
// @description  Scrapes every element on a Tribal Wars page and returns structured data
// @match        https://*.tribalwars.net/game.php*
// @match        https://*.tribalwars.us/game.php*
// @match        https://*.die-staemme.de/game.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Utilities ─────────────────────────────────────────────────────────────

  function txt(el) { return el ? el.textContent.trim() : null; }
  function num(str) { return str ? parseInt(String(str).replace(/[^\d]/g, ''), 10) : null; }
  function fnum(str) { return str ? parseFloat(String(str).replace(/[^0-9.]/g, '')) : null; }
  function attr(el, a) { return el ? el.getAttribute(a) : null; }

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  // ─── Page identity ─────────────────────────────────────────────────────────

  function detectPage() {
    const params = new URLSearchParams(window.location.search);
    return {
      screen: params.get('screen') || 'unknown',
      mode:   params.get('mode')   || null,
      view:   params.get('view')   || null,
      id:     params.get('id')     || null,
    };
  }

  // ─── Global context (always present) ───────────────────────────────────────

  function parseGlobalContext() {
    // TW exposes a `game_data` JS object in the page; grab it if present
    const gd = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).game_data || {};

    return {
      player: {
        name:    gd.player?.name    || txt(qs('#menu_row .info-bar .player-name')) || null,
        id:      gd.player?.id      || null,
        points:  gd.player?.points  || null,
        rank:    gd.player?.rank    || null,
        tribe:   gd.player?.tribe_name || null,
      },
      village: {
        name:    gd.village?.name   || txt(qs('#menu_row #village_name, .village-name')) || null,
        id:      gd.village?.id     || null,
        x:       gd.village?.x      || null,
        y:       gd.village?.y      || null,
        coord:   gd.village ? `${gd.village.x}|${gd.village.y}` : null,
        points:  gd.village?.points || null,
      },
      world:   gd.world            || window.location.hostname.split('.')[0],
      screen:  gd.screen           || detectPage().screen,
    };
  }

  // ─── Resources bar ─────────────────────────────────────────────────────────

  function parseResources() {
    const wood  = qs('#wood,  #l_wood,  [data-type="wood"]');
    const stone = qs('#stone, #l_stone, [data-type="stone"]');
    const iron  = qs('#iron,  #l_iron,  [data-type="iron"]');
    const pop   = qs('#pop,   #l_pop,   [data-type="pop"]');
    const maxPop = qs('#max_pop, #pop_max');
    const storage = qs('#storage, #max_storage');

    return {
      wood:    num(txt(wood)),
      stone:   num(txt(stone)),
      iron:    num(txt(iron)),
      pop:     num(txt(pop)),
      maxPop:  num(txt(maxPop)),
      storage: num(txt(storage)),
    };
  }

  // ─── Buildings ─────────────────────────────────────────────────────────────

  function parseBuildings() {
    // Overview / main page table
    const rows = qsa('#buildings_table tr, .buildings-table tr, #building_main_table tr');
    const buildings = {};
    rows.forEach(row => {
      const nameEl = qs('.building-name, td:first-child a[href*="screen="]', row);
      const levelEl = qs('.level, .building-level, td.right', row);
      if (!nameEl || !levelEl) return;
      const key = attr(nameEl, 'href')?.match(/screen=(\w+)/)?.[1] || txt(nameEl)?.toLowerCase().replace(/\s+/g, '_');
      if (key) buildings[key] = num(txt(levelEl));
    });

    // Single-building page header
    const singleName = qs('.building-header h2, h2.none');
    const singleLevel = qs('.building-header .level-info, h2.none + p');
    if (singleName && singleLevel) {
      const m = txt(singleLevel)?.match(/(\d+)/);
      if (m) buildings['current_page'] = num(m[1]);
    }

    return buildings;
  }

  // ─── Troops ────────────────────────────────────────────────────────────────

  const UNIT_KEYS = [
    'spear','sword','axe','archer','spy','light','marcher','heavy','ram',
    'catapult','knight','snob','militia',
  ];

  function parseUnits(ctx) {
    const units = {};
    UNIT_KEYS.forEach(u => {
      const el = qs(`#${u}, .unit-item-${u} .unit-count, [data-unit="${u}"] .count`, ctx);
      if (el) units[u] = num(txt(el));
    });
    return units;
  }

  function parseTroops() {
    // Train page or barracks-style tables
    const tables = qsa('.units-row, #train_form table, .troop_info');
    const result = { home: {}, away: {}, total: {} };

    // Home troops (from troop_info table or unit display on overview)
    const homeTable = qs('#troops_home, .troops_home, table.vis:has(.unit-item-spear)');
    if (homeTable) result.home = parseUnits(homeTable);

    const awayTable = qs('#troops_away, .troops_away');
    if (awayTable) result.away = parseUnits(awayTable);

    // Fallback: scan the whole page for any unit counts
    if (!Object.keys(result.home).length && !Object.keys(result.away).length) {
      result.home = parseUnits(document);
    }

    return result;
  }

  // ─── Attacks / incoming ────────────────────────────────────────────────────

  function parseIncoming() {
    const rows = qsa('#incomings_table tr.row_a, #incomings_table tr.row_b');
    return rows.map(row => {
      const cells = qsa('td', row);
      return {
        origin: txt(cells[0]),
        target: txt(cells[1]),
        type:   txt(cells[2]),
        arrives: txt(cells[3]),
        duration: txt(cells[4]),
      };
    }).filter(r => r.origin);
  }

  // ─── Reports ───────────────────────────────────────────────────────────────

  function parseReports() {
    const rows = qsa('#report_list tr.nowrap, #report_list tr');
    return rows.map(row => {
      const link = qs('a[href*="view="]', row);
      const iconEl = qs('img.report-icon, .report_type img', row);
      const timeEl = qs('.time-cell, td:last-child', row);
      if (!link) return null;
      return {
        title: txt(link),
        url:   attr(link, 'href'),
        type:  attr(iconEl, 'title') || null,
        time:  txt(timeEl),
      };
    }).filter(Boolean);
  }

  // ─── Report detail (scout / attack) ────────────────────────────────────────

  function parseReportDetail() {
    const attacker = qs('#attack_info_att, .report-attack-info .player-name');
    const defender = qs('#attack_info_def, .report-defense-info .player-name');
    const haul = qs('#plunder_list, .report-haul');

    const lostAtt = parseUnits(qs('#attack_info_att_loses, #attack_info_att', document));
    const lostDef = parseUnits(qs('#attack_info_def_loses, #attack_info_def', document));
    const scoutData = qs('#attack_info_def_buildings, .spy_info');

    return {
      attacker: txt(attacker),
      defender: txt(defender),
      luck: fnum(txt(qs('#luck .value, .battle-luck'))),
      morale: fnum(txt(qs('#morale .value, .battle-morale'))),
      losses: { attacker: lostAtt, defender: lostDef },
      haul: txt(haul),
      scoutBuildings: scoutData ? txt(scoutData) : null,
    };
  }

  // ─── Map / overview coords ─────────────────────────────────────────────────

  function parseVillageList() {
    // Overview table rows (all villages of the player)
    const rows = qsa('#overview_villages tr, .village-overview tr');
    return rows.map(row => {
      const link = qs('a[href*="village="]', row);
      const coords = txt(qs('.coord, .village-coord', row));
      const pts = txt(qs('.points, .village-points', row));
      if (!link) return null;
      return {
        name:   txt(link),
        coord:  coords,
        points: num(pts),
        url:    attr(link, 'href'),
      };
    }).filter(Boolean);
  }

  // ─── Market ────────────────────────────────────────────────────────────────

  function parseMarket() {
    const offerRows = qsa('#market_merchant_form tr, .market-offer-row');
    const offers = offerRows.map(row => {
      const gives = txt(qs('[name*="sell_wood"],[name*="sell_stone"],[name*="sell_iron"]', row));
      const gets  = txt(qs('[name*="buy_wood"],[name*="buy_stone"],[name*="buy_iron"]', row));
      return { gives, gets };
    }).filter(r => r.gives || r.gets);

    const merchants = num(txt(qs('#market_merchant_available, .merchants-count')));
    return { merchants, offers };
  }

  // ─── Timers / build queue ──────────────────────────────────────────────────

  function parseBuildQueue() {
    const rows = qsa('#buildqueue tr, .build-queue-item');
    return rows.map(row => {
      const nameEl = qs('td:first-child, .queue-name', row);
      const timerEl = qs('.timer, .build-time', row);
      if (!nameEl) return null;
      return {
        building: txt(nameEl),
        finishes: txt(timerEl),
      };
    }).filter(Boolean);
  }

  // ─── All text nodes (last-resort catch-all) ────────────────────────────────

  function dumpAllText() {
    const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','META','LINK','HEAD']);
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      { acceptNode: n => skip.has(n.parentElement?.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }
    );
    const chunks = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (t.length > 1) chunks.push(t);
    }
    return chunks;
  }

  // ─── All links ─────────────────────────────────────────────────────────────

  function dumpAllLinks() {
    return qsa('a[href]').map(a => ({ text: txt(a), href: attr(a, 'href') }))
      .filter(l => l.href && !l.href.startsWith('#'));
  }

  // ─── All tables (generic extraction) ───────────────────────────────────────

  function dumpAllTables() {
    return qsa('table').map((table, ti) => {
      const headers = qsa('th', table).map(txt);
      const rows = qsa('tr', table).map(row =>
        qsa('td', row).map(td => txt(td))
      ).filter(r => r.length);
      return { tableIndex: ti, id: table.id || null, headers, rows };
    });
  }

  // ─── Images / icons ────────────────────────────────────────────────────────

  function dumpAllImages() {
    return qsa('img[src]').map(img => ({
      src:   attr(img, 'src'),
      alt:   attr(img, 'alt'),
      title: attr(img, 'title'),
      id:    img.id || null,
    })).filter(i => !i.src.includes('1x1') && !i.src.includes('blank'));
  }

  // ─── Input fields ──────────────────────────────────────────────────────────

  function dumpAllInputs() {
    return qsa('input, select, textarea').map(el => ({
      tag:   el.tagName.toLowerCase(),
      type:  el.type || null,
      name:  el.name || null,
      id:    el.id   || null,
      value: el.value || null,
      label: txt(qs(`label[for="${el.id}"]`)) || null,
    }));
  }

  // ─── Main parser ───────────────────────────────────────────────────────────

  function parse() {
    const page = detectPage();

    const result = {
      _meta: {
        parsedAt:  new Date().toISOString(),
        url:       window.location.href,
        screen:    page.screen,
        mode:      page.mode,
        title:     document.title,
      },
      context:    parseGlobalContext(),
      resources:  parseResources(),
      buildings:  parseBuildings(),
      troops:     parseTroops(),
      buildQueue: parseBuildQueue(),
      incoming:   [],
      reports:    [],
      reportDetail: null,
      villageList:  [],
      market:     null,
      // catch-all dumps
      allTables:  dumpAllTables(),
      allLinks:   dumpAllLinks(),
      allImages:  dumpAllImages(),
      allInputs:  dumpAllInputs(),
      allText:    dumpAllText(),
    };

    // Screen-specific parsing
    switch (page.screen) {
      case 'overview':
        result.villageList = parseVillageList();
        break;
      case 'report':
        if (page.view === 'attack' || page.view === 'spy') {
          result.reportDetail = parseReportDetail();
        } else {
          result.reports = parseReports();
        }
        break;
      case 'place':
        if (page.mode === 'incomings') result.incoming = parseIncoming();
        break;
      case 'market':
        result.market = parseMarket();
        break;
    }

    return result;
  }

  // ─── Output ─────────────────────────────────────────────────────────────────

  function render(data) {
    // Console output (always)
    console.group('[TW Parser]', data._meta.screen, data._meta.parsedAt);
    console.log(JSON.stringify(data, null, 2));
    console.groupEnd();

    // Floating panel injected into the page
    const existing = document.getElementById('_tw_parser_panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = '_tw_parser_panel';
    Object.assign(panel.style, {
      position: 'fixed', top: '50px', right: '10px', zIndex: 99999,
      background: '#1a1a1a', color: '#e0e0e0', fontFamily: 'monospace',
      fontSize: '11px', padding: '10px', border: '1px solid #555',
      borderRadius: '6px', maxWidth: '420px', maxHeight: '70vh',
      overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    });

    const header = document.createElement('div');
    Object.assign(header.style, { fontWeight: 'bold', marginBottom: '6px', color: '#aef' });
    header.textContent = `[TW Parser] ${data._meta.screen} — ${data._meta.parsedAt}`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      float: 'right', background: 'none', border: 'none',
      color: '#e0e0e0', cursor: 'pointer', fontSize: '14px',
    });
    closeBtn.onclick = () => panel.remove();
    header.prepend(closeBtn);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy JSON';
    Object.assign(copyBtn.style, {
      display: 'block', marginBottom: '8px', padding: '3px 8px',
      background: '#2a5', color: '#fff', border: 'none', borderRadius: '3px',
      cursor: 'pointer', fontSize: '11px',
    });
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2))
        .then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1500); });
    };

    const pre = document.createElement('pre');
    Object.assign(pre.style, { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' });
    // Show a summary view, not the full dump
    const summary = {
      screen:    data._meta.screen,
      village:   data.context.village,
      player:    data.context.player,
      resources: data.resources,
      buildings: data.buildings,
      troops:    data.troops.home,
      buildQueue: data.buildQueue,
    };
    if (data.incoming.length)       summary.incoming    = data.incoming;
    if (data.reports.length)        summary.reports     = data.reports;
    if (data.reportDetail)          summary.reportDetail = data.reportDetail;
    if (data.villageList.length)    summary.villageList  = data.villageList;
    if (data.market)                summary.market       = data.market;
    pre.textContent = JSON.stringify(summary, null, 2);

    panel.appendChild(header);
    panel.appendChild(copyBtn);
    panel.appendChild(pre);
    document.body.appendChild(panel);

    // Store full data globally for access from console
    (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window)._twParsed = data;
    console.info('[TW Parser] Full data available at window._twParsed');
  }

  // ─── Run ───────────────────────────────────────────────────────────────────

  render(parse());

  // Re-parse when TW navigates via Ajax (they use pushState)
  const _origPush = history.pushState.bind(history);
  history.pushState = function (...args) {
    _origPush(...args);
    setTimeout(() => render(parse()), 800);
  };
  window.addEventListener('popstate', () => setTimeout(() => render(parse()), 800));

})();
