// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
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
  const name = document.getElementById('newName').value.trim();
  const price = parseFloat(document.getElementById('newPrice').value);
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
    document.getElementById('newName').value = '';
    document.getElementById('newPrice').value = '';
    showMsg(`"${name}" přidáno.`, '#4caf50');
    await loadItems();
  }
}

async function deleteItem(id, name) {
  if (!confirm(`Opravdu skrýt "${name}" z menu?`)) return;
  await fetch(`/api/items/${id}`, { method: 'DELETE' });
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

  // Seskupit podle kategorií
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
      row.innerHTML = `
        <span class="ai-name">${item.name}</span>
        <span class="ai-price">${item.price} Kč</span>
        <button class="btn-delete" data-id="${item.id}" data-name="${item.name}">Odebrat</button>
      `;
      list.appendChild(row);
    }
  }

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.id, btn.dataset.name));
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function showMsg(text, color) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.style.color = color;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

init();
