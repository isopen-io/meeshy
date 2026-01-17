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

// Mock unsubscribe functions
const mockUnsubscribeMessage = jest.fn();
const mockUnsubscribeEdit = jest.fn();
const mockUnsubscribeDelete = jest.fn();
const mockUnsubscribeTranslation = jest.fn();

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
    },
    notifications: {
      all: ['notifications'],
    },
  },
}));

// Test data
const createMockMessage = (id: string, content: string, conversationId = 'conv-1'): Message => ({
  id,
  content,
  conversationId,
  senderId: 'user-1',
  originalLanguage: 'en',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isDeleted: false,
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
      canAccessAdmin: false,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
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
});

const mockMessages = [
  createMockMessage('msg-1', 'Hello'),
  createMockMessage('msg-2', 'World'),
];

const mockConversation: Conversation = {
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
};

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

    it('should not remove message when conversationId not provided', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      // No conversationId provided
      renderHook(() => useSocketCacheSync(), { wrapper });

      act(() => {
        messageDeletedCallback?.('msg-1');
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      // Message should still be there (can't determine which conversation)
      expect(cachedData.pages[0].messages).toHaveLength(2);
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

      const translationEvent: TranslationEvent = {
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
      };

      act(() => {
        translationCallback?.(translationEvent);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      const message = cachedData.pages[0].messages.find((m) => m.id === 'msg-1');
      expect(message?.translations).toHaveProperty('fr', 'Bonjour');
    });

    it('should not update when conversationId not provided', () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
        pageParams: [1],
      });

      // No conversationId
      renderHook(() => useSocketCacheSync(), { wrapper });

      const translationEvent: TranslationEvent = {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        translations: [],
      };

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
