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

// ── Záloha (Excel) ────────────────────────────────────────────────────────────
app.get('/api/backup', async (req, res) => {
  try {
    const ExcelJS  = require('exceljs');
    const rows     = await db.getBackupData();
    const workbook = new ExcelJS.Workbook();
    const sheet    = workbook.addWorksheet('Objednávky');

    // ── Sloupce ──────────────────────────────────────────────────────────────
    sheet.columns = [
      { header: 'Č. objednávky', key: 'order_number', width: 16 },
      { header: 'Datum',         key: 'date',         width: 14 },
      { header: 'Čas',           key: 'time',         width: 8  },
      { header: 'Způsob platby', key: 'payment',      width: 16 },
      { header: 'Položka',       key: 'item',         width: 26 },
      { header: 'Množství',      key: 'quantity',     width: 10 },
      { header: 'Cena/ks (Kč)',  key: 'price',        width: 14 },
      { header: 'Mezisoučet (Kč)', key: 'subtotal',   width: 16 },
      { header: 'Celkem obj. (Kč)', key: 'total',     width: 16 },
    ];

    // ── Styl záhlaví ─────────────────────────────────────────────────────────
    sheet.getRow(1).eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C4F2A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });
    sheet.getRow(1).height = 24;

    // ── Data ──────────────────────────────────────────────────────────────────
    const lightBrown = 'FFFFF8F0'; // světlé řádky pro liché objednávky
    const white      = 'FFFFFFFF';

    rows.forEach(r => {
      const dt  = new Date(r.created_at);
      const row = sheet.addRow({
        order_number: Number(r.order_number),
        date:    dt.toLocaleDateString('cs-CZ'),
        time:    dt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
        payment: r.payment_method === 'hotovost' ? 'Hotovost' : 'Na účet',
        item:    r.item_name,
        quantity: Number(r.quantity),
        price:   Number(r.item_price),
        subtotal: Number(r.subtotal),
        total:   Number(r.total),
      });

      // Střídání barev řádků podle čísla objednávky
      const bg = Number(r.order_number) % 2 === 0 ? white : lightBrown;
      row.eachCell(cell => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle' };
      });

      // Čísla zarovnat doprava
      ['quantity', 'price', 'subtotal', 'total'].forEach(key => {
        row.getCell(key).alignment = { horizontal: 'right' };
        row.getCell(key).numFmt = '#,##0.00';
      });
      row.getCell('order_number').alignment = { horizontal: 'center' };
      row.getCell('time').alignment          = { horizontal: 'center' };
      row.getCell('payment').alignment       = { horizontal: 'center' };
    });

    // ── Zmrazit záhlaví ───────────────────────────────────────────────────────
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ── Odeslat ───────────────────────────────────────────────────────────────
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kavarna-zaloha-${date}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── Ceník (Excel) ─────────────────────────────────────────────────────────────
app.get('/api/pricelist', async (req, res) => {
  try {
    const ExcelJS  = require('exceljs');
    const items    = await db.getItems();
    const workbook = new ExcelJS.Workbook();
    const sheet    = workbook.addWorksheet('Ceník');

    const CAT_LABELS = { kava: 'Káva', napoje: 'Nápoje', jidlo: 'Jídlo', ostatni: 'Ostatní' };

    sheet.columns = [
      { header: 'Kategorie', key: 'category', width: 14 },
      { header: 'Název',     key: 'name',     width: 30 },
      { header: 'Cena (Kč)', key: 'price',    width: 14 },
    ];

    // Záhlaví
    sheet.getRow(1).eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C4F2A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.getRow(1).height = 24;

    // Barvy kategorií
    const CAT_COLORS = { kava: 'FFFFF8F0', napoje: 'FFF0F7FF', jidlo: 'FFF3FAF3', ostatni: 'FFFAFAFA' };

    items.forEach(item => {
      const row = sheet.addRow({
        category: CAT_LABELS[item.category] ?? item.category,
        name:     item.name,
        price:    Number(item.price),
      });
      const bg = CAT_COLORS[item.category] ?? 'FFFFFFFF';
      row.eachCell(cell => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle' };
      });
      row.getCell('price').numFmt    = '#,##0.00';
      row.getCell('price').alignment = { horizontal: 'right' };
    });

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kavarna-cenik-${date}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error(e);
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
