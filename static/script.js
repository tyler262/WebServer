// ── Weather ───────────────────────────────────────────────────────────────────
async function fetchWeather() {
  const el = document.getElementById("weather-content");
  if (!el) return;
  try {
    const cities = await (await fetch("/api/weather")).json();
    if (!cities.length) {
      el.innerHTML = '<p class="muted">No cities configured. <a href="/settings" style="color:var(--accent)">Add one in Settings</a>.</p>';
      return;
    }
    el.innerHTML = cities.map(d => {
      const actionBtn = d.is_default
        ? `<a href="/settings" class="btn-city-settings" title="Change in Settings">&#9881;</a>`
        : `<button class="btn-del" onclick="deleteCity(${d.city_id})" title="Remove">&times;</button>`;
      if (d.error) return `
        <div class="weather-city">
          <div class="weather-city-header">
            <span class="weather-city-name">${escapeHtml(d.name)}${d.is_default ? ' <span class="city-default-badge">default</span>' : ''}</span>
            ${actionBtn}
          </div>
          <div class="weather-city-details error">${escapeHtml(d.error)}</div>
        </div>`;

      const forecastHtml = d.forecast && d.forecast.length
        ? `<div class="forecast-strip">${d.forecast.map(f => `
            <div class="forecast-day">
              <div class="forecast-day-label">${escapeHtml(f.label)}</div>
              <div class="forecast-day-icon">${f.icon}</div>
              <div class="forecast-day-high">${f.high}°</div>
              <div class="forecast-day-low">${f.low}°</div>
              ${f.precip_pct > 20 ? `<div class="forecast-day-precip">&#128167;${f.precip_pct}%</div>` : ""}
            </div>`).join("")}</div>`
        : "";

      const summaryHtml = d.summary
        ? `<div class="weather-summary">${escapeHtml(d.summary)}</div>` : "";

      return `
        <div class="weather-city">
          <div class="weather-city-header">
            <span class="weather-city-name">${escapeHtml(d.name)}${d.is_default ? ' <span class="city-default-badge">default</span>' : ''}</span>
            <span class="weather-city-temp">${d.icon} ${d.temp}${d.unit}</span>
            ${actionBtn}
          </div>
          <div class="weather-city-details">
            ${escapeHtml(d.description)} &nbsp;·&nbsp;
            Feels ${d.feels_like}${d.unit} &nbsp;·&nbsp;
            &#128167; ${d.humidity}% &nbsp;·&nbsp; &#128168; ${d.wind} mph
          </div>
          ${forecastHtml}
          ${summaryHtml}
        </div>`;
    }).join("");
  } catch {
    el.innerHTML = '<p class="error">Failed to load weather</p>';
  }
}

