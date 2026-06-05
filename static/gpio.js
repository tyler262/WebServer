// ── Pin reference data ────────────────────────────────────────────────────────
// [board_pin, label, type, bcm_gpio_or_null]
const PINS = [
  [1,  "3.3V",    "power33", null], [2,  "5V",      "power5",  null],
  [3,  "GPIO 2",  "i2c",     2],    [4,  "5V",      "power5",  null],
  [5,  "GPIO 3",  "i2c",     3],    [6,  "GND",     "gnd",     null],
  [7,  "GPIO 4",  "gpio",    4],    [8,  "GPIO 14", "uart",    14],
  [9,  "GND",     "gnd",     null], [10, "GPIO 15", "uart",    15],
  [11, "GPIO 17", "gpio",    17],   [12, "GPIO 18", "gpio",    18],
  [13, "GPIO 27", "gpio",    27],   [14, "GND",     "gnd",     null],
  [15, "GPIO 22", "gpio",    22],   [16, "GPIO 23", "gpio",    23],
  [17, "3.3V",    "power33", null], [18, "GPIO 24", "gpio",    24],
  [19, "GPIO 10", "spi",     10],   [20, "GND",     "gnd",     null],
  [21, "GPIO 9",  "spi",     9],    [22, "GPIO 25", "gpio",    25],
  [23, "GPIO 11", "spi",     11],   [24, "GPIO 8",  "spi",     8],
  [25, "GND",     "gnd",     null], [26, "GPIO 7",  "spi",     7],
  [27, "GPIO 0",  "i2c",     0],    [28, "GPIO 1",  "i2c",     1],
  [29, "GPIO 5",  "gpio",    5],    [30, "GND",     "gnd",     null],
  [31, "GPIO 6",  "gpio",    6],    [32, "GPIO 12", "gpio",    12],
  [33, "GPIO 13", "gpio",    13],   [34, "GND",     "gnd",     null],
  [35, "GPIO 19", "spi",     19],   [36, "GPIO 16", "gpio",    16],
  [37, "GPIO 26", "gpio",    26],   [38, "GPIO 20", "gpio",    20],
  [39, "GND",     "gnd",     null], [40, "GPIO 21", "gpio",    21],
];

// ── State ─────────────────────────────────────────────────────────────────────
let configuredPins = [];

// ── Load pins ─────────────────────────────────────────────────────────────────
async function loadPins() {
  const el = document.getElementById("gpio-pins-content");
  try {
    const data = await (await fetch("/api/gpio/pins")).json();
    configuredPins = data.pins || [];

    if (!data.available) {
      const warn = '<div class="gpio-unavail">&#9888; RPi.GPIO not available — running in simulation mode. Install on Pi: <code>pip install RPi.GPIO</code> (Pi 4) or <code>pip install rpi-lgpio</code> (Pi 5).</div>';
      el.innerHTML = warn + renderPins(configuredPins);
    } else {
      el.innerHTML = renderPins(configuredPins);
    }

    renderPinMap();
  } catch {
    el.innerHTML = '<p class="error">Failed to load GPIO pins</p>';
  }
}

function renderPins(pins) {
  if (!pins.length) {
    return '<p class="muted" style="font-size:.85rem">No pins configured yet. Add one using the form →</p>';
  }
  return pins.map(p => `
    <div class="gpio-pin-row" id="gpio-row-${p.pin}">
      <div class="gpio-pin-info">
        <span class="gpio-pin-name">${escapeHtml(p.name)}</span>
        <span class="gpio-pin-meta">GPIO ${p.pin} &middot; ${p.mode}${p.pull ? " &middot; pull-" + p.pull : ""}</span>
      </div>
      ${p.mode === "output"
        ? `<button class="gpio-toggle ${p.state ? "on" : "off"}" onclick="togglePin(${p.pin}, ${p.state ? 0 : 1})">
             ${p.state ? "HIGH" : "LOW"}
           </button>`
        : `<span class="gpio-input-state ${p.state ? "high" : "low"}">${p.state ? "HIGH" : "LOW"}</span>`
      }
      <button class="btn-del" onclick="deletePin(${p.pin})" title="Remove">&times;</button>
    </div>`).join("");
}

