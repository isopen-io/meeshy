/**
 * notification-read-sync — marquage par portée (conversation / post) côté web.
 *
 * Miroir du NotificationCachePatch iOS : ouvrir une conversation, un post, un
 * réel ou une story doit (1) patcher le cache React Query de la cloche
 * immédiatement (lignes marquées lues + compteurs décrémentés) et (2) prévenir
 * le serveur via la route de portée, coalescée pour ne pas spammer (une story
 * de 10 slides = 10 posts distincts, mais un slide revisité ne repart pas).
 */

import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Notification } from '@/types/notification';

const mockMarkConversationRead = jest.fn<Promise<unknown>, [string]>();
const mockMarkPostRead = jest.fn<Promise<unknown>, [string]>();

jest.mock('@/services/notification.service', () => ({
  NotificationService: {
    markConversationRead: (...args: [string]) => mockMarkConversationRead(...args),
    markPostRead: (...args: [string]) => mockMarkPostRead(...args),
  },
}));

let mockAuthToken: string | null = 'test-token';

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ authToken: mockAuthToken }),
  },
}));

import {
  notificationMatchesScope,
  applyScopeReadToCache,
  markScopeNotificationsRead,
  __resetNotificationReadSyncForTests,
} from '@/lib/notifications/notification-read-sync';

const CONV_ID = 'conv-1';
const POST_ID = 'post-1';

function makeNotification(overrides: Partial<Notification> & { id: string }): Notification {
  return {
    userId: 'user-1',
    type: 'new_message',
    priority: 'normal',
    content: 'hello',
    context: {},
    metadata: {},
    state: {
      isRead: false,
      readAt: null,
      createdAt: new Date('2026-08-01T00:00:00Z'),
    },
    delivery: { emailSent: false, pushSent: false },
    ...overrides,
  } as Notification;
}

function seedInfiniteList(queryClient: QueryClient, notifications: Notification[], unreadCount: number) {
  queryClient.setQueryData([...queryKeys.notifications.lists(), 'infinite', {}], {
    pages: [{ notifications, pagination: { offset: 0, limit: 20, total: notifications.length, hasMore: false }, unreadCount }],
    pageParams: [0],
  });
}

describe('notificationMatchesScope', () => {
  it('matche une notification de conversation sur context.conversationId', () => {
    const n = makeNotification({ id: 'n1', context: { conversationId: CONV_ID } });
    expect(notificationMatchesScope(n, { kind: 'conversation', conversationId: CONV_ID })).toBe(true);
    expect(notificationMatchesScope(n, { kind: 'conversation', conversationId: 'other' })).toBe(false);
    expect(notificationMatchesScope(n, { kind: 'post', postId: CONV_ID })).toBe(false);
  });

  it('matche une notification sociale sur context.postId (commentaires et réactions inclus)', () => {
    const n = makeNotification({ id: 'n2', type: 'story_new_comment', context: { postId: POST_ID, commentId: 'c1' } });
    expect(notificationMatchesScope(n, { kind: 'post', postId: POST_ID })).toBe(true);
    expect(notificationMatchesScope(n, { kind: 'post', postId: 'other' })).toBe(false);
  });
});

