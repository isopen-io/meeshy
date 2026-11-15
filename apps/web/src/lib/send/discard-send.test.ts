import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { createHttpTransport } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Conversation, Message } from '@/lib/api/types';
import { localMessage, threadPages } from '@/test-support/thread-cache';

import { discardSend } from './discard-send';
import { createOutboxStore, entriesOf } from './outbox-store';
import { performSend, type SendDeps } from './perform-send';

/**
 * #12632 — ABANDONNER UN ENVOI EN ÉCHEC LE RETIRE DE TOUTE L'INTERFACE. À
 * l'envoi, `performSend` offre l'optimiste à la ligne de liste
 * (`offerLastMessage`) : sans le défaire, la liste disait « Vous : … » d'un
 * message que ni le fil ni le serveur n'ont. Le message qui le précède reprend
 * la ligne ET son rang ; aucun survivant ⇒ la ligne ne décrit plus rien.
 */

const AT = Date.parse('2026-09-09T10:00:00.000Z');

const earlier: Message = localMessage({
  id: 'm-earlier',
  senderId: 'u-other',
  content: 'à demain',
  createdAt: new Date('2026-09-09T09:00:00.000Z'),
  timestamp: new Date('2026-09-09T09:00:00.000Z'),
});

const row = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c-a',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

function clientWith(thread: readonly Message[]): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), threadPages(thread));
  const last = thread.at(-1);
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [row(last === undefined ? {} : { lastMessage: last, lastMessageAt: last.createdAt, lastMessageOriginalLanguage: last.originalLanguage })],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
  return queryClient;
}

const rowOf = (queryClient: QueryClient): Conversation | undefined =>
  queryClient
    .getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(CONVERSATIONS_QUERY_KEY)
    ?.pages.flatMap((p) => p.conversations)
    .find((c) => c.id === 'c-a');

function depsOf(queryClient: QueryClient, response: { readonly status: number } | 'offline', at = AT): SendDeps {
  const fetchImpl = (async () =>
    response === 'offline' ? new Response(null, { status: 200 }) : new Response(JSON.stringify({ success: false, error: 'x' }), { status: response.status })) as unknown as typeof fetch;
  return {
    source: 'gateway',
    transport: createHttpTransport({ base: '', fetchImpl }),
    queryClient,
    outbox: createOutboxStore(),
    online: response !== 'offline',
    now: () => at,
  };
}

async function failedSend(deps: SendDeps, content = 'On se voit demain ?'): Promise<string> {
  await performSend({ conversationId: 'c-a', draft: { content, originalLanguage: 'fr' }, viewerId: 'u-viewer', deps });
  const entry = entriesOf(deps.outbox.getState(), 'c-a').at(-1);
  if (entry === undefined) throw new Error('aucune entrée posée');
  return entry.message.clientMessageId;
}

describe('discardSend', () => {
  test('la ligne de liste rend sa place et son rang au message qui précède', async () => {
    const queryClient = clientWith([earlier]);
    const deps = depsOf(queryClient, { status: 403 });
    const cid = await failedSend(deps);
    expect(rowOf(queryClient)?.lastMessage?.id).toBe(cid);

    expect(discardSend({ conversationId: 'c-a', clientMessageId: cid, deps })).not.toBeNull();

    expect(entriesOf(deps.outbox.getState(), 'c-a')).toEqual([]);
    expect(rowOf(queryClient)?.lastMessage?.id).toBe('m-earlier');
    expect(new Date(rowOf(queryClient)?.lastMessageAt as unknown as string).getTime()).toBe(earlier.createdAt.getTime());
  });

  test('aucun survivant : la ligne ne décrit plus l’envoi abandonné', async () => {
    const queryClient = clientWith([]);
    const deps = depsOf(queryClient, 'offline');
    const cid = await failedSend(deps);

    discardSend({ conversationId: 'c-a', clientMessageId: cid, deps });

    expect(rowOf(queryClient)?.lastMessage ?? undefined).toBeUndefined();
    expect(rowOf(queryClient)?.lastMessageAt ?? undefined).toBeUndefined();
  });

  test('un autre envoi resté dans l’outbox, plus récent, reprend la ligne', async () => {
    const queryClient = clientWith([earlier]);
    const deps = depsOf(queryClient, 'offline');
    const first = await failedSend(deps, 'premier');
    const second = await failedSend({ ...deps, now: () => AT + 1000 }, 'second');

    discardSend({ conversationId: 'c-a', clientMessageId: second, deps });

    expect(rowOf(queryClient)?.lastMessage?.id).toBe(first);
  });

  test('abandonner un envoi plus ancien ne touche pas la ligne qui décrit le plus récent', async () => {
    const queryClient = clientWith([earlier]);
    const deps = depsOf(queryClient, 'offline');
    const first = await failedSend(deps, 'premier');
    const second = await failedSend({ ...deps, now: () => AT + 1000 }, 'second');

    discardSend({ conversationId: 'c-a', clientMessageId: first, deps });

    expect(rowOf(queryClient)?.lastMessage?.id).toBe(second);
  });

  test('un envoi encore en vol ne s’abandonne pas', async () => {
    const queryClient = clientWith([earlier]);
    const deps = depsOf(queryClient, 'offline');
    const cid = await failedSend(deps);
    deps.outbox.getState().markPending('c-a', cid, AT);

    expect(discardSend({ conversationId: 'c-a', clientMessageId: cid, deps })).toBeNull();
    expect(entriesOf(deps.outbox.getState(), 'c-a')).toHaveLength(1);
    expect(rowOf(queryClient)?.lastMessage?.id).toBe(cid);
  });

  test('l’issue dit si le serveur a pu recevoir l’envoi malgré l’échec', async () => {
    const cases = [
      { response: 'offline' as const, uncertain: false },
      { response: { status: 403 }, uncertain: false },
      { response: { status: 429 }, uncertain: false },
      { response: { status: 504 }, uncertain: true },
      { response: { status: 500 }, uncertain: true },
    ];
    for (const { response, uncertain } of cases) {
      const deps = depsOf(clientWith([earlier]), response);
      const cid = await failedSend(deps);
      expect({ response, outcome: discardSend({ conversationId: 'c-a', clientMessageId: cid, deps }) }).toEqual({ response, outcome: { uncertain } });
    }
  });

  test('une coupure réseau en cours d’appel est une issue incertaine', async () => {
    const queryClient = clientWith([earlier]);
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const deps: SendDeps = { ...depsOf(queryClient, { status: 200 }), transport: createHttpTransport({ base: '', fetchImpl }) };
    const cid = await failedSend(deps);

    expect(discardSend({ conversationId: 'c-a', clientMessageId: cid, deps })).toEqual({ uncertain: true });
  });
});
