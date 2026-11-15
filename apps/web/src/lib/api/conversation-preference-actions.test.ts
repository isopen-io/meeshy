import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createConversationStore, withPreferenceOverrides } from '@/lib/conversation-store';

import { performPreferenceAction } from './conversation-actions';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import { createHttpTransport } from './http';
import { categoryIdOf, customNameOf, reactionOf } from './preferences';
import type { Conversation } from './types';

/**
 * FAVORI, CATÉGORIE, NOM PERSONNEL — OPTIMISTES ET DÉFAITS SUR REFUS (#10593).
 * Même loi que les drapeaux (`performRowAction`) : la correction se lit à
 * l'instant du geste, un 2xx la remplace par la valeur servie, un 4xx la
 * retire et le cache reste intact.
 */
const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  }) as Conversation;

function seededClient(conversations: readonly Conversation[]): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations,
        pagination: { limit: 30, offset: 0, total: conversations.length, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
  return queryClient;
}

type Sent = { readonly method: string; readonly url: string; readonly body: unknown };

function recordingTransport(response: { readonly status: number; readonly body?: unknown }) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ method: init?.method ?? 'GET', url: String(input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  return { sent, transport: createHttpTransport({ base: '', fetchImpl }) };
}

const effective = (queryClient: QueryClient, overrides: ReturnType<ReturnType<typeof createConversationStore>['getState']>['overrides']) => {
  const cached = findCachedConversation(queryClient, 'c1');
  return cached === undefined ? undefined : withPreferenceOverrides([cached], overrides)[0];
};

describe('performPreferenceAction', () => {
  test('le favori se lit à l’instant du geste, part en PUT partiel, et le cache prend la valeur servie', async () => {
    const queryClient = seededClient([conversation({ userPreferences: [{ isPinned: true }] })]);
    queryClient.setQueryData(conversationQueryKey('c1'), conversation({ userPreferences: [{ isPinned: true }] }));
    const store = createConversationStore();
    const { sent, transport } = recordingTransport({ status: 200, body: { success: true, data: { isPinned: true, reaction: '🔥' } } });

    const pending = performPreferenceAction({ conversationId: 'c1', patch: { reaction: '🔥' }, deps: { source: 'gateway', transport, store, queryClient } });
    const optimistic = effective(queryClient, store.getState().overrides);
    expect(optimistic === undefined ? undefined : reactionOf(optimistic)).toBe('🔥');
    await pending;

    expect(sent).toEqual([{ method: 'PUT', url: '/api/v1/user-preferences/conversations/c1', body: { reaction: '🔥' } }]);
    expect(store.getState().overrides['c1']).toBeUndefined();
    const cached = findCachedConversation(queryClient, 'c1');
    expect(cached === undefined ? undefined : reactionOf(cached)).toBe('🔥');
    const detail = queryClient.getQueryData<Conversation>(conversationQueryKey('c1'));
    expect(detail === undefined ? undefined : reactionOf(detail)).toBe('🔥');
  });

  test('un refus (4xx) défait la correction : la catégorie d’avant revient, le cache est intact', async () => {
    const queryClient = seededClient([conversation({ userPreferences: [{ categoryId: 'cat-a' }] })]);
    const store = createConversationStore();
    const { transport } = recordingTransport({ status: 404, body: { success: false, error: 'Category not found' } });

    const pending = performPreferenceAction({ conversationId: 'c1', patch: { categoryId: 'cat-b' }, deps: { source: 'gateway', transport, store, queryClient } });
    const optimistic = effective(queryClient, store.getState().overrides);
    expect(optimistic === undefined ? undefined : categoryIdOf(optimistic)).toBe('cat-b');
    await pending;

    const after = effective(queryClient, store.getState().overrides);
    expect(after === undefined ? undefined : categoryIdOf(after)).toBe('cat-a');
    expect(store.getState().overrides['c1']).toBeUndefined();
  });

  test('renommer à vide rend le nom d’origine : `customName: null` part sur le fil', async () => {
    const queryClient = seededClient([conversation({ title: 'Équipe', userPreferences: [{ customName: 'Les copains' }] })]);
    const store = createConversationStore();
    const { sent, transport } = recordingTransport({ status: 200, body: { success: true, data: { customName: null } } });

    await performPreferenceAction({ conversationId: 'c1', patch: { customName: null }, deps: { source: 'gateway', transport, store, queryClient } });

    expect(sent.map((s) => s.body)).toEqual([{ customName: null }]);
    const cached = findCachedConversation(queryClient, 'c1');
    expect(cached === undefined ? 'absent' : customNameOf(cached)).toBeUndefined();
  });

  test('en source fixtures, la correction reste et rien ne part', async () => {
    const queryClient = seededClient([conversation({})]);
    const store = createConversationStore();
    const { sent, transport } = recordingTransport({ status: 200 });

    await performPreferenceAction({ conversationId: 'c1', patch: { reaction: '✨' }, deps: { source: 'fixtures', transport, store, queryClient } });

    expect(sent).toEqual([]);
    const after = effective(queryClient, store.getState().overrides);
    expect(after === undefined ? undefined : reactionOf(after)).toBe('✨');
  });
});
