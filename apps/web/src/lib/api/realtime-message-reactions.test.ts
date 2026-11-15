import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, test } from 'bun:test';

import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { createHttpTransport, type HttpTransport } from './http';
import { loadMessages, messagesQueryKey } from './messages';
import { mineOf, reactionStore, seedMineFromServed } from './reaction-store';
import { performReaction } from './reactions';
import { applyMessageReactionUpdate, isMessageReactionUpdate } from './realtime-message-reactions';
import type { Message } from './types';

/**
 * `reaction:added` / `reaction:removed` (#5863) — la passerelle diffuse à la
 * room de la conversation l'état ABSOLU de l'emoji touché
 * (`ReactionService.createUpdateEvent` → `aggregation: { emoji, count }`) et
 * l'acteur (`userId`, le User.id). Le fil suit sans rechargement ; « ma
 * réaction » ne bascule QUE si l'acteur est le lecteur (un autre de ses
 * appareils).
 */

const VIEWER = 'u-viewer';

beforeEach(() => {
  reactionStore.setState({ mine: {} });
});

const seeded = (messages: readonly Message[], conversationId = 'c-a'): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(messagesQueryKey(conversationId), threadPages(messages));
  return client;
};

const event = (partial: Record<string, unknown> = {}): Record<string, unknown> => ({
  messageId: 'm-1',
  conversationId: 'c-a',
  participantId: 'p-other',
  userId: 'u-other',
  emoji: '🔥',
  action: 'add',
  aggregation: { emoji: '🔥', count: 1, participantIds: ['p-other'] },
  timestamp: '2026-09-25T10:00:00.000Z',
  ...partial,
});

const apply = (client: QueryClient, payload: Record<string, unknown>): void => {
  if (!isMessageReactionUpdate(payload)) throw new Error('charge invalide');
  applyMessageReactionUpdate(client, payload, VIEWER);
};

const rowOf = (client: QueryClient, id = 'm-1', conversationId = 'c-a'): Message | undefined =>
  threadOf(client, conversationId)?.messages.find((m) => m.id === id);

describe('isMessageReactionUpdate — garde de forme, fail-closed', () => {
  test('la charge servie passe', () => {
    expect(isMessageReactionUpdate(event())).toBe(true);
  });

  test('une charge sans message, sans conversation, sans compte fini ou au compte d’un AUTRE emoji est rejetée', () => {
    expect(isMessageReactionUpdate(event({ messageId: undefined }))).toBe(false);
    expect(isMessageReactionUpdate(event({ conversationId: 7 }))).toBe(false);
    expect(isMessageReactionUpdate(event({ action: 'toggle' }))).toBe(false);
    expect(isMessageReactionUpdate(event({ aggregation: { emoji: '🔥', count: Number.NaN } }))).toBe(false);
    expect(isMessageReactionUpdate(event({ aggregation: { emoji: '🔥', count: -1 } }))).toBe(false);
    expect(isMessageReactionUpdate(event({ aggregation: { emoji: '😍', count: 3 } }))).toBe(false);
    expect(isMessageReactionUpdate(null)).toBe(false);
  });
});

