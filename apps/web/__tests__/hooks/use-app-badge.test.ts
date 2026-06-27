/**
 * Tests for hooks/use-app-badge.ts
 */

const mockIsBadgingSupported = jest.fn<boolean, []>();
const mockUpdateAppBadge = jest.fn();
const mockClearAppBadge = jest.fn();

jest.mock('@/utils/badge', () => ({
  isBadgingSupported: () => mockIsBadgingSupported(),
  updateAppBadge: (...args: unknown[]) => mockUpdateAppBadge(...args),
  clearAppBadge: () => mockClearAppBadge(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn() },
}));

import { renderHook, act } from '@testing-library/react';
import { useAppBadge, useAppBadgeControl } from '@/hooks/use-app-badge';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsBadgingSupported.mockReturnValue(true);
});

// ─── useAppBadge ──────────────────────────────────────────────────────────────

describe('useAppBadge', () => {
  it('calls updateAppBadge with unreadCount when supported', () => {
    renderHook(() => useAppBadge(5));
    expect(mockUpdateAppBadge).toHaveBeenCalledWith(5);
  });

  it('does not call updateAppBadge when badging is not supported', () => {
    mockIsBadgingSupported.mockReturnValue(false);
    renderHook(() => useAppBadge(5));
    expect(mockUpdateAppBadge).not.toHaveBeenCalled();
  });

  it('calls clearAppBadge on unmount', () => {
    const { unmount } = renderHook(() => useAppBadge(3));
    unmount();
    expect(mockClearAppBadge).toHaveBeenCalled();
  });

  it('does not call clearAppBadge on unmount when not supported', () => {
    mockIsBadgingSupported.mockReturnValue(false);
    const { unmount } = renderHook(() => useAppBadge(3));
    unmount();
    expect(mockClearAppBadge).not.toHaveBeenCalled();
  });

  it('updates badge when unreadCount changes', () => {
    const { rerender } = renderHook(({ count }: { count: number }) => useAppBadge(count), {
      initialProps: { count: 2 },
    });
    rerender({ count: 7 });
    expect(mockUpdateAppBadge).toHaveBeenCalledWith(7);
  });

  it('calls updateAppBadge with 0', () => {
    renderHook(() => useAppBadge(0));
    expect(mockUpdateAppBadge).toHaveBeenCalledWith(0);
  });
});

// ─── useAppBadgeControl ───────────────────────────────────────────────────────

describe('useAppBadgeControl', () => {
  it('supported is true when badging is supported', () => {
    const { result } = renderHook(() => useAppBadgeControl());
    expect(result.current.supported).toBe(true);
  });

  it('supported is false when badging is not supported', () => {
    mockIsBadgingSupported.mockReturnValue(false);
    const { result } = renderHook(() => useAppBadgeControl());
    expect(result.current.supported).toBe(false);
  });

  it('setBadge calls updateAppBadge', () => {
    const { result } = renderHook(() => useAppBadgeControl());
    act(() => { result.current.setBadge(10); });
    expect(mockUpdateAppBadge).toHaveBeenCalledWith(10);
  });

  it('clearBadge calls clearAppBadge', () => {
    const { result } = renderHook(() => useAppBadgeControl());
    act(() => { result.current.clearBadge(); });
    expect(mockClearAppBadge).toHaveBeenCalled();
  });
});
