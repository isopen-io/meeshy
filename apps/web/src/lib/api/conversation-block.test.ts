import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createConversationStore, effectiveFlagsOf } from '@/lib/conversation-store';

import { BLOCKED_USERS_QUERY_KEY, flattenBlockedUsers, type BlockedData } from './blocks';
import { blockTargetOf, performConversationBlock } from './conversation-block';
import { CONVERSATIONS_QUERY_KEY, findCachedConversation } from './conversations';
import { createHttpTransport } from './http';
import type { Conversation } from './types';

/**
 * BLOQUER DEPUIS LA LIGNE D'UN DIRECT (#10593) — comme iOS
 * (`ConversationListView.swift:1149`) : bloquer le pair PUIS archiver la
 * conversation. Les deux gestes s'appliquent à l'instant ; si le blocage est
 * refusé, l'archive se défait avec lui. Débloquer ne touche pas à l'archive.
 */
const VIEWER = 'u-me';

const direct = (partial: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [
      { id: 'p-me', userId: VIEWER, displayName: 'Moi', user: { id: VIEWER, username: 'moi' } },
      { id: 'p-amina', userId: 'u-amina', displayName: 'Amina', avatar: 'https://cdn/amina.png', user: { id: 'u-amina', username: 'amina' } },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    userPreferences: [{ isArchived: false }],
    ...partial,
  }) as Conversation;

function seededClient(conversations: readonly Conversation[]): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations, pagination: { limit: 30, offset: 0, total: conversations.length, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  return queryClient;
}

/** Une passerelle qui répond selon la route : le blocage d'un côté, les préférences de l'autre. */
function gateway(statusFor: (method: string, url: string) => number) {
  const sent: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input);
    sent.push(`${method} ${url}`);
    const status = statusFor(method, url);
    const echoed: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    const body = status < 300 ? { success: true, data: url.includes('user-preferences') ? echoed : null } : { success: false, error: 'refus' };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { sent, transport: createHttpTransport({ base: '', fetchImpl }) };
}

const blockedIds = (queryClient: QueryClient): readonly string[] =>
  flattenBlockedUsers(queryClient.getQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY)).map((p) => p.id);

describe('blockTargetOf', () => {
  test('le pair d’un direct qui a un compte ; rien pour un groupe ou un invité', () => {
    expect(blockTargetOf(direct(), VIEWER)).toEqual({ id: 'u-amina', username: 'amina', displayName: 'Amina', avatar: 'https://cdn/amina.png' });
    expect(blockTargetOf(direct({ type: 'group' }), VIEWER)).toBeUndefined();
    expect(blockTargetOf(direct({ participants: [{ id: 'p-me', userId: VIEWER }, { id: 'p-anon', displayName: 'Invité' }] as unknown as Conversation['participants'] }), VIEWER)).toBeUndefined();
  });
});

describe('performConversationBlock', () => {
  test('bloquer : le pair rejoint les bloqués ET la conversation les archives, à l’instant', async () => {
    const c = direct();
    const queryClient = seededClient([c]);
    const store = createConversationStore();
    const { sent, transport } = gateway(() => 200);
    const deps = { source: 'gateway' as const, transport, store, queryClient, isOnline: () => true, viewerId: () => VIEWER };

    const pending = performConversationBlock({ conversation: c, viewerId: VIEWER, intent: 'block', deps });
    expect(blockedIds(queryClient)).toEqual(['u-amina']);
    expect(effectiveFlagsOf(c, store.getState().overrides).isArchived).toBe(true);
    expect(await pending).toBe('done');

    expect(sent.sort()).toEqual(['PUT /api/v1/directory/blocks/u-amina', 'PUT /api/v1/user-preferences/conversations/c1']);
    const cached = findCachedConversation(queryClient, 'c1');
    expect(cached === undefined ? false : effectiveFlagsOf(cached, store.getState().overrides).isArchived).toBe(true);
  });

  test('un blocage refusé défait les deux gestes : ni bloqué, ni archivé', async () => {
    const c = direct();
    const queryClient = seededClient([c]);
    const store = createConversationStore();
    const { transport } = gateway((_, url) => (url.includes('/blocks/') ? 403 : 200));
    const deps = { source: 'gateway' as const, transport, store, queryClient, isOnline: () => true, viewerId: () => VIEWER };

    expect(await performConversationBlock({ conversation: c, viewerId: VIEWER, intent: 'block', deps })).toBe('failed');

    expect(blockedIds(queryClient)).toEqual([]);
    const cached = findCachedConversation(queryClient, 'c1');
    expect(cached === undefined ? true : effectiveFlagsOf(cached, store.getState().overrides).isArchived).toBe(false);
  });

  test('hors ligne, rien ne part et rien ne bouge', async () => {
    const c = direct();
    const queryClient = seededClient([c]);
    const store = createConversationStore();
    const { sent, transport } = gateway(() => 200);
    const deps = { source: 'gateway' as const, transport, store, queryClient, isOnline: () => false, viewerId: () => VIEWER };

    expect(await performConversationBlock({ conversation: c, viewerId: VIEWER, intent: 'block', deps })).toBe('offline');
    expect(sent).toEqual([]);
    expect(effectiveFlagsOf(c, store.getState().overrides).isArchived).toBe(false);
  });

  test('débloquer : le pair quitte les bloqués, l’archive reste où elle est', async () => {
    const c = direct({ userPreferences: [{ isArchived: true }] });
    const queryClient = seededClient([c]);
    queryClient.setQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY, {
      pages: [{ users: [{ id: 'u-amina', username: 'amina', displayName: 'Amina', avatar: null }], nextCursor: null }],
      pageParams: [null],
    });
    const store = createConversationStore();
    const { sent, transport } = gateway(() => 200);
    const deps = { source: 'gateway' as const, transport, store, queryClient, isOnline: () => true, viewerId: () => VIEWER };

    expect(await performConversationBlock({ conversation: c, viewerId: VIEWER, intent: 'unblock', deps })).toBe('done');
    expect(blockedIds(queryClient)).toEqual([]);
    expect(sent).toEqual(['DELETE /api/v1/directory/blocks/u-amina']);
    expect(effectiveFlagsOf(c, store.getState().overrides).isArchived).toBe(true);
  });
});
