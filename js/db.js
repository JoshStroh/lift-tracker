// Minimal IndexedDB wrapper.
// Store "records": { id, type, doc, dirty, sha }  — one per session / exercise / routine.
// Store "kv": misc key/value (settings).

const DB_NAME = 'lift-tracker';
const VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}

const request = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });

export async function allRecords() {
  const db = await open();
  return request(db.transaction('records').objectStore('records').getAll());
}

export async function putRecords(recs) {
  const db = await open();
  const t = db.transaction('records', 'readwrite');
  const s = t.objectStore('records');
  for (const r of recs) s.put(r);
  return done(t);
}

export async function clearRecords() {
  const db = await open();
  const t = db.transaction('records', 'readwrite');
  t.objectStore('records').clear();
  return done(t);
}

export async function kvGet(key) {
  const db = await open();
  return request(db.transaction('kv').objectStore('kv').get(key));
}

export async function kvSet(key, value) {
  const db = await open();
  const t = db.transaction('kv', 'readwrite');
  t.objectStore('kv').put(value, key);
  return done(t);
}
