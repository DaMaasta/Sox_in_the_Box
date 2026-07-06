// Bild-Cache für Produktfotos in IndexedDB (statt localStorage - viel größeres Kontingent,
// für binäre/große Daten gedacht). localStorage bleibt für Name/Menge/Ort zuständig.

const DB_NAME = 'kistle-images';
const STORE = 'images';
const MAX_ENTRIES = 500;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB nicht verfügbar')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('accessedAt', 'accessedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

export async function getCachedImage(id: string): Promise<string | null> {
  try {
    const db = await getDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const row = req.result as { id: string; dataUrl: string } | undefined;
        resolve(row?.dataUrl ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getCachedImages(ids: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(ids.map(async (id) => {
    const dataUrl = await getCachedImage(id);
    if (dataUrl) result[id] = dataUrl;
  }));
  return result;
}

export async function setCachedImage(id: string, dataUrl: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id, dataUrl, accessedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    void evictIfNeeded();
  } catch {
    /* IndexedDB nicht verfügbar - Bild bleibt unkached, kein Fehler für den Nutzer */
  }
}

export async function deleteCachedImage(id: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

async function evictIfNeeded(): Promise<void> {
  try {
    const db = await getDB();
    const count = await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
    const excess = count - MAX_ENTRIES;
    if (excess <= 0) return;

    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const index = tx.objectStore(STORE).index('accessedAt');
      let deleted = 0;
      const cursorReq = index.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor && deleted < excess) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