async function addCity(e) {
  e.preventDefault();
  const input = document.getElementById("city-input");
  const name = input.value.trim();
  if (!name) return;
  input.disabled = true;
  try {
    const res = await fetch("/api/weather/cities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) { input.value = ""; fetchWeather(); }
    else {
      const d = await res.json();
      alert(d.error || "Could not add city");
    }
  } finally { input.disabled = false; }
}

async function deleteCity(id) {
  const btn  = document.querySelector(`[onclick="deleteCity(${id})"]`);
  const name = btn?.closest('.weather-city')?.querySelector('.weather-city-name')?.textContent?.trim() || 'this city';
  if (!confirm(`Remove ${name} from weather?`)) return;
  await fetch(`/api/weather/cities/${id}`, { method: "DELETE" });
  fetchWeather();
}

// ── TV Status ─────────────────────────────────────────────────────────────────
async function fetchTVStatus() {
  const el = document.getElementById("tv-content");
  if (!el) return;
  try {
    const tvs = await (await fetch("/api/tv/status")).json();
    if (!tvs.length) {
      el.innerHTML = '<p class="muted">No TVs configured. <a href="/settings" style="color:var(--accent)">Add in Settings</a>.</p>';
      return;
    }
    el.innerHTML = tvs.map(tv => `
      <div class="tv-item">
        <span class="tv-name">
          <span class="dot ${tv.online ? "online" : "offline"}" style="margin-right:.45rem"></span>
          ${escapeHtml(tv.name)}
          <span class="tv-ip">${escapeHtml(tv.ip)}</span>
        </span>
        <button class="btn-off" onclick="turnOffTV(${tv.index}, this)" data-tv="${escapeHtml(tv.name)}"
          ${tv.online ? "" : 'disabled title="TV appears offline"'}>
          &#9211; Turn Off
        </button>
      </div>`).join("");
  } catch {
    el.innerHTML = '<p class="error">Failed to load TV status</p>';
  }
}

// ── Stocks ────────────────────────────────────────────────────────────────────
async function fetchStocks() {
  const el = document.getElementById("stocks-content");
  if (!el) return;
  try {
    const data = await (await fetch("/api/stocks")).json();
    if (data.error) { el.innerHTML = `<p class="error">${escapeHtml(data.error)}</p>`; return; }
    if (!data.length) { el.innerHTML = '<p class="muted">No symbols configured.</p>'; return; }
    el.innerHTML = data.map(s => {
      if (s.error) return `
        <div class="stock-row">
          <span class="stock-symbol">${escapeHtml(s.symbol)}</span>
          <span class="stock-price muted">—</span>
          <span class="stock-change">${escapeHtml(s.error)}</span>
        </div>`;
      const dir = s.change >= 0 ? "up" : "down";
      const arrow = s.change >= 0 ? "&#9650;" : "&#9660;";
      const chSign = s.change >= 0 ? "+" : "";
      const pctSign = s.change_pct >= 0 ? "+" : "";
      return `
        <div class="stock-row">
          <span class="stock-symbol">${escapeHtml(s.symbol)}</span>
          <span class="stock-price">$${s.price.toFixed(2)}</span>
          <span class="stock-change ${dir}">${arrow} ${chSign}${s.change.toFixed(2)} (${pctSign}${s.change_pct.toFixed(2)}%)</span>
        </div>`;
    }).join("");
  } catch {
    el.innerHTML = '<p class="error">Failed to load stocks</p>';
  }
}

// ── Moon Phase ────────────────────────────────────────────────────────────────
async function fetchMoon() {
  const el = document.getElementById("moon-content");
  if (!el) return;
  try {
    const d = await (await fetch("/api/moon")).json();
    el.innerHTML = `
      <div class="moon-display">
        <div class="moon-emoji">${d.emoji}</div>
        <div class="moon-phase-name">${escapeHtml(d.phase)}</div>
        <div class="moon-illum">${d.illumination}% illuminated</div>
        <div class="moon-next-full">${escapeHtml(d.next_full_in)}</div>
      </div>`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load moon phase</p>';
  }
}

// ── News ──────────────────────────────────────────────────────────────────────
async function fetchNews() {
  const el = document.getElementById("news-content");
  if (!el) return;
  try {
    const articles = await (await fetch("/api/news")).json();
    if (!articles.length) { el.innerHTML = '<p class="muted">No articles</p>'; return; }
    el.innerHTML = articles.map(a => `
      <div class="news-item">
        <div class="news-title"><a href="${a.link}" target="_blank" rel="noopener noreferrer">${a.title}</a></div>
        <div class="news-meta">${a.source}${a.published ? " &middot; " + timeAgo(a.published) : ""}</div>
      </div>`).join("");
  } catch {
    el.innerHTML = '<p class="error">Failed to load news</p>';
  }
}

// ── Pi-hole ───────────────────────────────────────────────────────────────────
async function fetchPihole() {
  const el = document.getElementById("pihole-content");
  if (!el) return;
  try {
    const d = await (await fetch("/api/pihole")).json();
    if (d.error) { el.innerHTML = `<p class="error">${d.error}</p>`; return; }
    const isEnabled = d.status === "enabled";
    el.innerHTML = `
      <div class="pihole-status">
        <span class="dot ${isEnabled ? "online" : "offline"}"></span>
        Pi-hole is <strong style="color:var(--${isEnabled ? "success" : "danger"})">${d.status}</strong>
      </div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${Number(d.queries_today).toLocaleString()}</div>
          <div class="stat-label">Queries</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${Number(d.blocked_today).toLocaleString()}</div>
          <div class="stat-label">Blocked</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${d.percent_blocked}%</div>
          <div class="stat-label">Block Rate</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${Number(d.domains_blocked).toLocaleString()}</div>
          <div class="stat-label">Blocklist</div>
        </div>
      </div>`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load Pi-hole stats</p>';
  }
}

// ── System ────────────────────────────────────────────────────────────────────
function meterColor(pct) {
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  return "";
}

function meter(label, pct, detail) {
  return `
    <div class="meter">
      <div class="meter-label"><span>${label}</span><span>${detail}</span></div>
      <div class="meter-track">
        <div class="meter-fill ${meterColor(pct)}" style="width:${pct}%"></div>
      </div>
    </div>`;
}

async function fetchSystem() {
  const el = document.getElementById("system-content");
  if (!el) return;
  try {
    const d = await (await fetch("/api/system")).json();
    if (d.error) { el.innerHTML = `<p class="error">${d.error}</p>`; return; }
    const tempHtml = d.cpu_temp !== null
      ? `<span class="muted"> &middot; Temp:</span> <span class="val" style="color:${d.cpu_temp >= 70 ? "var(--danger)" : d.cpu_temp >= 60 ? "var(--warning)" : "inherit"}">${d.cpu_temp}&#8451;</span>`
      : "";
    el.innerHTML = `
      <div class="sys-info-row">
        <span class="muted">Host:</span>&nbsp;<span class="val">${d.hostname}</span>
        <span class="muted">&nbsp;&middot; Up:</span>&nbsp;<span class="val">${d.uptime}</span>
        ${tempHtml}
      </div>
      ${meter("CPU", d.cpu_percent, d.cpu_percent + "%")}
      ${meter("Memory", d.mem_percent, d.mem_used_gb + " / " + d.mem_total_gb + " GB")}
      ${meter("Disk", d.disk_percent, d.disk_used_gb + " / " + d.disk_total_gb + " GB")}`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load system stats</p>';
  }
}

// ── Quote ─────────────────────────────────────────────────────────────────────
async function fetchQuote(forceRefresh = false) {
  const el = document.getElementById("quote-content");
  if (!el) return;
  try {
    const d = await (await fetch(forceRefresh ? "/api/quote?refresh=1" : "/api/quote")).json();
    if (d.error) { el.innerHTML = `<p class="error">${d.error}</p>`; return; }
    el.innerHTML = `
      <div class="quote-text">${d.text}</div>
      <div class="quote-author">&mdash; ${d.author}</div>`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load quote</p>';
  }
}

// ── Joke ──────────────────────────────────────────────────────────────────────
async function fetchJoke(forceRefresh = false) {
  const el = document.getElementById("joke-content");
  if (!el) return;
  try {
    const d = await (await fetch(forceRefresh ? "/api/joke?refresh=1" : "/api/joke")).json();
    if (d.error) { el.innerHTML = `<p class="error">${d.error}</p>`; return; }
    if (d.type === "single") {
      el.innerHTML = `<div class="joke-setup">${d.joke}</div>`;
    } else {
      el.innerHTML = `
        <div class="joke-setup">${d.setup}</div>
        <button class="btn-reveal" onclick="revealPunchline(this)">Reveal punchline &hellip;</button>
        <div class="joke-delivery" style="display:none">${d.delivery}</div>`;
    }
  } catch {
    el.innerHTML = '<p class="error">Failed to load joke</p>';
  }
}

function revealPunchline(btn) {
  btn.nextElementSibling.style.display = "block";
  btn.style.display = "none";
}

// ── Photo ─────────────────────────────────────────────────────────────────────
async function fetchPhoto(forceRefresh = false) {
  const el = document.getElementById("photo-content");
  if (!el) return;
  try {
    const d = await (await fetch(forceRefresh ? "/api/photo?refresh=1" : "/api/photo")).json();
    if (d.error) { el.innerHTML = `<p class="error">${d.error}</p>`; return; }
    el.innerHTML = `
      <img class="photo-img" src="${d.url}" alt="${d.title || "Photo of the day"}" loading="lazy">
      ${d.title   ? `<div class="photo-title">${d.title}</div>`     : ""}
      ${d.caption ? `<div class="photo-caption">${d.caption}</div>` : ""}`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load photo</p>';
  }
}

// ── Todo list ─────────────────────────────────────────────────────────────────
const TODO_STATUS = [
  { cls: "pending",     icon: "",  next: 1 },
  { cls: "in-progress", icon: "▶", next: 2 },
  { cls: "done",        icon: "✓", next: 0 },
];

async function fetchTodos() {
  const el = document.getElementById("todo-list");
  if (!el) return;
  try {
    const todos = await (await fetch("/api/todos")).json();
    if (!todos.length) {
      el.innerHTML = '<p class="muted" style="font-size:0.85rem;padding:0.5rem 0">No tasks yet</p>';
      return;
    }
    el.innerHTML = `<div class="todo-scroll">${todos.map(t => {
      const s = TODO_STATUS[t.status] || TODO_STATUS[0];
      return `
        <div class="todo-item ${s.cls}" id="todo-${t.id}">
          <button class="status-btn ${s.cls}" title="Click to advance status"
            onclick="setTodoStatus(${t.id}, ${s.next})">${s.icon}</button>
          <span class="todo-text">${escapeHtml(t.text)}</span>
          <button class="btn-del" onclick="deleteTodo(${t.id})" title="Delete">&times;</button>
        </div>`;
    }).join("")}</div>`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load tasks</p>';
  }
}

async function addTodo(e) {
  e.preventDefault();
  const input = document.getElementById("todo-input");
  const text = input.value.trim();
  if (!text) return;
  const res = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => null);
  if (res && res.ok) { input.value = ""; fetchTodos(); }
}

