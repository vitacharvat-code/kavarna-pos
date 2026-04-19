import { askPin } from './pin.js';

let currentDate = today();
const REFRESH_INTERVAL = 30_000;

async function init() {
  const picker = document.getElementById('datePicker');
  picker.value = currentDate;
  picker.max   = today();
  picker.addEventListener('change', () => {
    currentDate = picker.value;
    loadSummary();
  });

  await loadSummary();
  setInterval(() => {
    if (document.getElementById('datePicker').value === today()) loadSummary();
  }, REFRESH_INTERVAL);
}

// ── Načtení dat ───────────────────────────────────────────────────────────────
async function loadSummary() {
  try {
    const res  = await fetch(`/api/summary?date=${currentDate}`);
    const data = await res.json();
    renderStats(data.totals);
    renderOrders(data.orders);
    updateRefreshInfo();
  } catch {
    document.getElementById('ordersSection').innerHTML =
      '<div class="no-data">Nepodařilo se načíst data — zkontroluj připojení.</div>';
  }
}

function updateRefreshInfo() {
  const el = document.getElementById('refreshInfo');
  if (el) el.textContent = `Aktualizováno ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

// ── Render stats ──────────────────────────────────────────────────────────────
function renderStats(t) {
  document.getElementById('statOrders').textContent = t?.order_count ?? 0;
  document.getElementById('statTotal').textContent  = fmt(t?.total_revenue ?? 0);
  document.getElementById('statCash').textContent   = fmt(t?.cash ?? 0);
  document.getElementById('statCard').textContent   = fmt(t?.card ?? 0);
}

// ── Render objednávek ─────────────────────────────────────────────────────────
function renderOrders(orders) {
  const section = document.getElementById('ordersSection');

  if (!orders?.length) {
    section.innerHTML = '<div class="no-data">Žádné objednávky za tento den.</div>';
    return;
  }

  section.innerHTML = '';

  orders.forEach((order, idx) => {
    const time        = new Date(order.created_at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    const itemCount   = order.items.reduce((s, i) => s + i.quantity, 0);
    const payIcon     = order.payment_method === 'hotovost' ? '💵' : '🏦';
    const payLabel    = order.payment_method === 'hotovost' ? 'Hotovost' : 'Na účet';
    const detailId    = `order-detail-${idx}`;

    const row = document.createElement('div');
    row.className = 'order-summary-row';
    row.innerHTML = `
      <div class="osr-main" data-target="${detailId}">
        <span class="osr-time">${time}</span>
        <span class="osr-items">${itemCount} ${itemCount === 1 ? 'položka' : itemCount < 5 ? 'položky' : 'položek'}</span>
        <span class="osr-pay">${payIcon} ${payLabel}</span>
        <span class="osr-total">${fmt(order.total)}</span>
        <span class="osr-chevron">›</span>
      </div>
      <div class="osr-detail" id="${detailId}">
        <table class="detail-table">
          ${order.items.map(i => `
            <tr>
              <td>${i.name}</td>
              <td class="dt-qty">${i.quantity}×</td>
              <td class="dt-price">${fmt(i.price * i.quantity)}</td>
            </tr>
          `).join('')}
          <tr class="dt-total-row">
            <td colspan="2">Celkem</td>
            <td class="dt-price">${fmt(order.total)}</td>
          </tr>
        </table>
        <button class="btn-delete-order" data-id="${order.id}">Smazat objednávku</button>
      </div>
    `;
    section.appendChild(row);
  });

  // Rozbalení/sbalení
  section.querySelectorAll('.osr-main').forEach(el => {
    el.addEventListener('click', () => {
      const detail  = document.getElementById(el.dataset.target);
      const chevron = el.querySelector('.osr-chevron');
      const open    = detail.classList.toggle('open');
      chevron.style.transform = open ? 'rotate(90deg)' : '';
    });
  });

  // Smazání objednávky — vyžaduje PIN
  section.querySelectorAll('.btn-delete-order').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await askPin({ force: true });
        const res = await fetch(`/api/orders/${btn.dataset.id}`, { method: 'DELETE' });
        if (res.ok) loadSummary();
      } catch {
        // PIN zrušen — nic nedělat
      }
    });
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function fmt(n)  { return Number(n).toLocaleString('cs-CZ') + ' Kč'; }

init();
