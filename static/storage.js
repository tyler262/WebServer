// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function $(id) { return document.getElementById(id); }

// ── Load all locations ─────────────────────────────────────────────────────────
async function loadLocations() {
  const container = $('locations-container');
  try {
    const locs = await (await fetch('/api/storage')).json();
    if (!locs.length) {
      container.innerHTML = '<div class="card"><p class="muted">No locations yet — add one below.</p></div>';
      return;
    }
    container.innerHTML = locs.map(loc => renderLocation(loc)).join('');
  } catch {
    container.innerHTML = '<div class="card"><p class="error">Failed to load locations.</p></div>';
  }
}

function renderLocation(loc) {
  const items = loc.items || [];
  return `
    <div class="card storage-loc-card" id="loc-${loc.id}">
      <div class="storage-loc-header">
        <div>
          <span class="storage-loc-name">&#128205; ${esc(loc.name)}</span>
          <span class="storage-loc-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
        </div>
        <button class="btn-del" onclick="deleteLocation(${loc.id})" title="Delete location and all its items">&times; Delete</button>
      </div>
      <div class="storage-items-list" id="items-${loc.id}">
        ${items.length
          ? items.map(item => renderItem(item)).join('')
          : '<p class="muted" style="font-size:.85rem;padding:.3rem 0">No items yet.</p>'
        }
      </div>
      <form class="storage-add-item-form input-stack" onsubmit="addItem(event, ${loc.id})" style="margin-top:.75rem;margin-bottom:0">
        <div class="input-row" style="margin-bottom:.3rem">
          <input type="text" class="item-name-input" placeholder="Item name&hellip;" maxlength="300" autocomplete="off">
          <button type="submit" class="btn-submit">Add</button>
        </div>
        <input type="text" class="item-notes-input" placeholder="Notes (optional — e.g. red box, behind the skis)&hellip;" maxlength="500" autocomplete="off">
      </form>
    </div>`;
}

function renderItem(item) {
  return `
    <div class="storage-item" id="item-${item.id}">
      <div class="storage-item-body">
        <span class="storage-item-name">${esc(item.name)}</span>
        ${item.notes ? `<span class="storage-item-notes">${esc(item.notes)}</span>` : ''}
      </div>
      <button class="btn-del" onclick="deleteItem(${item.id}, ${item.location_id})" title="Remove item">&times;</button>
    </div>`;
}

// ── Add location ───────────────────────────────────────────────────────────────
async function addLocation() {
  const input = $('new-loc-name');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }

  const res = await fetch('/api/storage/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => null);

  if (res && res.ok) {
    input.value = '';
    await loadLocations();
    // Scroll to the new location
    const last = document.querySelector('#locations-container .storage-loc-card:last-child');
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    const statusEl = $('new-loc-status');
    statusEl.textContent = '✗ Failed to add location';
    statusEl.className = 'settings-status err';
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'settings-status'; }, 3000);
  }
}

// ── Delete location ────────────────────────────────────────────────────────────
async function deleteLocation(locId) {
  const card = $(`loc-${locId}`);
  const name = card ? card.querySelector('.storage-loc-name').textContent.replace('📍', '').trim() : 'this location';
  const count = card ? parseInt(card.querySelector('.storage-loc-count').textContent) : 0;
  const msg = count > 0
    ? `Delete "${name}" and all ${count} item${count !== 1 ? 's' : ''} in it?`
    : `Delete "${name}"?`;
  if (!confirm(msg)) return;

  await fetch(`/api/storage/locations/${locId}`, { method: 'DELETE' }).catch(() => null);
  await loadLocations();
}

// ── Add item ───────────────────────────────────────────────────────────────────
async function addItem(e, locId) {
  e.preventDefault();
  const form = e.target;
  const nameInput  = form.querySelector('.item-name-input');
  const notesInput = form.querySelector('.item-notes-input');
  const name  = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  const res = await fetch('/api/storage/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_id: locId, name, notes: notesInput.value.trim() }),
  }).catch(() => null);

  if (res && res.ok) {
    const item = await res.json();
    nameInput.value  = '';
    notesInput.value = '';
    nameInput.focus();
    // Update count and list without full reload
    const listEl = $(`items-${locId}`);
    const emptyEl = listEl.querySelector('.muted');
    if (emptyEl) emptyEl.remove();
    listEl.insertAdjacentHTML('beforeend', renderItem(item));
    updateCount(locId, 1);
  }
}

// ── Delete item ────────────────────────────────────────────────────────────────
async function deleteItem(itemId, locId) {
  const name = $(`item-${itemId}`)?.querySelector('.storage-item-name')?.textContent?.trim() || 'this item';
  if (!confirm(`Remove "${name}"?`)) return;
  await fetch(`/api/storage/items/${itemId}`, { method: 'DELETE' }).catch(() => null);
  const el = $(`item-${itemId}`);
  if (el) el.remove();
  const listEl = $(`items-${locId}`);
  if (listEl && !listEl.children.length) {
    listEl.innerHTML = '<p class="muted" style="font-size:.85rem;padding:.3rem 0">No items yet.</p>';
  }
  updateCount(locId, -1);
}

function updateCount(locId, delta) {
  const card = $(`loc-${locId}`);
  if (!card) return;
  const countEl = card.querySelector('.storage-loc-count');
  if (!countEl) return;
  const current = parseInt(countEl.textContent) || 0;
  const n = current + delta;
  countEl.textContent = `${n} item${n !== 1 ? 's' : ''}`;
}

// ── Page-level search ──────────────────────────────────────────────────────────
let _searchTimer = null;
function pageSearch(query) {
  const el = $('page-search-results');
  clearTimeout(_searchTimer);
  if (!query.trim()) { el.innerHTML = ''; return; }
  _searchTimer = setTimeout(async () => {
    try {
      const results = await (await fetch('/api/storage/search?q=' + encodeURIComponent(query))).json();
      if (!results.length) {
        el.innerHTML = '<p class="storage-no-results">No items found.</p>';
        return;
      }
      el.innerHTML = `<div class="storage-search-list">${results.map(r => `
        <div class="storage-search-row">
          <span class="storage-search-item">${esc(r.name)}</span>
          <span class="storage-search-arrow">&#8594;</span>
          <a href="#loc-${r.location_id}" class="storage-search-loc">${esc(r.location_name)}</a>
          ${r.notes ? `<span class="storage-search-notes">${esc(r.notes)}</span>` : ''}
        </div>`).join('')}</div>`;
    } catch {
      el.innerHTML = '<p class="error">Search failed.</p>';
    }
  }, 200);
}

// ── Init ───────────────────────────────────────────────────────────────────────
loadLocations();
