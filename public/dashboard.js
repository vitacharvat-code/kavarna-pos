let currentDate = today();
let refreshTimer = null;
const REFRESH_INTERVAL = 30_000; // 30 sekund

async function init() {
  const picker = document.getElementById('datePicker');
  picker.value = currentDate;
  picker.max   = today();
  picker.addEventListener('change', () => {
    currentDate = picker.value;
    loadSummary();
  });

  await loadSummary();
  startAutoRefresh();
}

// ── Načtení dat ───────────────────────────────────────────────────────────────
async function loadSummary() {
  try {
    const res  = await fetch(`/api/summary?date=${currentDate}`);
    const data = await res.json();
    renderStats(data.totals);
    renderItems(data.itemStats);
    updateRefreshInfo();
  } catch {
    document.getElementById('itemsSection').innerHTML =
      '<div class="no-data">Nepodařilo se načíst data — zkontroluj připojení.</div>';
  }
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────
function startAutoRefresh() {
  // Refresh pouze pro dnešní den (historická data se nemění)
  refreshTimer = setInterval(() => {
    if (document.getElementById('datePicker').value === today()) {
      loadSummary();
    }
  }, REFRESH_INTERVAL);
}

function updateRefreshInfo() {
  const el = document.getElementById('refreshInfo');
  if (!el) return;
  const now = new Date();
  el.textContent = `Aktualizováno ${now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderStats(t) {
  document.getElementById('statOrders').textContent = t?.order_count ?? 0;
  document.getElementById('statTotal').textContent  = fmt(t?.total_revenue ?? 0);
  document.getElementById('statCash').textContent   = fmt(t?.cash ?? 0);
  document.getElementById('statCard').textContent   = fmt(t?.card ?? 0);
}

function renderItems(items) {
  const section = document.getElementById('itemsSection');
  if (!items?.length) {
    section.innerHTML = '<div class="no-data">Žádné prodeje za tento den.</div>';
    return;
  }
  section.innerHTML = `
    <table class="items-table">
      <thead>
        <tr><th>Položka</th><th>Kusů</th><th>Tržba</th></tr>
      </thead>
      <tbody>
        ${items.map(i => `
          <tr>
            <td>${i.name}</td>
            <td class="td-qty">${i.quantity}×</td>
            <td class="td-revenue">${fmt(i.revenue)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function fmt(n)  { return Number(n).toLocaleString('cs-CZ') + ' Kč'; }

init();
