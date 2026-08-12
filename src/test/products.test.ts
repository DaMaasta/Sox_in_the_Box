import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product } from '../types';

vi.mock('../utils/pollManager', () => ({
  registerLoader: vi.fn(() => () => {}),
}));

vi.mock('../utils/errorBus', () => ({
  reportError: vi.fn(),
}));

vi.mock('../config/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock('../utils/imageUtils', () => ({
  compressImageToBlob: vi.fn(async (file: File) => file),
}));

import { api } from '../config/api';
import {
  subscribeToSpaceProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  updateQuantity,
  uploadProductImage,
  applyProductQuantityUpdates,
} from '../services/products.service';
import { reportError } from '../utils/errorBus';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Hammer',
    spaceId: 's1',
    quantity: 5,
    minQuantity: null,
    unit: 'Stück',
    category: '',
    description: '',
    barcode: null,
    imageUrl: null,
    lastModifiedBy: 'u1',
    lastModifiedByEmail: 'test@test.de',
    lastModifiedAt: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('products.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('subscribeToSpaceProducts', () => {
    it('fetches products and calls callback sorted', async () => {
      const products = [
        makeProduct({ id: 'p2', name: 'Zange', quantity: 3 }),
        makeProduct({ id: 'p1', name: 'Bohrer', quantity: 1 }),
      ];
      vi.mocked(api.get).mockResolvedValue(products);

      const cb = vi.fn();
      subscribeToSpaceProducts('s1', cb);

      await vi.waitFor(() => expect(cb).toHaveBeenCalled());
      const result = cb.mock.calls[0][0];
      expect(result[0].name).toBe('Bohrer');
      expect(result[1].name).toBe('Zange');
    });

    it('sorts zero-quantity items last', async () => {
      const products = [
        makeProduct({ id: 'p10', name: 'Aaa', quantity: 0 }),
        makeProduct({ id: 'p20', name: 'Zzz', quantity: 1 }),
      ];
      vi.mocked(api.get).mockResolvedValue(products);

      const cb = vi.fn();
      subscribeToSpaceProducts('s-sort', cb);

      await vi.waitFor(() => expect(cb).toHaveBeenCalled());
      const last = cb.mock.calls[cb.mock.calls.length - 1][0];
      expect(last[0].name).toBe('Zzz');
      expect(last[1].name).toBe('Aaa');
    });

    it('reports error on first failure', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network'));

      subscribeToSpaceProducts('s1', vi.fn());
      await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
      expect(reportError).toHaveBeenCalledWith('Produkte konnten nicht geladen werden');
    });

    it('returns unsubscribe function', () => {
      vi.mocked(api.get).mockResolvedValue([]);
      const unsub = subscribeToSpaceProducts('s1', vi.fn());
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('patches cached quantities immediately after a booking', async () => {
      vi.mocked(api.get).mockResolvedValue([
        makeProduct({ id: 'p-cache-patch', spaceId: 's-cache-patch', quantity: 5 }),
      ]);
      const firstCallback = vi.fn();
      const unsubscribeFirst = subscribeToSpaceProducts('s-cache-patch', firstCallback);
      await vi.waitFor(() => expect(firstCallback).toHaveBeenCalled());

      applyProductQuantityUpdates([{ id: 'p-cache-patch', quantity: 0 }]);

      const cachedCallback = vi.fn();
      const unsubscribeSecond = subscribeToSpaceProducts('s-cache-patch', cachedCallback);
      expect(cachedCallback.mock.calls[0][0][0].quantity).toBe(0);
      unsubscribeFirst();
      unsubscribeSecond();
    });
  });

  describe('createProduct', () => {
    it('posts product data to API', async () => {
      vi.mocked(api.post).mockResolvedValue({});

      const id = await createProduct('s1', 'u1', 'test@test.de', {
        name: 'Schrauben',
        quantity: 100,
        minQuantity: 10,
        unit: 'Stück',
        category: 'Hardware',
        description: '',
        barcode: null,
        imageUrl: null,
      });

      expect(api.post).toHaveBeenCalledWith('/products', expect.objectContaining({
        name: 'Schrauben',
        quantity: 100,
        spaceId: 's1',
      }));
      expect(typeof id).toBe('string');
    });

    it('rolls back on failure', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('500'));
      await expect(
        createProduct('s1', 'u1', 'test@test.de', {
          name: 'Fail', quantity: 1, minQuantity: null,
          unit: 'Stück', category: '', description: '',
          barcode: null, imageUrl: null,
        })
      ).rejects.toThrow('500');
    });
  });

  describe('updateProduct', () => {
    it('puts update data to API', async () => {
      vi.mocked(api.put).mockResolvedValue({});
      await updateProduct('p1', 'u1', 'test@test.de', { name: 'Updated' });
      expect(api.put).toHaveBeenCalledWith('/products/p1', { name: 'Updated' });
    });

    it('rolls back on failure', async () => {
      vi.mocked(api.put).mockRejectedValue(new Error('500'));
      await expect(updateProduct('p1', 'u1', 'test@test.de', { name: 'Fail' })).rejects.toThrow('500');
    });
  });

  describe('deleteProduct', () => {
    it('sends delete to API', async () => {
      vi.mocked(api.delete).mockResolvedValue({});
      await deleteProduct('p1');
      expect(api.delete).toHaveBeenCalledWith('/products/p1');
    });

    it('rolls back on failure', async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error('500'));
      await expect(deleteProduct('p1')).rejects.toThrow('500');
    });
  });

  describe('updateQuantity', () => {
    it('delegates to updateProduct with quantity field', async () => {
      vi.mocked(api.put).mockResolvedValue({});
      await updateQuantity('p1', 'u1', 'test@test.de', 42);
      expect(api.put).toHaveBeenCalledWith('/products/p1', { quantity: 42 });
    });
  });

  describe('uploadProductImage', () => {
    it('uploads file and returns URL', async () => {
      vi.mocked(api.upload).mockResolvedValue({ imageUrl: '/api/images/img.jpg' });

      const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
      const url = await uploadProductImage('p1', file);

      expect(url).toBe('/api/images/img.jpg');
      expect(api.upload).toHaveBeenCalledWith('/products/p1/image', expect.any(FormData));
    });
  });
});
