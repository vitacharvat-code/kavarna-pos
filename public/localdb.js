// Lokální fronta objednávek v localStorage
// Jednoduchá a spolehlivá náhrada za IndexedDB

const KEY = 'kavarna_queue';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function writeQueue(q) {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function saveOrder(order) {
  const q = readQueue();
  q.push({ ...order, synced: false });
  writeQueue(q);
}

export function markSynced(ids) {
  const set = new Set(ids);
  const q   = readQueue().filter(o => !set.has(o.id));
  writeQueue(q);
}

export function getUnsynced() {
  return readQueue().filter(o => !o.synced);
}

export function unsyncedCount() {
  return getUnsynced().length;
}