async function setTodoStatus(id, status) {
  await fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }).catch(() => null);
  fetchTodos();
}

async function deleteTodo(id) {
  const text = document.getElementById(`todo-${id}`)?.querySelector('.todo-text')?.textContent?.trim() || 'this task';
  if (!confirm(`Delete "${text}"?`)) return;
  await fetch(`/api/todos/${id}`, { method: "DELETE" }).catch(() => null);
  fetchTodos();
}

// ── Grocery list ──────────────────────────────────────────────────────────────
async function fetchGroceries() {
  const el = document.getElementById("grocery-list");
  if (!el) return;
  try {
    const items = await (await fetch("/api/groceries")).json();
    if (!items.length) {
      el.innerHTML = '<p class="muted" style="font-size:0.85rem;padding:0.5rem 0">List is empty</p>';
      return;
    }
    el.innerHTML = `<div class="todo-scroll">${items.map(g => `
      <div class="todo-item${g.done ? " done" : ""}" id="grocery-${g.id}">
        <button class="status-btn ${g.done ? "done" : ""}"
          title="${g.done ? "Mark needed" : "Mark got it"}"
          onclick="toggleGrocery(${g.id}, ${g.done ? 0 : 1})">${g.done ? "✓" : ""}</button>
        <span class="todo-text">${escapeHtml(g.text)}</span>
        <button class="btn-del" onclick="deleteGrocery(${g.id})" title="Remove">&times;</button>
      </div>`).join("")}</div>`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load grocery list</p>';
  }
}

