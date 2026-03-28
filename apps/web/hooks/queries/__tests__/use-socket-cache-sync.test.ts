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
    onUnreadUpdated: jest.fn(() => () => {}),
    onTranscription: jest.fn(() => () => {}),
    onAudioTranslation: jest.fn(() => () => {}),
    onParticipantRoleUpdated: jest.fn(() => () => {}),
    onPreferencesUpdated: jest.fn(() => () => {}),
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

  it('replaces optimistic message with server message when content matches', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Seed with an optimistic message (has _tempId, _localStatus: 'sending')
    const optimistic = {
      ...makeMessage({ id: 'temp-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' }),
      _tempId: 'temp-1',
      _localStatus: 'sending',
    };
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [optimistic], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    // Server message with same content from same user (message:new before ACK)
    const serverMsg = makeMessage({ id: 'server-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' });
    act(() => { capturedMessageListener!(serverMsg); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    // Optimistic should be replaced by server message
    expect(cached.pages[0].messages).toHaveLength(1);
    expect(cached.pages[0].messages[0].id).toBe('server-1');
  });

  it('does NOT replace stale optimistic messages older than 30s', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Seed with a stale optimistic message (created 60s ago)
    const staleDate = new Date(Date.now() - 60_000);
    const optimistic = {
      ...makeMessage({ id: 'temp-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' }),
      _tempId: 'temp-1',
      _localStatus: 'sending',
      createdAt: staleDate.toISOString(),
    };
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [optimistic], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    // Server message with same content — should NOT replace stale optimistic
    const serverMsg = makeMessage({ id: 'server-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' });
    act(() => { capturedMessageListener!(serverMsg); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    // Both messages should exist (no replacement of stale optimistic)
    expect(cached.pages[0].messages).toHaveLength(2);
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
