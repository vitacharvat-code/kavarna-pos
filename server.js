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
