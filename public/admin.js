import { askPin } from './pin.js';

const CAT_LABELS = { kava: 'Káva', napoje: 'Nápoje', jidlo: 'Jídlo', ostatni: 'Ostatní' };
let orderChanged = false;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    await askPin({ force: true });
  } catch {
    window.location.href = '/';
    return;
  }
  await loadItems();
  document.getElementById('btnAdd').addEventListener('click', addItem);
  document.getElementById('btnSaveOrder').addEventListener('click', saveOrder);
}

// ── API ───────────────────────────────────────────────────────────────────────
async function loadItems() {
  const res   = await fetch('/api/items');
  const items = await res.json();
  orderChanged = false;
  document.getElementById('saveOrderBar').style.display = 'none';
  renderItems(items);
}

async function addItem() {
  const name     = document.getElementById('newName').value.trim();
  const price    = parseFloat(document.getElementById('newPrice').value);
  const category = document.getElementById('newCategory').value;

  if (!name || isNaN(price) || price <= 0) { showMsg('Vyplň název a platnou cenu.', '#e53935'); return; }

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

async function saveEdit(id) {
  const row      = document.querySelector(`.admin-item-row[data-id="${id}"]`);
  const name     = row.querySelector('.edit-name').value.trim();
  const price    = parseFloat(row.querySelector('.edit-price').value);
  const category = row.querySelector('.edit-cat').value;

  if (!name || isNaN(price) || price <= 0) { showMsg('Vyplň název a platnou cenu.', '#e53935'); return; }

  await fetch(`/api/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, category }),
  });
  showMsg(`"${name}" uloženo.`, '#4caf50');
  await loadItems();
}

async function deleteItem(id, name) {
  if (!confirm(`Opravdu odebrat "${name}" z menu?`)) return;
  await fetch(`/api/items/${id}`, { method: 'DELETE' });
  await loadItems();
}

async function saveOrder() {
  // Sesbírá ID všech viditelných řádků v aktuálním pořadí
  const ids = [...document.querySelectorAll('.admin-item-row')].map(r => r.dataset.id);
  const res = await fetch('/api/items/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (res.ok) {
    showMsg('Pořadí uloženo.', '#4caf50');
    orderChanged = false;
    document.getElementById('saveOrderBar').style.display = 'none';
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderItems(items) {
  const list = document.getElementById('itemsList');
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = '<div class="no-data">Žádné položky v menu.</div>';
    return;
  }

  // Skupiny podle kategorií
  const groups = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }

  for (const [cat, catItems] of Object.entries(groups)) {
    // Nadpis kategorie
    const title = document.createElement('div');
    title.className = 'section-title';
    title.style.marginTop = '16px';
    title.textContent = CAT_LABELS[cat] ?? cat;
    list.appendChild(title);

    // Kontejner pro drag & drop
    const group = document.createElement('div');
    group.className = 'sortable-group';
    group.dataset.cat = cat;

    for (const item of catItems) {
      const row = document.createElement('div');
      row.className   = 'admin-item-row';
      row.dataset.id  = item.id;
      row.dataset.cat = item.category;
      row.innerHTML = `
        <span class="drag-handle">⠿</span>
        <div class="ai-fields">
          <input class="edit-name"  value="${item.name}" placeholder="Název">
          <input class="edit-price" type="number" value="${item.price}" min="1" step="1" placeholder="Cena">
          <select class="edit-cat">
            <option value="kava"    ${item.category === 'kava'    ? 'selected' : ''}>Káva</option>
            <option value="napoje"  ${item.category === 'napoje'  ? 'selected' : ''}>Nápoje</option>
            <option value="jidlo"   ${item.category === 'jidlo'   ? 'selected' : ''}>Jídlo</option>
            <option value="ostatni" ${item.category === 'ostatni' ? 'selected' : ''}>Ostatní</option>
          </select>
        </div>
        <div class="ai-actions">
          <button class="btn-save"   data-id="${item.id}">Uložit</button>
          <button class="btn-delete" data-id="${item.id}" data-name="${item.name}">Odebrat</button>
        </div>
      `;
      group.appendChild(row);
    }

    list.appendChild(group);

    // Inicializace Sortable pro skupinu
    Sortable.create(group, {
      animation:  150,
      handle:     '.drag-handle',
      ghostClass: 'drag-ghost',
      onEnd() {
        orderChanged = true;
        document.getElementById('saveOrderBar').style.display = 'flex';
      },
    });
  }

  // Tlačítka
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
  el.textContent   = text;
  el.style.color   = color;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

init();
