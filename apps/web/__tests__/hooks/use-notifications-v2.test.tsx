import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { NotificationType } from '@/types/notification';

// Mocks must be declared before imports that use them
const mockUseInfiniteNotificationsQuery = jest.fn();
const mockUseUnreadNotificationCountQuery = jest.fn();
const mockUseMarkNotificationAsReadMutation = jest.fn();
const mockUseMarkAllNotificationsAsReadMutation = jest.fn();
const mockUseDeleteNotificationMutation = jest.fn();
const mockUseNotificationsQuery = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue({});
const mockFetchNextPage = jest.fn().mockResolvedValue({});
const mockMutateAsync = jest.fn().mockResolvedValue({});

jest.mock('@/hooks/queries/use-notifications-query', () => ({
  useNotificationsQuery: (...args: unknown[]) => mockUseNotificationsQuery(...args),
  useInfiniteNotificationsQuery: (...args: unknown[]) => mockUseInfiniteNotificationsQuery(...args),
  useUnreadNotificationCountQuery: () => mockUseUnreadNotificationCountQuery(),
  useMarkNotificationAsReadMutation: () => mockUseMarkNotificationAsReadMutation(),
  useMarkAllNotificationsAsReadMutation: () => mockUseMarkAllNotificationsAsReadMutation(),
  useDeleteNotificationMutation: () => mockUseDeleteNotificationMutation(),
}));

jest.mock('@/stores/language-store', () => ({
  getCurrentInterfaceLocale: jest.fn().mockReturnValue('fr-FR'),
  useLanguageStore: jest.fn(),
}));

import { useNotificationsV2 } from '@/hooks/v2/use-notifications-v2';

const makeNotification = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'notif-1',
  type: 'new_message' as NotificationType,
  actor: {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    avatar: 'https://example.com/alice.jpg',
  },
  context: { conversationId: 'conv-1' },
  state: {
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  content: 'Hello world',
  ...overrides,
});

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapper({ queryClient }: { queryClient: QueryClient }) {
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
}

function setupMocks({
  notifications = [makeNotification()],
  unreadCount = 1,
  hasNextPage = false,
  isLoading = false,
  isFetchingNextPage = false,
  error = null,
}: {
  notifications?: ReturnType<typeof makeNotification>[];
  unreadCount?: number;
  hasNextPage?: boolean;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  error?: Error | null;
} = {}) {
  mockUseInfiniteNotificationsQuery.mockReturnValue({
    data: notifications.length > 0 ? { pages: [{ notifications }] } : undefined,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage: mockFetchNextPage,
    error,
    refetch: mockRefetch,
  });
  mockUseUnreadNotificationCountQuery.mockReturnValue({ data: unreadCount });
  mockUseMarkNotificationAsReadMutation.mockReturnValue({ mutateAsync: mockMutateAsync });
  mockUseMarkAllNotificationsAsReadMutation.mockReturnValue({ mutateAsync: mockMutateAsync });
  mockUseDeleteNotificationMutation.mockReturnValue({ mutateAsync: mockMutateAsync });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchNextPage.mockResolvedValue({});
  mockMutateAsync.mockResolvedValue({});
  mockRefetch.mockResolvedValue({});
});

