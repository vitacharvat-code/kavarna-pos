import { saveOrder, markSynced, getUnsynced, unsyncedCount } from './localdb.js';

// ── State ─────────────────────────────────────────────────────────────────────
let items          = [];
let order          = [];
let activeCategory = 'vse';
let isSyncing      = false;

const CATEGORIES = { vse: 'Vše', kava: 'Káva', napoje: 'Nápoje', jidlo: 'Jídlo' };

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  registerSW();
  await loadItems();
  renderTabs();
  renderItems();
  renderOrder();
  setupSync();

  document.getElementById('btnClear').addEventListener('click', clearOrder);
  document.getElementById('btnCash').addEventListener('click', () => pay('hotovost'));
  document.getElementById('btnCard').addEventListener('click', () => pay('ucet'));
  document.getElementById('modalOk').addEventListener('click', closeModal);
}

// ── Service Worker ────────────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }
}

// ── Sync engine ───────────────────────────────────────────────────────────────
function setupSync() {
  updateSyncBadge();

  // Sync při obnovení připojení
  window.addEventListener('online',  () => { updateOnlineStatus(true);  syncPending(); });
  window.addEventListener('offline', () => { updateOnlineStatus(false); });
  updateOnlineStatus(navigator.onLine);

  // Periodický sync každých 30 s
  setInterval(() => { if (navigator.onLine) syncPending(); }, 30_000);
}

async function syncPending() {
  if (isSyncing) return;
  const pending = getUnsynced();
  if (!pending.length) return;

  isSyncing = true;
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders: pending }),
    });

    if (res.ok) {
      markSynced(pending.map(o => o.id));
    }
  } catch {
    // Offline nebo server nedostupný — zkusíme příště
  } finally {
    isSyncing = false;
    updateSyncBadge();
  }
}

function updateSyncBadge() {
  const count = unsyncedCount();
  const badge = document.getElementById('syncBadge');
  if (!badge) return;
  badge.textContent   = count > 0 ? `${count} čeká` : '';
  badge.style.display = count > 0 ? 'inline-block' : 'none';
}

function updateOnlineStatus(online) {
  const dot = document.getElementById('onlineDot');
  if (!dot) return;
  dot.title  = online ? 'Online' : 'Offline';
  dot.dataset.online = online;
}

// ── Načtení menu ──────────────────────────────────────────────────────────────
async function loadItems() {
  try {
    const res = await fetch('/api/items');
    items = await res.json();
    // Uložit do localStorage jako zálohu pro offline
    localStorage.setItem('kavarna_items', JSON.stringify(items));
  } catch {
    // Offline — načti z cache
    const cached = localStorage.getItem('kavarna_items');
    if (cached) items = JSON.parse(cached);
  }
}

// ── Platba ────────────────────────────────────────────────────────────────────
async function pay(method) {
  if (!order.length) return;

  const newOrder = {
    id:             crypto.randomUUID(),
    total:          order.reduce((s, i) => s + i.price * i.quantity, 0),
    payment_method: method,
    created_at:     new Date().toISOString(),
    items:          order.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
  };

  // 1. Uložit lokálně (vždy uspěje)
  saveOrder(newOrder);
  updateSyncBadge();

  // 2. Zkusit ihned synchronizovat na server
  syncPending();

  const icon  = method === 'hotovost' ? '💵' : '🏦';
  const label = method === 'hotovost' ? 'Hotovost' : 'Na účet';
  showModal(icon, 'Platba přijata', `${label} — ${fmt(newOrder.total)}`);
  clearOrder();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTabs() {
  const bar = document.getElementById('tabBar');
  bar.innerHTML = '';
  for (const [key, label] of Object.entries(CATEGORIES)) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (key === activeCategory ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { activeCategory = key; renderTabs(); renderItems(); });
    bar.appendChild(btn);
  }
}

function renderItems() {
  const grid = document.getElementById('itemsGrid');
  grid.innerHTML = '';

  const filtered = activeCategory === 'vse' ? items : items.filter(i => i.category === activeCategory);
  if (!filtered.length) {
    grid.innerHTML = '<div class="order-empty">Žádné položky</div>';
    return;
  }

  for (const item of filtered) {
    const btn = document.createElement('button');
    btn.className = 'item-btn';
    btn.innerHTML = `
      <span class="item-name">${item.name}</span>
      <span class="item-price">${fmt(item.price)}</span>
    `;
    btn.addEventListener('click', () => addToOrder(item));
    grid.appendChild(btn);
  }
}

function renderOrder() {
  const list     = document.getElementById('orderList');
  const totalEl  = document.getElementById('totalAmount');
  const btnCash  = document.getElementById('btnCash');
  const btnCard  = document.getElementById('btnCard');

  if (!order.length) {
    list.innerHTML = '<div class="order-empty">Zatím žádné položky</div>';
    totalEl.textContent = '0 Kč';
    btnCash.disabled = btnCard.disabled = true;
    return;
  }

  list.innerHTML = '';
  let total = 0;

  for (const item of order) {
    const sub = item.price * item.quantity;
    total += sub;

    const row = document.createElement('div');
    row.className = 'order-row';
    row.innerHTML = `
      <div class="order-row-info">
        <div class="order-row-name">${item.name}</div>
        <div class="order-row-price">${fmt(item.price)} × ${item.quantity} = ${fmt(sub)}</div>
      </div>
      <div class="order-row-controls">
        <button class="qty-btn" data-id="${item.id}" data-action="minus">−</button>
        <span class="qty-num">${item.quantity}</span>
        <button class="qty-btn" data-id="${item.id}" data-action="plus">+</button>
      </div>
    `;
    list.appendChild(row);
  }

  list.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () =>
      changeQty(parseInt(btn.dataset.id), btn.dataset.action === 'plus' ? 1 : -1)
    );
  });

  totalEl.textContent = fmt(total);
  btnCash.disabled = btnCard.disabled = false;
}

// ── Order helpers ─────────────────────────────────────────────────────────────
function addToOrder(item) {
  const ex = order.find(i => i.id === item.id);
  ex ? ex.quantity++ : order.push({ ...item, quantity: 1 });
  renderOrder();
}

function changeQty(id, delta) {
  const idx = order.findIndex(i => i.id === id);
  if (idx === -1) return;
  order[idx].quantity += delta;
  if (order[idx].quantity <= 0) order.splice(idx, 1);
  renderOrder();
}

function clearOrder() { order = []; renderOrder(); }

// ── Utils ─────────────────────────────────────────────────────────────────────
function fmt(n) { return Number(n).toLocaleString('cs-CZ') + ' Kč'; }

function showModal(icon, title, text) {
  document.getElementById('modalIcon').textContent  = icon;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalText').textContent  = text;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }

init();
