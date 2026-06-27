jest.mock('@/utils/badge', () => ({
  isBadgingSupported: jest.fn(() => true),
  updateAppBadge: jest.fn(),
  clearAppBadge: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn() },
}));

import { renderHook, act } from '@testing-library/react';
import { useAppBadge, useAppBadgeControl } from '@/hooks/use-app-badge';
import { isBadgingSupported, updateAppBadge, clearAppBadge } from '@/utils/badge';

const mockIsBadgingSupported = isBadgingSupported as jest.Mock;
const mockUpdateAppBadge = updateAppBadge as jest.Mock;
const mockClearAppBadge = clearAppBadge as jest.Mock;

describe('useAppBadge', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsBadgingSupported.mockReturnValue(true);
  });

  it('does not call updateAppBadge when badging is not supported', () => {
    mockIsBadgingSupported.mockReturnValue(false);

    renderHook(() => useAppBadge(5));

    expect(mockUpdateAppBadge).not.toHaveBeenCalled();
  });

  it('calls updateAppBadge with 5 when supported and count is 5', () => {
    renderHook(() => useAppBadge(5));

    expect(mockUpdateAppBadge).toHaveBeenCalledWith(5);
  });

  it('calls updateAppBadge with 0 when supported and count is 0', () => {
    renderHook(() => useAppBadge(0));

    expect(mockUpdateAppBadge).toHaveBeenCalledWith(0);
  });

  it('calls clearAppBadge on unmount', () => {
    const { unmount } = renderHook(() => useAppBadge(3));

    unmount();

    expect(mockClearAppBadge).toHaveBeenCalled();
  });

  it('calls updateAppBadge with new count when count changes', () => {
    const { rerender } = renderHook(({ count }: { count: number }) => useAppBadge(count), {
      initialProps: { count: 2 },
    });

    expect(mockUpdateAppBadge).toHaveBeenCalledWith(2);

    rerender({ count: 7 });

    expect(mockUpdateAppBadge).toHaveBeenCalledWith(7);
  });
});

describe('useAppBadgeControl', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsBadgingSupported.mockReturnValue(true);
  });

  it('supported matches isBadgingSupported return value when true', () => {
    mockIsBadgingSupported.mockReturnValue(true);

    const { result } = renderHook(() => useAppBadgeControl());

    expect(result.current.supported).toBe(true);
  });

  it('supported matches isBadgingSupported return value when false', () => {
    mockIsBadgingSupported.mockReturnValue(false);

    const { result } = renderHook(() => useAppBadgeControl());

    expect(result.current.supported).toBe(false);
  });

  it('setBadge(3) calls updateAppBadge with 3', () => {
    const { result } = renderHook(() => useAppBadgeControl());

    act(() => {
      result.current.setBadge(3);
    });

    expect(mockUpdateAppBadge).toHaveBeenCalledWith(3);
  });

  it('clearBadge() calls clearAppBadge', () => {
    const { result } = renderHook(() => useAppBadgeControl());

    act(() => {
      result.current.clearBadge();
    });

    expect(mockClearAppBadge).toHaveBeenCalled();
  });
});
