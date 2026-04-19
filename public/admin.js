import { askPin } from './pin.js';

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    await askPin({ force: true });
  } catch {
    // PIN zrušen — vrátit zpět na pokladnu
    window.location.href = '/';
    return;
  }
  await loadItems();
  document.getElementById('btnAdd').addEventListener('click', addItem);
}

// ── API ───────────────────────────────────────────────────────────────────────
async function loadItems() {
  const res = await fetch('/api/items');
  const items = await res.json();
  renderItems(items);
}

async function addItem() {
  const name     = document.getElementById('newName').value.trim();
  const price    = parseFloat(document.getElementById('newPrice').value);
  const category = document.getElementById('newCategory').value;

  if (!name || isNaN(price) || price <= 0) {
    showMsg('Vyplň název a platnou cenu.', '#e53935');
    return;
  }

  const res = await fetch('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, category }),
  });

  if (res.ok) {
    document.getElementById('newName').value  = '';
    document.getElementById('newPrice').value = '';
    showMsg(`"${name}" přidáno.`, '#4caf50');
    await loadItems();
  }
}

async function moveItem(id, direction) {
  await fetch(`/api/items/${id}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
  await loadItems();
}

async function deleteItem(id, name) {
  if (!confirm(`Opravdu odebrat "${name}" z menu?`)) return;
  await fetch(`/api/items/${id}`, { method: 'DELETE' });
  await loadItems();
}

async function saveEdit(id) {
  const row      = document.querySelector(`.admin-item-row[data-id="${id}"]`);
  const name     = row.querySelector('.edit-name').value.trim();
  const price    = parseFloat(row.querySelector('.edit-price').value);
  const category = row.querySelector('.edit-cat').value;

  if (!name || isNaN(price) || price <= 0) {
    showMsg('Vyplň název a platnou cenu.', '#e53935');
    return;
  }

  await fetch(`/api/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, category }),
  });

  showMsg(`"${name}" uloženo.`, '#4caf50');
  await loadItems();
}

// ── Render ────────────────────────────────────────────────────────────────────
const CAT_LABELS = { kava: 'Káva', napoje: 'Nápoje', jidlo: 'Jídlo', ostatni: 'Ostatní' };

function renderItems(items) {
  const list = document.getElementById('itemsList');

  if (!items.length) {
    list.innerHTML = '<div class="no-data">Žádné položky v menu.</div>';
    return;
  }

  const groups = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }

  list.innerHTML = '';
  for (const [cat, catItems] of Object.entries(groups)) {
    const title = document.createElement('div');
    title.className = 'section-title';
    title.style.marginTop = '16px';
    title.textContent = CAT_LABELS[cat] ?? cat;
    list.appendChild(title);

    for (const item of catItems) {
      const row = document.createElement('div');
      row.className = 'admin-item-row';
      row.dataset.id  = item.id;
      row.dataset.cat = item.category;
      row.innerHTML = `
        <div class="ai-fields">
          <input class="edit-name" value="${item.name}" placeholder="Název">
          <input class="edit-price" type="number" value="${item.price}" min="1" step="1" placeholder="Cena">
          <select class="edit-cat">
            <option value="kava"    ${item.category === 'kava'    ? 'selected' : ''}>Káva</option>
            <option value="napoje"  ${item.category === 'napoje'  ? 'selected' : ''}>Nápoje</option>
            <option value="jidlo"   ${item.category === 'jidlo'   ? 'selected' : ''}>Jídlo</option>
            <option value="ostatni" ${item.category === 'ostatni' ? 'selected' : ''}>Ostatní</option>
          </select>
        </div>
        <div class="ai-actions">
          <button class="btn-move" data-id="${item.id}" data-dir="up"   title="Přesunout nahoru">↑</button>
          <button class="btn-move" data-id="${item.id}" data-dir="down" title="Přesunout dolů">↓</button>
          <button class="btn-save"   data-id="${item.id}">Uložit</button>
          <button class="btn-delete" data-id="${item.id}" data-name="${item.name}">Odebrat</button>
        </div>
      `;
      list.appendChild(row);
    }
  }

  list.querySelectorAll('.btn-move').forEach(btn => {
    btn.addEventListener('click', () => moveItem(btn.dataset.id, btn.dataset.dir));
  });
  list.querySelectorAll('.btn-save').forEach(btn => {
    btn.addEventListener('click', () => saveEdit(btn.dataset.id));
  });
  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.id, btn.dataset.name));
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function showMsg(text, color) {
  const el = document.getElementById('formMsg');
  el.textContent  = text;
  el.style.color  = color;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

init();
