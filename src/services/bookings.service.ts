import { api } from '../config/api';
import type { Booking, BookingItem, CartItem, RawBooking } from '../types';
import { createCachedStore } from '../utils/cachedStore';
import { applyProductQuantityUpdates, invalidateProductCache } from './products.service';
import type { ProductQuantityUpdate } from './products.service';

interface BookingMutationResponse {
  id: string;
  products?: ProductQuantityUpdate[];
}

function deserializeBooking(b: RawBooking): Booking {
  return { ...b, createdAt: new Date(b.createdAt) };
}

function sortBookings(bookings: Booking[]): Booking[] {
  return bookings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Bookings vorher ohne Cache: Verlauf-Tab startete bei jedem Öffnen mit einer leeren
// Liste und wartete auf den vollen Netzwerk-Roundtrip (Cloudflare Tunnel), während
// Boxen/Produkte dank Cache sofort erschienen. Gleiches Cache-First-Muster wie dort.
const store = createCachedStore<RawBooking, Booking>({
  lsPrefix: 'kistle_bc_',
  deserialize: deserializeBooking,
  sort: sortBookings,
});

export async function createBooking(
  _userId: string,
  _userDisplayName: string,
  _userEmail: string,
  cartItems: CartItem[]
): Promise<string> {
  const id = crypto.randomUUID();
  const items: BookingItem[] = cartItems.map(i => ({
    productId:   i.productId,
    productName: i.productName,
    quantity:    i.cartQuantity,
    unit:        i.unit,
    imageUrl:    i.imageUrl,
    boxId:       i.boxId,
    boxName:     i.boxName,
    parentId:    i.parentId,
    parentName:  i.parentName,
  }));
  const parentIds = [...new Set(items.map(i => i.parentId).filter(Boolean))];
  const response = await api.post<BookingMutationResponse>('/bookings', { id, items, parentIds });
  if (response.products) applyProductQuantityUpdates(response.products);
  else invalidateProductCache();
  store.triggerReload();
  return response.id;
}

export async function returnBooking(bookingId: string): Promise<string> {
  const response = await api.post<BookingMutationResponse>(`/bookings/${bookingId}/return`, {});
  if (response.products) applyProductQuantityUpdates(response.products);
  else invalidateProductCache();
  store.triggerReload();
  return response.id;
}

export function subscribeToGroupBookings(
  groupId: string,
  callback: (bookings: Booking[]) => void
): () => void {
  return store.subscribe(
    `group:${groupId}`,
    () => api.get<RawBooking[]>(`/bookings?groupId=${groupId}`),
    'Buchungen konnten nicht geladen werden',
    callback
  );
}

export async function getBooking(bookingId: string): Promise<Booking | null> {
  try {
    const booking = await api.get<RawBooking>(`/bookings/${bookingId}`);
    return deserializeBooking(booking);
  } catch {
    return null;
  }
}

export async function createReturnBooking(
  originalBookingId: string,
  items: Array<{ productId: string; quantity: number }>
): Promise<void> {
  const response = await api.post<BookingMutationResponse>(`/bookings/${originalBookingId}/return`, { items });
  if (response.products) applyProductQuantityUpdates(response.products);
  else invalidateProductCache();
  store.triggerReload();
}
