/**
 * Tests for the useSocketCacheSync hook
 *
 * Tests cover:
 * - Socket.IO event listeners registration
 * - Cache updates on new message
 * - Cache updates on message edited
 * - Cache updates on message deleted
 * - Cache updates on translation events
 * - Cache updates on unread count changes
 * - Cleanup on unmount
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useSocketCacheSync,

} from '@/hooks/queries/use-socket-cache-sync';
import { useInfiniteConversationsQuery } from '@/hooks/queries/use-conversations-query';
import type { Message, Conversation } from '@/types';
import type { TranslationEvent } from '@meeshy/shared/types';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';
import { useNotificationStore } from '@/stores/notification-store';

// Store callbacks to trigger them in tests
let newMessageCallback: ((message: Message) => void) | null = null;
let messageEditedCallback: ((message: Message) => void) | null = null;
let messageDeletedCallback: ((messageId: string) => void) | null = null;
let messageRestoredForMeCallback:
  | ((data: { messages: Array<{ messageId: string; conversationId: string }> }) => void)
  | null = null;
let translationCallback: ((data: TranslationEvent) => void) | null = null;
let conversationDeletedCallback: ((data: { userId: string; conversationId: string }) => void) | null = null;
let conversationUpdatedCallback: ((data: { conversationId: string; updatedBy: { id: string }; updatedAt: string; [key: string]: unknown }) => void) | null = null;
let conversationJoinedCallback: ((data: { conversationId: string; userId: string }) => void) | null = null;
let conversationParticipantJoinedCallback: ((data: { conversationId: string; userId: string; displayName: string; joinedAt: string; memberCount?: number }) => void) | null = null;
let conversationLeftCallback: ((data: { conversationId: string; userId: string }) => void) | null = null;
let conversationParticipantLeftCallback: ((data: { conversationId: string; userId: string; displayName: string; leftAt: string; memberCount?: number }) => void) | null = null;
let conversationParticipantBannedCallback: ((data: { conversationId: string; userId: string; bannedBy: { id: string }; bannedAt: string; membershipEnded?: boolean; memberCount?: number }) => void) | null = null;
let conversationParticipantUnbannedCallback: ((data: { conversationId: string; userId: string; membershipRestored?: boolean; memberCount?: number }) => void) | null = null;
let conversationClosedCallback: ((data: { conversationId: string; closedBy: string; closedAt: string }) => void) | null = null;
let categoryChangedCallback: (() => void) | null = null;
let messageAttachmentUpdatedCallback: ((data: { conversationId: string; messageId: string; attachment: unknown }) => void) | null = null;
let pendingMessagesDeliveredCallback: ((data: { count: number; conversationIds: string[] }) => void) | null = null;
let unreadUpdatedCallback: ((data: { conversationId: string; unreadCount: number; bridge?: unknown }) => void) | null = null;
let linkMessageNewCallback: ((data: { message: Record<string, unknown> }) => void) | null = null;
let conversationJoinErrorCallback: ((data: { conversationId: string; reason: string; message: string }) => void) | null = null;
let messagePinnedCallback: ((data: { messageId: string; conversationId: string; pinnedBy: string; pinnedAt: string }) => void) | null = null;
let messageUnpinnedCallback: ((data: { messageId: string; conversationId: string }) => void) | null = null;
let userUpdatedCallback: ((data: { userId: string; changes: Record<string, unknown> }) => void) | null = null;
let preferencesUpdatedCallback: ((data: { category: string } | { conversationId: string } | { communityId: string; reset: boolean; preferences: unknown }) => void) | null = null;
let preferencesReorderedCallback: ((data: { userId: string; updates: Array<{ conversationId: string; orderInCategory: number }> }) => void) | null = null;
let communityPreferencesReorderedCallback: ((data: { userId: string; updates: Array<{ communityId: string; orderInCategory: number }> }) => void) | null = null;

// Mock unsubscribe functions
const mockUnsubscribeMessage = jest.fn();
const mockUnsubscribeEdit = jest.fn();
const mockUnsubscribeDelete = jest.fn();
const mockUnsubscribeTranslation = jest.fn();

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      user: { id: 'current-user', username: 'me' },
    }),
  },
}));

const mockApiGet = jest.fn();
const mockApiPost = jest.fn().mockResolvedValue({});

jest.mock('@/services/api.service', () => ({
  apiService: {
    post: (...args: unknown[]) => mockApiPost(...args),
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

// La liste infinie RÉELLE est montée par les témoins de rejeu de pages
// ci-dessous : c'est le seul moyen d'observer le dommage en termes de requêtes
// plutôt qu'en termes d'appels à `invalidateQueries`.
const mockGetConversations = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
    getConversation: jest.fn(),
  },
}));

// Le delta borné est le rattrapage de la liste, pas le sujet de ce fichier ; il
// a ses propres témoins (`use-conversations-delta-sync.test.tsx`). Le neutraliser
// ici garantit qu'une requête observée vient bien du handler socket testé.
jest.mock('@/hooks/queries/use-conversations-delta-sync', () => ({
  useConversationsDeltaSync: () => undefined,
}));

jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getAllPreferences: jest.fn().mockResolvedValue([]),
    getCategories: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onNewMessage: (callback: (message: Message) => void) => {
      newMessageCallback = callback;
      return mockUnsubscribeMessage;
    },
    onMessageEdited: (callback: (message: Message) => void) => {
      messageEditedCallback = callback;
      return mockUnsubscribeEdit;
    },
    onMessageDeleted: (callback: (messageId: string) => void) => {
      messageDeletedCallback = callback;
      return mockUnsubscribeDelete;
    },
    onMessageRestoredForMe: (
      callback: (data: { messages: Array<{ messageId: string; conversationId: string }> }) => void
    ) => {
      messageRestoredForMeCallback = callback;
      return jest.fn();
    },
    onTranslation: (callback: (data: TranslationEvent) => void) => {
      translationCallback = callback;
      return mockUnsubscribeTranslation;
    },
    onUnreadUpdated: (callback: (data: { conversationId: string; unreadCount: number; bridge?: unknown }) => void) => {
      unreadUpdatedCallback = callback;
      return jest.fn();
    },
    onTranscription: jest.fn(() => jest.fn()),
    onAudioTranslation: jest.fn(() => jest.fn()),
    onAttachmentStatusUpdated: jest.fn(() => jest.fn()),
    onParticipantRoleUpdated: jest.fn(() => jest.fn()),
    onPreferencesUpdated: (callback: (data: { category: string } | { conversationId: string } | { communityId: string; reset: boolean; preferences: unknown }) => void) => {
      preferencesUpdatedCallback = callback;
      return jest.fn();
    },
    onPreferencesReordered: (callback: (data: { userId: string; updates: Array<{ conversationId: string; orderInCategory: number }> }) => void) => {
      preferencesReorderedCallback = callback;
      return jest.fn();
    },
    onCommunityPreferencesReordered: (callback: (data: { userId: string; updates: Array<{ communityId: string; orderInCategory: number }> }) => void) => {
      communityPreferencesReorderedCallback = callback;
      return jest.fn();
    },
    onConversationJoined: (callback: (data: { conversationId: string; userId: string }) => void) => {
      conversationJoinedCallback = callback;
      return jest.fn();
    },
    onConversationParticipantJoined: (callback: (data: { conversationId: string; userId: string; displayName: string; joinedAt: string; memberCount?: number }) => void) => {
      conversationParticipantJoinedCallback = callback;
      return jest.fn();
    },
    onConversationLeft: (callback: (data: { conversationId: string; userId: string }) => void) => {
      conversationLeftCallback = callback;
      return jest.fn();
    },
    onConversationNew: jest.fn(() => jest.fn()),
    onConversationDeleted: (callback: (data: { userId: string; conversationId: string }) => void) => {
      conversationDeletedCallback = callback;
      return jest.fn();
    },
    onConversationUpdated: (callback: (data: { conversationId: string; updatedBy: { id: string }; updatedAt: string; [key: string]: unknown }) => void) => {
      conversationUpdatedCallback = callback;
      return jest.fn();
    },
    onConversationParticipantLeft: (callback: (data: { conversationId: string; userId: string; displayName: string; leftAt: string }) => void) => {
      conversationParticipantLeftCallback = callback;
      return jest.fn();
    },
    onConversationParticipantBanned: (callback: (data: { conversationId: string; userId: string; bannedBy: { id: string }; bannedAt: string }) => void) => {
      conversationParticipantBannedCallback = callback;
      return jest.fn();
    },
    onConversationParticipantUnbanned: (callback: (data: { conversationId: string; userId: string }) => void) => {
      conversationParticipantUnbannedCallback = callback;
      return jest.fn();
    },
    onConversationClosed: (callback: (data: { conversationId: string; closedBy: string; closedAt: string }) => void) => {
      conversationClosedCallback = callback;
      return jest.fn();
    },
    onCategoryChanged: (callback: () => void) => {
      categoryChangedCallback = callback;
      return jest.fn();
    },
    onMessageAttachmentUpdated: (callback: (data: { conversationId: string; messageId: string; attachment: unknown }) => void) => {
      messageAttachmentUpdatedCallback = callback;
      return jest.fn();
    },
    onPendingMessagesDelivered: (callback: (data: { count: number; conversationIds: string[] }) => void) => {
      pendingMessagesDeliveredCallback = callback;
      return jest.fn();
    },
    onLinkMessageNew: (callback: (data: { message: Record<string, unknown> }) => void) => {
      linkMessageNewCallback = callback;
      return jest.fn();
    },
    onConversationJoinError: (callback: (data: { conversationId: string; reason: string; message: string }) => void) => {
      conversationJoinErrorCallback = callback;
      return jest.fn();
    },
    onMessagePinned: (callback: (data: { messageId: string; conversationId: string; pinnedBy: string; pinnedAt: string }) => void) => {
      messagePinnedCallback = callback;
      return jest.fn();
    },
    onMessageUnpinned: (callback: (data: { messageId: string; conversationId: string }) => void) => {
      messageUnpinnedCallback = callback;
      return jest.fn();
    },
    onUserUpdated: (callback: (data: { userId: string; changes: Record<string, unknown> }) => void) => {
      userUpdatedCallback = callback;
      return jest.fn();
    },
    onStatusChange: jest.fn(() => () => {}),
  },
}));

// Mock query keys
jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    messages: {
      all: ['messages'],
      lists: () => ['messages', 'list'],
      list: (conversationId: string) => ['messages', 'list', conversationId],
      infinite: (conversationId: string) => ['messages', 'list', conversationId, 'infinite'],
    },
    conversations: {
      all: ['conversations'],
      infinite: () => ['conversations', 'infinite'],
      details: () => ['conversations', 'detail'],
      detail: (id: string) => ['conversations', 'detail', id],
      participants: (id: string) => ['conversations', 'participants', id],
    },
    notifications: {
      all: ['notifications'],
    },
    preferences: {
      all: ['user-preferences'],
      category: (category: string) => ['user-preferences', category],
      categories: () => ['user-preferences', 'categories'],
    },
    communities: {
      preferences: {
        detail: (communityId: string) => ['communities', 'preferences', communityId],
        list: () => ['communities', 'preferences', 'list'],
      },
    },
    users: {
      all: ['users'],
      details: () => ['users', 'detail'],
      detail: (id: string) => ['users', 'detail', id],
    },
  },
}));

// Test data
const createMockMessage = (id: string, content: string, conversationId = 'conv-1') => ({
  id,
  content,
  conversationId,
  senderId: 'user-1',
  originalLanguage: 'en',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  sender: {
    id: 'user-1',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    email: 'test@example.com',
    phoneNumber: '',
    role: 'USER',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    systemLanguage: 'en',
    regionalLanguage: 'en',
    autoTranslateEnabled: false,
    translateToSystemLanguage: false,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    isOnline: true,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    isActive: true,
    updatedAt: new Date(),
  },
  translations: [],
}) as any as Message;

const mockMessages = [
  createMockMessage('msg-1', 'Hello'),
  createMockMessage('msg-2', 'World'),
];

// Les remises en cache passent par une lecture bornée `GET /conversations/:id`,
// gardée par la forme d'un ObjectId Mongo — `conv-1` n'en est pas un.
const RESTORED_CONV_ID = '64b7f2a1c3d4e5f6a7b8c9d0';

const mockConversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  type: 'direct',
  visibility: 'private',
  status: 'active',
  participants: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastMessageAt: new Date('2024-01-01'),
  unreadCount: 0,
  isActive: true,
  memberCount: 0,
} as Conversation;

// Helper to create a wrapper with QueryClient
function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  return { wrapper, queryClient };
}

describe('useSocketCacheSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: null });
    mockGetConversations.mockResolvedValue({
      conversations: [mockConversation],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
    });
    newMessageCallback = null;
    messageEditedCallback = null;
    messageDeletedCallback = null;
    translationCallback = null;
    conversationDeletedCallback = null;
    conversationUpdatedCallback = null;
    conversationParticipantLeftCallback = null;
    conversationParticipantBannedCallback = null;
    conversationParticipantUnbannedCallback = null;
    conversationClosedCallback = null;
    categoryChangedCallback = null;
    messageAttachmentUpdatedCallback = null;
    pendingMessagesDeliveredCallback = null;
    unreadUpdatedCallback = null;
    linkMessageNewCallback = null;
    conversationJoinErrorCallback = null;
    messagePinnedCallback = null;
    messageUnpinnedCallback = null;
    userUpdatedCallback = null;
    preferencesUpdatedCallback = null;
    preferencesReorderedCallback = null;
  });

  describe('Event Listener Registration', () => {
    it('should register all socket event listeners', () => {
      const { wrapper } = createWrapperWithClient();

      renderHook(() => useSocketCacheSync(), { wrapper });

      expect(newMessageCallback).not.toBeNull();
      expect(messageEditedCallback).not.toBeNull();
      expect(messageDeletedCallback).not.toBeNull();
      expect(translationCallback).not.toBeNull();
    });

    it('should not register listeners when disabled', () => {
      const { wrapper } = createWrapperWithClient();

      renderHook(() => useSocketCacheSync({ enabled: false }), { wrapper });

      expect(newMessageCallback).toBeNull();
      expect(messageEditedCallback).toBeNull();
      expect(messageDeletedCallback).toBeNull();
      expect(translationCallback).toBeNull();
    });

    it('should cleanup listeners on unmount', () => {
      const { wrapper } = createWrapperWithClient();

      const { unmount } = renderHook(() => useSocketCacheSync(), { wrapper });

      unmount();

      expect(mockUnsubscribeMessage).toHaveBeenCalled();
      expect(mockUnsubscribeEdit).toHaveBeenCalled();
      expect(mockUnsubscribeDelete).toHaveBeenCalled();
      expect(mockUnsubscribeTranslation).toHaveBeenCalled();
    });
  });

  describe('New Message Handler', () => {
    it('should add new message to infinite query cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      // Pre-populate cache
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      // Trigger new message event
      const newMessage = createMockMessage('msg-new', 'New message');
      act(() => {
        newMessageCallback?.(newMessage);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      expect(cachedData.pages[0].messages[0].id).toBe('msg-new');
      expect(cachedData.pages[0].messages).toHaveLength(3);
    });

    // A `message:new` that lands while the conversation's message list has no
    // cache entry yet (initial fetch in flight, or conversation never opened in
    // this session) used to be dropped on the floor: `setQueryData` bails out on
    // `!old`, and the socket layer had already marked the id as "seen" for 5
    // minutes, so no re-delivery ever repaired the gap. Combined with
    // `staleTime: Infinity`, the message stayed invisible across reloads.
    // Invalidating the key makes the in-flight (or next) fetch re-read from the
    // server, which is the only source that can close the gap.
    it('invalidates the messages query when no cache entry exists yet', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

      act(() => {
        newMessageCallback?.(createMockMessage('msg-missed', 'Arrived during initial fetch'));
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['messages', 'list', 'conv-1', 'infinite'],
      });
    });

    it('does not invalidate the messages query when the message was written to cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

      act(() => {
        newMessageCallback?.(createMockMessage('msg-new', 'New message'));
      });

      expect(invalidateSpy).not.toHaveBeenCalledWith({
        queryKey: ['messages', 'list', 'conv-1', 'infinite'],
      });
    });

    // The home page opens the global conversation by its slug
    // (`conversationId="meeshy"`), so its cache entry is keyed by the slug while
    // the socket payload carries the resolved ObjectId. Writing only to the
    // ObjectId key left that screen frozen until a reload.
    it('writes into a cache entry keyed by the conversation slug', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'meeshy', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'meeshy', enabled: true }), { wrapper });

      act(() => {
        newMessageCallback?.(createMockMessage('msg-new', 'Realtime into slug cache'));
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'meeshy', 'infinite']) as {
        pages: { messages: Message[] }[];
      };
      expect(cached.pages[0].messages[0].id).toBe('msg-new');
      expect(cached.pages[0].messages).toHaveLength(3);
    });

    it('leaves other conversations’ caches untouched', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      const otherMessage = { ...mockMessages[0], id: 'other-1', conversationId: 'conv-2' } as Message;
      queryClient.setQueryData(['messages', 'list', 'conv-2', 'infinite'], {
        pages: [{ messages: [otherMessage], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: null, enabled: true }), { wrapper });

      act(() => {
        newMessageCallback?.(createMockMessage('msg-new', 'For conv-1 only'));
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-2', 'infinite']) as {
        pages: { messages: Message[] }[];
      };
      expect(cached.pages[0].messages.map((m) => m.id)).toEqual(['other-1']);
    });

    it('should not add duplicate message', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      // Try to add existing message
      act(() => {
        newMessageCallback?.(mockMessages[0]);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      // Should still have only 2 messages
      expect(cachedData.pages[0].messages).toHaveLength(2);
    });

    it('should not confuse two different optimistic messages with same content', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      // Two optimistic messages with identical content but different _tempIds
      // senderId matches the mocked current user (current-user)
      const optimistic1 = {
        ...createMockMessage('temp-1', 'Same content'),
        senderId: 'current-user',
        _tempId: 'temp-1',
        _localStatus: 'sending' as const,
        createdAt: new Date('2024-01-01T12:00:00Z'),
      };
      const optimistic2 = {
        ...createMockMessage('temp-2', 'Same content'),
        senderId: 'current-user',
        _tempId: 'temp-2',
        _localStatus: 'sending' as const,
        createdAt: new Date('2024-01-01T12:00:01Z'),
      };

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [optimistic2, optimistic1], hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      // Server message for optimistic1 arrives (same senderId as current user)
      const serverMessage = {
        ...createMockMessage('server-msg-1', 'Same content'),
        senderId: 'current-user',
        createdAt: new Date('2024-01-01T12:00:00Z'),
      };
      act(() => {
        newMessageCallback?.(serverMessage as any);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: any[] }[];
      };

      // Should replace exactly ONE optimistic (the closest in time), not both
      const remainingOptimistics = cachedData.pages[0].messages.filter(
        (m: any) => m._tempId !== undefined
      );
      expect(remainingOptimistics).toHaveLength(1);
      expect(remainingOptimistics[0]._tempId).toBe('temp-2');
    });

    it('should update conversation with latest message', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [mockConversation], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      const newMessage = createMockMessage('msg-new', 'New message', 'conv-1');
      act(() => {
        newMessageCallback?.(newMessage);
      });

      const conversations = (queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: { conversations: Conversation[] }[];
      }).pages.flatMap((page) => page.conversations);

      expect(conversations[0].lastMessage?.id).toBe('msg-new');
    });
  });

  describe('List view — conversationId: null, enabled: true', () => {
    it('still updates the conversation list cache (lastMessage + reorder) on message:new', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      const otherConversation = { ...mockConversation, id: 'conv-2', title: 'Other' } as Conversation;
      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [otherConversation, mockConversation], pagination: { total: 2, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync({ conversationId: null, enabled: true }), { wrapper });

      const newMessage = createMockMessage('msg-new', 'From the list view', 'conv-1');
      act(() => {
        newMessageCallback?.(newMessage);
      });

      const infiniteCache = queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: { conversations: Conversation[] }[];
      };
      const orderedIds = infiniteCache.pages.flatMap((p) => p.conversations.map((c) => c.id));
      expect(orderedIds[0]).toBe('conv-1');
      expect(infiniteCache.pages[0].conversations[0].lastMessage?.id).toBe('msg-new');
    });

    it('still writes into an existing messages cache entry on message:new', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: null, enabled: true }), { wrapper });

      const newMessage = createMockMessage('msg-new', 'While browsing the list', 'conv-1');
      act(() => {
        newMessageCallback?.(newMessage);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };
      expect(cachedData.pages[0].messages[0].id).toBe('msg-new');
      expect(cachedData.pages[0].messages).toHaveLength(3);
    });
  });

  describe('Message Edited Handler', () => {
    it('should update edited message in cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      const editedMessage = { ...mockMessages[0], content: 'Edited content', isEdited: true };
      act(() => {
        messageEditedCallback?.(editedMessage);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      const updatedMessage = cachedData.pages[0].messages.find((m) => m.id === 'msg-1');
      expect(updatedMessage?.content).toBe('Edited content');
      expect(updatedMessage?.isEdited).toBe(true);
    });

    it('updates a cache entry keyed by the conversation slug', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'meeshy', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'meeshy', enabled: true }), { wrapper });

      act(() => {
        messageEditedCallback?.({ ...mockMessages[0], content: 'Edited from socket' } as Message);
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'meeshy', 'infinite']) as {
        pages: { messages: Message[] }[];
      };
      expect(cached.pages[0].messages[0].content).toBe('Edited from socket');
    });

    it('should ignore a stale out-of-order edit older than the currently cached edit', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      const newerEdit = {
        ...mockMessages[0],
        content: 'Newer edit',
        isEdited: true,
        editedAt: new Date('2024-06-01T12:00:00Z'),
      };
      const staleEdit = {
        ...mockMessages[0],
        content: 'Stale edit',
        isEdited: true,
        editedAt: new Date('2024-06-01T11:00:00Z'),
      };

      act(() => {
        messageEditedCallback?.(newerEdit);
      });
      act(() => {
        // Simulates a reordered/delayed duplicate delivery of an older edit
        // arriving after the newer one was already applied.
        messageEditedCallback?.(staleEdit);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      const updatedMessage = cachedData.pages[0].messages.find((m) => m.id === 'msg-1');
      expect(updatedMessage?.content).toBe('Newer edit');
    });
  });

  describe('Message Deleted Handler', () => {
    it('should remove deleted message from cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        messageDeletedCallback?.('msg-1');
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      expect(cachedData.pages[0].messages.find((m) => m.id === 'msg-1')).toBeUndefined();
      expect(cachedData.pages[0].messages).toHaveLength(1);
    });

    it('should scan and remove message from correct conversation when conversationId not provided', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      // Set up messages in two different conversations
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });
      queryClient.setQueryData(['messages', 'list', 'conv-2', 'infinite'], {
        pages: [{ messages: [createMockMessage('msg-3', 'Other conv', 'conv-2')], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      // No conversationId provided
      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        messageDeletedCallback?.('msg-1');
      });

      // Should remove msg-1 from conv-1 via cache scan
      const conv1Data = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };
      expect(conv1Data.pages[0].messages).toHaveLength(1);
      expect(conv1Data.pages[0].messages[0].id).toBe('msg-2');

      // conv-2 should be untouched
      const conv2Data = queryClient.getQueryData(['messages', 'list', 'conv-2', 'infinite']) as {
        pages: { messages: Message[] }[];
      };
      expect(conv2Data.pages[0].messages).toHaveLength(1);

      // Should NOT have called invalidateQueries for all messages
      expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['messages'] });
    });
  });

  describe('Translation Handler', () => {
    it('should add translations to message', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      const translationEvent = {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        translations: [
          {
            id: 'trans-1',
            messageId: 'msg-1',
            sourceLanguage: 'en',
            targetLanguage: 'fr',
            translatedContent: 'Bonjour',
            translationModel: 'basic',
            cacheKey: 'cache-1',
            createdAt: new Date(),
            cached: false,
          },
        ],
      } as any as TranslationEvent;

      act(() => {
        translationCallback?.(translationEvent);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      const message = cachedData.pages[0].messages.find((m) => m.id === 'msg-1');
      const translations = message?.translations as ReadonlyArray<{ targetLanguage: string; translatedContent: string }>;
      expect(translations).toEqual(
        expect.arrayContaining([expect.objectContaining({ targetLanguage: 'fr', translatedContent: 'Bonjour' })])
      );
    });

    it('should not update when conversationId not provided', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      // No conversationId
      renderHook(() => useSocketCacheSync(), { wrapper });

      const translationEvent = {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        translations: [],
      } as any as TranslationEvent;

      act(() => {
        translationCallback?.(translationEvent);
      });

      // Cache should be unchanged
      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      expect(cachedData.pages[0].messages[0].translations).toEqual([]);
    });
  });

  describe('Conversation Deleted Handler', () => {
    it('removes the deleted conversation from the infinite cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [mockConversation, { ...mockConversation, id: 'conv-2' }], pagination: { total: 2, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationDeletedCallback?.({ userId: 'current-user', conversationId: 'conv-1' });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      const ids = cached.pages.flatMap(p => p.conversations.map(c => c.id));
      expect(ids).not.toContain('conv-1');
      expect(ids).toContain('conv-2');
    });

    it('is a no-op when the conversation is not in the cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [mockConversation], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationDeletedCallback?.({ userId: 'current-user', conversationId: 'conv-UNKNOWN' });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect(cached.pages[0].conversations).toHaveLength(1);
    });
  });

  describe('Conversation Updated Handler', () => {
    it('updates the matching conversation title in the infinite cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [mockConversation], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationUpdatedCallback?.({ conversationId: 'conv-1', updatedBy: { id: 'user-2' }, updatedAt: new Date().toISOString(), title: 'Renamed Group' });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      const conv = cached.pages[0].conversations[0];
      expect((conv as any).title).toBe('Renamed Group');
    });

    it('updates the lastMessageAt when lastMessageAt is present in the event', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const newTime = new Date('2025-01-15T10:00:00Z').toISOString();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [mockConversation], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationUpdatedCallback?.({ conversationId: 'conv-1', updatedBy: { id: 'user-1' }, updatedAt: newTime, lastMessageAt: newTime });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      const conv = cached.pages[0].conversations[0];
      // `Conversation.lastMessageAt` is a `Date` — that is what the REST
      // transformer puts in this cache. The socket payload's ISO string is
      // materialised so a single conversation never carries both shapes.
      expect(conv.lastMessageAt).toEqual(new Date(newTime));
    });

    it('keeps the cached date when the event carries an unparseable one', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [mockConversation], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationUpdatedCallback?.({
          conversationId: 'conv-1',
          updatedBy: { id: 'user-1' },
          updatedAt: 'not-a-date',
          lastMessageAt: 'not-a-date',
        });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect(cached.pages[0].conversations[0].lastMessageAt).toEqual(mockConversation.lastMessageAt);
    });
  });

  describe('Conversation Participant Joined Handler', () => {
    // L'effectif que porte l'événement est ABSOLU : il se POSE. C'est ce qui le
    // sépare d'un delta — il RATTRAPE une dérive au lieu de la continuer. Cache
    // à 4, serveur à 9 : un incrément rendrait 5 et garderait l'écart à jamais
    // (`staleTime: Infinity` ne relit rien de lui-même).
    it('pose l\'effectif du serveur plutôt que d\'incrémenter le cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 4 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantJoinedCallback?.({ conversationId: 'conv-1', userId: 'user-9', displayName: 'Zoe', joinedAt: new Date().toISOString(), memberCount: 9 });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(9);
    });

    it('pose le drapeau de plafonnement 199+ avec l\'effectif du serveur', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 4 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantJoinedCallback?.({ conversationId: 'conv-1', userId: 'user-9', displayName: 'Zoe', joinedAt: new Date().toISOString(), memberCount: 199, memberCountCapped: true } as any);
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(199);
      expect((cached.pages[0].conversations[0] as any).memberCountCapped).toBe(true);
    });

    it('efface le drapeau quand le serveur repasse un effectif exact', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 199, memberCountCapped: true }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantJoinedCallback?.({ conversationId: 'conv-1', userId: 'user-9', displayName: 'Zoe', joinedAt: new Date().toISOString(), memberCount: 150 });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(150);
      expect((cached.pages[0].conversations[0] as any).memberCountCapped).toBe(false);
    });

    it('n\'applique pas le delta de repli sur un compteur plafonné', () => {
      // Un compteur à « 199+ » décrit un effectif AU-DELÀ du seuil : un ±1
      // de repli (serveur antérieur au contrat) ne peut pas le faire bouger
      // sans mentir — le vrai compte est inconnu du client.
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 199, memberCountCapped: true }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantJoinedCallback?.({ conversationId: 'conv-1', userId: 'user-9', displayName: 'Zoe', joinedAt: new Date().toISOString() });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(199);
      expect((cached.pages[0].conversations[0] as any).memberCountCapped).toBe(true);
    });

    it('increments memberCount when a member is actually added', () => {
      // Le pendant montant de `participant-left`. Sans lui, l'effectif ne
      // connaissait que des soustractions et dérivait vers le bas — et
      // `staleTime: Infinity` ne le relit jamais de lui-même.
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 4 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantJoinedCallback?.({ conversationId: 'conv-1', userId: 'user-9', displayName: 'Zoe', joinedAt: new Date().toISOString() });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(5);
    });

    it('laisse conversation:joined SANS effet sur l\'effectif', () => {
      // `conversation:joined` porte aussi l'ack self-only du socket qui REJOINT
      // LA ROOM — à chaque ouverture de fil, avec le même payload. Incrémenter
      // dessus gonflait la ligne de liste d'une unité par ouverture,
      // indéfiniment : trois ouvertures suffisaient à afficher un groupe de 4
      // comme un groupe de 7.
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 4 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationJoinedCallback?.({ conversationId: 'conv-1', userId: 'current-user' });
        conversationJoinedCallback?.({ conversationId: 'conv-1', userId: 'current-user' });
        conversationJoinedCallback?.({ conversationId: 'conv-1', userId: 'current-user' });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(4);
    });

    it('laisse conversation:left SANS effet sur l\'effectif', () => {
      // Le pendant exact : `conversation:left` n'est émis que par
      // `socket.emit` après `socket.leave(room)` — la FERMETURE d'un fil.
      // Décrémenter dessus retirait un membre à chaque fermeture. Les deux
      // erreurs se compensaient en partie, jamais exactement : une reconnexion
      // rejoint sans `leave`, et la soustraction était bornée à 0 quand
      // l'addition ne l'était pas.
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 4 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationLeftCallback?.({ conversationId: 'conv-1', userId: 'current-user' });
        conversationLeftCallback?.({ conversationId: 'conv-1', userId: 'current-user' });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(4);
    });

    it('invalide tout de même la liste des participants sur conversation:joined', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationJoinedCallback?.({ conversationId: 'conv-1', userId: 'current-user' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conversations', 'participants', 'conv-1'] })
      );
    });
  });

  describe('Conversation Participant Left Handler', () => {
    // Symétrique du témoin d'adhésion : le compte absolu rattrape vers le BAS
    // aussi. Cache à 5, serveur à 2 — un décrément rendrait 4.
    it('pose l\'effectif du serveur plutôt que de décrémenter le cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 5 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantLeftCallback?.({ conversationId: 'conv-1', userId: 'user-2', displayName: 'Bob', leftAt: new Date().toISOString(), memberCount: 2 });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(2);
    });

    it('decrements memberCount when a participant leaves', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 5 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantLeftCallback?.({ conversationId: 'conv-1', userId: 'user-2', displayName: 'Bob', leftAt: new Date().toISOString() });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(4);
    });

    it('invalidates participants query on participant-left', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantLeftCallback?.({ conversationId: 'conv-1', userId: 'user-2', displayName: 'Bob', leftAt: new Date().toISOString() });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conversations', 'participants', 'conv-1'] })
      );
    });

    // Quand le `userId` du départ est le MIEN, l'événement ne dit pas
    // « l'effectif a changé » — il dit « cette conversation n'est plus la
    // mienne ». `GET /conversations` filtre sur
    // `participants.some({ userId, isActive: true })` : la ligne a disparu
    // côté serveur, et `staleTime: Infinity` interdit au cache de s'en
    // apercevoir tout seul. Décrémenter un compteur sur une ligne qui doit
    // partir la laissait cliquable pour de bon.
    //
    // Le cas se produit sans rien faire d'anormal : quitter depuis un autre
    // appareil, ou depuis le web pendant que l'app est ouverte ailleurs.
    it('retire la conversation quand le partant est MOI (autre appareil)', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 3 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantLeftCallback?.({ conversationId: 'conv-1', userId: 'current-user', displayName: 'Me', leftAt: new Date().toISOString(), memberCount: 2 });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect(cached.pages[0].conversations).toHaveLength(0);
    });

    it('purge aussi le détail de la conversation quittée', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const removeSpy = jest.spyOn(queryClient, 'removeQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantLeftCallback?.({ conversationId: 'conv-1', userId: 'current-user', displayName: 'Me', leftAt: new Date().toISOString() });
      });

      expect(removeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conversations', 'detail', 'conv-1'] })
      );
    });

    it("laisse la ligne en place quand c'est quelqu'un d'AUTRE qui part", () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 3 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantLeftCallback?.({ conversationId: 'conv-1', userId: 'user-2', displayName: 'Bob', leftAt: new Date().toISOString(), memberCount: 2 });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect(cached.pages[0].conversations).toHaveLength(1);
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(2);
    });
  });

  describe('Conversation Participant Banned Handler', () => {
    it('decrements memberCount when a participant is banned', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 3 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantBannedCallback?.({ conversationId: 'conv-1', userId: 'user-2', bannedBy: { id: 'admin-1' }, bannedAt: new Date().toISOString() });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(2);
    });

    it('leaves memberCount alone when the banned person had already left', () => {
      // Bannir un ancien membre reste possible — c'est ce qui l'empêche de
      // revenir par un lien de partage — mais ce bannissement-là ne retire
      // aucune appartenance. Décrémenter quand même fait dériver le compteur
      // vers le bas, et la dérive persiste : `staleTime: Infinity` ne relit
      // jamais de lui-même.
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 3 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantBannedCallback?.({ conversationId: 'conv-1', userId: 'user-2', bannedBy: { id: 'admin-1' }, bannedAt: new Date().toISOString(), membershipEnded: false });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(3);
    });

    // Être banni est la troisième manière de perdre une appartenance, après
    // le départ volontaire et le retrait par un admin. Le geste est le même :
    // la ligne quitte la liste, elle n'y voit pas son compteur baisser.
    it('retire la conversation quand le banni est MOI', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 3 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantBannedCallback?.({ conversationId: 'conv-1', userId: 'current-user', bannedBy: { id: 'admin-1' }, bannedAt: new Date().toISOString(), memberCount: 2 });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect(cached.pages[0].conversations).toHaveLength(0);
    });

    // `membershipEnded: false` dit que la cible était DÉJÀ partie. Le retrait
    // reste le bon geste — il n'y a simplement plus rien à retirer — et le
    // court-circuit « ne touche pas au compteur » ne doit pas l'en empêcher :
    // c'est exactement le cas d'un ban qui suit un départ non synchronisé.
    it('retire la conversation même si le ban ne clôt aucune appartenance', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 3 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantBannedCallback?.({ conversationId: 'conv-1', userId: 'current-user', bannedBy: { id: 'admin-1' }, bannedAt: new Date().toISOString(), membershipEnded: false });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect(cached.pages[0].conversations).toHaveLength(0);
    });

    it('invalidates participants query on participant-banned', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantBannedCallback?.({ conversationId: 'conv-1', userId: 'user-2', bannedBy: { id: 'admin-1' }, bannedAt: new Date().toISOString() });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conversations', 'participants', 'conv-1'] })
      );
    });
  });

  describe('Conversation Participant Unbanned Handler', () => {
    it('invalidates participants query when a participant is unbanned', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantUnbannedCallback?.({ conversationId: 'conv-1', userId: 'user-2' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conversations', 'participants', 'conv-1'] })
      );
    });

    it('leaves memberCount alone when the unban restored nothing', () => {
      // Lever le bannissement de quelqu'un qui était parti de lui-même le rend
      // libre de revenir ; ça ne le fait pas rentrer. Incrémenter ici
      // afficherait un membre de plus que la conversation n'en a.
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 3 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantUnbannedCallback?.({ conversationId: 'conv-1', userId: 'user-2', membershipRestored: false });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(3);
    });

    it('restores memberCount when a participant is unbanned', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [{ ...mockConversation, memberCount: 3 }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      // A ban decrements the cached count; the unban is its exact inverse. Left
      // un-incremented, every ban/unban round-trip drifts the displayed member
      // count one lower than reality until an unrelated full refetch.
      act(() => {
        conversationParticipantBannedCallback?.({ conversationId: 'conv-1', userId: 'user-2', bannedBy: { id: 'admin-1' }, bannedAt: new Date().toISOString() });
        conversationParticipantUnbannedCallback?.({ conversationId: 'conv-1', userId: 'user-2' });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(3);
    });

    // Le bannissement retire la ligne de MA liste ; la levée qui restaure
    // l'appartenance doit l'y remettre. Sans ce bras, `applyMemberCount` mappe
    // sur une liste où la conversation n'est plus — un no-op silencieux — et la
    // ligne ne revient qu'à la réconciliation complète (bornée, rare) : le
    // delta `updatedSince=` est upsert-only sur `Conversation.updatedAt`, que
    // la levée d'un bannissement ne touche pas.
    // `createWrapperWithClient()` monte un client à `gcTime: 0` : une entrée
    // posée par `setQueryData` sans observateur y est ramassée dès le tick
    // suivant, donc invisible après un `await`. Les témoins ASYNCHRONES de ce
    // bloc montent le leur, comme les témoins de rejeu de pages plus bas.
    const createPersistentWrapper = () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      };
      return { wrapper, queryClient };
    };

    const readConversationIds = (queryClient: QueryClient): string[] => {
      const cached = queryClient.getQueryData(['conversations', 'infinite']) as
        | { pages: { conversations: Conversation[] }[] }
        | undefined;
      return (cached?.pages ?? []).flatMap((page) => page.conversations.map((c) => c.id));
    };

    it('remet la conversation dans la liste quand le débanni est MOI', async () => {
      const { wrapper, queryClient } = createPersistentWrapper();
      mockApiGet.mockResolvedValue({ data: { ...mockConversation, id: RESTORED_CONV_ID, memberCount: 3 } as Conversation });

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      await act(async () => {
        conversationParticipantUnbannedCallback?.({
          conversationId: RESTORED_CONV_ID,
          userId: 'current-user',
          membershipRestored: true,
          memberCount: 3,
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockApiGet).toHaveBeenCalledWith(`/conversations/${RESTORED_CONV_ID}`);
      expect(readConversationIds(queryClient)).toEqual([RESTORED_CONV_ID]);
    });

    // Un serveur antérieur au champ ne l'envoie pas, et une levée y restaurait
    // TOUJOURS l'appartenance : l'absence se lit comme un retour, d'où
    // `!== false` et jamais `=== true`.
    it('remet la conversation quand le serveur n’envoie pas membershipRestored', async () => {
      const { wrapper, queryClient } = createPersistentWrapper();
      mockApiGet.mockResolvedValue({ data: { ...mockConversation, id: RESTORED_CONV_ID } as Conversation });

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      await act(async () => {
        conversationParticipantUnbannedCallback?.({ conversationId: RESTORED_CONV_ID, userId: 'current-user' });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockApiGet).toHaveBeenCalledWith(`/conversations/${RESTORED_CONV_ID}`);
      expect(readConversationIds(queryClient)).toEqual([RESTORED_CONV_ID]);
    });

    // Lever le bannissement de quelqu'un qui était parti de lui-même le rend
    // libre de revenir ; ça ne le fait pas rentrer. Il n'y a donc aucune ligne
    // à remettre dans sa liste, et la relire la ferait réapparaître à tort.
    it('ne remet RIEN quand la levée ne restaure aucune appartenance', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantUnbannedCallback?.({
          conversationId: RESTORED_CONV_ID,
          userId: 'current-user',
          membershipRestored: false,
        });
      });

      expect(mockApiGet).not.toHaveBeenCalledWith(`/conversations/${RESTORED_CONV_ID}`);
    });

    // La levée qui concerne QUELQU'UN D'AUTRE ne dit rien de ma propre
    // appartenance : elle ne doit ouvrir aucune requête.
    it('ne relit rien quand le débanni est quelqu’un d’autre', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantUnbannedCallback?.({
          conversationId: RESTORED_CONV_ID,
          userId: 'user-2',
          membershipRestored: true,
        });
      });

      expect(mockApiGet).not.toHaveBeenCalledWith(`/conversations/${RESTORED_CONV_ID}`);
    });

    // Idempotence : un bannissement raté (hors ligne) laisse la ligne en place,
    // et la levée ne doit alors ni la dupliquer ni payer une requête.
    it('ne relit pas une conversation déjà présente dans la liste', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{
          conversations: [{ ...mockConversation, id: RESTORED_CONV_ID, memberCount: 2 } as Conversation],
          pagination: { total: 1, offset: 0, limit: 20, hasMore: false },
        }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantUnbannedCallback?.({
          conversationId: RESTORED_CONV_ID,
          userId: 'current-user',
          membershipRestored: true,
          memberCount: 3,
        });
      });

      expect(mockApiGet).not.toHaveBeenCalledWith(`/conversations/${RESTORED_CONV_ID}`);
      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect(cached.pages[0].conversations).toHaveLength(1);
      expect((cached.pages[0].conversations[0] as any).memberCount).toBe(3);
    });

    // L'aller-retour complet, tel qu'il se produit sur un appareil resté
    // connecté : la ligne part au bannissement et revient à la levée.
    it('aller-retour ban → unban : la ligne part puis revient', async () => {
      const { wrapper, queryClient } = createPersistentWrapper();
      mockApiGet.mockResolvedValue({ data: { ...mockConversation, id: RESTORED_CONV_ID, memberCount: 3 } as Conversation });

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{
          conversations: [{ ...mockConversation, id: RESTORED_CONV_ID, memberCount: 3 } as Conversation],
          pagination: { total: 1, offset: 0, limit: 20, hasMore: false },
        }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationParticipantBannedCallback?.({
          conversationId: RESTORED_CONV_ID,
          userId: 'current-user',
          bannedBy: { id: 'admin-1' },
          bannedAt: new Date().toISOString(),
          memberCount: 2,
        });
      });

      expect(readConversationIds(queryClient)).toEqual([]);

      await act(async () => {
        conversationParticipantUnbannedCallback?.({
          conversationId: RESTORED_CONV_ID,
          userId: 'current-user',
          membershipRestored: true,
          memberCount: 3,
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(readConversationIds(queryClient)).toEqual([RESTORED_CONV_ID]);
    });
  });

  describe('Conversation Closed Handler', () => {
    it('removes conversation from infinite cache when closed', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [mockConversation, { ...mockConversation, id: 'conv-2' }], pagination: { total: 2, offset: 0, limit: 20, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationClosedCallback?.({ conversationId: 'conv-1', closedBy: 'admin-1', closedAt: new Date().toISOString() });
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as { pages: { conversations: Conversation[] }[] };
      expect(cached.pages[0].conversations).toHaveLength(1);
      expect(cached.pages[0].conversations[0].id).toBe('conv-2');
    });

    it('removes conversation detail query when closed', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'detail', 'conv-1'], { id: 'conv-1' });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        conversationClosedCallback?.({ conversationId: 'conv-1', closedBy: 'admin-1', closedAt: new Date().toISOString() });
      });

      expect(queryClient.getQueryData(['conversations', 'detail', 'conv-1'])).toBeUndefined();
    });
  });

  describe('Preferences Updated Handler — community scope (F71)', () => {
    it('invalidates the community preferences detail and list queries', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        preferencesUpdatedCallback?.({ communityId: 'community-1', reset: false, preferences: {} });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['communities', 'preferences', 'community-1'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['communities', 'preferences', 'list'] })
      );
    });

    it('does not touch community queries for the category-scoped variant', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        preferencesUpdatedCallback?.({ category: 'notifications' } as any);
      });

      expect(invalidateSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['communities']) })
      );
    });
  });

  describe('Category Changed Handler', () => {
    it('invalidates preferences categories query on any category event', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        categoryChangedCallback?.();
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['user-preferences', 'categories'] })
      );
    });

    /**
     * La liste de conversations lit ses catégories dans le STORE Zustand
     * (`useConversationPreferences` -> `useConversationCategories`), jamais dans
     * React Query : `queryKeys.preferences.categories()` n'a aucun observateur
     * en production. Invalider seul ne changeait donc rien a l'ecran.
     */
    it('refreshes the store categories the conversation list actually renders', () => {
      const { wrapper } = createWrapperWithClient();
      const refreshSpy = jest.spyOn(
        useConversationPreferencesStore.getState(),
        'refreshCategories'
      );

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        categoryChangedCallback?.();
      });

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      refreshSpy.mockRestore();
    });
  });

  describe('Preferences Reordered Handler', () => {
    it('applies the broadcast order onto the store the list sorts on', () => {
      const { wrapper } = createWrapperWithClient();

      act(() => {
        useConversationPreferencesStore.setState({
          preferencesMap: new Map([
            [
              'conv-1',
              {
                id: 'pref-1',
                userId: 'current-user',
                conversationId: 'conv-1',
                isPinned: false,
                isMuted: false,
                isArchived: false,
                tags: [],
                orderInCategory: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          ]),
        });
      });

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        preferencesReorderedCallback?.({
          userId: 'current-user',
          updates: [{ conversationId: 'conv-1', orderInCategory: 7 }],
        });
      });

      expect(
        useConversationPreferencesStore.getState().preferencesMap.get('conv-1')?.orderInCategory
      ).toBe(7);
    });

    it('does not invalidate the categories query — a reorder changes no category', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        preferencesReorderedCallback?.({ userId: 'current-user', updates: [] });
      });

      expect(invalidateSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['user-preferences', 'categories'] })
      );
    });
  });

  describe('User Updated Handler', () => {
    it('invalidates the cached profile query for the updated user', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        userUpdatedCallback?.({ userId: 'user-42', changes: { displayName: 'New Name' } });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['users', 'detail', 'user-42'] })
      );
    });

    it('ignores malformed events without a userId', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        userUpdatedCallback?.({ userId: '', changes: {} });
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('Pending Messages Delivered Handler', () => {
    it('invalidates targeted conversations when conversationIds provided', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        pendingMessagesDeliveredCallback?.({ count: 2, conversationIds: ['conv-a', 'conv-b'] });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['messages', 'list', 'conv-a', 'infinite'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['messages', 'list', 'conv-b', 'infinite'] })
      );
      // La liste n'est jamais invalidée en bloc : `['conversations']` est un
      // PRÉFIXE de `['conversations','infinite']` et rejouerait toutes ses
      // pages, écrasant les `message:new` que le gateway vient de rejouer juste
      // avant cet événement. Seule la pastille manque, et elle se lit ligne par
      // ligne — voir « pastille de non-lus » plus bas.
      expect(invalidateSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conversations'] })
      );
    });

    it('falls back to active conversationId when conversationIds is empty', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        pendingMessagesDeliveredCallback?.({ count: 3, conversationIds: [] });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['messages', 'list', 'conv-1', 'infinite'] })
      );
      expect(invalidateSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conversations'] })
      );
    });
  });

  describe('Message Attachment Updated Handler', () => {
    it('replaces the attachment in the infinite messages cache when updated', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      const existingMessage = createMockMessage('msg-1', 'Hello');
      (existingMessage as any).attachments = [{ id: 'att-1', mimeType: 'audio/mp4', transcription: null }];

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [existingMessage], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      const updatedAttachment = { id: 'att-1', mimeType: 'audio/mp4', transcription: 'Hello world' };
      act(() => {
        messageAttachmentUpdatedCallback?.({ conversationId: 'conv-1', messageId: 'msg-1', attachment: updatedAttachment });
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: (Message & { attachments?: unknown[] })[] }[];
      };
      const msg = cached.pages[0].messages[0];
      expect((msg.attachments as typeof updatedAttachment[])[0].transcription).toBe('Hello world');
    });
  });

  describe('Link Message New Handler', () => {
    it('prepends the link message to the infinite messages cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [createMockMessage('existing-1', 'hi')], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        linkMessageNewCallback?.({ message: { id: 'link-1', conversationId: 'conv-1', content: 'https://example.com', messageType: 'link', createdAt: new Date().toISOString() } });
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as { pages: { messages: Message[] }[] };
      expect(cached.pages[0].messages).toHaveLength(2);
      expect(cached.pages[0].messages[0]).toMatchObject({ id: 'link-1', messageType: 'link' });
    });

    it('does not add duplicate link message if ID already exists in cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [{ id: 'link-1', conversationId: 'conv-1', content: 'https://example.com' }], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        linkMessageNewCallback?.({ message: { id: 'link-1', conversationId: 'conv-1', content: 'https://example.com' } });
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as { pages: { messages: Message[] }[] };
      expect(cached.pages[0].messages).toHaveLength(1);
    });

    it('invalidates the messages query when no cache entry exists yet', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        linkMessageNewCallback?.({ message: { id: 'link-1', conversationId: 'conv-1', content: 'https://example.com', messageType: 'link', createdAt: new Date().toISOString() } });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages', 'list', 'conv-1', 'infinite'] });
    });

    it('does not invalidate when the message did land in a cache entry', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [], hasMore: false, total: 0 }],
        pageParams: [1],
      });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        linkMessageNewCallback?.({ message: { id: 'link-1', conversationId: 'conv-1', content: 'https://example.com', createdAt: new Date().toISOString() } });
      });

      expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['messages', 'list', 'conv-1', 'infinite'] });
    });

    it('ignores link messages without a conversationId', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [], hasMore: false, total: 0 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        linkMessageNewCallback?.({ message: { id: 'link-1', content: 'https://example.com' } });
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as { pages: { messages: Message[] }[] };
      expect(cached.pages[0].messages).toHaveLength(0);
    });
  });

  describe('Message Pinned Handler', () => {
    it('updates the pinned message in the messages cache with pin metadata', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [createMockMessage('msg-1', 'Hello')], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      const pinnedAt = new Date().toISOString();
      act(() => {
        messagePinnedCallback?.({ messageId: 'msg-1', conversationId: 'conv-1', pinnedBy: 'user-admin', pinnedAt });
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as { pages: { messages: (Message & { pinnedBy?: string; pinnedAt?: string })[] }[] };
      expect(cached.pages[0].messages[0].pinnedBy).toBe('user-admin');
      expect(cached.pages[0].messages[0].pinnedAt).toBe(pinnedAt);
    });

    it('ignores events with missing messageId or conversationId', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [createMockMessage('msg-1', 'Hello')], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        messagePinnedCallback?.({ messageId: '', conversationId: 'conv-1', pinnedBy: 'admin', pinnedAt: new Date().toISOString() });
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as { pages: { messages: (Message & { pinnedBy?: string })[] }[] };
      expect(cached.pages[0].messages[0].pinnedBy).toBeUndefined();
    });
  });

  describe('Message Unpinned Handler', () => {
    it('removes pin metadata from the message in the messages cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      const pinnedMsg = { ...createMockMessage('msg-1', 'Hello'), pinnedBy: 'admin', pinnedAt: new Date().toISOString() };
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [pinnedMsg], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        messageUnpinnedCallback?.({ messageId: 'msg-1', conversationId: 'conv-1' });
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as { pages: { messages: (Message & { pinnedBy?: string; pinnedAt?: string })[] }[] };
      expect(cached.pages[0].messages[0].pinnedBy).toBeUndefined();
      expect(cached.pages[0].messages[0].pinnedAt).toBeUndefined();
    });

    it('ignores events with missing messageId or conversationId', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      const pinnedMsg = { ...createMockMessage('msg-1', 'Hello'), pinnedBy: 'admin', pinnedAt: new Date().toISOString() };
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [pinnedMsg], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        messageUnpinnedCallback?.({ messageId: '', conversationId: 'conv-1' });
      });

      const cached = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as { pages: { messages: (Message & { pinnedBy?: string })[] }[] };
      // pinnedBy should still be present since we ignored the event
      expect(cached.pages[0].messages[0].pinnedBy).toBe('admin');
    });
  });

  describe('Conversation Join Error Handler', () => {
    it('removes the rejected conversation from the conversations list cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [
          {
            conversations: [
              { ...mockConversation, id: 'conv-1' },
              { ...mockConversation, id: 'conv-2' },
            ] as Conversation[],
            pagination: { total: 2, offset: 0, limit: 20, hasMore: false },
          },
        ],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        conversationJoinErrorCallback?.({ conversationId: 'conv-1', reason: 'banned', message: 'You are banned' });
      });

      const convs = (queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: { conversations: Conversation[] }[];
      }).pages.flatMap((page) => page.conversations);
      expect(convs.map((c) => c.id)).not.toContain('conv-1');
      expect(convs.map((c) => c.id)).toContain('conv-2');
    });

    it('removes the rejected conversation detail and messages from cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'detail', 'conv-1'], { ...mockConversation });
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [], hasMore: false, total: 0 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        conversationJoinErrorCallback?.({ conversationId: 'conv-1', reason: 'not_a_member', message: '' });
      });

      expect(queryClient.getQueryData(['conversations', 'detail', 'conv-1'])).toBeUndefined();
      expect(queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite'])).toBeUndefined();
    });

    // Cycle 99 — les deux témoins ci-dessus n'exercent que `banned` et
    // `not_a_member`, c'est-à-dire les deux seuls motifs où purger est JUSTE.
    // Le producteur en émet sept, dont quatre transitoires : le gestionnaire
    // les recevait tous et purgeait pareil, parce qu'aucun témoin ne les
    // faisait passer. Ceux-ci écrivent l'invariant en NÉGATIF — le cache
    // SURVIT — pour garder la forme exacte du défaut.
    it.each([
      ['rate_limited', 'Trop de requêtes. Veuillez réessayer.'],
      ['server_error', 'Erreur serveur lors du join'],
      ['not_authenticated', 'Non authentifié'],
      ['invalid_payload', 'conversationId invalide'],
    ])('garde la conversation et ses messages sur un refus TRANSITOIRE (%s)', (reason, message) => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [
          {
            conversations: [{ ...mockConversation, id: 'conv-1' }] as Conversation[],
            pagination: { total: 1, offset: 0, limit: 20, hasMore: false },
          },
        ],
        pageParams: [0],
      });
      queryClient.setQueryData(['conversations', 'detail', 'conv-1'], { ...mockConversation });
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [], hasMore: false, total: 0 }],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        conversationJoinErrorCallback?.({ conversationId: 'conv-1', reason, message });
      });

      const convs = (queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: { conversations: Conversation[] }[];
      }).pages.flatMap((page) => page.conversations);
      expect(convs.map((c) => c.id)).toContain('conv-1');
      expect(queryClient.getQueryData(['conversations', 'detail', 'conv-1'])).toBeDefined();
      expect(queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite'])).toBeDefined();
    });

    // Ne pas savoir lire n'autorise pas à détruire : une passerelle plus récente
    // que ce client peut émettre un motif qu'il ne connaît pas.
    it('garde le cache sur un motif INCONNU', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['conversations', 'detail', 'conv-1'], { ...mockConversation });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        conversationJoinErrorCallback?.({
          conversationId: 'conv-1',
          reason: 'a_reason_a_future_gateway_adds',
          message: '',
        });
      });

      expect(queryClient.getQueryData(['conversations', 'detail', 'conv-1'])).toBeDefined();
    });

    // Le signal reste émis dans TOUS les cas : c'est ce qui permet à l'UI de
    // dire « réessaie » sur un transitoire. Seule la PURGE est conditionnelle.
    it('émet quand même le CustomEvent sur un refus transitoire', () => {
      const { wrapper } = createWrapperWithClient();
      const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        conversationJoinErrorCallback?.({ conversationId: 'conv-1', reason: 'rate_limited', message: 'slow down' });
      });

      const call = dispatchSpy.mock.calls.find(([e]) => (e as CustomEvent).type === 'meeshy:conversation-join-error');
      expect(call).toBeDefined();
      expect((call![0] as CustomEvent).detail).toMatchObject({ conversationId: 'conv-1', reason: 'rate_limited' });
    });

    it('dispatches meeshy:conversation-join-error CustomEvent on window', () => {
      const { wrapper } = createWrapperWithClient();
      const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        conversationJoinErrorCallback?.({ conversationId: 'conv-2', reason: 'banned', message: 'You are banned' });
      });

      const call = dispatchSpy.mock.calls.find(([e]) => (e as CustomEvent).type === 'meeshy:conversation-join-error');
      expect(call).toBeDefined();
      expect((call![0] as CustomEvent).detail).toMatchObject({ conversationId: 'conv-2', reason: 'banned' });
    });
  });
});

