/**
 * Tests for hooks/use-pwa-badge.ts
 */

const mockIsSupported = jest.fn<boolean, []>();
const mockSetCount = jest.fn<Promise<boolean>, [number]>();
const mockClear = jest.fn<Promise<void>, []>();
const mockIncrement = jest.fn<Promise<boolean>, []>();
const mockDecrement = jest.fn<Promise<boolean>, []>();

jest.mock('@/utils/pwa-badge', () => ({
  pwaBadge: {
    isSupported: () => mockIsSupported(),
    setCount: (...args: unknown[]) => mockSetCount(...(args as [number])),
    clear: () => mockClear(),
    increment: () => mockIncrement(),
    decrement: () => mockDecrement(),
  },
}));

const mockUnreadCount = { unreadCount: 0 };
jest.mock('@/hooks/queries/use-notifications-manager-rq', () => ({
  useNotificationsManagerRQ: () => mockUnreadCount,
}));

import { renderHook, act } from '@testing-library/react';
import { usePWABadge, usePWABadgeSync } from '@/hooks/use-pwa-badge';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSupported.mockReturnValue(true);
  mockSetCount.mockResolvedValue(true);
  mockClear.mockResolvedValue(undefined);
  mockUnreadCount.unreadCount = 0;
});

// ─── usePWABadge ─────────────────────────────────────────────────────────────

describe('usePWABadge', () => {
  it('clears badge on mount when supported', () => {
    renderHook(() => usePWABadge());
    expect(mockClear).toHaveBeenCalled();
  });

  it('does not clear badge on mount when not supported', () => {
    mockIsSupported.mockReturnValue(false);
    renderHook(() => usePWABadge());
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('clears badge on unmount when supported', () => {
    const { unmount } = renderHook(() => usePWABadge());
    mockClear.mockClear();
    unmount();
    expect(mockClear).toHaveBeenCalled();
  });

  it('does not clear badge on unmount when not supported', () => {
    mockIsSupported.mockReturnValue(false);
    const { unmount } = renderHook(() => usePWABadge());
    unmount();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('calls setCount when unreadCount changes from 0', async () => {
    mockUnreadCount.unreadCount = 5;
    await act(async () => {
      renderHook(() => usePWABadge());
      await Promise.resolve();
    });
    expect(mockSetCount).toHaveBeenCalledWith(5);
  });

  it('does not call setCount when autoSync=false', async () => {
    mockUnreadCount.unreadCount = 5;
    await act(async () => {
      renderHook(() => usePWABadge({ autoSync: false }));
      await Promise.resolve();
    });
    expect(mockSetCount).not.toHaveBeenCalled();
  });

  it('calls onBadgeUpdate callback after successful setCount', async () => {
    const onBadgeUpdate = jest.fn();
    mockUnreadCount.unreadCount = 3;
    await act(async () => {
      renderHook(() => usePWABadge({ onBadgeUpdate }));
      await Promise.resolve();
    });
    expect(onBadgeUpdate).toHaveBeenCalledWith(3);
  });

  it('does not call onBadgeUpdate when setCount returns false', async () => {
    mockSetCount.mockResolvedValue(false);
    const onBadgeUpdate = jest.fn();
    mockUnreadCount.unreadCount = 3;
    await act(async () => {
      renderHook(() => usePWABadge({ onBadgeUpdate }));
      await Promise.resolve();
    });
    expect(onBadgeUpdate).not.toHaveBeenCalled();
  });

  it('returns isSupported from pwaBadge', () => {
    const { result } = renderHook(() => usePWABadge());
    expect(result.current.isSupported).toBe(true);
  });

  it('returns currentCount as unreadCount', () => {
    mockUnreadCount.unreadCount = 7;
    const { result } = renderHook(() => usePWABadge());
    expect(result.current.currentCount).toBe(7);
  });

  it('exposes setBadgeCount, clearBadge, incrementBadge, decrementBadge', () => {
    const { result } = renderHook(() => usePWABadge());
    expect(typeof result.current.setBadgeCount).toBe('function');
    expect(typeof result.current.clearBadge).toBe('function');
    expect(typeof result.current.incrementBadge).toBe('function');
    expect(typeof result.current.decrementBadge).toBe('function');
  });
});

// ─── usePWABadgeSync ──────────────────────────────────────────────────────────

describe('usePWABadgeSync', () => {
  it('mounts without throwing', () => {
    expect(() => renderHook(() => usePWABadgeSync())).not.toThrow();
  });
});