describe('applyMessageReactionUpdate — le compte ABSOLU se pose sur le message ciblé', () => {
  test('la réaction d’un AUTRE participant apparaît sans action locale ; le voisin garde sa référence', () => {
    const neighbour = localMessage({ id: 'm-2' });
    const client = seeded([localMessage({ id: 'm-1', reactionSummary: { '😍': 2 } }), neighbour]);

    apply(client, event({ aggregation: { emoji: '🔥', count: 1, participantIds: ['p-other'] } }));

    expect(rowOf(client)?.reactionSummary).toEqual({ '😍': 2, '🔥': 1 });
    expect(rowOf(client, 'm-2')).toBe(neighbour);
  });

  test('un retrait qui ramène le compte à zéro retire la clé', () => {
    const client = seeded([localMessage({ id: 'm-1', reactionSummary: { '🔥': 1, '😍': 1 } })]);

    apply(client, event({ action: 'remove', aggregation: { emoji: '🔥', count: 0, participantIds: [] } }));

    expect(rowOf(client)?.reactionSummary).toEqual({ '😍': 1 });
  });

  test('la réaction d’un AUTRE ne remplit jamais « ma réaction »', () => {
    const client = seeded([localMessage({ id: 'm-1' })]);

    apply(client, event());

    expect(mineOf('m-1')).toEqual([]);
  });

  test('ma PROPRE réaction, venue d’un autre de mes appareils, pose ET retire « ma réaction »', () => {
    const client = seeded([localMessage({ id: 'm-1' })]);

    apply(client, event({ userId: VIEWER }));
    expect(mineOf('m-1')).toEqual(['🔥']);

    apply(client, event({ userId: VIEWER, action: 'remove', aggregation: { emoji: '🔥', count: 0, participantIds: [] } }));
    expect(mineOf('m-1')).toEqual([]);
  });

  test('l’écho de MA réaction optimiste ne double-compte pas', async () => {
    const client = seeded([localMessage({ id: 'm-1' })]);
    await performReaction({
      conversationId: 'c-a',
      messageId: 'm-1',
      emoji: '🔥',
      deps: {
        queryClient: client,
        source: 'gateway',
        transport: { request: async () => ({ ok: true, status: 201, data: {} }) } as unknown as HttpTransport,
      },
    });
    expect(rowOf(client)?.reactionSummary).toEqual({ '🔥': 1 });

    apply(client, event({ userId: VIEWER, participantId: 'p-viewer', aggregation: { emoji: '🔥', count: 1, participantIds: ['p-viewer'] } }));

    expect(rowOf(client)?.reactionSummary).toEqual({ '🔥': 1 });
    expect(mineOf('m-1')).toEqual(['🔥']);
  });

  test('un écho rejoué (double livraison) ne change rien — même référence', () => {
    const client = seeded([localMessage({ id: 'm-1', reactionSummary: { '🔥': 1 } })]);
    const before = rowOf(client);

    apply(client, event());

    expect(rowOf(client)).toBe(before);
  });
});

describe('applyMessageReactionUpdate — aucune fuite inter-conversation', () => {
  test('un événement qui nomme une AUTRE conversation ne touche pas le message de même id ailleurs', () => {
    const client = seeded([localMessage({ id: 'm-1', conversationId: 'c-a' })], 'c-a');

    apply(client, event({ conversationId: 'c-b' }));

    expect(rowOf(client)?.reactionSummary).toBeUndefined();
  });

  test('un message rangé sous la bonne clé mais qui se DIT d’une autre conversation n’est pas touché', () => {
    const client = seeded([localMessage({ id: 'm-1', conversationId: 'c-z' })], 'c-a');

    apply(client, event({ userId: VIEWER }));

    expect(rowOf(client)?.reactionSummary).toBeUndefined();
    expect(mineOf('m-1')).toEqual([]);
  });

  test('fil fermé : rien n’est fabriqué, « ma réaction » ne bouge pas', () => {
    const client = new QueryClient();

    apply(client, event({ userId: VIEWER }));

    expect(threadOf(client, 'c-a')).toBeUndefined();
    expect(mineOf('m-1')).toEqual([]);
  });
});

describe('seedMineFromServed — « ma réaction » juste dès le chargement du fil', () => {
  test('le `currentUserReactions` servi par la page peuple le magasin', () => {
    seedMineFromServed([
      { id: 'm-1', currentUserReactions: ['🔥', '😍'] },
      { id: 'm-2', currentUserReactions: [] },
    ]);

    expect(mineOf('m-1')).toEqual(['🔥', '😍']);
    expect(mineOf('m-2')).toEqual([]);
  });

  test('le serveur fait foi : une réaction retirée ailleurs quitte le magasin', () => {
    reactionStore.getState().add('m-1', '🔥');

    seedMineFromServed([{ id: 'm-1', currentUserReactions: [] }]);

    expect(mineOf('m-1')).toEqual([]);
  });

  test('une passerelle qui ne sert pas le champ ne vide rien (clé absente ≠ aucune réaction)', () => {
    reactionStore.getState().add('m-1', '🔥');

    seedMineFromServed([{ id: 'm-1' }]);

    expect(mineOf('m-1')).toEqual(['🔥']);
  });

  test('une page qui ne change rien ne réécrit pas le magasin (aucun rendu provoqué)', () => {
    seedMineFromServed([{ id: 'm-1', currentUserReactions: ['🔥'] }]);
    const before = reactionStore.getState().mine;

    seedMineFromServed([{ id: 'm-1', currentUserReactions: ['🔥'] }]);

    expect(reactionStore.getState().mine).toBe(before);
  });
});