describe('applyScopeReadToCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('marque lues les notifications du scope, décrémente les compteurs de page et la clé unreadCount', () => {
    seedInfiniteList(queryClient, [
      makeNotification({ id: 'n1', context: { conversationId: CONV_ID } }),
      makeNotification({ id: 'n2', context: { conversationId: CONV_ID } }),
      makeNotification({ id: 'n3', context: { conversationId: 'other' } }),
    ], 3);
    queryClient.setQueryData(queryKeys.notifications.unreadCount(), 3);

    const marked = applyScopeReadToCache(queryClient, { kind: 'conversation', conversationId: CONV_ID });

    expect(marked).toBe(2);
    const data = queryClient.getQueryData([...queryKeys.notifications.lists(), 'infinite', {}]) as {
      pages: Array<{ notifications: Notification[]; unreadCount: number }>;
    };
    expect(data.pages[0].unreadCount).toBe(1);
    expect(data.pages[0].notifications.find((n) => n.id === 'n1')!.state.isRead).toBe(true);
    expect(data.pages[0].notifications.find((n) => n.id === 'n2')!.state.isRead).toBe(true);
    expect(data.pages[0].notifications.find((n) => n.id === 'n3')!.state.isRead).toBe(false);
    expect(queryClient.getQueryData(queryKeys.notifications.unreadCount())).toBe(1);
  });

  it('ignore les notifications déjà lues (pas de double décrément)', () => {
    seedInfiniteList(queryClient, [
      makeNotification({
        id: 'n1',
        context: { conversationId: CONV_ID },
        state: { isRead: true, readAt: new Date(), createdAt: new Date() },
      }),
    ], 0);
    queryClient.setQueryData(queryKeys.notifications.unreadCount(), 0);

    const marked = applyScopeReadToCache(queryClient, { kind: 'conversation', conversationId: CONV_ID });

    expect(marked).toBe(0);
    expect(queryClient.getQueryData(queryKeys.notifications.unreadCount())).toBe(0);
  });

  it('ne descend jamais sous zéro', () => {
    seedInfiniteList(queryClient, [
      makeNotification({ id: 'n1', context: { postId: POST_ID } }),
      makeNotification({ id: 'n2', context: { postId: POST_ID } }),
    ], 1);
    queryClient.setQueryData(queryKeys.notifications.unreadCount(), 1);

    applyScopeReadToCache(queryClient, { kind: 'post', postId: POST_ID });

    const data = queryClient.getQueryData([...queryKeys.notifications.lists(), 'infinite', {}]) as {
      pages: Array<{ unreadCount: number }>;
    };
    expect(data.pages[0].unreadCount).toBe(0);
    expect(queryClient.getQueryData(queryKeys.notifications.unreadCount())).toBe(0);
  });
});

describe('markScopeNotificationsRead — coalescing serveur', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.useFakeTimers();
    queryClient = new QueryClient();
    mockAuthToken = 'test-token';
    mockMarkConversationRead.mockReset().mockResolvedValue(undefined);
    mockMarkPostRead.mockReset().mockResolvedValue(undefined);
    __resetNotificationReadSyncForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("session anonyme (pas de token) : aucun appel serveur — la route est JWT-only, un 401 serait rejoué par withRetry", () => {
    mockAuthToken = null;

    markScopeNotificationsRead(queryClient, { kind: 'conversation', conversationId: CONV_ID });
    markScopeNotificationsRead(queryClient, { kind: 'post', postId: POST_ID });

    expect(mockMarkConversationRead).not.toHaveBeenCalled();
    expect(mockMarkPostRead).not.toHaveBeenCalled();
  });

  it('appelle la route de portée conversation une seule fois dans la fenêtre de coalescing', () => {
    markScopeNotificationsRead(queryClient, { kind: 'conversation', conversationId: CONV_ID });
    markScopeNotificationsRead(queryClient, { kind: 'conversation', conversationId: CONV_ID });

    expect(mockMarkConversationRead).toHaveBeenCalledTimes(1);
    expect(mockMarkConversationRead).toHaveBeenCalledWith(CONV_ID);
  });

  it('rappelle le serveur une fois la fenêtre écoulée', () => {
    markScopeNotificationsRead(queryClient, { kind: 'conversation', conversationId: CONV_ID });
    jest.advanceTimersByTime(6000);
    markScopeNotificationsRead(queryClient, { kind: 'conversation', conversationId: CONV_ID });

    expect(mockMarkConversationRead).toHaveBeenCalledTimes(2);
  });

  it('des scopes différents ne se coalescent pas entre eux', () => {
    markScopeNotificationsRead(queryClient, { kind: 'post', postId: 'slide-1' });
    markScopeNotificationsRead(queryClient, { kind: 'post', postId: 'slide-2' });

    expect(mockMarkPostRead).toHaveBeenCalledTimes(2);
  });

  it("un échec serveur rouvre la fenêtre pour réessayer", async () => {
    mockMarkConversationRead.mockRejectedValueOnce(new Error('offline'));

    markScopeNotificationsRead(queryClient, { kind: 'conversation', conversationId: CONV_ID });
    await Promise.resolve();
    await Promise.resolve();
    markScopeNotificationsRead(queryClient, { kind: 'conversation', conversationId: CONV_ID });

    expect(mockMarkConversationRead).toHaveBeenCalledTimes(2);
  });
});
