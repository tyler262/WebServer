// ── OTA Update ────────────────────────────────────────────────────────────────
function openUpdateModal() {
  document.getElementById("update-modal").style.display = "flex";
  document.getElementById("update-pw").focus();
}

function closeUpdateModal() {
  document.getElementById("update-modal").style.display = "none";
  document.getElementById("update-body").innerHTML = `
    <p class="modal-hint">Pulls the latest code from GitHub and restarts the server.</p>
    <div class="input-row">
      <input id="update-pw" type="password" placeholder="Password" autocomplete="off"
             onkeydown="if(event.key==='Enter')runUpdate()">
      <button class="btn-submit" onclick="runUpdate()">Pull &amp; Restart</button>
    </div>`;
}

async function runUpdate() {
  const pw = document.getElementById("update-pw").value;
  if (!pw) return;

  const body = document.getElementById("update-body");
  body.innerHTML = `<p class="modal-hint">Pulling from GitHub…</p>`;

  try {
    const res = await fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();

    if (!res.ok) {
      body.innerHTML = `
        <p class="modal-hint" style="color:var(--danger)">&#10005; ${escapeHtml(data.error)}</p>
        <pre class="modal-output">${escapeHtml(data.output || "")}</pre>
        <button class="btn-submit" onclick="closeUpdateModal()" style="margin-top:.5rem">Close</button>`;
      return;
    }

    let secs = 8;
    body.innerHTML = `
      <p class="modal-hint" style="color:var(--success)">&#10003; Update successful — restarting…</p>
      <pre class="modal-output">${escapeHtml(data.output || "")}</pre>
      <p class="modal-status" id="reload-countdown">Page reloads in ${secs}s</p>`;

    const interval = setInterval(() => {
      secs--;
      const el = document.getElementById("reload-countdown");
      if (el) el.textContent = `Page reloads in ${secs}s`;
      if (secs <= 0) { clearInterval(interval); location.reload(); }
    }, 1000);

  } catch (e) {
    body.innerHTML = `<p class="modal-hint" style="color:var(--danger)">&#10005; ${escapeHtml(e.message)}</p>`;
  }
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(str) {
  try {
    const d = new Date(str.replace(" ", "T"));
    return d.toLocaleDateString([], { month: "short", day: "numeric" })
      + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return str; }
}

function timeAgo(str) {
  try {
    const diff = (Date.now() - new Date(str)) / 60000;
    if (diff < 60)   return Math.round(diff) + "m ago";
    if (diff < 1440) return Math.round(diff / 60) + "h ago";
    return new Date(str).toLocaleDateString();
  } catch { return ""; }
}

// ── Weather ───────────────────────────────────────────────────────────────────
async function fetchWeather() {
  const el = document.getElementById("weather-content");
  try {
    const d = await (await fetch("/api/weather")).json();
    if (d.error) { el.innerHTML = `<p class="error">${d.error}</p>`; return; }
    el.innerHTML = `
      <div class="weather-main">
        <span class="weather-icon">${d.icon}</span>
        <div>
          <div class="weather-temp">${d.temp}${d.unit}</div>
          <div class="weather-desc">${d.description}</div>
          <div class="weather-city">${d.city}</div>
        </div>
      </div>
      <div class="weather-meta">
        <span>&#128167; ${d.humidity}%</span>
        <span>&#128168; ${d.wind} mph</span>
        <span>&#127777;&#65039; Feels ${d.feels_like}${d.unit}</span>
      </div>`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load weather</p>';
  }
}

// ── News ──────────────────────────────────────────────────────────────────────
async function fetchNews() {
  const el = document.getElementById("news-content");
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

// ── Devices ───────────────────────────────────────────────────────────────────
async function fetchDevices() {
  const el = document.getElementById("devices-content");
  try {
    const devices = await (await fetch("/api/devices")).json();
    if (!devices.length) { el.innerHTML = '<p class="muted">No devices configured</p>'; return; }
    el.innerHTML = `<div class="devices-grid">${devices.map(d => `
      <div class="device-chip">
        <span class="dot ${d.online ? "online" : "offline"}"></span>
        <div>
          <div>${d.name}</div>
          <div class="device-sub">${d.ip} &mdash; ${d.online ? "Online" : "Offline"}</div>
        </div>
      </div>`).join("")}</div>`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load devices</p>';
  }
}

// ── Pi-hole ───────────────────────────────────────────────────────────────────
async function fetchPihole() {
  const el = document.getElementById("pihole-content");
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

// ── Todo list (3-state: 0=pending, 1=in progress, 2=done) ────────────────────
const TODO_STATUS = [
  { cls: "pending",     icon: "",  next: 1 },
  { cls: "in-progress", icon: "▶", next: 2 },
  { cls: "done",        icon: "✓", next: 0 },
];

async function fetchTodos() {
  const el = document.getElementById("todo-list");
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
  await fetch(`/api/todos/${id}`, { method: "DELETE" }).catch(() => null);
  fetchTodos();
}

// ── Grocery list ──────────────────────────────────────────────────────────────
async function fetchGroceries() {
  const el = document.getElementById("grocery-list");
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
  await fetch(`/api/groceries/${id}`, { method: "DELETE" }).catch(() => null);
  fetchGroceries();
}

// ── Suggestions ───────────────────────────────────────────────────────────────
async function fetchNotes() {
  const el = document.getElementById("notes-list");
  try {
    const notes = await (await fetch("/api/notes")).json();
    if (!notes.length) {
      el.innerHTML = '<p class="muted" style="font-size:0.85rem;padding:0.5rem 0">No suggestions yet</p>';
      return;
    }
    el.innerHTML = `<div class="notes-scroll">${notes.map(n => `
      <div class="note-item" id="note-${n.id}">
        <div class="note-header">
          <span class="note-name">${escapeHtml(n.name || "Anonymous")}</span>
          <span class="note-time">${n.created_at ? fmtDate(n.created_at) : ""}</span>
        </div>
        <div class="note-body">${escapeHtml(n.text)}</div>
        <button class="btn-del" onclick="deleteNote(${n.id})" title="Delete">&times;</button>
      </div>`).join("")}</div>`;
  } catch {
    el.innerHTML = '<p class="error">Failed to load suggestions</p>';
  }
}

async function addNote(e) {
  e.preventDefault();
  const nameEl = document.getElementById("note-name");
  const textEl = document.getElementById("note-text");
  const text = textEl.value.trim();
  if (!text) return;
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nameEl.value.trim(), text }),
  }).catch(() => null);
  if (res && res.ok) { textEl.value = ""; nameEl.value = ""; fetchNotes(); }
}

async function deleteNote(id) {
  await fetch(`/api/notes/${id}`, { method: "DELETE" }).catch(() => null);
  fetchNotes();
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

// ── Init & refresh ────────────────────────────────────────────────────────────
function loadAll() {
  fetchWeather();
  fetchNews();
  fetchDevices();
  fetchPihole();
  fetchSystem();
  fetchQuote();
  fetchJoke();
  fetchPhoto();
  fetchTodos();
  fetchGroceries();
  fetchNotes();
}

updateClock();
loadAll();

setInterval(updateClock,    1_000);
setInterval(fetchSystem,   10_000);
setInterval(fetchTodos,    15_000);
setInterval(fetchGroceries,15_000);
setInterval(fetchNotes,    15_000);
setInterval(fetchDevices,  30_000);
setInterval(fetchPihole,   60_000);
setInterval(fetchWeather,  10 * 60_000);
setInterval(fetchNews,     30 * 60_000);
