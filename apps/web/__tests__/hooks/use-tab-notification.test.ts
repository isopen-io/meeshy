/**
 * Tests for hooks/use-tab-notification.ts
 */

const mockUnreadCount = { unreadCount: 0 };
jest.mock('@/hooks/queries/use-notifications-manager-rq', () => ({
  useNotificationsManagerRQ: () => mockUnreadCount,
}));

import { renderHook } from '@testing-library/react';
import { useTabNotification } from '@/hooks/use-tab-notification';

const ORIGINAL_TITLE = 'Meeshy - Messagerie multilingue en temps réel';

beforeEach(() => {
  jest.clearAllMocks();
  mockUnreadCount.unreadCount = 0;
  document.title = ORIGINAL_TITLE;
});

// ─── initial render ───────────────────────────────────────────────────────────

describe('initial render', () => {
  it('mounts without throwing', () => {
    expect(() => renderHook(() => useTabNotification())).not.toThrow();
  });

  it('does not change title when tab is visible and no unread', () => {
    // jsdom document.visibilityState defaults to 'visible'
    renderHook(() => useTabNotification());
    expect(document.title).toBe(ORIGINAL_TITLE);
  });
});

// ─── visibility change — title ────────────────────────────────────────────────

describe('visibility change — title', () => {
  it('updates title with unread count when tab becomes hidden', () => {
    mockUnreadCount.unreadCount = 3;
    renderHook(() => useTabNotification());

    // Simulate tab hidden
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.title).toBe(`(3) ${ORIGINAL_TITLE}`);

    // Restore
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('restores title when tab becomes visible again', () => {
    mockUnreadCount.unreadCount = 5;
    renderHook(() => useTabNotification());

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.title).toBe(ORIGINAL_TITLE);
  });

  it('does not change title to unread format when tab becomes hidden with 0 unread', () => {
    mockUnreadCount.unreadCount = 0;
    renderHook(() => useTabNotification());

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.title).toBe(ORIGINAL_TITLE);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});

// ─── cleanup on unmount ───────────────────────────────────────────────────────

describe('cleanup on unmount', () => {
  it('restores original title on unmount', () => {
    const { unmount } = renderHook(() => useTabNotification());
    unmount();
    expect(document.title).toBe(ORIGINAL_TITLE);
  });

  it('removes visibilitychange listeners on unmount', () => {
    mockUnreadCount.unreadCount = 2;
    const { unmount } = renderHook(() => useTabNotification());
    unmount();

    // After unmount, visibilitychange should not update title
    const titleBefore = document.title;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.title).toBe(titleBefore);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});
