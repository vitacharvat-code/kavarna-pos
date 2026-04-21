const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── Inicializace tabulek ──────────────────────────────────────────────────────
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id        SERIAL PRIMARY KEY,
      name      TEXT    NOT NULL,
      price     REAL    NOT NULL,
      category  TEXT    NOT NULL DEFAULT 'ostatni',
      active    BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS orders (
      id             TEXT PRIMARY KEY,   -- UUID generované na klientu
      total          REAL    NOT NULL,
      payment_method TEXT    NOT NULL CHECK (payment_method IN ('hotovost', 'ucet')),
      created_at     TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id         SERIAL PRIMARY KEY,
      order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_name  TEXT NOT NULL,
      item_price REAL NOT NULL,
      quantity   INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Přidat sort_order pokud sloupec chybí (migrace)
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0
  `);
  // Inicializovat sort_order pro existující položky kde je 0
  await pool.query(`
    UPDATE items SET sort_order = id WHERE sort_order = 0
  `);

  // Seed položek pokud je tabulka prázdná
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM items');
  if (parseInt(rows[0].c) === 0) {
    const seedItems = [
      ['Espresso',            45,  'kava'],
      ['Doppio',              55,  'kava'],
      ['Americano',           55,  'kava'],
      ['Cappuccino',          65,  'kava'],
      ['Latte',               70,  'kava'],
      ['Flat White',          70,  'kava'],
      ['Vídeňská káva',       75,  'kava'],
      ['Ledová káva',         75,  'kava'],
      ['Voda 0,33l',          35,  'napoje'],
      ['Voda 0,5l',           45,  'napoje'],
      ['Džus pomeranč',       55,  'napoje'],
      ['Limonáda',            65,  'napoje'],
      ['Čaj',                 45,  'napoje'],
      ['Horká čokoláda',      65,  'napoje'],
      ['Pivo 0,5l',           55,  'napoje'],
      ['Víno sklenka',        75,  'napoje'],
      ['Croissant',           55,  'jidlo'],
      ['Croissant se šunkou', 75,  'jidlo'],
      ['Toast',               65,  'jidlo'],
      ['Bagel',               85,  'jidlo'],
      ['Muffin',              55,  'jidlo'],
      ['Cheesecake',          85,  'jidlo'],
      ['Brownie',             65,  'jidlo'],
      ['Ovesná kaše',         95,  'jidlo'],
    ];
    for (const [name, price, category] of seedItems) {
      await pool.query(
        'INSERT INTO items (name, price, category) VALUES ($1, $2, $3)',
        [name, price, category]
      );
    }
    console.log('Databáze naplněna výchozími položkami.');
  }

  console.log('Databáze připravena.');
}

// ── Items ─────────────────────────────────────────────────────────────────────
async function getItems() {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE active = true ORDER BY category, sort_order, id'
  );
  return rows;
}

async function moveItem(id, direction) {
  // Najdi aktuální položku
  const { rows: [item] } = await pool.query('SELECT * FROM items WHERE id=$1', [id]);
  if (!item) return;

  // Najdi sousední položku ve stejné kategorii
  const op = direction === 'up' ? '<' : '>';
  const ord = direction === 'up' ? 'DESC' : 'ASC';
  const { rows: [neighbor] } = await pool.query(
    `SELECT * FROM items WHERE active=true AND category=$1 AND sort_order ${op} $2 ORDER BY sort_order ${ord} LIMIT 1`,
    [item.category, item.sort_order]
  );
  if (!neighbor) return;

  // Prohoď sort_order
  await pool.query('UPDATE items SET sort_order=$1 WHERE id=$2', [neighbor.sort_order, item.id]);
  await pool.query('UPDATE items SET sort_order=$1 WHERE id=$2', [item.sort_order, neighbor.id]);
}

async function addItem({ name, price, category }) {
  const { rows } = await pool.query(
    'INSERT INTO items (name, price, category) VALUES ($1, $2, $3) RETURNING *',
    [name, price, category]
  );
  return rows[0];
}

async function updateItem(id, { name, price, category }) {
  await pool.query(
    'UPDATE items SET name=$1, price=$2, category=$3 WHERE id=$4',
    [name, price, category, id]
  );
}

async function deleteItem(id) {
  await pool.query('UPDATE items SET active=false WHERE id=$1', [id]);
}

// ── Orders ────────────────────────────────────────────────────────────────────

// Hromadný upsert objednávek (iPad může posílat i již uložené)
async function upsertOrders(orders) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (const order of orders) {
      const exists = await client.query('SELECT id FROM orders WHERE id=$1', [order.id]);
      if (exists.rows.length > 0) continue; // Duplikát — přeskočit

      await client.query(
        'INSERT INTO orders (id, total, payment_method, created_at) VALUES ($1,$2,$3,$4)',
        [order.id, order.total, order.payment_method, order.created_at]
      );
      for (const item of order.items) {
        await client.query(
          'INSERT INTO order_items (order_id, item_name, item_price, quantity) VALUES ($1,$2,$3,$4)',
          [order.id, item.name, item.price, item.quantity]
        );
      }
      inserted++;
    }
    await client.query('COMMIT');
    return inserted;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
async function getSummary(date) {
  const { rows: totals } = await pool.query(`
    SELECT
      COUNT(*)::int                                                           AS order_count,
      COALESCE(SUM(total), 0)                                                 AS total_revenue,
      COALESCE(SUM(CASE WHEN payment_method='hotovost' THEN total ELSE 0 END), 0) AS cash,
      COALESCE(SUM(CASE WHEN payment_method='ucet'     THEN total ELSE 0 END), 0) AS card
    FROM orders
    WHERE created_at::date = $1
  `, [date]);

  const { rows: itemStats } = await pool.query(`
    SELECT
      oi.item_name                     AS name,
      SUM(oi.quantity)::int            AS quantity,
      SUM(oi.item_price * oi.quantity) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at::date = $1
    GROUP BY oi.item_name
    ORDER BY quantity DESC
  `, [date]);

  const { rows: orders } = await pool.query(`
    SELECT *,
      ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS order_number
    FROM orders WHERE created_at::date=$1 ORDER BY created_at DESC
  `, [date]);

  // Přidat položky ke každé objednávce
  const { rows: allOrderItems } = await pool.query(`
    SELECT order_id, item_name AS name, item_price AS price, quantity
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at::date = $1
  `, [date]);

  const itemsByOrder = {};
  for (const item of allOrderItems) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }
  const ordersWithItems = orders.map(o => ({ ...o, items: itemsByOrder[o.id] || [] }));

  return { date, totals: totals[0], itemStats, orders: ordersWithItems };
}

async function getBackupData() {
  const { rows } = await pool.query(`
    SELECT
      DENSE_RANK() OVER (ORDER BY o.created_at ASC, o.id ASC) AS order_number,
      o.created_at,
      o.payment_method,
      o.total,
      oi.item_name,
      oi.item_price,
      oi.quantity,
      (oi.item_price * oi.quantity) AS subtotal
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    ORDER BY o.created_at ASC, o.id ASC, oi.id ASC
  `);
  return rows;
}

async function deleteOrder(id) {
  await pool.query('DELETE FROM order_items WHERE order_id=$1', [id]);
  await pool.query('DELETE FROM orders WHERE id=$1', [id]);
}

async function getAvailableDates() {
  const { rows } = await pool.query(`
    SELECT DISTINCT created_at::date::text AS date
    FROM orders ORDER BY date DESC LIMIT 60
  `);
  return rows.map(r => r.date);
}

module.exports = { init, getItems, addItem, updateItem, deleteItem, moveItem, upsertOrders, deleteOrder, getBackupData, getSummary, getAvailableDates };
