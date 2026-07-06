import { registerLoader } from './pollManager';
import { reportError } from './errorBus';

interface CachedStoreOptions<TRaw, T> {
  lsPrefix: string;
  deserialize: (item: TRaw) => T;
  sort?: (items: T[]) => T[];
  /** Strip heavy fields (e.g. base64 images) before writing to localStorage, so large
   *  payloads can't blow the quota and silently prevent metadata from being cached. */
  stripForPersist?: (item: T) => T;
}

export function createCachedStore<TRaw, T extends { id: string }>(
  options: CachedStoreOptions<TRaw, T>
) {
  const { lsPrefix, deserialize, sort, stripForPersist } = options;
  const cache = new Map<string, T[]>();
  const pendingUpdates = new Map<string, Partial<T>>();
  const pendingCreates = new Map<string, T>();
  const pendingDeletes = new Set<string>();
  const activeLoaders = new Set<() => void>();

  function triggerReload() {
    activeLoaders.forEach(fn => fn());
  }

  function cacheGet(key: string): T[] | null {
    if (cache.has(key)) return cache.get(key)!;
    try {
      const raw = localStorage.getItem(lsPrefix + key);
      if (!raw) return null;
      const parsed = (JSON.parse(raw) as TRaw[]).map(deserialize);
      cache.set(key, parsed);
      return parsed;
    } catch { return null; }
  }

  function cacheSet(key: string, data: T[]): void {
    cache.set(key, data);
    const persistable = stripForPersist ? data.map(stripForPersist) : data;
    try {
      localStorage.setItem(lsPrefix + key, JSON.stringify(persistable));
    } catch {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(lsPrefix)).sort();
      if (keys.length > 0) {
        localStorage.removeItem(keys[0]);
        try { localStorage.setItem(lsPrefix + key, JSON.stringify(persistable)); } catch { /* give up */ }
      }
    }
  }

  function applyOptimistic(items: T[]): T[] {
    const result = items
      .filter(item => !pendingDeletes.has(item.id))
      .map(item => {
        const upd = pendingUpdates.get(item.id);
        return upd ? { ...item, ...upd } : item;
      });
    pendingCreates.forEach(item => {
      if (!result.find(r => r.id === item.id)) result.unshift(item);
    });
    return result;
  }

  function process(items: T[]): T[] {
    const optimistic = applyOptimistic(items);
    return sort ? sort(optimistic) : optimistic;
  }

  function subscribe(
    cacheKey: string,
    fetcher: () => Promise<TRaw[]>,
    errorMsg: string,
    callback: (items: T[]) => void
  ): () => void {
    let active = true;
    let errors = 0;
    const cached = cacheGet(cacheKey);
    if (cached) callback(process(cached));
    async function load() {
      try {
        const raw = await fetcher();
        const items = raw.map(deserialize);
        cacheSet(cacheKey, items);
        errors = 0;
        if (active) callback(process(items));
      } catch {
        if (++errors === 1) reportError(errorMsg);
      }
    }
    activeLoaders.add(load);
    load();
    const unregister = registerLoader(load);
    return () => { active = false; unregister(); activeLoaders.delete(load); };
  }

  function subscribeSingle(
    cacheKey: string,
    fetcher: () => Promise<TRaw | null>,
    errorMsg: string,
    callback: (item: T | null) => void
  ): () => void {
    let active = true;
    let errors = 0;
    const cached = cacheGet(cacheKey);
    if (cached?.[0]) {
      const upd = pendingUpdates.get(cached[0].id);
      callback(upd ? { ...cached[0], ...upd } as T : cached[0]);
    }
    async function load() {
      try {
        const raw = await fetcher();
        errors = 0;
        if (!active) return;
        if (!raw) { callback(null); return; }
        const item = deserialize(raw);
        cacheSet(cacheKey, [item]);
        const upd = pendingUpdates.get(item.id);
        callback(upd ? { ...item, ...upd } as T : item);
      } catch {
        if (++errors === 1) reportError(errorMsg);
      }
    }
    activeLoaders.add(load);
    load();
    const unregister = registerLoader(load);
    return () => { active = false; unregister(); activeLoaders.delete(load); };
  }

  return {
    subscribe,
    subscribeSingle,
    seedCache(key: string, items: T[]) { cacheSet(key, items); },
    setCreate(id: string, item: T) { pendingCreates.set(id, item); triggerReload(); },
    setUpdate(id: string, data: Partial<T>) {
      const prev = pendingUpdates.get(id);
      pendingUpdates.set(id, { ...prev, ...data });
      triggerReload();
    },
    setDelete(id: string) { pendingDeletes.add(id); triggerReload(); },
    clearCreate(id: string) { pendingCreates.delete(id); },
    clearUpdate(id: string) { pendingUpdates.delete(id); },
    clearDelete(id: string) { pendingDeletes.delete(id); },
    triggerReload,
  };
}
