import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setErrorHandler, reportError } from '../utils/errorBus';

describe('errorBus', () => {
  beforeEach(() => {
    setErrorHandler(() => {});
  });

  it('calls the registered handler on reportError', () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    reportError('test error');
    expect(handler).toHaveBeenCalledWith('test error');
  });

  it('does not throw when no handler is set', () => {
    expect(() => reportError('orphan')).not.toThrow();
  });

  it('replaces the previous handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    setErrorHandler(first);
    setErrorHandler(second);
    reportError('msg');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('msg');
  });
});
