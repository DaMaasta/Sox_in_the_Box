import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from '../contexts/CartContext';
import type { CartItem } from '../types';

function makeItem(overrides: Partial<CartItem> = {}): Omit<CartItem, 'cartQuantity'> {
  return {
    productId: 'p1',
    productName: 'Hammer',
    imageUrl: null,
    maxQuantity: 10,
    unit: 'Stück',
    boxId: 'b1',
    boxName: 'Werkzeug',
    parentId: 'g1',
    parentName: 'Lager A',
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}

describe('CartContext', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toEqual([]);
  });

  it('adds an item with default quantity 1', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem()));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].cartQuantity).toBe(1);
  });

  it('clamps quantity to maxQuantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem({ maxQuantity: 3 }), 99));
    expect(result.current.items[0].cartQuantity).toBe(3);
  });

  it('clamps quantity to minimum 1', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem(), -5));
    expect(result.current.items[0].cartQuantity).toBe(1);
  });

  it('updates quantity when adding the same product again', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem(), 2));
    act(() => result.current.addToCart(makeItem(), 5));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].cartQuantity).toBe(5);
  });

  it('removes an item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem()));
    act(() => result.current.removeFromCart('p1'));
    expect(result.current.items).toEqual([]);
  });

  it('increments quantity with updateCartQuantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem({ maxQuantity: 5 }), 2));
    act(() => result.current.updateCartQuantity('p1', 1));
    expect(result.current.items[0].cartQuantity).toBe(3);
  });

  it('does not exceed maxQuantity with updateCartQuantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem({ maxQuantity: 3 }), 3));
    act(() => result.current.updateCartQuantity('p1', 1));
    expect(result.current.items[0].cartQuantity).toBe(3);
  });

  it('removes item when quantity reaches 0', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem(), 1));
    act(() => result.current.updateCartQuantity('p1', -1));
    expect(result.current.items).toEqual([]);
  });

  it('clears all items', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem({ productId: 'p1' })));
    act(() => result.current.addToCart(makeItem({ productId: 'p2' })));
    act(() => result.current.clearCart());
    expect(result.current.items).toEqual([]);
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(makeItem()));
    const stored = JSON.parse(localStorage.getItem('cart')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].productId).toBe('p1');
  });

  it('restores from localStorage', () => {
    const saved: CartItem[] = [{ ...makeItem(), cartQuantity: 3 }];
    localStorage.setItem('cart', JSON.stringify(saved));
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].cartQuantity).toBe(3);
  });
});
