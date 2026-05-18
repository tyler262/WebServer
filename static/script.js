// Clock
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
function timeAgo(str) {
  try {
    const diff = (Date.now() - new Date(str)) / 60000;
    if (diff < 60)    return Math.round(diff) + "m ago";
    if (diff < 1440)  return Math.round(diff / 60) + "h ago";
    return new Date(str).toLocaleDateString();
  } catch { return ""; }
}

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
}

updateClock();
loadAll();

setInterval(updateClock,   1_000);
setInterval(fetchSystem,  10_000);
setInterval(fetchDevices, 30_000);
setInterval(fetchPihole,  60_000);
setInterval(fetchWeather, 10 * 60_000);
setInterval(fetchNews,    30 * 60_000);
