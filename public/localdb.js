// IndexedDB wrapper — lokální úložiště objednávek na iPadu
// Každá objednávka má UUID (id) a příznak synced (true/false)

const DB_NAME    = 'kavarna';
const DB_VERSION = 1;
const STORE      = 'orders';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function tx(mode) {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

// Uložit objednávku (synced = false = čeká na synchronizaci)
export async function saveOrder(order) {
  const store = await tx('readwrite');
  return new Promise((res, rej) => {
    const req = store.put({ ...order, synced: false });
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}

// Označit objednávky jako synchronizované
export async function markSynced(ids) {
  const store = await tx('readwrite');
  for (const id of ids) {
    await new Promise((res, rej) => {
      const getReq = store.get(id);
      getReq.onsuccess = e => {
        if (!e.target.result) return res();
        const putReq = store.put({ ...e.target.result, synced: true });
        putReq.onsuccess = () => res();
        putReq.onerror   = er => rej(er.target.error);
      };
      getReq.onerror = e => rej(e.target.error);
    });
  }
}

// Vrátí všechny nesynchronizované objednávky
export async function getUnsynced() {
  const store = await tx('readonly');
  return new Promise((res, rej) => {
    const idx = store.index('synced');
    const req = idx.getAll(IDBKeyRange.only(false));
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

// Celkový počet nesynchronizovaných
export async function unsyncedCount() {
  const items = await getUnsynced();
  return items.length;
}
