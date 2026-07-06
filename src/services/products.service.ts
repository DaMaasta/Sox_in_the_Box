import { api } from '../config/api';
import type { Product, RawProduct } from '../types';
import { createCachedStore } from '../utils/cachedStore';
import { reportError } from '../utils/errorBus';
import { getCachedImages, setCachedImage, deleteCachedImage } from '../utils/imageCache';

function deserializeProduct(p: RawProduct): Product {
  return { ...p, lastModifiedAt: new Date(p.lastModifiedAt), createdAt: new Date(p.createdAt) };
}

function sortProducts(products: Product[]): Product[] {
  return products.sort((a, b) => {
    if ((a.quantity === 0) !== (b.quantity === 0)) return a.quantity === 0 ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

const store = createCachedStore<RawProduct, Product>({
  lsPrefix: 'kistle_pc_',
  deserialize: deserializeProduct,
  sort: sortProducts,
  // Product photos are embedded base64 strings and can be large enough to blow the
  // localStorage quota, which would silently stop names/quantities from being cached too.
  stripForPersist: (p) => (p.imageUrl ? { ...p, imageUrl: null } : p),
});

const now = () => new Date();

// Fotos landen nicht in localStorage (siehe stripForPersist), sondern separat in
// IndexedDB. Frisch vom Netzwerk geladene Fotos werden dort opportunistisch abgelegt ...
function cacheImagesFrom(raw: RawProduct[]): void {
  raw.forEach((p) => { if (p.imageUrl) void setCachedImage(p.id, p.imageUrl); });
}

// ... und Produkte, die (z.B. aus dem bildlosen localStorage-Cache) ohne Foto reinkommen,
// werden per IndexedDB-Lookup nachträglich ergänzt und ein zweites Mal emittiert.
function withImageHydration(
  callback: (products: Product[]) => void
): (products: Product[]) => void {
  return (products) => {
    callback(products);
    const missingIds = products.filter((p) => !p.imageUrl).map((p) => p.id);
    if (missingIds.length === 0) return;
    void getCachedImages(missingIds).then((images) => {
      if (Object.keys(images).length === 0) return;
      callback(products.map((p) => (images[p.id] ? { ...p, imageUrl: images[p.id] } : p)));
    });
  };
}

// ── Subscriptions ─────────────────────────────────────────────────────────────
export function subscribeToSpaceProducts(
  spaceId: string,
  callback: (products: Product[]) => void
): () => void {
  return store.subscribe(
    `space:${spaceId}`,
    async () => {
      const raw = await api.get<RawProduct[]>(`/products?spaceId=${spaceId}`);
      cacheImagesFrom(raw);
      return raw;
    },
    'Produkte konnten nicht geladen werden',
    withImageHydration(callback)
  );
}

export function subscribeToAllProducts(
  callback: (products: Product[]) => void
): () => void {
  return store.subscribe(
    'all',
    async () => {
      const raw = await api.get<RawProduct[]>('/products');
      cacheImagesFrom(raw);
      return raw;
    },
    'Produkte konnten nicht geladen werden',
    withImageHydration(callback)
  );
}

export function subscribeToProductsInSpaces(
  spaceIds: string[],
  callback: (products: Product[]) => void
): () => void {
  return store.subscribe(
    `spaces:${spaceIds.sort().join(',')}`,
    async () => {
      const raw = await api.get<RawProduct[]>(`/products?spaceIds=${spaceIds.join(',')}`);
      cacheImagesFrom(raw);
      // Seed individual space caches so BoxDetail loads instantly from cache
      const bySpace = new Map<string, RawProduct[]>();
      raw.forEach(p => {
        if (!bySpace.has(p.spaceId)) bySpace.set(p.spaceId, []);
        bySpace.get(p.spaceId)!.push(p);
      });
      bySpace.forEach((spaceRaw, spaceId) => {
        store.seedCache(`space:${spaceId}`, spaceRaw.map(deserializeProduct));
      });
      return raw;
    },
    'Produkte konnten nicht geladen werden',
    withImageHydration(callback)
  );
}

// ── Mutations ─────────────────────────────────────────────────────────────────
export async function createProduct(
  spaceId: string,
  _userId: string,
  _userEmail: string,
  data: Omit<Product, 'id' | 'spaceId' | 'lastModifiedBy' | 'lastModifiedByEmail' | 'lastModifiedAt' | 'createdAt'>
): Promise<string> {
  const id = crypto.randomUUID();
  const optimistic: Product = {
    id, spaceId, lastModifiedBy: '', lastModifiedByEmail: '',
    lastModifiedAt: now(), createdAt: now(), ...data,
  };
  store.setCreate(id, optimistic);
  if (data.imageUrl) void setCachedImage(id, data.imageUrl);
  try {
    await api.post('/products', { id, ...data, spaceId });
    return id;
  } catch (err) {
    reportError('Produkt konnte nicht erstellt werden');
    throw err;
  } finally {
    store.clearCreate(id);
    store.triggerReload();
  }
}

export async function updateProduct(
  productId: string,
  _userId: string,
  _userEmail: string,
  data: Partial<Omit<Product, 'id' | 'spaceId' | 'createdAt'>>
): Promise<void> {
  store.setUpdate(productId, data);
  if (data.imageUrl) void setCachedImage(productId, data.imageUrl);
  try {
    await api.put(`/products/${productId}`, data);
  } catch (err) {
    reportError('Änderung konnte nicht gespeichert werden');
    throw err;
  } finally {
    store.clearUpdate(productId);
    store.triggerReload();
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  store.setDelete(productId);
  void deleteCachedImage(productId);
  try {
    await api.delete(`/products/${productId}`);
  } catch (err) {
    reportError('Produkt konnte nicht gelöscht werden');
    throw err;
  } finally {
    store.clearDelete(productId);
    store.triggerReload();
  }
}

export async function updateQuantity(
  productId: string,
  userId: string,
  userEmail: string,
  quantity: number
): Promise<void> {
  await updateProduct(productId, userId, userEmail, { quantity });
}

export async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const { url } = await api.upload<{ url: string }>('/images', formData);
  return url;
}
