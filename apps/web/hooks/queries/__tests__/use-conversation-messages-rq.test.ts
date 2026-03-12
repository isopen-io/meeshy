/**
 * Tests for useConversationMessagesRQ — B1 dedup changes
 *
 * Verifies:
 * - addMessage uses ID-only dedup (no content matching)
 * - replaceOptimisticMessage performs full replacement by _tempId
 * - replaceOptimisticMessage removes _tempId and _localStatus
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { Message } from '@meeshy/shared/types';

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getMessages: jest.fn().mockResolvedValue({ messages: [], hasMore: false, total: 0 }),
    markAsRead: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { post: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/services/anonymous-chat.service', () => ({
  AnonymousChatService: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { useConversationMessagesRQ } from '../use-conversation-messages-rq';

function makeMessage(overrides: Partial<Message> & { id: string }): Message {
  return {
    conversationId: 'conv-1',
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

function makeOptimistic(content: string, tempId: string) {
  return {
    ...makeMessage({ id: tempId, content }),
    _tempId: tempId,
    _localStatus: 'sending' as const,
  };
}

describe('useConversationMessagesRQ — B1 dedup', () => {
  const currentUser = { id: 'user-1', username: 'test', displayName: 'Test' } as any;

  async function setup(conversationId = 'conv-1') {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const hook = renderHook(
      () => useConversationMessagesRQ(conversationId, currentUser),
      { wrapper }
    );
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return hook;
  }

  describe('addMessage — ID-only dedup', () => {
    it('deduplicates by server ID', async () => {
      const { result } = await setup();

      act(() => { result.current.addMessage(makeMessage({ id: 'msg-1', content: 'Hello' })); });
      await waitFor(() => expect(result.current.messages).toHaveLength(1));

      let added2 = true;
      act(() => { added2 = result.current.addMessage(makeMessage({ id: 'msg-1', content: 'Hello again' })); });
      expect(added2).toBe(false);
      await waitFor(() => expect(result.current.messages).toHaveLength(1));
    });

    it('does NOT false-positive dedup on same content from same sender', async () => {
      const { result } = await setup();

      act(() => { result.current.addOptimisticMessage(makeOptimistic('Hello world', 'temp-1')); });
      await waitFor(() => expect(result.current.messages).toHaveLength(1));

      const serverMsg = makeMessage({ id: 'server-msg-1', content: 'Hello world', senderId: 'user-1' });
      let wasAdded = false;
      act(() => { wasAdded = result.current.addMessage(serverMsg); });

      expect(wasAdded).toBe(true);
      await waitFor(() => expect(result.current.messages).toHaveLength(2));
    });

    it('adds new messages with different IDs', async () => {
      const { result } = await setup();

      act(() => { result.current.addMessage(makeMessage({ id: 'msg-1' })); });
      await waitFor(() => expect(result.current.messages).toHaveLength(1));

      let wasAdded = false;
      act(() => { wasAdded = result.current.addMessage(makeMessage({ id: 'msg-2', content: 'New' })); });
      expect(wasAdded).toBe(true);
      await waitFor(() => expect(result.current.messages).toHaveLength(2));
    });
  });

  describe('replaceOptimisticMessage', () => {
    it('replaces optimistic message by _tempId with full server message', async () => {
      const { result } = await setup();

      act(() => { result.current.addOptimisticMessage(makeOptimistic('Hello', 'temp-abc')); });
      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
        expect((result.current.messages[0] as any)._tempId).toBe('temp-abc');
      });

      const serverMsg = makeMessage({ id: 'server-123', content: 'Hello' });
      act(() => { result.current.replaceOptimisticMessage('temp-abc', serverMsg); });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].id).toBe('server-123');
        expect((result.current.messages[0] as any)._tempId).toBeUndefined();
        expect((result.current.messages[0] as any)._localStatus).toBeUndefined();
      });
    });

    it('does nothing when _tempId not found', async () => {
      const { result } = await setup();

      act(() => { result.current.addMessage(makeMessage({ id: 'msg-1' })); });
      await waitFor(() => expect(result.current.messages).toHaveLength(1));

      act(() => {
        result.current.replaceOptimisticMessage('nonexistent', makeMessage({ id: 'server-x' }));
      });

      // Should not add or remove anything
      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].id).toBe('msg-1');
      });
    });

    it('preserves other messages in cache during replacement', async () => {
      const { result } = await setup();

      act(() => { result.current.addMessage(makeMessage({ id: 'msg-1', content: 'First' })); });
      await waitFor(() => expect(result.current.messages).toHaveLength(1));

      act(() => { result.current.addOptimisticMessage(makeOptimistic('Pending', 'temp-xyz')); });
      await waitFor(() => expect(result.current.messages).toHaveLength(2));

      act(() => { result.current.addMessage(makeMessage({ id: 'msg-3', content: 'Third' })); });
      await waitFor(() => expect(result.current.messages).toHaveLength(3));

      const serverMsg = makeMessage({ id: 'server-456', content: 'Pending' });
      act(() => { result.current.replaceOptimisticMessage('temp-xyz', serverMsg); });

      await waitFor(() => {
        const ids = result.current.messages.map(m => m.id);
        expect(ids).toContain('msg-1');
        expect(ids).toContain('server-456');
        expect(ids).toContain('msg-3');
        expect(ids).not.toContain('temp-xyz');
      });
    });
  });
});