describe('useNotificationsV2', () => {
  describe('notifications data transformation', () => {
    it('transforms notifications from pages into NotificationV2 format', () => {
      setupMocks();
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].id).toBe('notif-1');
      expect(result.current.notifications[0].type).toBe('new_message');
    });

    it('returns empty array when data is undefined', () => {
      setupMocks({ notifications: [] });
      mockUseInfiniteNotificationsQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: mockFetchNextPage,
        error: null,
        refetch: mockRefetch,
      });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications).toEqual([]);
    });

    it('sets user fields from actor', () => {
      setupMocks();
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      const user = result.current.notifications[0].user;
      expect(user.id).toBe('user-1');
      expect(user.name).toBe('Alice');
      expect(user.avatar).toBe('https://example.com/alice.jpg');
    });

    it('uses "system" as user id when actor is absent', () => {
      const notif = makeNotification({ actor: undefined });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].user.id).toBe('system');
      expect(result.current.notifications[0].user.name).toBe('Systeme');
    });

    it('sets isUnread to true when isRead is false', () => {
      const notif = makeNotification({ state: { isRead: false, createdAt: new Date().toISOString() } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].isUnread).toBe(true);
    });

    it('sets isUnread to false when isRead is true', () => {
      const notif = makeNotification({ state: { isRead: true, createdAt: new Date().toISOString() } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].isUnread).toBe(false);
    });

    it('builds conversationId action URL', () => {
      setupMocks({ notifications: [makeNotification({ context: { conversationId: 'conv-42' } })] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].actionUrl).toBe('/v2/chats?id=conv-42');
    });

    it('builds commentId action URL when no conversationId', () => {
      const notif = makeNotification({ context: { commentId: 'post-123' } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].actionUrl).toBe('/v2/communities/post-123');
    });

    it('builds actor profile URL when no context', () => {
      const notif = makeNotification({ context: undefined });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].actionUrl).toBe('/v2/u/alice');
    });

    it('returns undefined actionUrl when no context and no actor', () => {
      const notif = makeNotification({ context: undefined, actor: undefined });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].actionUrl).toBeUndefined();
    });
  });

  describe('getNotificationContent per type', () => {
    const types: [NotificationType, string][] = [
      ['new_message', 'vous a envoye un message'],
      ['message_reply', 'vous a envoye un message'],
      ['mention', 'vous a mentionne dans un commentaire'],
      ['user_mentioned', 'vous a mentionne dans un commentaire'],
      ['reaction', 'a reagi a votre message'],
      ['message_reaction', 'a reagi a votre message'],
      ['friend_request', 'vous a envoye une demande de contact'],
      ['contact_request', 'vous a envoye une demande de contact'],
      ['friend_accepted', 'a accepte votre demande de contact'],
      ['contact_accepted', 'a accepte votre demande de contact'],
      ['member_joined', 'a rejoint la conversation'],
      ['member_left', 'a quitte la conversation'],
      ['community_invite', 'vous a invite a rejoindre une communaute'],
      ['community_announcement', 'Nouvelle annonce dans votre communaute'],
      ['missed_call', 'Appel manque'],
      ['translation_completed', 'Traduction terminee'],
    ];

    test.each(types)('type "%s" produces content "%s"', (type, expected) => {
      const notif = makeNotification({ type });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].content).toBe(expected);
    });

    it('uses notification.content for system type when content is present', () => {
      const notif = makeNotification({ type: 'system' as NotificationType, content: 'System alert' });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].content).toBe('System alert');
    });

    it('uses fallback text for system type when content is absent', () => {
      const notif = makeNotification({ type: 'system' as NotificationType, content: undefined });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].content).toBe('Notification systeme');
    });

    it('falls back to "Nouvelle notification" for unknown type', () => {
      const notif = makeNotification({ type: 'unknown_type' as NotificationType, content: undefined });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].content).toBe('Nouvelle notification');
    });
  });

  describe('loading and pagination states', () => {
    it('exposes isLoading from query', () => {
      setupMocks({ isLoading: true, notifications: [] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.isLoading).toBe(true);
    });

    it('exposes isLoadingMore from isFetchingNextPage', () => {
      setupMocks({ isFetchingNextPage: true });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.isLoadingMore).toBe(true);
    });

    it('exposes hasMore from hasNextPage', () => {
      setupMocks({ hasNextPage: true });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.hasMore).toBe(true);
    });

    it('exposes hasMore as false when hasNextPage is false', () => {
      setupMocks({ hasNextPage: false });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.hasMore).toBe(false);
    });

    it('returns unreadCount from query', () => {
      setupMocks({ unreadCount: 7 });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.unreadCount).toBe(7);
    });

    it('returns error message when query errors', () => {
      setupMocks({ error: new Error('Network error') });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.error).toBe('Network error');
    });

    it('returns null error when no error', () => {
      setupMocks({ error: null });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.error).toBeNull();
    });
  });

  describe('actions', () => {
    it('loadMore calls fetchNextPage when hasNextPage and not already fetching', async () => {
      setupMocks({ hasNextPage: true, isFetchingNextPage: false });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      await act(async () => { await result.current.loadMore(); });

      expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('loadMore does NOT call fetchNextPage when already fetching', async () => {
      setupMocks({ hasNextPage: true, isFetchingNextPage: true });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      await act(async () => { await result.current.loadMore(); });

      expect(mockFetchNextPage).not.toHaveBeenCalled();
    });

    it('loadMore does NOT call fetchNextPage when hasNextPage is false', async () => {
      setupMocks({ hasNextPage: false });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      await act(async () => { await result.current.loadMore(); });

      expect(mockFetchNextPage).not.toHaveBeenCalled();
    });

    it('markAsRead calls mutateAsync with the notification id', async () => {
      setupMocks();
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      await act(async () => { await result.current.markAsRead('notif-42'); });

      expect(mockMutateAsync).toHaveBeenCalledWith('notif-42');
    });

    it('markAllAsRead calls mutateAsync', async () => {
      setupMocks();
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      await act(async () => { await result.current.markAllAsRead(); });

      expect(mockMutateAsync).toHaveBeenCalled();
    });

    it('deleteNotification calls mutateAsync with the notification id', async () => {
      setupMocks();
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      await act(async () => { await result.current.deleteNotification('notif-99'); });

      expect(mockMutateAsync).toHaveBeenCalledWith('notif-99');
    });

    it('refreshNotifications calls refetch', async () => {
      setupMocks();
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      await act(async () => { await result.current.refreshNotifications(); });

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('options', () => {
    it('passes unreadOnly=true as isRead:false to query', () => {
      setupMocks();
      const qc = makeQueryClient();
      renderHook(() => useNotificationsV2({ unreadOnly: true }), { wrapper: wrapper({ queryClient: qc }) });

      expect(mockUseInfiniteNotificationsQuery).toHaveBeenCalledWith(
        expect.objectContaining({ isRead: false })
      );
    });

    it('passes unreadOnly=false as isRead:undefined to query', () => {
      setupMocks();
      const qc = makeQueryClient();
      renderHook(() => useNotificationsV2({ unreadOnly: false }), { wrapper: wrapper({ queryClient: qc }) });

      expect(mockUseInfiniteNotificationsQuery).toHaveBeenCalledWith(
        expect.objectContaining({ isRead: undefined })
      );
    });
  });

  describe('formatRelativeTime via notification.time', () => {
    it('shows "A l\'instant" for very recent notifications', () => {
      const notif = makeNotification({ state: { isRead: false, createdAt: new Date().toISOString() } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].time).toBe("A l'instant");
    });

    it('shows "Hier" for yesterday notification', () => {
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const notif = makeNotification({ state: { isRead: false, createdAt: yesterday.toISOString() } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].time).toBe('Hier');
    });

    it('shows minutes-ago for notification less than 60 min old', () => {
      const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
      const notif = makeNotification({ state: { isRead: false, createdAt: twoMinsAgo.toISOString() } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].time).toMatch(/Il y a \d+ min/);
    });

    it('shows hours-ago for notification 2h old', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const notif = makeNotification({ state: { isRead: false, createdAt: twoHoursAgo.toISOString() } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].time).toMatch(/Il y a \d+h/);
    });

    it('shows days-ago for notification 3 days old', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const notif = makeNotification({ state: { isRead: false, createdAt: threeDaysAgo.toISOString() } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].time).toMatch(/Il y a \d+j/);
    });

    it('formats date for notifications older than 7 days', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const notif = makeNotification({ state: { isRead: false, createdAt: tenDaysAgo.toISOString() } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      // Should be a formatted date string (contains a digit for the day)
      expect(result.current.notifications[0].time).toMatch(/\d/);
    });

    it('shows empty string for undefined createdAt', () => {
      const notif = makeNotification({ state: { isRead: false, createdAt: undefined } });
      setupMocks({ notifications: [notif] });
      const qc = makeQueryClient();
      const { result } = renderHook(() => useNotificationsV2(), { wrapper: wrapper({ queryClient: qc }) });

      expect(result.current.notifications[0].time).toBe('');
    });
  });
});
