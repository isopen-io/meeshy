/**
 * Tests for hooks/use-pwa-badge.ts
 */

jest.mock('@/utils/pwa-badge', () => ({
  pwaBadge: {
    isSupported: jest.fn(() => true),
    clear: jest.fn(() => Promise.resolve(true)),
    setCount: jest.fn(() => Promise.resolve(true)),
    increment: jest.fn(),
    decrement: jest.fn(),
  },
}));

jest.mock('@/hooks/queries/use-notifications-manager-rq', () => ({
  useNotificationsManagerRQ: jest.fn(),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePWABadge, usePWABadgeSync } from '@/hooks/use-pwa-badge';
import { pwaBadge } from '@/utils/pwa-badge';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';

const mockIsSupported = pwaBadge.isSupported as jest.MockedFunction<typeof pwaBadge.isSupported>;
const mockClear = pwaBadge.clear as jest.MockedFunction<typeof pwaBadge.clear>;
const mockSetCount = pwaBadge.setCount as jest.MockedFunction<typeof pwaBadge.setCount>;
const mockUseNotifications = useNotificationsManagerRQ as jest.MockedFunction<
  typeof useNotificationsManagerRQ
>;

describe('usePWABadge', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSupported.mockReturnValue(true);
    mockClear.mockResolvedValue(true);
    mockSetCount.mockResolvedValue(true);
    mockUseNotifications.mockReturnValue({ unreadCount: 0 } as ReturnType<typeof useNotificationsManagerRQ>);
  });

  it('returns isSupported from pwaBadge', () => {
    const { result } = renderHook(() => usePWABadge());

    expect(result.current.isSupported).toBe(true);
  });

  it('returns false when badge API not supported', () => {
    mockIsSupported.mockReturnValue(false);

    const { result } = renderHook(() => usePWABadge());

    expect(result.current.isSupported).toBe(false);
  });

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

  it('returns currentCount matching unreadCount', () => {
    mockUseNotifications.mockReturnValue({ unreadCount: 5 } as ReturnType<typeof useNotificationsManagerRQ>);

    const { result } = renderHook(() => usePWABadge());

    expect(result.current.currentCount).toBe(5);
  });

  it('syncs badge when unreadCount changes', async () => {
    mockUseNotifications.mockReturnValue({ unreadCount: 3 } as ReturnType<typeof useNotificationsManagerRQ>);

    renderHook(() => usePWABadge({ autoSync: true }));

    await waitFor(() => {
      expect(mockSetCount).toHaveBeenCalledWith(3);
    });
  });

  it('does not sync when autoSync is false', async () => {
    mockUseNotifications.mockReturnValue({ unreadCount: 5 } as ReturnType<typeof useNotificationsManagerRQ>);

    renderHook(() => usePWABadge({ autoSync: false }));

    await new Promise(r => setTimeout(r, 50));

    expect(mockSetCount).not.toHaveBeenCalled();
  });

  it('calls onBadgeUpdate after successful sync', async () => {
    const onBadgeUpdate = jest.fn();
    mockUseNotifications.mockReturnValue({ unreadCount: 7 } as ReturnType<typeof useNotificationsManagerRQ>);
    mockSetCount.mockResolvedValue(true);

    renderHook(() => usePWABadge({ onBadgeUpdate }));

    await waitFor(() => {
      expect(onBadgeUpdate).toHaveBeenCalledWith(7);
    });
  });

  it('does not call onBadgeUpdate when setCount fails', async () => {
    const onBadgeUpdate = jest.fn();
    mockUseNotifications.mockReturnValue({ unreadCount: 7 } as ReturnType<typeof useNotificationsManagerRQ>);
    mockSetCount.mockResolvedValue(false);

    renderHook(() => usePWABadge({ onBadgeUpdate }));

    await new Promise(r => setTimeout(r, 50));

    expect(onBadgeUpdate).not.toHaveBeenCalled();
  });

  it('logs debug info when debug is true', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    renderHook(() => usePWABadge({ debug: true }));

    expect(consoleSpy).toHaveBeenCalledWith(
      '[usePWABadge] Badge API supported:',
      expect.any(Boolean)
    );

    consoleSpy.mockRestore();
  });

  it('returns badge utility functions', () => {
    const { result } = renderHook(() => usePWABadge());

    expect(result.current.setBadgeCount).toBe(pwaBadge.setCount);
    expect(result.current.clearBadge).toBe(pwaBadge.clear);
    expect(result.current.incrementBadge).toBe(pwaBadge.increment);
    expect(result.current.decrementBadge).toBe(pwaBadge.decrement);
  });

  describe('usePWABadgeSync', () => {
    it('runs without error', () => {
      expect(() => {
        renderHook(() => usePWABadgeSync());
      }).not.toThrow();
    });
  });
});
