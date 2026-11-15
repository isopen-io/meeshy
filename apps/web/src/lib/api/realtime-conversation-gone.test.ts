import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { messagesQueryKey } from './messages';
import { applyConversationGone, conversationGoneOf, leaveThreadOfGoneConversation } from './realtime-conversation-gone';
import type { Conversation } from './types';

/**
 * UNE CONVERSATION FERMÉE OU RENDUE OBSOLÈTE QUITTE L'ÉCRAN (#14645) —
 * `conversation:closed` et `conversation:obsoleted` retirent la ligne, le
 * détail et les messages en cache, et ferment le fil s'il est ouvert.
 */

const conversation = (id: string): Conversation => ({ id, type: 'group', title: id, participants: [] }) as unknown as Conversation;

const clientWith = (ids: readonly string[]) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: ids.map(conversation),
        pagination: { limit: 30, offset: 0, total: ids.length, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
  return queryClient;
};

const listed = (queryClient: QueryClient) =>
  queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages.flatMap((p) => p.conversations.map((c) => c.id));

describe('conversationGoneOf', () => {
  test('lit la conversation nommée par `conversation:closed` comme par `conversation:obsoleted`', () => {
    expect(conversationGoneOf({ conversationId: 'c1', closedBy: 'u1', closedAt: '2026-11-02T10:00:00.000Z' })).toBe('c1');
    expect(conversationGoneOf({ conversationId: 'c1', obsoletedBy: 'u1', obsoletedAt: 'x', purgeAfter: 'y' })).toBe('c1');
  });

  test('fail-closed sur la forme', () => {
    expect(conversationGoneOf(null)).toBeNull();
    expect(conversationGoneOf({})).toBeNull();
    expect(conversationGoneOf({ conversationId: '' })).toBeNull();
    expect(conversationGoneOf({ conversationId: 42 })).toBeNull();
  });
});

describe('applyConversationGone', () => {
  test('la ligne, le détail et les messages partent ; le reste demeure', () => {
    const queryClient = clientWith(['a', 'b', 'c']);
    queryClient.setQueryData(conversationQueryKey('b'), conversation('b'));
    queryClient.setQueryData(messagesQueryKey('b'), { pages: [] });
    queryClient.setQueryData(conversationQueryKey('a'), conversation('a'));

    applyConversationGone(queryClient, 'b');

    expect(listed(queryClient)).toEqual(['a', 'c']);
    expect(queryClient.getQueryData(conversationQueryKey('b'))).toBeUndefined();
    expect(queryClient.getQueryData(messagesQueryKey('b'))).toBeUndefined();
    expect(queryClient.getQueryData(conversationQueryKey('a'))).toBeDefined();
  });

  test('une conversation absente de la liste ne change rien à la liste', () => {
    const queryClient = clientWith(['a']);
    applyConversationGone(queryClient, 'z');
    expect(listed(queryClient)).toEqual(['a']);
  });
});

describe('leaveThreadOfGoneConversation', () => {
  test('le fil ouvert de la conversation partie se referme sur la liste', () => {
    const went: string[] = [];
    leaveThreadOfGoneConversation('b', { pathname: '/c/b', threadPath: (id) => `/c/${id}`, listPath: '/', go: (to) => went.push(to) });
    expect(went).toEqual(['/']);
  });

  test('un autre fil, ou un autre écran, reste ouvert', () => {
    const went: string[] = [];
    leaveThreadOfGoneConversation('b', { pathname: '/c/a', threadPath: (id) => `/c/${id}`, listPath: '/', go: (to) => went.push(to) });
    leaveThreadOfGoneConversation('b', { pathname: '/feed', threadPath: (id) => `/c/${id}`, listPath: '/', go: (to) => went.push(to) });
    expect(went).toEqual([]);
  });
});