async function addGrocery(e) {
  e.preventDefault();
  const input = document.getElementById("grocery-input");
  const text = input.value.trim();
  if (!text) return;
  const res = await fetch("/api/groceries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => null);
  if (res && res.ok) { input.value = ""; fetchGroceries(); }
}

async function toggleGrocery(id, done) {
  await fetch(`/api/groceries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done }),
  }).catch(() => null);
  fetchGroceries();
}

async function deleteGrocery(id) {
  const text = document.getElementById(`grocery-${id}`)?.querySelector('.todo-text')?.textContent?.trim() || 'this item';
  if (!confirm(`Remove "${text}" from the grocery list?`)) return;
  await fetch(`/api/groceries/${id}`, { method: "DELETE" }).catch(() => null);
  fetchGroceries();
}

// ── Vehicles / Oil Changes (dashboard card) ───────────────────────────────────
async function fetchVehicles() {
  const el = document.getElementById("vehicles-content");
  if (!el) return;
  try {
    const vehicles = await (await fetch("/api/vehicles")).json();
    if (!vehicles.length) {
      el.innerHTML = '<p class="muted" style="font-size:.85rem">No vehicles yet. <a href="/vehicles" style="color:var(--accent)">Add one</a>.</p>';
      return;
    }
    el.innerHTML = vehicles.map(v => {
      let statusTxt, statusCls;
      if (v.days_since === null) {
        statusTxt = "No record"; statusCls = "none";
      } else if (v.days_since < 120) {
        statusTxt = `${v.days_since}d ago`; statusCls = "ok";
      } else if (v.days_since < 180) {
        statusTxt = `${v.days_since}d ago — coming up`; statusCls = "warn";
      } else {
        statusTxt = `${v.days_since}d ago — OVERDUE`; statusCls = "overdue";
      }
      return `
        <div class="vehicle-row">
          <span class="vehicle-name">${escapeHtml(v.name)}</span>
          <span class="vehicle-status ${statusCls}">${statusTxt}</span>
          <button class="btn-log-change" onclick="logOilChange(${v.id})">&#128197; Log</button>
        </div>`;
    }).join("");
  } catch {
    el.innerHTML = '<p class="error">Failed to load vehicles</p>';
  }
}

async function logOilChange(vehicleId) {
  const res = await fetch(`/api/vehicles/${vehicleId}/oil-change`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changed_at: new Date().toISOString().slice(0, 10) }),
  }).catch(() => null);
  if (res && res.ok) fetchVehicles();
}

// ── Storage search (dashboard card) ──────────────────────────────────────────
let _storageSearchTimer = null;
function searchStorage(query) {
  const el = document.getElementById("storage-search-results");
  if (!el) return;
  clearTimeout(_storageSearchTimer);
  if (!query.trim()) { el.innerHTML = ""; return; }
  _storageSearchTimer = setTimeout(async () => {
    try {
      const results = await (await fetch(`/api/storage/search?q=${encodeURIComponent(query)}`)).json();
      if (!results.length) {
        el.innerHTML = '<div class="storage-no-results">No items found.</div>';
        return;
      }
      el.innerHTML = results.map(r => `
        <div class="storage-result">
          <span class="storage-result-name">${escapeHtml(r.name)}</span>
          <span class="storage-result-loc">&#8594; ${escapeHtml(r.location_name)}</span>
          ${r.notes ? `<div class="storage-result-notes" style="width:100%;padding-left:0">${escapeHtml(r.notes)}</div>` : ""}
        </div>`).join("");
    } catch {
      el.innerHTML = '<div class="storage-no-results error">Search failed.</div>';
    }
  }, 250);
}

// ── TV Control ────────────────────────────────────────────────────────────────
async function turnOffTV(index, btn) {
  const name = btn.dataset.tv || `TV ${index + 1}`;
  const statusEl = document.getElementById("tv-status");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const d = await (await fetch(`/api/tv/off/${index}`, { method: "POST" })).json();
    statusEl.textContent = d.success ? `✓ ${name} turned off` : `✗ ${d.error}`;
    statusEl.className = `tv-status-msg ${d.success ? "success" : "error"}`;
  } catch {
    statusEl.textContent = "✗ Request failed";
    statusEl.className = "tv-status-msg error";
  }
  btn.disabled = false;
  btn.textContent = "⏻ Turn Off";
  setTimeout(() => { statusEl.textContent = ""; statusEl.className = "tv-status-msg"; }, 5000);
}

// ── Calendar ──────────────────────────────────────────────────────────────────
async function fetchCalendar() {
  const el = document.getElementById("cal-list");
  if (!el) return;
  try {
    const events = await (await fetch("/api/calendar")).json();
    if (!events.length) { el.innerHTML = '<p class="muted">No upcoming events.</p>'; return; }

    const today    = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const oneWeek  = new Date(today); oneWeek.setDate(today.getDate() + 7);

    const groups = {};
    for (const ev of events) {
      const d = new Date(ev.date + "T00:00:00");
      let label;
      if (d < today)             label = "Earlier";
      else if (+d === +today)    label = "Today";
      else if (+d === +tomorrow) label = "Tomorrow";
      else if (d < oneWeek) label = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
      else                  label = d.toLocaleDateString([], { month: "long", day: "numeric" });
      (groups[label] = groups[label] || []).push(ev);
    }

    el.innerHTML = Object.entries(groups).map(([label, evs]) => `
      <div class="cal-group-label">${escapeHtml(label)}</div>
      ${evs.map(ev => `
        <div class="cal-event">
          <div class="cal-event-time">${ev.time ? ev.time.slice(0,5) : "All day"}</div>
          <div class="cal-event-body">
            <div class="cal-event-title">${escapeHtml(ev.title)}</div>
            ${ev.notes ? `<div class="cal-event-notes">${escapeHtml(ev.notes)}</div>` : ""}
          </div>
          <button class="btn-del" onclick="deleteEvent(${ev.id})" title="Delete">&times;</button>
        </div>`).join("")}`).join("");
  } catch {
    el.innerHTML = '<p class="error">Failed to load calendar</p>';
  }
}

async function addEvent(e) {
  e.preventDefault();
  const title = document.getElementById("event-title").value.trim();
  const date  = document.getElementById("event-date").value;
  const time  = document.getElementById("event-time").value;
  if (!title || !date) return;
  const res = await fetch("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, date, time: time || null }),
  }).catch(() => null);
  if (res && res.ok) {
    document.getElementById("event-title").value = "";
    document.getElementById("event-date").value  = "";
    document.getElementById("event-time").value  = "";
    fetchCalendar();
  }
}

async function deleteEvent(id) {
  const btn   = document.querySelector(`[onclick="deleteEvent(${id})"]`);
  const title = btn?.closest('.cal-event')?.querySelector('.cal-event-title')?.textContent?.trim() || 'this event';
  if (!confirm(`Delete "${title}"?`)) return;
  await fetch(`/api/calendar/${id}`, { method: "DELETE" });
  fetchCalendar();
}

// ── Init & refresh (overview only) ────────────────────────────────────────────
function loadAll() {
  fetchWeather();
  fetchTVStatus();
  fetchStocks();
  fetchMoon();
  fetchVehicles();
  fetchPihole();
  fetchSystem();
  fetchQuote();
  fetchJoke();
  fetchPhoto();
  fetchCalendar();
}

if (document.getElementById("weather-content")) {
  loadAll();
  setInterval(fetchSystem,   10_000);
  setInterval(fetchTVStatus, 30_000);
  setInterval(fetchPihole,   60_000);
  setInterval(fetchVehicles, 5 * 60_000);
  setInterval(fetchStocks,   5 * 60_000);
  setInterval(fetchWeather,  10 * 60_000);
  setInterval(fetchMoon,     60 * 60_000);
  setInterval(fetchCalendar,      60_000);
}