describe('useSocketCacheSync — suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Les deux témoins de `useInvalidateOnReconnect` ont été retirés avec le hook
  // (cycle 59) : ils épinglaient ses appels `invalidateQueries` — c'est-à-dire
  // exactement le geste destructeur qui a motivé sa suppression. L'invariant
  // qu'ils prétendaient garder vit désormais dans
  // `use-conversations-query.test.tsx` (« ne relit PAS ses pages au retour de
  // connexion réseau »), en termes de COMPORTEMENT observable.

  // ─── message:restored-for-me ───────────────────────────────────────────────
  //
  // Un message masqué pour moi est revenu en vue depuis un AUTRE de mes
  // appareils. Le masquage avait retiré la bulle du cache : il n'y a rien à
  // fusionner, seulement une adresse à re-demander.
  describe('message:restored-for-me', () => {
    it('invalidates only the named conversations, plus the list', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      act(() => {
        messageRestoredForMeCallback?.({
          messages: [
            { messageId: 'm-1', conversationId: 'conv-1' },
            { messageId: 'm-2', conversationId: 'conv-2' },
            { messageId: 'm-3', conversationId: 'conv-1' },
          ],
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['messages', 'list', 'conv-1', 'infinite'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['messages', 'list', 'conv-2', 'infinite'],
      });
      // Deux messages nomment `conv-1` : une seule invalidation, pas deux.
      const messageInvalidations = invalidateSpy.mock.calls.filter((call) =>
        Array.isArray((call[0] as { queryKey?: unknown })?.queryKey)
          ? ((call[0] as { queryKey: unknown[] }).queryKey[0] === 'messages')
          : false
      );
      expect(messageInvalidations).toHaveLength(2);
      // La LIGNE de liste n'est PAS demandée ici : le gateway l'a déjà poussée.
      // `restoreMessageForUser` appelle `refreshPersonalConversationPreview`,
      // qui émet un `conversation:updated` portant l'aperçu personnel recalculé
      // — fusionné sans remplacer la page. L'invalidation qui se trouvait ici
      // doublait cette diffusion en rejouant toutes les pages de la liste
      // (`['conversations']` est un PRÉFIXE de `['conversations','infinite']`).
      expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['conversations'] });
    });

    it('does nothing when the payload names no message', () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      act(() => {
        messageRestoredForMeCallback?.({ messages: [] });
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  // ─── La liste ne rejoue JAMAIS ses pages ────────────────────────────────────
  //
  // `queryKeys.conversations.all` (`['conversations']`) est un PRÉFIXE de
  // `queryKeys.conversations.infinite()` (`['conversations','infinite']`).
  // `invalidateQueries` sur ce préfixe atteint donc la liste infinie, et sur une
  // query infinie ACTIVE il rejoue TOUTES les pages chargées et REMPLACE le
  // cache. Trois dommages, dont un est une faute de correction :
  //
  //   1. N pages de scroll = N requêtes sur une route lourde (participants,
  //      dernier message avec traductions et pièce jointe, compteurs de non-lus
  //      calculés par curseur) ;
  //   2. tout ce que la socket écrit pendant la séquence est ÉCRASÉ ;
  //   3. la route pagine par OFFSET sur un tri `lastMessageAt` décroissant : un
  //      message arrivé entre la page k et la page k+1 promeut sa conversation
  //      en tête et décale les suivantes d'un cran — une ligne DUPLIQUÉE à la
  //      frontière, une autre PERDUE.
  //
  // Le cycle 59 a désarmé les deux déclencheurs GLOBAUX (`refetchOnWindowFocus`
  // et `refetchOnReconnect`, tous deux `false` sur `useInfiniteConversationsQuery`).
  // Ces dérogations ne protègent de RIEN contre un `invalidateQueries` explicite :
  // les handlers socket ci-dessous rouvraient la même panne par une autre porte.
  //
  // Les témoins montent la liste RÉELLE et comptent les requêtes — pas les
  // appels à `invalidateQueries`. C'est la seule forme discriminante : un témoin
  // qui épingle `invalidateQueries` verrouille le geste destructeur au lieu de
  // le mesurer (deux témoins de ce genre ont été retirés au cycle 59).
  describe('la liste de conversations ne rejoue pas ses pages', () => {
    function renderListWithSync() {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      };
      const rendered = renderHook(
        () => {
          const list = useInfiniteConversationsQuery({ limit: 20 });
          useSocketCacheSync({ conversationId: 'conv-1', enabled: true });
          return list;
        },
        { wrapper }
      );
      return { ...rendered, queryClient };
    }

    /** Deux pages chargées : la frontière que le rejeu duplique existe alors. */
    async function loadTwoPages() {
      mockGetConversations.mockReset();
      mockGetConversations
        .mockResolvedValueOnce({
          conversations: [mockConversation],
          pagination: { limit: 20, offset: 0, total: 40, hasMore: true },
        })
        .mockResolvedValueOnce({
          conversations: [{ ...mockConversation, id: 'conv-2' }],
          pagination: { limit: 20, offset: 20, total: 40, hasMore: false },
        });

      const harness = renderListWithSync();
      await waitFor(() => expect(harness.result.current.isSuccess).toBe(true));
      await act(async () => {
        await harness.result.current.fetchNextPage();
      });
      expect(mockGetConversations).toHaveBeenCalledTimes(2);
      mockGetConversations.mockClear();
      mockGetConversations.mockResolvedValue({
        conversations: [mockConversation],
        pagination: { limit: 20, offset: 0, total: 40, hasMore: true },
      });
      return harness;
    }

    /**
     * La file HORS-LIGNE vidée au reconnect — le chemin le plus fréquenté de
     * tous, plusieurs fois par trajet sur un usage mobile.
     *
     * Le gateway rejoue d'abord CHAQUE `message:new` en attente, puis annonce
     * `message:pending-delivered`. Chaque rejeu a déjà été fusionné par
     * `handleNewMessage`, qui écrit la ligne de liste sans la remplacer et dont
     * le commentaire l'écrit en capitales : « DO NOT invalidate here ». Le
     * handler d'à côté faisait exactement l'inverse, sur un préfixe PLUS LARGE,
     * et effaçait donc les écritures que le précédent venait de poser.
     */
    it('ne rejoue pas ses pages quand la file hors-ligne est vidée', async () => {
      const harness = await loadTwoPages();

      await act(async () => {
        pendingMessagesDeliveredCallback?.({ count: 2, conversationIds: ['conv-1'] });
        await Promise.resolve();
      });

      const pageReads = mockGetConversations.mock.calls.filter(
        (call) => (call[0] as { updatedSince?: string })?.updatedSince === undefined
      );
      expect(pageReads).toHaveLength(0);
      harness.unmount();
    });

    /**
     * Un message masqué pour moi revenu en vue depuis un autre de mes appareils.
     *
     * Ici l'invalidation était PUREMENT redondante : `restoreMessageForUser`
     * (gateway) appelle déjà `refreshPersonalConversationPreview`, qui émet un
     * `conversation:updated` portant l'aperçu PERSONNEL recalculé pour ce seul
     * lecteur — et `handleConversationUpdated` le fusionne sans remplacer la
     * page. Le serveur faisait le travail, mieux, et le client le refaisait en
     * cassant la pagination.
     */
    it('ne rejoue pas ses pages quand un message masqué revient en vue', async () => {
      const harness = await loadTwoPages();

      await act(async () => {
        messageRestoredForMeCallback?.({
          messages: [{ messageId: 'm-1', conversationId: 'conv-1' }],
        });
        await Promise.resolve();
      });

      const pageReads = mockGetConversations.mock.calls.filter(
        (call) => (call[0] as { updatedSince?: string })?.updatedSince === undefined
      );
      expect(pageReads).toHaveLength(0);
      harness.unmount();
    });
  });

  // ─── Le compteur de non-lus après une vidange de file ───────────────────────
  //
  // Il ne se lit plus au réseau, et il n'a jamais eu à s'y lire.
  //
  // `_drainedEventName` (`MeeshySocketIOManager.ts`) mappe chaque entrée de file
  // vers UN événement de message — `message:new`, `edited`, `deleted`,
  // `reaction-*`, `translation`, `pinned`... — et n'a AUCUN cas
  // `conversation:unread-updated`. L'aperçu, le rang et la promotion en tête
  // arrivent donc par ces rejeux ; la pastille, non.
  //
  // Ce handler la lisait donc au réseau : N `GET /conversations/:id`, PLAFONNÉS
  // à 10, au-delà desquels les compteurs étaient abandonnés — et sur le lien le
  // plus contraint qui existe, un mobile qui vient de revenir.
  //
  // Or le gateway pousse ce compteur sur le MÊME chemin de connexion
  // (`_emitUnreadCountsSnapshot` → `conversation:unread-updated`), pour TOUTES
  // les conversations du lecteur et sans plafond : un SUR-ENSEMBLE. Son seul
  // angle mort était l'invité de lien partagé, dont la résolution de participant
  // ne lisait que la colonne `userId` — corrigé côté serveur, où le trou était.
  describe('Pending Messages Delivered — pastille de non-lus', () => {
    // Le cache est SEMÉ avec les deux conversations nommées : c'est la condition
    // exacte sous laquelle l'ancienne lecture REST tirait
    // (`refreshUnreadCountsFromServer` filtrait sur les lignes déjà en cache).
    // Sans cette semence le témoin serait vert par vacuité — il n'attesterait
    // que d'un cache vide, pas de la suppression de la lecture.
    it('ne demande RIEN au réseau : la pastille arrive par conversation:unread-updated', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      };
      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [
          {
            conversations: [
              { ...mockConversation, id: 'conv-a', unreadCount: 0 },
              { ...mockConversation, id: 'conv-b', unreadCount: 0 },
            ],
            pagination: { limit: 20, offset: 0, total: 2, hasMore: false },
          },
        ],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-a', enabled: true }), { wrapper });

      await act(async () => {
        pendingMessagesDeliveredCallback?.({ count: 6, conversationIds: ['conv-a', 'conv-b'] });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockApiGet).not.toHaveBeenCalledWith('/conversations/conv-a');
      expect(mockApiGet).not.toHaveBeenCalledWith('/conversations/conv-b');
    });

    /**
     * La garde qui compte vraiment après la suppression : c'est bien l'ÉVÉNEMENT
     * qui déplace la pastille, et il porte déjà le clamp de conversation
     * OUVERTE que la lecture REST devait dupliquer. Router la pastille par
     * l'événement ramène donc cette garde à UN seul site.
     */
    it('applique le compteur poussé par le serveur, et le force à zéro sur la conversation OUVERTE', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      };
      const cachedPreview = createMockMessage('msg-9', 'dernier message reçu', 'conv-a');
      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [
          {
            conversations: [
              { ...mockConversation, id: 'conv-a', unreadCount: 0, lastMessage: cachedPreview },
              { ...mockConversation, id: 'conv-b', unreadCount: 0 },
            ],
            pagination: { limit: 20, offset: 0, total: 2, hasMore: false },
          },
        ],
        pageParams: [0],
      });

      useNotificationStore.getState().setActiveConversationId('conv-a');
      renderHook(() => useSocketCacheSync({ conversationId: 'conv-a', enabled: true }), { wrapper });

      await act(async () => {
        unreadUpdatedCallback?.({ conversationId: 'conv-a', unreadCount: 4 });
        unreadUpdatedCallback?.({ conversationId: 'conv-b', unreadCount: 2 });
        await Promise.resolve();
      });

      const cached = queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: Array<{ conversations: Conversation[] }>;
      };
      const rows = cached.pages.flatMap((page) => page.conversations);
      // Conversation OUVERTE : le compteur poussé est clampé à zéro.
      expect(rows.find((c) => c.id === 'conv-a')?.unreadCount).toBe(0);
      expect(rows.find((c) => c.id === 'conv-b')?.unreadCount).toBe(2);
      // L'aperçu vient du `message:new` rejoué : la pastille ne le remplace pas.
      expect(rows.find((c) => c.id === 'conv-a')?.lastMessage?.id).toBe('msg-9');

      useNotificationStore.getState().setActiveConversationId(null);
    });
  });

  /**
   * Le pont ✦ sur `conversation:unread-updated` — LES TROIS ÉTATS (cycle 63).
   *
   * Ce handler recopiait `data.bridge` INCONDITIONNELLEMENT, `undefined`
   * compris, et son commentaire le revendiquait : « un pont ABSENT du payload
   * wire DOIT effacer un pont déjà en cache ». La règle était juste pour
   * l'émetteur qu'elle avait en tête — le fan-out d'envoi, qui calcule
   * toujours — et fausse pour les trois autres, qui ne calculent pas toujours.
   *
   * Le serveur distingue désormais ses deux silences, et ce témoin monte le
   * VRAI handler sur le VRAI cache pour prouver que le client les entend :
   *
   *   `bridge: {...}` → remplace
   *   `bridge: null`  → efface
   *   (clé absente)   → NE TOUCHE À RIEN
   *
   * Le troisième cas est le seul qui change de comportement, et c'est celui
   * qui rend une reconnexion, un incident de passe ou un accusé de lecture
   * incapables de détruire un pont que le serveur n'a jamais recalculé.
   */
  describe('le pont ✦ — les trois états du fil', () => {
    const A_BRIDGE = {
      kind: 'fallback' as const,
      unreadCount: 3,
      suggestedMode: 'focal' as const,
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 3 },
    };

    function mountWithCachedBridge() {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      };
      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [
          {
            conversations: [{ ...mockConversation, id: 'conv-x', unreadCount: 3, bridge: A_BRIDGE }],
            pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
          },
        ],
        pageParams: [0],
      });
      renderHook(() => useSocketCacheSync({ conversationId: 'conv-other', enabled: true }), {
        wrapper,
      });
      const rowBridge = () => {
        const cached = queryClient.getQueryData(['conversations', 'infinite']) as {
          pages: Array<{ conversations: Conversation[] }>;
        };
        return cached.pages.flatMap((page) => page.conversations).find((c) => c.id === 'conv-x');
      };
      return { rowBridge };
    }

    it('GARDE le pont en cache quand la clé est ABSENTE — le serveur n’a pas calculé', async () => {
      const { rowBridge } = mountWithCachedBridge();

      await act(async () => {
        unreadUpdatedCallback?.({ conversationId: 'conv-x', unreadCount: 3 });
        await Promise.resolve();
      });

      expect(rowBridge()?.bridge).toEqual(A_BRIDGE);
      expect(rowBridge()?.unreadCount).toBe(3);
    });

    it('EFFACE le pont sur un `null` explicite — le serveur a calculé, il n’y en a pas', async () => {
      const { rowBridge } = mountWithCachedBridge();

      await act(async () => {
        unreadUpdatedCallback?.({ conversationId: 'conv-x', unreadCount: 1, bridge: null });
        await Promise.resolve();
      });

      expect(rowBridge()?.bridge).toBeUndefined();
      expect(rowBridge()?.unreadCount).toBe(1);
    });

    it('REMPLACE le pont quand le serveur en annonce un neuf', async () => {
      const { rowBridge } = mountWithCachedBridge();
      const fresher = { ...A_BRIDGE, unreadCount: 9, data: { ...A_BRIDGE.data, messageCount: 9 } };

      await act(async () => {
        unreadUpdatedCallback?.({ conversationId: 'conv-x', unreadCount: 9, bridge: fresher });
        await Promise.resolve();
      });

      expect(rowBridge()?.bridge).toEqual(fresher);
    });
  });
  // ─────────────────────────────────────────────────────────────────────────
  // Le hook est désormais monté AUSSI par `BubbleStreamPage` (`/`,
  // `/chat/:linkId`) — deux écrans qui ne montent AUCUNE liste de
  // conversations, et dont la liste de messages est clé-ée sur un SLUG. Ces
  // deux faits gouvernent les gardes ci-dessous.
  // ─────────────────────────────────────────────────────────────────────────
  describe('Écrans sans liste de conversations et listes clé-ées sur un alias', () => {
    const UNKNOWN_CONV_ID = '64b7f2a1c3d4e5f6a7b8c9d1';

    const arrivingMessage = () => ({
      ...createMockMessage('msg-arriving', 'Salut'),
      conversationId: UNKNOWN_CONV_ID,
      senderId: 'someone-else',
    }) as Message;

    it('ne lit PAS `GET /conversations/:id` quand aucune liste de conversations n’est en cache', async () => {
      const { wrapper } = createWrapperWithClient();

      renderHook(() => useSocketCacheSync({ conversationId: 'meeshy', enabled: true }), { wrapper });

      await act(async () => {
        newMessageCallback?.(arrivingMessage());
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockApiGet).not.toHaveBeenCalledWith(`/conversations/${UNKNOWN_CONV_ID}`);
    });

    // Jumeau POSITIF — sans lui la garde ci-dessus serait satisfaite par un
    // hook qui ne lit plus JAMAIS la ligne manquante, ce qui priverait
    // `/conversations` d’une conversation toute neuve.
    it('lit la ligne manquante dès qu’une liste existe pour la recevoir', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      mockApiGet.mockResolvedValue({
        data: { ...mockConversation, id: UNKNOWN_CONV_ID } as Conversation,
      });
      queryClient.setQueryData(['conversations', 'infinite'], {
        pages: [{ conversations: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } }],
        pageParams: [0],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'meeshy', enabled: true }), { wrapper });

      await act(async () => {
        newMessageCallback?.(arrivingMessage());
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockApiGet).toHaveBeenCalledWith(`/conversations/${UNKNOWN_CONV_ID}`);
    });

    // L'accusé de RÉCEPTION appartient à la couche TRANSPORT
    // (`messaging.service.markAsReceivedDebounced`, débouncé 500 ms par
    // conversation), qui sert ce handler et poste juste après l'avoir servi.
    // Le doubler ici coûtait UNE requête par message — invisible tant que le
    // hook n'était monté que par `ConversationLayout`, payée sur la
    // conversation la plus bavarde dès qu'il l'est par `BubbleStreamPage`.
    it('ne poste PAS l’accusé de réception : la couche transport le fait déjà, débouncée', async () => {
      const { wrapper } = createWrapperWithClient();

      renderHook(() => useSocketCacheSync({ conversationId: 'meeshy', enabled: true }), { wrapper });

      await act(async () => {
        newMessageCallback?.(arrivingMessage());
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockApiPost).not.toHaveBeenCalledWith(
        `/conversations/${UNKNOWN_CONV_ID}/mark-as-received`
      );
    });

    // `message:restored-for-me` demande une RELECTURE. Elle nommait la clé
    // ObjectId, que la page d’accueil ne monte pas : l’invalidation ne visait
    // aucune requête existante. Le témoin s’écrit donc sur une entrée ALIAS —
    // au rang où la règle et le raccourci divergent.
    it('invalide la liste clé-ée sur l’ALIAS, pas seulement celle clé-ée sur l’ObjectId', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      };
      const aliasKey = ['messages', 'list', 'meeshy', 'infinite'];

      queryClient.setQueryData(aliasKey, {
        pages: [
          {
            messages: [{ ...createMockMessage('msg-1', 'Hello'), conversationId: UNKNOWN_CONV_ID }],
            hasMore: false,
            total: 1,
          },
        ],
        pageParams: [1],
      });

      renderHook(() => useSocketCacheSync({ conversationId: 'meeshy', enabled: true }), { wrapper });

      await act(async () => {
        messageRestoredForMeCallback?.({
          messages: [{ messageId: 'msg-restored', conversationId: UNKNOWN_CONV_ID }],
        } as never);
        await Promise.resolve();
      });

      expect(queryClient.getQueryState(aliasKey)?.isInvalidated).toBe(true);
    });
  });
});
