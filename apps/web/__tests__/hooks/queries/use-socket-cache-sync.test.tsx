/**
 * Tests for useSocketCacheSync and useInvalidateOnReconnect hooks
 *
 * Tests cover:
 * - Socket.IO event listeners registration
 * - Cache updates on new message
 * - Cache updates on message edited
 * - Cache updates on message deleted
 * - Cache updates on translation events
 * - Cache updates on unread count changes
 * - Cleanup on unmount
 * - useInvalidateOnReconnect: Query invalidation on reconnect
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useSocketCacheSync,
  useInvalidateOnReconnect,
} from '@/hooks/queries/use-socket-cache-sync';
import type { Message, Conversation } from '@/types';
import type { TranslationEvent } from '@meeshy/shared/types';

// Store callbacks to trigger them in tests
let newMessageCallback: ((message: Message) => void) | null = null;
let messageEditedCallback: ((message: Message) => void) | null = null;
let messageDeletedCallback: ((messageId: string) => void) | null = null;
let translationCallback: ((data: TranslationEvent) => void) | null = null;
let conversationDeletedCallback: ((data: { userId: string; conversationId: string }) => void) | null = null;
let conversationUpdatedCallback: ((data: { conversationId: string; updatedBy: { id: string }; updatedAt: string; [key: string]: unknown }) => void) | null = null;
let conversationParticipantLeftCallback: ((data: { conversationId: string; userId: string; displayName: string; leftAt: string }) => void) | null = null;
let conversationParticipantBannedCallback: ((data: { conversationId: string; userId: string; bannedBy: { id: string }; bannedAt: string }) => void) | null = null;
let conversationParticipantUnbannedCallback: ((data: { conversationId: string; userId: string }) => void) | null = null;
let conversationClosedCallback: ((data: { conversationId: string; closedBy: string; closedAt: string }) => void) | null = null;
let categoryChangedCallback: (() => void) | null = null;
let messageAttachmentUpdatedCallback: ((data: { conversationId: string; messageId: string; attachment: unknown }) => void) | null = null;
let pendingMessagesDeliveredCallback: ((data: { count: number; conversationIds: string[] }) => void) | null = null;
let linkMessageNewCallback: ((data: { message: Record<string, unknown> }) => void) | null = null;
let conversationJoinErrorCallback: ((data: { conversationId: string; reason: string; message: string }) => void) | null = null;
let messagePinnedCallback: ((data: { messageId: string; conversationId: string; pinnedBy: string; pinnedAt: string }) => void) | null = null;
let messageUnpinnedCallback: ((data: { messageId: string; conversationId: string }) => void) | null = null;
let userUpdatedCallback: ((data: { userId: string; changes: Record<string, unknown> }) => void) | null = null;

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

jest.mock('@/services/api.service', () => ({
  apiService: {
    post: jest.fn().mockResolvedValue({}),
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
    onTranslation: (callback: (data: TranslationEvent) => void) => {
      translationCallback = callback;
      return mockUnsubscribeTranslation;
    },
    onUnreadUpdated: jest.fn(() => jest.fn()),
    onTranscription: jest.fn(() => jest.fn()),
    onAudioTranslation: jest.fn(() => jest.fn()),
    onAttachmentStatusUpdated: jest.fn(() => jest.fn()),
    onParticipantRoleUpdated: jest.fn(() => jest.fn()),
    onPreferencesUpdated: jest.fn(() => jest.fn()),
    onConversationJoined: jest.fn(() => jest.fn()),
    onConversationLeft: jest.fn(() => jest.fn()),
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
      lists: () => ['conversations', 'list'],
      list: (filters?: Record<string, unknown>) => ['conversations', 'list', filters],
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
      categories: () => ['user-preferences', 'categories'],
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
    linkMessageNewCallback = null;
    conversationJoinErrorCallback = null;
    messagePinnedCallback = null;
    messageUnpinnedCallback = null;
    userUpdatedCallback = null;
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

    it('should add new message to simple list cache', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1'], mockMessages);

      renderHook(() => useSocketCacheSync(), { wrapper });

      const newMessage = createMockMessage('msg-new', 'New message');
      act(() => {
        newMessageCallback?.(newMessage);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1']) as Message[];

      expect(cachedData[0].id).toBe('msg-new');
      expect(cachedData).toHaveLength(3);
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

      queryClient.setQueryData(['conversations', 'list', undefined], [mockConversation]);

      renderHook(() => useSocketCacheSync(), { wrapper });

      const newMessage = createMockMessage('msg-new', 'New message', 'conv-1');
      act(() => {
        newMessageCallback?.(newMessage);
      });

      const conversations = queryClient.getQueryData(['conversations', 'list', undefined]) as Conversation[];

      expect(conversations[0].lastMessage?.id).toBe('msg-new');
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
      expect((conv as any).lastMessageAt).toBe(newTime);
    });
  });

  describe('Conversation Participant Left Handler', () => {
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
      expect(invalidateSpy).toHaveBeenCalledWith(
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
      expect(invalidateSpy).toHaveBeenCalledWith(
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

      queryClient.setQueryData(['conversations', 'list', undefined], [
        { ...mockConversation, id: 'conv-1' },
        { ...mockConversation, id: 'conv-2' },
      ] as Conversation[]);

      renderHook(() => useSocketCacheSync({ conversationId: 'conv-1' }), { wrapper });

      act(() => {
        conversationJoinErrorCallback?.({ conversationId: 'conv-1', reason: 'banned', message: 'You are banned' });
      });

      const convs = queryClient.getQueryData(['conversations', 'list', undefined]) as Conversation[];
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

describe('useInvalidateOnReconnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should invalidate queries on online event', () => {
    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useInvalidateOnReconnect(), { wrapper });

    // Simulate online event
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['conversations'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['notifications'],
    });
  });

  it('should cleanup event listener on unmount', () => {
    const { wrapper } = createWrapperWithClient();

    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useInvalidateOnReconnect(), { wrapper });

    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
  });
});
