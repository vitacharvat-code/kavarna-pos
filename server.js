require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Items ─────────────────────────────────────────────────────────────────────

app.get('/api/items', async (req, res) => {
  try { res.json(await db.getItems()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/items', async (req, res) => {
  const { name, price, category } = req.body;
  if (!name || price == null || !category)
    return res.status(400).json({ error: 'Chybí povinná pole' });
  try { res.json(await db.addItem({ name, price: Number(price), category })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/items/:id', async (req, res) => {
  const { name, price, category } = req.body;
  try { await db.updateItem(req.params.id, { name, price: Number(price), category }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/items/:id/move', async (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'Invalid direction' });
  try { await db.moveItem(req.params.id, direction); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/items/:id', async (req, res) => {
  try { await db.deleteItem(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id', async (req, res) => {
  try { await db.deleteOrder(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Sync objednávek z iPadu ───────────────────────────────────────────────────
// iPad posílá pole objednávek (UUID id); server ignoruje duplikáty
app.post('/api/sync', async (req, res) => {
  const { orders } = req.body;
  if (!Array.isArray(orders)) return res.status(400).json({ error: 'Očekáváno pole orders' });
  try {
    const inserted = await db.upsertOrders(orders);
    res.json({ ok: true, inserted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Denní přehled ─────────────────────────────────────────────────────────────

app.get('/api/summary', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try { res.json(await db.getSummary(date)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dates', async (req, res) => {
  try { res.json(await db.getAvailableDates()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Záloha ────────────────────────────────────────────────────────────────────
app.get('/api/backup', async (req, res) => {
  try {
    const rows = await db.getBackupData();

    // Celkem a metadata zobrazit jen na prvním řádku každé objednávky
    const seen = new Set();
    const lines = [
      'Č. objednávky;Datum;Čas;Způsob platby;Položka;Množství;Cena za kus (Kč);Mezisoučet (Kč);Celkem objednávka (Kč)',
      ...rows.map(r => {
        const dt       = new Date(r.created_at);
        const isFirst  = !seen.has(r.order_number);
        if (isFirst) seen.add(r.order_number);
        return [
          r.order_number,
          isFirst ? dt.toLocaleDateString('cs-CZ') : '',
          isFirst ? dt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '',
          isFirst ? (r.payment_method === 'hotovost' ? 'Hotovost' : 'Na účet') : '',
          r.item_name,
          r.quantity,
          r.item_price.toFixed(2).replace('.', ','),
          r.subtotal.toFixed(2).replace('.', ','),
          isFirst ? r.total.toFixed(2).replace('.', ',') : '',
        ].join(';');
      })
    ];

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kavarna-zaloha-${date}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n')); // BOM pro správné zobrazení v Excelu
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

db.init()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Kavárna POS běží na http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Chyba při inicializaci databáze:', err.message);
    process.exit(1);
  });
