import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setToken, clearToken, isLoggedIn } from '../config/api';

describe('api config', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('token management', () => {
    it('isLoggedIn returns false when no token', () => {
      expect(isLoggedIn()).toBe(false);
    });

    it('isLoggedIn returns true after setToken', () => {
      setToken('test-jwt');
      expect(isLoggedIn()).toBe(true);
    });

    it('setToken stores to localStorage', () => {
      setToken('my-token');
      expect(localStorage.getItem('kistle_token')).toBe('my-token');
    });

    it('clearToken removes token and isLoggedIn returns false', () => {
      setToken('my-token');
      clearToken();
      expect(isLoggedIn()).toBe(false);
      expect(localStorage.getItem('kistle_token')).toBeNull();
    });
  });

  describe('api.get / request', () => {
    it('sends Authorization header when token is set', async () => {
      setToken('jwt-123');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      const { api } = await import('../config/api');
      await api.get('/test');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-123',
          }),
        })
      );
      fetchSpy.mockRestore();
    });

    it('throws and clears token on 401 response', async () => {
      setToken('expired-token');
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      );

      const { api } = await import('../config/api');
      await expect(api.get('/protected')).rejects.toThrow('Session abgelaufen');
      expect(isLoggedIn()).toBe(false);

      fetchSpy.mockRestore();
    });

    it('sends JSON body on POST', async () => {
      setToken('jwt');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ id: '1' }), { status: 200 })
      );

      const { api } = await import('../config/api');
      await api.post('/items', { name: 'Test' });

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts?.headers).toEqual(expect.objectContaining({
        'Content-Type': 'application/json',
      }));
      expect(opts?.body).toBe(JSON.stringify({ name: 'Test' }));

      fetchSpy.mockRestore();
    });
  });
});