// ── Toggle output pin ─────────────────────────────────────────────────────────
async function togglePin(pinNum, newState) {
  try {
    const res = await fetch(`/api/gpio/pins/${pinNum}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: newState }),
    });
    if (res.ok) loadPins();
  } catch { /* silent */ }
}

// ── Add pin ───────────────────────────────────────────────────────────────────
async function addPin() {
  const name = document.getElementById("gpio-name").value.trim();
  const pin  = parseInt(document.getElementById("gpio-pin").value);
  const mode = document.getElementById("gpio-mode").value;
  const pull = document.getElementById("gpio-pull").value;
  const statusEl = document.getElementById("gpio-add-status");

  if (!name || isNaN(pin)) {
    statusEl.textContent = "Name and pin number are required.";
    statusEl.className = "settings-status err";
    return;
  }

  try {
    const res = await fetch("/api/gpio/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, name, mode, pull }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = "✗ " + (data.error || "Failed");
      statusEl.className = "settings-status err";
      return;
    }
    statusEl.textContent = `✓ GPIO ${pin} added`;
    statusEl.className = "settings-status ok";
    document.getElementById("gpio-name").value = "";
    document.getElementById("gpio-pin").value  = "";
    setTimeout(() => { statusEl.textContent = ""; statusEl.className = "settings-status"; }, 3000);
    loadPins();
  } catch {
    statusEl.textContent = "✗ Request failed";
    statusEl.className = "settings-status err";
  }
}

// ── Delete pin ────────────────────────────────────────────────────────────────
async function deletePin(pinNum) {
  const row  = document.getElementById(`gpio-row-${pinNum}`);
  const name = row?.querySelector('.gpio-pin-name')?.textContent?.trim() || `GPIO ${pinNum}`;
  if (!confirm(`Remove "${name}" (GPIO ${pinNum})?`)) return;
  await fetch(`/api/gpio/pins/${pinNum}`, { method: "DELETE" });
  loadPins();
}

// ── Pull option visibility ────────────────────────────────────────────────────
function togglePullOption() {
  const mode = document.getElementById("gpio-mode").value;
  document.getElementById("gpio-pull-group").style.display = mode === "input" ? "" : "none";
}

// ── I2C Scanner ───────────────────────────────────────────────────────────────
async function runI2CScan() {
  const statusEl = document.getElementById("i2c-status");
  const outputEl = document.getElementById("i2c-output");
  statusEl.textContent = "Scanning…";
  statusEl.className = "settings-status";
  outputEl.style.display = "none";
  try {
    const data = await (await fetch("/api/gpio/i2c-scan")).json();
    if (data.error) {
      statusEl.textContent = "✗ " + data.error;
      statusEl.className = "settings-status err";
      return;
    }
    outputEl.textContent = data.output;
    outputEl.style.display = "block";
    const hasDevices = /[0-9a-f][0-9a-f]/i.test(data.output.replace(/UU/g, ""));
    statusEl.textContent = hasDevices ? "✓ Devices found (addresses shown below)" : "✓ No I2C devices detected";
    statusEl.className = "settings-status ok";
  } catch {
    statusEl.textContent = "✗ Scan failed";
    statusEl.className = "settings-status err";
  }
}

// ── Serial ports ──────────────────────────────────────────────────────────────
async function loadSerialPorts() {
  const el = document.getElementById("serial-content");
  try {
    const ports = await (await fetch("/api/gpio/serial-ports")).json();
    if (!ports.length) {
      el.innerHTML = '<p class="muted" style="font-size:.85rem">No serial ports detected.</p>';
      return;
    }
    el.innerHTML = ports.map(p => `
      <div class="serial-row">
        <code class="serial-port">${escapeHtml(p.port)}</code>
      </div>`).join("");
  } catch {
    el.innerHTML = '<p class="error">Failed to load ports</p>';
  }
}

// ── Pin reference map ─────────────────────────────────────────────────────────
function renderPinMap() {
  const el = document.getElementById("pin-map");
  if (!el) return;
  const configured = new Set(configuredPins.map(p => p.pin));
  let html = '<div class="pin-map">';
  for (let i = 0; i < PINS.length; i += 2) {
    const L = PINS[i], R = PINS[i + 1];
    const lUsed = L[3] !== null && configured.has(L[3]);
    const rUsed = R[3] !== null && configured.has(R[3]);
    html += `
      <div class="pin-row">
        <div class="pin-chip type-${L[2]}${lUsed ? " used" : ""}" title="Board ${L[0]}${L[3] !== null ? ' · BCM ' + L[3] : ''}">
          <span class="pin-num">${L[0]}</span>
          <span class="pin-lbl">${L[1]}</span>
        </div>
        <div class="pin-chip type-${R[2]}${rUsed ? " used" : ""}" title="Board ${R[0]}${R[3] !== null ? ' · BCM ' + R[3] : ''}">
          <span class="pin-lbl">${R[1]}</span>
          <span class="pin-num">${R[0]}</span>
        </div>
      </div>`;
  }
  html += "</div>";
  el.innerHTML = html;
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadPins();
loadSerialPorts();
setInterval(loadPins, 5_000);
