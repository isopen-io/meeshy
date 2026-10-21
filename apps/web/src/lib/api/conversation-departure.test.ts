import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { performDeparture } from './conversation-departure';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import type { Conversation } from './types';

/**
 * **QUITTER OU SUPPRIMER UNE CONVERSATION** (#7285, #7837) — la rangée part au
 * geste, la passerelle confirme ; un échec la ramène À SA PLACE, un hors-ligne
 * certain ne la retire même pas.
 */

const conversation = (id: string, type: Conversation['type'] = 'group'): Conversation =>
  ({
    id,
    type,
    title: `Conversation ${id}`,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
  }) as Conversation;

const page = (ids: readonly string[]) => ({
  conversations: ids.map((id) => conversation(id)),
  pagination: { limit: 30, offset: 0, total: ids.length, hasMore: false },
  cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
});

const clientWith = (pages: readonly (readonly string[])[]) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: pages.map(page),
    pageParams: pages.map(() => undefined),
  });
  return queryClient;
};

const listedIds = (queryClient: QueryClient) =>
  queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages.map((p) => p.conversations.map((c) => c.id));

type Reply = ApiResult<unknown> | 'throw';

const transportReplying = (reply: Reply) => {
  const calls: HttpRequest[] = [];
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = {
    request: async (req: HttpRequest) => {
      calls.push(req);
      await gate;
      if (reply === 'throw') throw new Error('réseau coupé');
      return reply;
    },
  } as unknown as HttpTransport;
  return { transport, calls, release: () => release?.() };
};

describe('performDeparture — supprimer pour moi', () => {
  test('la rangée part AU GESTE, avant la réponse, et la passerelle reçoit DELETE …/delete-for-me', async () => {
    const queryClient = clientWith([['a', 'b', 'c']]);
    const { transport, calls, release } = transportReplying({ ok: true, data: { conversationId: 'b' } });

    const outcome = performDeparture({ conversationId: 'b', kind: 'delete', online: true, deps: { source: 'gateway', transport, queryClient } });

    expect(listedIds(queryClient)).toEqual([['a', 'c']]);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/v1/conversations/b/delete-for-me']);
    release();
    expect(await outcome).toBe('departed');
    expect(listedIds(queryClient)).toEqual([['a', 'c']]);
  });

  test('le fil quitté ne garde rien dans le cache de détail', async () => {
    const queryClient = clientWith([['a', 'b']]);
    queryClient.setQueryData(conversationQueryKey('b'), conversation('b'));
    const { transport, release } = transportReplying({ ok: true, data: {} });

    const outcome = performDeparture({ conversationId: 'b', kind: 'delete', online: true, deps: { source: 'gateway', transport, queryClient } });
    release();
    await outcome;

    expect(queryClient.getQueryData(conversationQueryKey('b'))).toBeUndefined();
  });

  test('un refus de la passerelle RAMÈNE la rangée à sa place, sur sa page', async () => {
    const queryClient = clientWith([['a', 'b'], ['c', 'd', 'e']]);
    const { transport, release } = transportReplying({ ok: false, status: 500, error: 'Erreur 500' });

    const outcome = performDeparture({ conversationId: 'd', kind: 'delete', online: true, deps: { source: 'gateway', transport, queryClient } });
    expect(listedIds(queryClient)).toEqual([['a', 'b'], ['c', 'e']]);
    release();

    expect(await outcome).toBe('failed');
    expect(listedIds(queryClient)).toEqual([['a', 'b'], ['c', 'd', 'e']]);
  });

  test('une panne réseau ramène la rangée elle aussi', async () => {
    const queryClient = clientWith([['a', 'b', 'c']]);
    const { transport, release } = transportReplying('throw');

    const outcome = performDeparture({ conversationId: 'a', kind: 'delete', online: true, deps: { source: 'gateway', transport, queryClient } });
    release();

    expect(await outcome).toBe('failed');
    expect(listedIds(queryClient)).toEqual([['a', 'b', 'c']]);
    expect(findCachedConversation(queryClient, 'a')?.title).toBe('Conversation a');
  });

  test('hors ligne certain : rien ne part, rien ne bouge', async () => {
    const queryClient = clientWith([['a', 'b']]);
    const { transport, calls } = transportReplying({ ok: true, data: {} });

    expect(await performDeparture({ conversationId: 'a', kind: 'delete', online: false, deps: { source: 'gateway', transport, queryClient } })).toBe('offline');
    expect(calls).toEqual([]);
    expect(listedIds(queryClient)).toEqual([['a', 'b']]);
  });

  test('« vous ne participez pas » (404) : la conversation est déjà partie, elle ne revient pas', async () => {
    const queryClient = clientWith([['a', 'b']]);
    const { transport, release } = transportReplying({ ok: false, status: 404, error: 'Vous ne participez pas à cette conversation' });

    const outcome = performDeparture({ conversationId: 'a', kind: 'delete', online: true, deps: { source: 'gateway', transport, queryClient } });
    release();

    expect(await outcome).toBe('departed');
    expect(listedIds(queryClient)).toEqual([['b']]);
  });
});

describe('performDeparture — quitter', () => {
  test('quitter un groupe appelle POST …/leave, la route que la passerelle sert', async () => {
    const queryClient = clientWith([['g', 'h']]);
    const { transport, calls, release } = transportReplying({ ok: true, data: { conversationId: 'g' } });

    const outcome = performDeparture({ conversationId: 'g', kind: 'leave', online: true, deps: { source: 'gateway', transport, queryClient } });
    expect(listedIds(queryClient)).toEqual([['h']]);
    release();

    expect(await outcome).toBe('departed');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/v1/conversations/g/leave']);
  });

  test('un fil absent de la liste (ouvert par son adresse) se quitte quand même ; un échec ne fabrique aucune rangée', async () => {
    const queryClient = clientWith([['a']]);
    const { transport, release } = transportReplying({ ok: false, status: 500, error: 'Erreur 500' });

    const outcome = performDeparture({ conversationId: 'z', kind: 'leave', online: true, deps: { source: 'gateway', transport, queryClient } });
    release();

    expect(await outcome).toBe('failed');
    expect(listedIds(queryClient)).toEqual([['a']]);
  });
});
