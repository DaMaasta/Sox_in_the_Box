import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Space } from '../types';

vi.mock('../utils/pollManager', () => ({
  registerLoader: vi.fn((_loader: () => void) => () => {}),
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
  },
}));

import { api } from '../config/api';
import {
  subscribeToUserSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
} from '../services/spaces.service';
import { reportError } from '../utils/errorBus';

function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: 's1',
    name: 'Test',
    description: '',
    type: 'other',
    parentId: null,
    ownerId: 'u1',
    memberIds: ['u1'],
    members: {},
    icon: '📦',
    color: '#2C2926',
    isGroup: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('spaces.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('subscribeToUserSpaces', () => {
    it('calls callback with fetched spaces', async () => {
      const spaces = [makeSpace()];
      vi.mocked(api.get).mockResolvedValue(spaces);

      const cb = vi.fn();
      subscribeToUserSpaces('u1', cb);

      await vi.waitFor(() => expect(cb).toHaveBeenCalled());
      expect(cb.mock.calls[0][0]).toHaveLength(1);
      expect(cb.mock.calls[0][0][0].id).toBe('s1');
    });

    it('reports error on first failure only', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network'));

      const cb = vi.fn();
      subscribeToUserSpaces('u1', cb);

      await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
      expect(reportError).toHaveBeenCalledWith('Lager konnten nicht geladen werden');
    });

    it('returns unsubscribe function', () => {
      vi.mocked(api.get).mockResolvedValue([]);
      const unsub = subscribeToUserSpaces('u1', vi.fn());
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('createSpace (optimistic)', () => {
    it('sends space data to API', async () => {
      vi.mocked(api.post).mockResolvedValue({});

      const id = await createSpace('u1', 'test@test.de', 'Test User', {
        name: 'Neues Lager',
        isGroup: true,
      });

      expect(api.post).toHaveBeenCalledWith('/spaces', expect.objectContaining({
        name: 'Neues Lager',
        isGroup: true,
      }));
      expect(typeof id).toBe('string');
    });

    it('rolls back on API failure', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('500'));
      vi.mocked(api.get).mockResolvedValue([]);

      const cb = vi.fn();
      subscribeToUserSpaces('u1', cb);
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      await expect(
        createSpace('u1', 'test@test.de', 'Test User', { name: 'Fail' })
      ).rejects.toThrow('500');
    });
  });

  describe('updateSpace (optimistic)', () => {
    it('sends update to API', async () => {
      vi.mocked(api.put).mockResolvedValue({});
      await updateSpace('s1', { name: 'Updated' });
      expect(api.put).toHaveBeenCalledWith('/spaces/s1', { name: 'Updated' });
    });

    it('rolls back on failure', async () => {
      vi.mocked(api.put).mockRejectedValue(new Error('500'));
      await expect(updateSpace('s1', { name: 'Fail' })).rejects.toThrow('500');
    });
  });

  describe('deleteSpace (optimistic)', () => {
    it('sends delete to API', async () => {
      vi.mocked(api.delete).mockResolvedValue({});
      await deleteSpace('s1');
      expect(api.delete).toHaveBeenCalledWith('/spaces/s1');
    });

    it('rolls back on failure', async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error('500'));
      await expect(deleteSpace('s1')).rejects.toThrow('500');
    });
  });
});