type Call = { readonly url: string };

const gatewayFetch = (routes: Readonly<Record<string, unknown>>, calls: Call[] = []): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push({ url });
    const path = Object.keys(routes).find((key) => url.startsWith(key));
    return path === undefined
      ? new Response(JSON.stringify({ success: false, error: 'introuvable' }), { status: 404 })
      : new Response(JSON.stringify({ success: true, data: routes[path] }), { status: 200 });
  }) as unknown as typeof fetch;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('loadMessages — « ma réaction » juste dès le chargement, lue sur la PAGE (#7936)', () => {
  const pageWith = (messages: readonly unknown[], calls: Call[] = []): HttpTransport =>
    createHttpTransport({
      base: '',
      fetchImpl: gatewayFetch({ '/api/v1/conversations/c-a/messages': messages }, calls),
    });

  test('le `currentUserReactions` servi par la page pose « ma réaction », sans AUCUNE requête de plus', async () => {
    const calls: Call[] = [];
    const transport = pageWith(
      [
        { ...localMessage({ id: 'm-1', reactionSummary: { '👍': 2 } }), currentUserReactions: ['👍'] },
        { ...localMessage({ id: 'm-2', reactionSummary: { '🔥': 1 } }), currentUserReactions: [] },
      ],
      calls,
    );

    const result = await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });
    await settle();

    expect(result.ok).toBe(true);
    expect(mineOf('m-1')).toEqual(['👍']);
    expect(mineOf('m-2')).toEqual([]);
    expect(calls.map((c) => c.url.split('?')[0])).toEqual(['/api/v1/conversations/c-a/messages']);
  });

  test('le serveur fait foi : une réaction retirée ailleurs quitte le magasin', async () => {
    reactionStore.getState().add('m-1', '🔥');
    const transport = pageWith([{ ...localMessage({ id: 'm-1' }), currentUserReactions: [] }]);

    await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });

    expect(mineOf('m-1')).toEqual([]);
  });

  test('un geste local pendant le chargement GAGNE : la page, plus ancienne, ne l’écrase pas', async () => {
    let release: (value: Response) => void = () => undefined;
    const fetchImpl = (() =>
      new Promise<Response>((resolve) => {
        release = resolve;
      })) as unknown as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl });

    const pending = loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });
    await settle();
    reactionStore.getState().add('m-1', '🔥');
    release(
      new Response(
        JSON.stringify({ success: true, data: [{ ...localMessage({ id: 'm-1' }), currentUserReactions: [] }] }),
        { status: 200 },
      ),
    );
    await pending;

    expect(mineOf('m-1')).toEqual(['🔥']);
  });

  test('un message local non confirmé ne reçoit rien de la page', async () => {
    reactionStore.getState().add('local-1', '🔥');
    const transport = pageWith([
      { ...localMessage({ id: 'local-1', clientMessageId: 'local-1' }), currentUserReactions: [] },
    ]);

    await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });

    expect(mineOf('local-1')).toEqual(['🔥']);
  });

  test('une passerelle qui ne sert pas le champ ne vide rien, et ne coûte aucune requête', async () => {
    reactionStore.getState().add('m-1', '👍');
    const calls: Call[] = [];
    const transport = pageWith([localMessage({ id: 'm-1', reactionSummary: { '👍': 1 } })], calls);

    await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });
    await settle();

    expect(mineOf('m-1')).toEqual(['👍']);
    expect(calls).toHaveLength(1);
  });
});
