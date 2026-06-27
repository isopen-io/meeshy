/**
 * Tests for hooks/queries/use-notifications-manager-rq.tsx
 *
 * Covers: return shape, socket lifecycle, markAsRead/markAllAsRead/
 * deleteNotification callbacks, fetchMore guard, refresh.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockOnNotification = jest.fn();
const mockOnNotificationRead = jest.fn();
const mockConnect = jest.fn();
const mockUnsubNotification = jest.fn();
const mockUnsubRead = jest.fn();

jest.mock('@/services/notification-socketio.singleton', () => ({
  notificationSocketIO: {
    connect: (...a: unknown[]) => mockConnect(...a),
    onNotification: (...a: unknown[]) => { mockOnNotification(...a); return mockUnsubNotification; },
    onNotificationRead: (...a: unknown[]) => { mockOnNotificationRead(...a); return mockUnsubRead; },
  },
}));

const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockDeleteNotification = jest.fn();
const mockFetchNextPage = jest.fn();
const mockRefetch = jest.fn();

jest.mock('@/hooks/queries/use-notifications-query', () => ({
  useInfiniteNotificationsQuery: jest.fn(() => ({
    data: {
      pages: [{ notifications: [{ id: 'n1', state: { createdAt: new Date(), isRead: false } }], unreadCount: 1 }],
    },
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: true,
    fetchNextPage: mockFetchNextPage,
    refetch: mockRefetch,
  })),
  useMarkNotificationAsReadMutation: () => ({ mutateAsync: mockMarkAsRead }),
  useMarkAllNotificationsAsReadMutation: () => ({ mutateAsync: mockMarkAllAsRead }),
  useDeleteNotificationMutation: () => ({ mutateAsync: mockDeleteNotification }),
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    notifications: {
      lists: () => ['notifications', 'list'],
      unreadCount: () => ['notifications', 'unreadCount'],
    },
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    jest.fn(() => ({ isAuthenticated: true })),
    { getState: () => ({ authToken: 'tok', isAuthenticated: true }) }
  ),
}));

jest.mock('@/stores/notification-store', () => ({
  useNotificationStore: Object.assign(
    jest.fn(() => ({})),
    { getState: () => ({ activeConversationId: null }) }
  ),
}));

jest.mock('@/utils/notification-helpers', () => ({
  buildNotificationTitle: () => 'Title',
  buildNotificationContent: () => 'Content',
  getNotificationLink: () => null,
  getNotificationBorderColor: () => '',
}));

jest.mock('sonner', () => ({ toast: { custom: jest.fn(), dismiss: jest.fn() } }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper: Wrapper, queryClient };
}

beforeEach(() => jest.clearAllMocks());

import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useNotificationsManagerRQ', () => {
  it('returns expected shape', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    const r = result.current;
    expect(Array.isArray(r.notifications)).toBe(true);
    expect(typeof r.unreadCount).toBe('number');
    expect(typeof r.isLoading).toBe('boolean');
    expect(typeof r.isLoadingMore).toBe('boolean');
    expect(typeof r.hasMore).toBe('boolean');
    expect(typeof r.markAsRead).toBe('function');
    expect(typeof r.markAllAsRead).toBe('function');
    expect(typeof r.deleteNotification).toBe('function');
    expect(typeof r.fetchMore).toBe('function');
    expect(typeof r.refresh).toBe('function');
    expect(r.counts).toHaveProperty('total');
    expect(r.counts).toHaveProperty('unread');
  });

  it('flattens pages into notifications array', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('n1');
  });

  it('reads unreadCount from first page', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    expect(result.current.unreadCount).toBe(1);
  });

  it('connects notificationSocketIO on mount when authenticated', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsManagerRQ(), { wrapper });
    expect(mockConnect).toHaveBeenCalledWith('tok');
  });

  it('subscribes to onNotification and onNotificationRead', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsManagerRQ(), { wrapper });
    expect(mockOnNotification).toHaveBeenCalled();
    expect(mockOnNotificationRead).toHaveBeenCalled();
  });

  it('calls unsubscribe functions on unmount', () => {
    const { wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    unmount();
    expect(mockUnsubNotification).toHaveBeenCalled();
    expect(mockUnsubRead).toHaveBeenCalled();
  });

  it('markAsRead calls mutateAsync with notificationId', async () => {
    mockMarkAsRead.mockResolvedValue(undefined);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    await act(async () => { await result.current.markAsRead('n1'); });
    expect(mockMarkAsRead).toHaveBeenCalledWith('n1');
  });

  it('markAllAsRead calls mutateAsync', async () => {
    mockMarkAllAsRead.mockResolvedValue(undefined);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    await act(async () => { await result.current.markAllAsRead(); });
    expect(mockMarkAllAsRead).toHaveBeenCalled();
  });

  it('deleteNotification calls mutateAsync with notificationId', async () => {
    mockDeleteNotification.mockResolvedValue(undefined);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    await act(async () => { await result.current.deleteNotification('n1'); });
    expect(mockDeleteNotification).toHaveBeenCalledWith('n1');
  });

  it('fetchMore calls fetchNextPage when hasNextPage is true', async () => {
    mockFetchNextPage.mockResolvedValue(undefined);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    await act(async () => { await result.current.fetchMore(); });
    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('refresh calls refetch', async () => {
    mockRefetch.mockResolvedValue(undefined);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    await act(async () => { await result.current.refresh(); });
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('counts.total equals notifications.length', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    expect(result.current.counts.total).toBe(result.current.notifications.length);
  });

  it('counts.unread equals unreadCount', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper });
    expect(result.current.counts.unread).toBe(result.current.unreadCount);
  });

  it('passes custom limit option to useInfiniteNotificationsQuery', () => {
    const { useInfiniteNotificationsQuery } = require('@/hooks/queries/use-notifications-query');
    const { wrapper } = makeWrapper();
    renderHook(() => useNotificationsManagerRQ({ limit: 10 }), { wrapper });
    expect(useInfiniteNotificationsQuery).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
  });
});
