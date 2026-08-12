import { renderHook, act } from '@testing-library/react';
import { useTabNotification } from '@/hooks/use-tab-notification';

jest.mock('@/hooks/queries/use-notifications-manager-rq', () => ({
  useNotificationsManagerRQ: jest.fn(),
}));

import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
const mockUseNotificationsManagerRQ = useNotificationsManagerRQ as jest.MockedFunction<typeof useNotificationsManagerRQ>;

const ORIGINAL_TITLE = 'Meeshy - Messagerie multilingue en temps réel';

function makeRQ(unreadCount: number) {
  mockUseNotificationsManagerRQ.mockReturnValue({
    unreadCount,
    notifications: [],
    isLoading: false,
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    refresh: jest.fn(),
  } as any);
}

function simulateVisibilityChange(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  document.title = ORIGINAL_TITLE;
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  // Clean up any favicon links added by previous tests
  document.querySelectorAll('link[rel="icon"]').forEach(el => el.remove());
});

afterEach(() => {
  document.title = ORIGINAL_TITLE;
});

describe('useTabNotification', () => {
  describe('document title updates', () => {
    it('does not change title when tab is visible', () => {
      makeRQ(5);
      renderHook(() => useTabNotification());
      expect(document.title).toBe(ORIGINAL_TITLE);
    });

    it('prepends unread count to title when tab becomes hidden with unread messages', () => {
      makeRQ(3);
      renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));

      expect(document.title).toBe(`(3) ${ORIGINAL_TITLE}`);
    });

    it('keeps original title when tab is hidden but no unread messages', () => {
      makeRQ(0);
      renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));

      expect(document.title).toBe(ORIGINAL_TITLE);
    });

    it('restores original title when tab becomes visible again', () => {
      makeRQ(3);
      renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));
      expect(document.title).toBe(`(3) ${ORIGINAL_TITLE}`);

      act(() => simulateVisibilityChange('visible'));
      expect(document.title).toBe(ORIGINAL_TITLE);
    });

    it('restores title on unmount', () => {
      makeRQ(3);
      const { unmount } = renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));
      expect(document.title).toBe(`(3) ${ORIGINAL_TITLE}`);

      unmount();
      expect(document.title).toBe(ORIGINAL_TITLE);
    });
  });

  describe('favicon updates', () => {
    it('changes favicon to badge variant when tab is hidden with unread', () => {
      makeRQ(2);
      renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));

      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      expect(link?.href).toContain('circle');
    });

    it('creates favicon link element if none exists', () => {
      makeRQ(1);
      document.querySelectorAll('link[rel="icon"]').forEach(el => el.remove());
      renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));

      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      expect(link).not.toBeNull();
    });

    it('restores original favicon on visibility restore', () => {
      makeRQ(2);
      renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));
      act(() => simulateVisibilityChange('visible'));

      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      // Original favicon does not have the badge circle
      expect(link?.href).not.toContain('circle');
    });
  });

  describe('re-render while tab is hidden', () => {
    it('updates favicon immediately when unread changes while tab is hidden', () => {
      makeRQ(0);
      const { rerender } = renderHook(() => useTabNotification());

      // Hide the tab (sets isTabVisibleRef.current = false via handler)
      act(() => simulateVisibilityChange('hidden'));

      // Now increase unreadCount while tab is still hidden → useEffect re-runs
      // with isTabVisibleRef.current === false
      makeRQ(5);
      act(() => { rerender(); });

      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      expect(link?.href).toContain('circle');
    });

    it('updates title immediately when unreadCount changes while tab is hidden', () => {
      makeRQ(0);
      const { rerender } = renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));

      // Change unreadCount to non-zero while tab remains hidden
      // → second useEffect re-runs, if (!isTabVisibleRef.current) branch executes
      makeRQ(3);
      act(() => { rerender(); });

      expect(document.title).toBe(`(3) ${ORIGINAL_TITLE}`);
    });
  });

  describe('getFaviconLink reuse', () => {
    it('reuses existing link element when one with correct type is present in DOM', () => {
      // Pre-insert the expected link element before the hook initializes
      const existingLink = document.createElement('link');
      existingLink.rel = 'icon';
      existingLink.type = 'image/svg+xml';
      existingLink.href = 'existing-favicon.svg';
      document.head.appendChild(existingLink);

      makeRQ(1);
      const { result } = renderHook(() => useTabNotification());

      act(() => simulateVisibilityChange('hidden'));

      // The hook should have reused the existing link element (querySelector finds it)
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
      expect(link).not.toBeNull();
      // href was updated by setFavicon (badge variant)
      expect(link?.href).toContain('circle');
    });
  });

  describe('cleanup', () => {
    it('removes visibilitychange listeners on unmount', () => {
      const removeSpy = jest.spyOn(document, 'removeEventListener');
      makeRQ(0);
      const { unmount } = renderHook(() => useTabNotification());
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});
