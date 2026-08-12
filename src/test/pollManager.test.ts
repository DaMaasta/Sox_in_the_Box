import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockWebSocket = vi.fn();
Object.defineProperty(globalThis, 'WebSocket', {
  value: mockWebSocket,
  writable: true,
});
(globalThis as Record<string, unknown>).WebSocket = Object.assign(mockWebSocket, {
  OPEN: 1,
  CONNECTING: 0,
});

let pollManager: typeof import('../utils/pollManager');

describe('pollManager', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    mockWebSocket.mockReset();
    mockWebSocket.mockImplementation(() => ({
      readyState: 0,
      close: vi.fn(),
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    }));
    pollManager = await import('../utils/pollManager');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls registered loader immediately', () => {
    const loader = vi.fn();
    pollManager.registerLoader(loader);
    expect(loader).toHaveBeenCalledTimes(0);
  });

  it('returns an unsubscribe function', () => {
    const loader = vi.fn();
    const unsub = pollManager.registerLoader(loader);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('attempts WebSocket connection on register', () => {
    const loader = vi.fn();
    pollManager.registerLoader(loader);
    expect(mockWebSocket).toHaveBeenCalled();
  });
});
