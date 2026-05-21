// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function $(id) { return document.getElementById(id); }

function statusInfo(days) {
  if (days === null) return { text: 'No oil change on record', cls: 'none' };
  if (days < 120)   return { text: `${days} days since last change — good`, cls: 'ok' };
  if (days < 180)   return { text: `${days} days since last change — due soon`, cls: 'warn' };
  return               { text: `${days} days since last change — OVERDUE`, cls: 'overdue' };
}

// ── Load ───────────────────────────────────────────────────────────────────────
async function loadVehicles() {
  const c = $('vehicles-container');
  try {
    const vehicles = await (await fetch('/api/vehicles')).json();
    if (!vehicles.length) {
      c.innerHTML = '<div class="card"><p class="muted">No vehicles yet — add one below.</p></div>';
      return;
    }
    c.innerHTML = vehicles.map(v => renderVehicle(v)).join('');
  } catch {
    c.innerHTML = '<div class="card"><p class="error">Failed to load.</p></div>';
  }
}

function renderVehicle(v) {
  const st = statusInfo(v.days_since);
  const lastDate = v.last_change ? v.last_change.changed_at : null;
  const history = v.history || [];

  const historyHtml = history.length ? history.map(h => `
    <div class="oil-history-item">
      <span class="oil-history-date">${esc(h.changed_at)}</span>
      <span class="oil-history-notes">${esc(h.notes || '—')}</span>
      <button class="btn-del" onclick="deleteChange(${h.id}, ${v.id})" title="Remove record">&times;</button>
    </div>`).join('') : '<p class="muted" style="font-size:.82rem">No history yet.</p>';

  return `
    <div class="card" id="v-${v.id}" style="margin-bottom:0">
      <div class="vehicle-card-header">
        <div>
          <div class="vehicle-card-title">&#128663; ${esc(v.name)}</div>
          <div class="vehicle-big-status ${st.cls}">${st.text}</div>
        </div>
        <button class="btn-del" onclick="deleteVehicle(${v.id})" style="font-size:.8rem;border:1px solid var(--card-border);border-radius:4px;padding:.2rem .5rem">&times; Remove</button>
      </div>

      <div style="margin-bottom:.75rem">
        <div class="field-label" style="margin-bottom:.4rem">Log Oil Change</div>
        <div class="input-stack" style="margin-bottom:0">
          <div class="input-row" style="margin-bottom:.3rem">
            <input type="date" id="date-${v.id}" value="${new Date().toISOString().slice(0,10)}">
            <button class="btn-submit" onclick="logChange(${v.id})">Log Change</button>
          </div>
          <input type="text" id="notes-${v.id}" placeholder="Notes (optional) — e.g. Jiffy Lube, synthetic 5W-30&hellip;" maxlength="300" autocomplete="off">
        </div>
      </div>

      <div class="field-label" style="margin-bottom:.4rem">History</div>
      <div id="history-${v.id}">${historyHtml}</div>
    </div>`;
}

// ── Add vehicle ────────────────────────────────────────────────────────────────
async function addVehicle() {
  const input = $('new-vehicle-name');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }
  const res = await fetch('/api/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => null);
  if (res && res.ok) {
    input.value = '';
    await loadVehicles();
  } else {
    const st = $('new-vehicle-status');
    st.textContent = '✗ Failed'; st.className = 'settings-status err';
    setTimeout(() => { st.textContent = ''; st.className = 'settings-status'; }, 3000);
  }
}

// ── Delete vehicle ─────────────────────────────────────────────────────────────
async function deleteVehicle(id) {
  const card = $(`v-${id}`);
  const name = card ? card.querySelector('.vehicle-card-title').textContent.replace(/^🚗\s*/,'').trim() : 'this vehicle';
  if (!confirm(`Remove "${name}" and all its oil change history?`)) return;
  await fetch(`/api/vehicles/${id}`, { method: 'DELETE' }).catch(() => null);
  await loadVehicles();
}

// ── Log oil change ─────────────────────────────────────────────────────────────
async function logChange(vehicleId) {
  const dateVal  = $(`date-${vehicleId}`).value;
  const notesVal = $(`notes-${vehicleId}`).value.trim();
  if (!dateVal) return;
  const res = await fetch(`/api/vehicles/${vehicleId}/oil-change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changed_at: dateVal, notes: notesVal }),
  }).catch(() => null);
  if (res && res.ok) {
    $(`notes-${vehicleId}`).value = '';
    await loadVehicles();
  }
}

// ── Delete a change record ─────────────────────────────────────────────────────
async function deleteChange(changeId, vehicleId) {
  await fetch(`/api/oil-changes/${changeId}`, { method: 'DELETE' }).catch(() => null);
  await loadVehicles();
}

// ── Init ───────────────────────────────────────────────────────────────────────
loadVehicles();
