// ── State ──────────────────────────────────────────────────────────────────────
let tvs = [], devs = [], feeds = [], smsRecipients = [], stockSymbols = [];

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function $(id) { return document.getElementById(id); }

function showStatus(id, msg, ok) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'settings-status ' + (ok ? 'ok' : 'err');
  setTimeout(() => { el.textContent = ''; el.className = 'settings-status'; }, 4000);
}

async function patchConfig(data) {
  try {
    const res = await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch { return false; }
}

// ── Load config ────────────────────────────────────────────────────────────────
async function loadConfig() {
  let cfg;
  try { cfg = await (await fetch('/api/config')).json(); }
  catch { return; }

  const upd = cfg.update || {};
  $('upd-cfg-pw').value = upd.password || '';
  $('upd-branch').value = upd.branch   || 'main';

  const w = cfg.weather || {};
  $('w-city').value  = w.city      || '';
  $('w-lat').value   = w.latitude  != null ? w.latitude  : '';
  $('w-lon').value   = w.longitude != null ? w.longitude : '';
  $('w-units').value = w.units     || 'fahrenheit';

  const ph = cfg.pihole || {};
  $('ph-host').value = ph.host     || 'localhost';
  $('ph-pw').value   = ph.password || '';

  const ntfy = cfg.ntfy || {};
  $('ntfy-topic').value  = ntfy.topic  || '';
  $('ntfy-server').value = ntfy.server || 'https://ntfy.sh';

  const sms = cfg.sms || {};
  $('sms-user').value = sms.smtp_user     || '';
  $('sms-pw').value   = sms.smtp_password || '';
  smsRecipients = [...(sms.recipients || [])];
  renderRecipients();

  const cal = cfg.calendar || {};
  $('cal-morning').value = cal.morning_brief    || '08:00';
  $('cal-evening').value = cal.evening_brief    || '21:00';
  $('cal-remind').value  = cal.reminder_minutes ?? 60;

  tvs = [...(cfg.tvs     || [])]; renderTvs();
  devs= [...(cfg.devices || [])]; renderDevs();

  const news = cfg.news || {};
  $('news-per-feed').value = news.articles_per_feed ?? 5;
  feeds = [...(news.feeds || [])];
  renderFeeds();

  const stocks = cfg.stocks || {};
  stockSymbols = [...(stocks.symbols || [])];
  renderSymbols();

  const photo = cfg.photo || {};
  $('photo-source').value   = photo.source      || 'picsum';
  $('photo-nasa-key').value = photo.nasa_api_key|| '';
  toggleNasaKey();
}

// ── Save sections ──────────────────────────────────────────────────────────────
async function saveSection(section) {
  const map = {
    update:        [{ update: { password: $('upd-cfg-pw').value, branch: $('upd-branch').value.trim() || 'main' } }, 'upd-cfg-status'],
    weather:       [{ weather: { city: $('w-city').value.trim(), latitude: parseFloat($('w-lat').value)||0, longitude: parseFloat($('w-lon').value)||0, units: $('w-units').value } }, 'w-status'],
    pihole:        [{ pihole: { host: $('ph-host').value.trim()||'localhost', password: $('ph-pw').value, api_key: '' } }, 'ph-status'],
    notifications: [{ ntfy: { topic: $('ntfy-topic').value.trim(), server: $('ntfy-server').value.trim()||'https://ntfy.sh' }, sms: { smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: $('sms-user').value.trim(), smtp_password: $('sms-pw').value, recipients: smsRecipients } }, 'notif-status'],
    calendar:      [{ calendar: { morning_brief: $('cal-morning').value||'08:00', evening_brief: $('cal-evening').value||'21:00', reminder_minutes: parseInt($('cal-remind').value)||60 } }, 'cal-status'],
    news:          [{ news: { articles_per_feed: parseInt($('news-per-feed').value)||5, feeds } }, 'news-status'],
    photo:         [{ photo: { source: $('photo-source').value, nasa_api_key: $('photo-nasa-key').value.trim() } }, 'photo-status'],
  };
  const entry = map[section];
  if (!entry) return;
  const ok = await patchConfig(entry[0]);
  showStatus(entry[1], ok ? '✓ Saved' : '✗ Save failed', ok);
}

// ── Geocode default city ───────────────────────────────────────────────────────
async function geocodeDefault() {
  const name = $('w-city').value.trim();
  if (!name) return;
  const hint = $('w-geocode-hint');
  hint.textContent = 'Searching…';
  hint.style.color = '';
  try {
    const res = await fetch('/api/geocode?name=' + encodeURIComponent(name));
    const d   = await res.json();
    if (!res.ok) { hint.textContent = '✗ ' + d.error; hint.style.color = 'var(--danger)'; return; }
    $('w-city').value = d.name;
    $('w-lat').value  = d.latitude;
    $('w-lon').value  = d.longitude;
    hint.textContent  = `✓ ${d.name} (${d.latitude}, ${d.longitude})`;
    hint.style.color  = 'var(--success)';
  } catch(e) {
    hint.textContent = '✗ ' + e.message;
    hint.style.color = 'var(--danger)';
  }
}

// ── SMS recipients ─────────────────────────────────────────────────────────────
function renderRecipients() {
  const el = $('sms-recipients-list');
  if (!smsRecipients.length) { el.innerHTML = '<p class="muted settings-hint">No recipients added</p>'; return; }
  el.innerHTML = smsRecipients.map((r, i) => `
    <div class="array-item">
      <span class="array-item-label">${esc(r)}</span>
      <button class="btn-del" onclick="delRecipient(${i})">&times;</button>
    </div>`).join('');
}

function addSmsRecipient() {
  const val = $('sms-recipient-new').value.trim();
  if (!val) return;
  smsRecipients.push(val);
  $('sms-recipient-new').value = '';
  renderRecipients();
}

function delRecipient(i) { smsRecipients.splice(i, 1); renderRecipients(); }

// ── TVs ────────────────────────────────────────────────────────────────────────
function renderTvs() {
  const el = $('tvs-list');
  if (!tvs.length) { el.innerHTML = '<p class="muted settings-hint">No TVs configured</p>'; return; }
  el.innerHTML = tvs.map((t, i) => `
    <div class="array-item">
      <span class="array-item-label">${esc(t.name)} <span class="array-item-sub">${esc(t.ip)}</span></span>
      <button class="btn-del" onclick="delTv(${i})">&times;</button>
    </div>`).join('');
}

async function addTv() {
  const name = $('tv-name-new').value.trim();
  const ip   = $('tv-ip-new').value.trim();
  if (!name || !ip) return;
  tvs.push({ name, ip });
  $('tv-name-new').value = '';
  $('tv-ip-new').value   = '';
  renderTvs();
  const ok = await patchConfig({ tvs });
  showStatus('tvs-status', ok ? '✓ Saved' : '✗ Save failed', ok);
}

async function delTv(i) {
  tvs.splice(i, 1); renderTvs();
  const ok = await patchConfig({ tvs });
  showStatus('tvs-status', ok ? '✓ Saved' : '✗ Save failed', ok);
}

// ── Network devices ────────────────────────────────────────────────────────────
function renderDevs() {
  const el = $('devs-list');
  if (!devs.length) { el.innerHTML = '<p class="muted settings-hint">No devices configured</p>'; return; }
  el.innerHTML = devs.map((d, i) => `
    <div class="array-item">
      <span class="array-item-label">${esc(d.name)} <span class="array-item-sub">${esc(d.ip)}</span></span>
      <button class="btn-del" onclick="delDev(${i})">&times;</button>
    </div>`).join('');
}

async function addDev() {
  const name = $('dev-name-new').value.trim();
  const ip   = $('dev-ip-new').value.trim();
  if (!name || !ip) return;
  devs.push({ name, ip });
  $('dev-name-new').value = '';
  $('dev-ip-new').value   = '';
  renderDevs();
  const ok = await patchConfig({ devices: devs });
  showStatus('devs-status', ok ? '✓ Saved' : '✗ Save failed', ok);
}

async function delDev(i) {
  devs.splice(i, 1); renderDevs();
  const ok = await patchConfig({ devices: devs });
  showStatus('devs-status', ok ? '✓ Saved' : '✗ Save failed', ok);
}

// ── News feeds ─────────────────────────────────────────────────────────────────
function renderFeeds() {
  const el = $('feeds-list');
  if (!feeds.length) { el.innerHTML = '<p class="muted settings-hint">No feeds configured</p>'; return; }
  el.innerHTML = feeds.map((f, i) => `
    <div class="array-item">
      <span class="array-item-label">${esc(f.name)} <span class="array-item-sub">${esc(f.url)}</span></span>
      <button class="btn-del" onclick="delFeed(${i})">&times;</button>
    </div>`).join('');
}

async function addFeed() {
  const name = $('feed-name-new').value.trim();
  const url  = $('feed-url-new').value.trim();
  if (!name || !url) return;
  feeds.push({ name, url });
  $('feed-name-new').value = '';
  $('feed-url-new').value  = '';
  renderFeeds();
  await saveSection('news');
}

async function delFeed(i) { feeds.splice(i, 1); renderFeeds(); await saveSection('news'); }

// ── Stock symbols ──────────────────────────────────────────────────────────────
function renderSymbols() {
  const el = $('stocks-list');
  if (!stockSymbols.length) { el.innerHTML = '<p class="muted settings-hint">No symbols added</p>'; return; }
  el.innerHTML = stockSymbols.map((s, i) => `
    <div class="array-item">
      <span class="array-item-label">${esc(s)}</span>
      <button class="btn-del" onclick="delSymbol(${i})">&times;</button>
    </div>`).join('');
}

async function addSymbol() {
  const input = $('stock-symbol-new');
  const val = input.value.trim().toUpperCase();
  if (!val || stockSymbols.includes(val)) { input.value = ''; return; }
  stockSymbols.push(val);
  input.value = '';
  renderSymbols();
  const ok = await patchConfig({ stocks: { symbols: stockSymbols } });
  showStatus('stocks-status', ok ? '✓ Saved' : '✗ Save failed', ok);
}

async function delSymbol(i) {
  stockSymbols.splice(i, 1);
  renderSymbols();
  const ok = await patchConfig({ stocks: { symbols: stockSymbols } });
  showStatus('stocks-status', ok ? '✓ Saved' : '✗ Save failed', ok);
}

// ── Photo ──────────────────────────────────────────────────────────────────────
function toggleNasaKey() {
  $('nasa-key-group').style.display = $('photo-source').value === 'nasa_apod' ? '' : 'none';
}

// ── OTA pull ───────────────────────────────────────────────────────────────────
async function runUpdate() {
  const pw = $('upd-pw').value;
  if (!pw) { $('upd-pw').focus(); return; }

  const statusEl = $('upd-status');
  const outputEl = $('upd-output');
  statusEl.textContent = 'Pulling from GitHub…';
  statusEl.className   = 'settings-status';
  outputEl.style.display = 'none';

  try {
    const res  = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (data.output) { outputEl.textContent = data.output; outputEl.style.display = 'block'; }

    if (!res.ok) {
      statusEl.textContent = '✗ ' + (data.error || 'Update failed');
      statusEl.className   = 'settings-status err';
      return;
    }

    let secs = 8;
    statusEl.className = 'settings-status ok';
    const tick = () => { statusEl.textContent = `✓ Update successful — restarting… (${secs}s)`; };
    tick();
    const t = setInterval(() => { if (--secs <= 0) { clearInterval(t); location.reload(); } tick(); }, 1000);
  } catch(e) {
    statusEl.textContent = '✗ ' + e.message;
    statusEl.className   = 'settings-status err';
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
loadConfig();
