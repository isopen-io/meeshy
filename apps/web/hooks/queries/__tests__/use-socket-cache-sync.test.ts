/**
 * Tests for useSocketCacheSync — B1 dedup changes
 *
 * Verifies:
 * - ID-only dedup in handleNewMessage (no content-based matching)
 * - No false-positive dedup when content matches but ID differs
 * - Existing server-ID dedup still works
 * - Conversations list is updated on new message
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Message, Conversation } from '@/types';

// Capture the new-message listener registered by the hook
let capturedMessageListener: ((message: Message) => void) | null = null;

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onNewMessage: jest.fn((listener: (msg: Message) => void) => {
      capturedMessageListener = listener;
      return () => { capturedMessageListener = null; };
    }),
    onMessageEdited: jest.fn(() => () => {}),
    onMessageDeleted: jest.fn(() => () => {}),
    onTranslation: jest.fn(() => () => {}),
  },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { post: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'current-user' } }),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@meeshy/shared/utils/sender-identity', () => ({
  getSenderUserId: (sender: any) => sender?.userId ?? sender?.id ?? null,
}));

import { useSocketCacheSync } from '../use-socket-cache-sync';

function makeMessage(overrides: Partial<Message> & { id: string; conversationId: string }): Message {
  return {
    content: 'test message',
    senderId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageType: 'text',
    originalLanguage: 'en',
    timestamp: new Date().toISOString(),
    sender: { id: 'user-1', displayName: 'Test', type: 'registered' },
    ...overrides,
  } as Message;
}

function createTestHarness(conversationId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Seed infinite messages cache
  queryClient.setQueryData(queryKeys.messages.infinite(conversationId), {
    pages: [{ messages: [] as Message[], hasMore: false, total: 0 }],
    pageParams: [1],
  });

  // Seed conversations list cache
  queryClient.setQueryData<Conversation[]>(queryKeys.conversations.list(), [
    { id: conversationId, lastMessage: null, lastMessageAt: null, updatedAt: new Date().toISOString() } as any,
  ]);

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

describe('useSocketCacheSync — B1 ID-only dedup', () => {
  beforeEach(() => {
    capturedMessageListener = null;
    jest.clearAllMocks();
  });

  it('adds new message to cache when ID is unique', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    expect(capturedMessageListener).not.toBeNull();

    const msg = makeMessage({ id: 'server-1', conversationId: 'conv-1' });
    act(() => { capturedMessageListener!(msg); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    expect(cached.pages[0].messages).toHaveLength(1);
    expect(cached.pages[0].messages[0].id).toBe('server-1');
  });

  it('deduplicates by server ID', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Pre-seed with a message
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [makeMessage({ id: 'server-1', conversationId: 'conv-1' })], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    // Try to add same message again
    act(() => { capturedMessageListener!(makeMessage({ id: 'server-1', conversationId: 'conv-1' })); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    expect(cached.pages[0].messages).toHaveLength(1);
  });

  it('does NOT false-positive dedup on same content from same sender with different ID', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Seed with an optimistic message (has _tempId)
    const optimistic = {
      ...makeMessage({ id: 'temp-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'user-1' }),
      _tempId: 'temp-1',
      _localStatus: 'sending',
    };
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [optimistic], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    // Server message with same content but different ID
    const serverMsg = makeMessage({ id: 'server-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'user-1' });
    act(() => { capturedMessageListener!(serverMsg); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    // After B1: no content-based dedup, so both messages should exist
    expect(cached.pages[0].messages).toHaveLength(2);
    expect(cached.pages[0].messages.map((m: any) => m.id)).toContain('server-1');
    expect(cached.pages[0].messages.map((m: any) => m.id)).toContain('temp-1');
  });

  it('moves conversation to top of list on new message', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Add a second conversation
    queryClient.setQueryData<Conversation[]>(queryKeys.conversations.list(), [
      { id: 'conv-2', lastMessage: null, updatedAt: new Date().toISOString() } as any,
      { id: 'conv-1', lastMessage: null, updatedAt: new Date().toISOString() } as any,
    ]);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    const msg = makeMessage({ id: 'server-1', conversationId: 'conv-1' });
    act(() => { capturedMessageListener!(msg); });

    const convs = queryClient.getQueryData<Conversation[]>(queryKeys.conversations.list());
    expect(convs![0].id).toBe('conv-1');
    expect(convs![0].lastMessage).toBeDefined();
  });
});
