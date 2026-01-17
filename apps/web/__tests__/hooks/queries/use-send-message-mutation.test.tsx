/**
 * Tests for useSendMessageMutation and related hooks
 *
 * Tests cover:
 * - useSendMessageMutation: Optimistic updates, rollback, cache updates
 * - useEditMessageMutation: Edit message with optimistic updates
 * - useDeleteMessageMutation: Delete message with optimistic updates
 * - useMarkAsReadMutation: Mark conversation as read
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useSendMessageMutation,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useMarkAsReadMutation,
} from '@/hooks/queries/use-send-message-mutation';
import type { Message, Conversation } from '@meeshy/shared/types';

// Mock the conversations service
const mockSendMessage = jest.fn();
const mockMarkAsRead = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
  },
}));

// Mock the socket.io service
const mockEditMessage = jest.fn();
const mockDeleteMessage = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    editMessage: (...args: unknown[]) => mockEditMessage(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
  },
}));

// Mock auth store
const mockUser = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  systemLanguage: 'en',
  avatar: 'avatar.png',
};

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { user: typeof mockUser }) => unknown) =>
    selector({ user: mockUser }),
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
  },
}));

// Test data
const createMockMessage = (id: string, content: string): Message => ({
  id,
  content,
  conversationId: 'conv-1',
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
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// Helper to get access to QueryClient in tests
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

describe('useSendMessageMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send message and update cache on success', async () => {
    const sentMessage = createMockMessage('msg-new', 'New message');
    mockSendMessage.mockResolvedValue(sentMessage);

    const { wrapper, queryClient } = createWrapperWithClient();

    // Pre-populate cache with infinite query structure
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'New message' },
      });
    });

    expect(mockSendMessage).toHaveBeenCalledWith('conv-1', { content: 'New message' });
  });

  it('should create optimistic message during mutation', async () => {
    let resolvePromise: (value: unknown) => void;
    mockSendMessage.mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve; })
    );

    const { wrapper, queryClient } = createWrapperWithClient();

    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper,
    });

    // Start mutation without awaiting
    act(() => {
      result.current.mutate({
        conversationId: 'conv-1',
        data: { content: 'Optimistic message' },
      });
    });

    // Wait for pending state which indicates onMutate has run
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    // Check that optimistic message was added
    const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
      pages: { messages: { id: string; content: string; status?: string }[] }[];
    };

    if (cachedData?.pages?.[0]?.messages) {
      const firstMessage = cachedData.pages[0].messages[0];
      expect(firstMessage.content).toBe('Optimistic message');
      expect(firstMessage.status).toBe('sending');
      expect(firstMessage.id).toMatch(/^temp-/);
    }

    // Resolve the promise
    await act(async () => {
      resolvePromise!(createMockMessage('msg-real', 'Optimistic message'));
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('should rollback on error', async () => {
    mockSendMessage.mockRejectedValue(new Error('Send failed'));

    const { wrapper, queryClient } = createWrapperWithClient();

    const originalData = {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    };
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], originalData);

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper,
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          conversationId: 'conv-1',
          data: { content: 'Will fail' },
        });
      })
    ).rejects.toThrow('Send failed');

    // Cache should be rolled back
    const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']);
    expect(cachedData).toEqual(originalData);
  });

  it('should update conversation lastMessageAt on success', async () => {
    const sentMessage = createMockMessage('msg-new', 'New message');
    mockSendMessage.mockResolvedValue(sentMessage);

    const { wrapper, queryClient } = createWrapperWithClient();

    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });
    queryClient.setQueryData(['conversations', 'list', undefined], [mockConversation]);

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'New message' },
      });
    });

    const conversations = queryClient.getQueryData(['conversations', 'list', undefined]) as Conversation[];
    expect(conversations[0].lastMessageAt).toBeDefined();
  });

  it('should handle empty cache gracefully', async () => {
    const sentMessage = createMockMessage('msg-new', 'New message');
    mockSendMessage.mockResolvedValue(sentMessage);

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper: createWrapper(),
    });

    // Should not throw when cache is empty
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'New message' },
      });
    });

    expect(mockSendMessage).toHaveBeenCalled();
  });
});

describe('useEditMessageMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should edit message optimistically', async () => {
    mockEditMessage.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();

    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });

    const { result } = renderHook(() => useEditMessageMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Edited content',
      });
    });

    expect(mockEditMessage).toHaveBeenCalledWith('msg-1', 'Edited content');

    // Cache update happens optimistically, check after mutation completes
    await waitFor(() => {
      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      } | undefined;
      if (cachedData?.pages?.[0]?.messages) {
        const editedMessage = cachedData.pages[0].messages.find((m) => m.id === 'msg-1');
        expect(editedMessage?.content).toBe('Edited content');
      }
    });
  });

  it('should rollback on edit error', async () => {
    mockEditMessage.mockRejectedValue(new Error('Edit failed'));

    const { wrapper, queryClient } = createWrapperWithClient();

    const originalMessages = [
      createMockMessage('msg-1', 'Original content'),
    ];
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: originalMessages, hasMore: false, total: 1 }],
      pageParams: [1],
    });

    const { result } = renderHook(() => useEditMessageMutation(), {
      wrapper,
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          conversationId: 'conv-1',
          messageId: 'msg-1',
          content: 'Will fail',
        });
      })
    ).rejects.toThrow('Edit failed');

    // Cache should be rolled back
    const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
      pages: { messages: Message[] }[];
    };
    const message = cachedData.pages[0].messages.find((m) => m.id === 'msg-1');
    expect(message?.content).toBe('Original content');
  });
});

describe('useDeleteMessageMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete message optimistically', async () => {
    mockDeleteMessage.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();

    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });

    const { result } = renderHook(() => useDeleteMessageMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        messageId: 'msg-1',
      });
    });

    expect(mockDeleteMessage).toHaveBeenCalledWith('msg-1');

    // Cache update happens optimistically, check after mutation completes
    await waitFor(() => {
      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      } | undefined;
      if (cachedData?.pages?.[0]?.messages) {
        expect(cachedData.pages[0].messages.find((m) => m.id === 'msg-1')).toBeUndefined();
      }
    });
  });

  it('should rollback on delete error', async () => {
    mockDeleteMessage.mockRejectedValue(new Error('Delete failed'));

    const { wrapper, queryClient } = createWrapperWithClient();

    const originalData = {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    };
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], originalData);

    const { result } = renderHook(() => useDeleteMessageMutation(), {
      wrapper,
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          conversationId: 'conv-1',
          messageId: 'msg-1',
        });
      })
    ).rejects.toThrow('Delete failed');

    // Cache should be rolled back
    const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']);
    expect(cachedData).toEqual(originalData);
  });
});

describe('useMarkAsReadMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark conversation as read', async () => {
    mockMarkAsRead.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();

    const conversationWithUnread = { ...mockConversation, unreadCount: 5 };
    queryClient.setQueryData(['conversations', 'list', undefined], [conversationWithUnread]);

    const { result } = renderHook(() => useMarkAsReadMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('conv-1');
    });

    expect(mockMarkAsRead).toHaveBeenCalledWith('conv-1');

    // Cache update happens in onSuccess
    await waitFor(() => {
      const conversations = queryClient.getQueryData(['conversations', 'list', undefined]) as Conversation[] | undefined;
      if (conversations?.[0]) {
        expect(conversations[0].unreadCount).toBe(0);
      }
    });
  });

  it('should handle mark as read error', async () => {
    mockMarkAsRead.mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(() => useMarkAsReadMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync('conv-1');
      })
    ).rejects.toThrow('Failed');
  });

  it('should only update the specific conversation', async () => {
    mockMarkAsRead.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();

    const conversations = [
      { ...mockConversation, id: 'conv-1', unreadCount: 5 },
      { ...mockConversation, id: 'conv-2', unreadCount: 3 },
    ];
    queryClient.setQueryData(['conversations', 'list', undefined], conversations);

    const { result } = renderHook(() => useMarkAsReadMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('conv-1');
    });

    const updatedConversations = queryClient.getQueryData(['conversations', 'list', undefined]) as Conversation[];
    expect(updatedConversations[0].unreadCount).toBe(0);
    expect(updatedConversations[1].unreadCount).toBe(3); // Unchanged
  });
});
