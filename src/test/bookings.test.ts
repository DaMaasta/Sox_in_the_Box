import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CartItem } from '../types';

vi.mock('../config/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../utils/pollManager', () => ({
  registerLoader: vi.fn(() => () => {}),
}));

vi.mock('../utils/errorBus', () => ({
  reportError: vi.fn(),
}));

vi.mock('../services/products.service', () => ({
  applyProductQuantityUpdates: vi.fn(),
  invalidateProductCache: vi.fn(),
}));

import { api } from '../config/api';
import { createBooking, createReturnBooking } from '../services/bookings.service';
import { applyProductQuantityUpdates, invalidateProductCache } from '../services/products.service';

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'p1',
    productName: 'Hammer',
    imageUrl: null,
    cartQuantity: 3,
    maxQuantity: 10,
    unit: 'Stück',
    boxId: 'b1',
    boxName: 'Werkzeug',
    parentId: 'g1',
    parentName: 'Lager A',
    ...overrides,
  };
}

describe('bookings.service', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('createBooking', () => {
    it('maps cartItems to booking items correctly', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 'booking-1' });

      const items = [
        makeCartItem({ productId: 'p1', cartQuantity: 3 }),
        makeCartItem({ productId: 'p2', cartQuantity: 1, parentId: 'g2', parentName: 'Lager B' }),
      ];

      const id = await createBooking('u1', 'Dan', 'dan@test.de', items);

      expect(id).toBe('booking-1');
      expect(api.post).toHaveBeenCalledWith('/bookings', expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ productId: 'p1', quantity: 3 }),
          expect.objectContaining({ productId: 'p2', quantity: 1 }),
        ]),
        parentIds: expect.arrayContaining(['g1', 'g2']),
      }));
    });

    it('uses cartQuantity as booking quantity, not maxQuantity', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 'b1' });

      await createBooking('u1', 'Dan', 'dan@test.de', [
        makeCartItem({ cartQuantity: 2, maxQuantity: 100 }),
      ]);

      const call = vi.mocked(api.post).mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({
        items: [expect.objectContaining({ quantity: 2 })],
      }));
    });

    it('deduplicates parentIds', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 'b1' });

      await createBooking('u1', 'Dan', 'dan@test.de', [
        makeCartItem({ productId: 'p1', parentId: 'g1' }),
        makeCartItem({ productId: 'p2', parentId: 'g1' }),
      ]);

      const call = vi.mocked(api.post).mock.calls[0];
      expect((call[1] as { parentIds: string[] }).parentIds).toEqual(['g1']);
    });

    it('applies authoritative product quantities returned by the server', async () => {
      const products = [{ id: 'p1', quantity: 0, lastModifiedAt: '2026-08-12T15:00:00.000Z' }];
      vi.mocked(api.post).mockResolvedValue({ id: 'b1', products });

      await createBooking('u1', 'Dan', 'dan@test.de', [makeCartItem()]);

      expect(applyProductQuantityUpdates).toHaveBeenCalledWith(products);
      expect(invalidateProductCache).not.toHaveBeenCalled();
    });

    it('invalidates old product caches for older server responses', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 'b1' });

      await createBooking('u1', 'Dan', 'dan@test.de', [makeCartItem()]);

      expect(invalidateProductCache).toHaveBeenCalledOnce();
    });

    it('excludes null parentIds', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 'b1' });

      await createBooking('u1', 'Dan', 'dan@test.de', [
        makeCartItem({ parentId: null }),
      ]);

      const call = vi.mocked(api.post).mock.calls[0];
      expect((call[1] as { parentIds: (string | null)[] }).parentIds).toEqual([]);
    });
  });

  describe('createReturnBooking', () => {
    it('sends return items to the correct endpoint', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 'return-1', products: [] });

      await createReturnBooking('booking-1', [
        { productId: 'p1', quantity: 2 },
      ]);

      expect(api.post).toHaveBeenCalledWith('/bookings/booking-1/return', {
        items: [{ productId: 'p1', quantity: 2 }],
      });
    });
  });
});
