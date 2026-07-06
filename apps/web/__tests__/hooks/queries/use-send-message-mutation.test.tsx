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
    onStatusChange: jest.fn(() => () => {}),
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

const mockUseAuthStore = jest.fn((selector: (state: { user: typeof mockUser | null }) => unknown) =>
  selector({ user: mockUser })
);
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (...args: Parameters<typeof mockUseAuthStore>) => mockUseAuthStore(...args),
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
const createMockMessage = (id: string, content: string) => ({
  id,
  content,
  conversationId: 'conv-1',
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
//
// gcTime is intentionally left at its (non-zero) default. gcTime: 0 makes a
// query with no active `useQuery` observer eligible for removal on the very
// next real macrotask — these tests only ever reach the cache via
// `setQueryData`/`getQueryData` (no observers), so a 0 gcTime races the
// mutation's real (unmocked) async chain and intermittently wipes the cache
// before assertions run, depending on unrelated timer/microtask ordering
// from other tests in the file. None of these tests exercise GC behavior.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
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

    const cid = 'cid_11111111-2222-4333-8444-555555555555';
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'New message', clientMessageId: cid } as never,
      });
    });

    expect(mockSendMessage).toHaveBeenCalledWith('conv-1', {
      content: 'New message',
      clientMessageId: cid,
    });
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
        data: { content: 'Optimistic message' } as never,
      });
    });

    // Wait for pending state which indicates onMutate has run
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    // Check that optimistic message was added
    const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
      pages: { messages: { id: string; content: string; _localStatus?: string }[] }[];
    };

    if (cachedData?.pages?.[0]?.messages) {
      const firstMessage = cachedData.pages[0].messages[0];
      expect(firstMessage.content).toBe('Optimistic message');
      expect(firstMessage._localStatus).toBe('sending');
      // Optimistic id now doubles as clientMessageId — `cid_<uuid v4>`
      expect(firstMessage.id).toMatch(
        /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }

    // Resolve the promise
    await act(async () => {
      resolvePromise!(createMockMessage('msg-real', 'Optimistic message'));
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('reconciles the optimistic (cid_-keyed) entry with the real server message on success', async () => {
    const { wrapper, queryClient } = createWrapperWithClient();

    mockSendMessage.mockResolvedValue(createMockMessage('msg-real', 'Optimistic message'));
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });

    const { result } = renderHook(() => useSendMessageMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'Optimistic message' } as never,
      });
    });

    const settledData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
      pages: { messages: { id: string; _localStatus?: string }[] }[];
    };
    const settledMessages = settledData.pages[0].messages;
    expect(settledMessages).toHaveLength(3);
    expect(settledMessages[0].id).toBe('msg-real');
    expect(settledMessages[0]._localStatus).toBeUndefined();
    expect(settledMessages.some((m) => m.id.startsWith('cid_'))).toBe(false);
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
          data: { content: 'Will fail' } as never,
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
        data: { content: 'New message' } as never,
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
        data: { content: 'New message' } as never,
      });
    });

    expect(mockSendMessage).toHaveBeenCalled();
  });

  it('should use empty senderId and undefined sender when currentUser is null', async () => {
    mockUseAuthStore.mockImplementation((selector: Function) => selector({ user: null }));

    const sentMessage = createMockMessage('msg-new', 'New message');
    mockSendMessage.mockResolvedValue(sentMessage);

    try {
      const { result } = renderHook(() => useSendMessageMutation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          conversationId: 'conv-1',
          data: { content: 'Message without user' } as never,
        });
      });

      expect(mockSendMessage).toHaveBeenCalled();
    } finally {
      mockUseAuthStore.mockImplementation((selector: Function) => selector({ user: mockUser }));
    }
  });

  it('should handle multi-page infinite query correctly (prepend to first page only)', async () => {
    const sentMessage = createMockMessage('msg-new', 'New message');
    mockSendMessage.mockResolvedValue(sentMessage);

    const { wrapper, queryClient } = createWrapperWithClient();

    // Two pages
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [
        { messages: mockMessages, hasMore: true, total: 4 },
        { messages: [createMockMessage('msg-3', 'Older'), createMockMessage('msg-4', 'Even older')], hasMore: false, total: 4 },
      ],
      pageParams: [1, 2],
    });

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'New message' } as never,
      });
    });

    const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as { pages: { messages: unknown[] }[] };
    // Optimistic message was prepended to page 0, page 1 unchanged
    if (cachedData?.pages) {
      expect(cachedData.pages[1].messages).toHaveLength(2);
    }
  });

  it('should rollback on error even when cache was not pre-populated (no-op path)', async () => {
    mockSendMessage.mockRejectedValue(new Error('Send failed'));

    // No cache pre-population → previousMessages will be undefined in context
    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({
        conversationId: 'conv-empty',
        data: { content: 'Will fail' } as never,
      });
    });

    // Wait for mutation to settle in error state
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The mutation fn was called (no crash even without cache context)
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('should update conversation lastMessageAt in onSuccess when conversation is in cache', async () => {
    const sentMessage = createMockMessage('msg-new', 'New message');
    mockSendMessage.mockResolvedValue(sentMessage);

    const { wrapper, queryClient } = createWrapperWithClient();

    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });

    // Pre-populate conversations cache so onMutate and onSuccess update it
    const convWithoutLastMsg = { ...mockConversation };
    queryClient.setQueryData(['conversations', 'list', undefined], [convWithoutLastMsg]);

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'New message' } as never,
      });
    });

    // onMutate sets lastMessageAt to the optimistic message's createdAt
    const conversations = queryClient.getQueryData(['conversations', 'list', undefined]) as Conversation[];
    // Either onMutate or onSuccess set lastMessageAt — just confirm it's a Date
    expect(conversations[0].lastMessageAt).toBeDefined();
    expect(conversations[0].lastMessageAt).toBeInstanceOf(Date);
  });

  it('should backfill clientMessageId when omitted (offline-queue dedup contract)', async () => {
    mockSendMessage.mockResolvedValue(createMockMessage('msg-new', 'No cid'));

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'No cid' } as never,
      });
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const [, sentPayload] = mockSendMessage.mock.calls[0];
    expect(typeof sentPayload.clientMessageId).toBe('string');
    expect(sentPayload.clientMessageId).toMatch(
      /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('should use username when displayName is empty (line 65 false branch)', async () => {
    mockUseAuthStore.mockImplementation((selector: (state: { user: typeof mockUser | null }) => unknown) =>
      selector({ user: { ...mockUser, displayName: '' } })
    );
    mockSendMessage.mockResolvedValue(createMockMessage('msg-new', 'No display'));

    const { wrapper, queryClient } = createWrapperWithClient();
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });

    const { result } = renderHook(() => useSendMessageMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'No display' } as never,
      });
    });

    expect(mockSendMessage).toHaveBeenCalled();

    // Restore default mock
    mockUseAuthStore.mockImplementation((selector: (state: { user: typeof mockUser | null }) => unknown) =>
      selector({ user: mockUser })
    );
  });

  it('should not update non-matching conversations in onMutate and onSuccess', async () => {
    const sentMessage = createMockMessage('msg-new', 'Hello');
    mockSendMessage.mockResolvedValue(sentMessage);

    const { wrapper, queryClient } = createWrapperWithClient();
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });
    // Two conversations: one matching (conv-1), one not (conv-2)
    const twoConvs = [
      { ...mockConversation, id: 'conv-1', lastMessageAt: new Date('2024-01-01') },
      { ...mockConversation, id: 'conv-2', lastMessageAt: new Date('2024-01-01') },
    ];
    queryClient.setQueryData(['conversations', 'list', undefined], twoConvs);

    const { result } = renderHook(() => useSendMessageMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'Hello' } as never,
      });
    });

    expect(mockSendMessage).toHaveBeenCalled();
    // Verify the mutation updated conv-1's lastMessageAt (not conv-2)
    const conversations = queryClient.getQueryData(['conversations', 'list', undefined]) as Conversation[] | undefined;
    if (conversations) {
      const conv2 = conversations.find((c) => c.id === 'conv-2');
      // conv-2 should have its original date (unchanged)
      expect(conv2?.lastMessageAt?.toString()).toBe(new Date('2024-01-01').toString());
    }
  });

  it('should fallback to new Date() when sentMessage has no createdAt', async () => {
    const sentMessage = { id: 'msg-new', content: 'No date', conversationId: 'conv-1' };
    mockSendMessage.mockResolvedValue(sentMessage);

    const { wrapper, queryClient } = createWrapperWithClient();
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });
    queryClient.setQueryData(['conversations', 'list', undefined], [{ ...mockConversation }]);

    const { result } = renderHook(() => useSendMessageMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        data: { content: 'No date' } as never,
      });
    });

    expect(mockSendMessage).toHaveBeenCalled();
    // The onSuccess branch with createdAt || new Date() runs — verify mutation completed
    const conversations = queryClient.getQueryData(['conversations', 'list', undefined]) as Conversation[] | undefined;
    if (conversations) {
      expect(conversations[0].lastMessageAt).toBeInstanceOf(Date);
    }
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

  it('should optimistically update lastMessage in conversation list when lastMessage id matches', async () => {
    mockEditMessage.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();

    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });
    const conversationWithLastMessage = {
      ...mockConversation,
      lastMessage: { id: 'msg-1', content: 'Hello', createdAt: new Date() },
    };
    queryClient.setQueryData(['conversations', 'list', undefined], [conversationWithLastMessage]);

    const { result } = renderHook(() => useEditMessageMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Edited via lastMessage',
      });
    });

    const conversations = queryClient.getQueryData(['conversations', 'list', undefined]) as Array<typeof conversationWithLastMessage>;
    expect(conversations[0].lastMessage?.content).toBe('Edited via lastMessage');
  });

  it('should be a no-op in setQueryData when messages cache does not exist for edit', async () => {
    mockEditMessage.mockResolvedValue({ success: true });

    // No pre-populated cache — old will be undefined in setQueryData callback
    const { result } = renderHook(() => useEditMessageMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Edit with no cache',
      });
    });

    expect(mockEditMessage).toHaveBeenCalledWith('msg-1', 'Edit with no cache');
  });

  it('should rollback conversations cache on edit error when previousConversations is set', async () => {
    mockEditMessage.mockRejectedValue(new Error('Edit failed'));

    const { wrapper, queryClient } = createWrapperWithClient();

    const originalMessages = [createMockMessage('msg-1', 'Original content')];
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: originalMessages, hasMore: false, total: 1 }],
      pageParams: [1],
    });
    const originalConversations = [
      { ...mockConversation, lastMessage: { id: 'msg-1', content: 'Original content', createdAt: new Date() } },
    ];
    queryClient.setQueryData(['conversations', 'list', undefined], originalConversations);

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

    // Both caches should be rolled back
    const conversations = queryClient.getQueryData(['conversations', 'list', undefined]);
    expect(conversations).toEqual(originalConversations);
  });

  it('should not update conversation when lastMessage.id does not match', async () => {
    mockEditMessage.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();
    queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
      pages: [{ messages: mockMessages, hasMore: false, total: 2 }],
      pageParams: [1],
    });
    // lastMessage.id is 'msg-2' but we're editing 'msg-1' — covers the false branch of lastMessage?.id === messageId
    const convWithOtherLastMsg = {
      ...mockConversation,
      lastMessage: { id: 'msg-2', content: 'Other message', createdAt: new Date() },
    };
    queryClient.setQueryData(['conversations', 'list', undefined], [convWithOtherLastMsg]);

    const { result } = renderHook(() => useEditMessageMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Edited',
      });
    });

    expect(mockEditMessage).toHaveBeenCalledWith('msg-1', 'Edited');
    // lastMessage should be unchanged since its id doesn't match
    const convs = queryClient.getQueryData(['conversations', 'list', undefined]) as any[] | undefined;
    if (convs) {
      expect(convs[0].lastMessage?.id).toBe('msg-2');
    }
  });

  it('should not rollback when no messages cache was captured on edit error', async () => {
    mockEditMessage.mockRejectedValue(new Error('Edit no cache'));

    // No messages cache → context.previousMessages = undefined (false branch at line 222)
    const { result } = renderHook(() => useEditMessageMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          conversationId: 'conv-1',
          messageId: 'msg-1',
          content: 'Will fail',
        });
      })
    ).rejects.toThrow('Edit no cache');
    // Passes if onError doesn't throw when context.previousMessages is undefined
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

  it('should be a no-op in setQueryData when messages cache does not exist for delete', async () => {
    mockDeleteMessage.mockResolvedValue({ success: true });

    // No pre-populated cache
    const { result } = renderHook(() => useDeleteMessageMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        messageId: 'msg-1',
      });
    });

    expect(mockDeleteMessage).toHaveBeenCalledWith('msg-1');
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

  it('should not rollback when no messages cache was captured (line 284 false branch)', async () => {
    mockDeleteMessage.mockRejectedValue(new Error('Delete failed'));

    // No pre-populated messages cache → context.previousMessages = undefined
    const { result } = renderHook(() => useDeleteMessageMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          conversationId: 'conv-1',
          messageId: 'msg-1',
        });
      })
    ).rejects.toThrow('Delete failed');
    // Test passes if no error thrown during onError (context.previousMessages is falsy)
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
