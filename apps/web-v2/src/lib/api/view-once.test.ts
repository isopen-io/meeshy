import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import { applyConsumption, consumeViewOnce, consumeViewOnceOptimistic } from './view-once';
import { createHttpTransport } from './http';
import { messagesQueryKey } from './messages';
import type { MessagesInfiniteData } from './messages-pages';
import type { Message } from './types';
import type { Transport } from '../net/transport';
import { message } from './fixtures-base';
import {
  PROTECTION_CONVERSATION_ID,
  VIEW_ONCE_OFFLINE_WITNESS_ID,
  messagesOf,
  recordViewOnceConsumption,
  resetViewOnceConsumptionForTests,
} from './fixtures';

/**
 * `consumedViewOnceIds` (`fixtures.ts`) vit pour la durée du PROCESSUS —
 * `bun test` partage le registre de modules entre TOUS les fichiers, pas
 * seulement entre les montages d'une route. Sans ce nettoyage,
 * `fixtures.test.ts` (qui attend `VIEW_ONCE_WITNESS_ID` à `viewOnceCount: 0`)
 * dépendrait de l'ORDRE d'exécution des fichiers — même discipline que
 * `scheme.test.ts` pour un état global comparable.
 */
afterEach(() => {
  resetViewOnceConsumptionForTests();
});

describe('consumeViewOnce — le port serveur (D-10, D-23)', () => {
  test('compose la MÉTHODE, le chemin EXACT de la route POST …/consume, SANS corps', async () => {
    const calls: { readonly method: string; readonly path: string; readonly body?: unknown }[] = [];
    const transport: Transport = async (request) => {
      calls.push(request);
      return { success: true };
    };

    await consumeViewOnce(transport, { conversationId: 'c1', messageId: 'm1' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.path).toBe('/api/v1/conversations/c1/messages/m1/consume');
    expect(calls[0]?.body).toBeUndefined();
  });
});

describe('applyConsumption — le réducteur IMMUABLE', () => {
  test('le message consommé porte le nouveau compte, les autres sont IDENTIQUES par référence', () => {
    const messages = messagesOf('c-deploiement');
    const target = messages[0]!;
    const updated = applyConsumption(messages, { messageId: target.id, viewOnceCount: 1 });

    expect(updated).not.toBe(messages);
    expect(updated.find((m) => m.id === target.id)?.viewOnceCount).toBe(1);
    for (let i = 0; i < messages.length; i += 1) {
      if (messages[i]?.id === target.id) continue;
      expect(updated[i]).toBe(messages[i]);
    }
  });

  test('un id absent du fil ne change rien (toutes les références identiques)', () => {
    const messages = messagesOf('c-deploiement');
    const updated = applyConsumption(messages, { messageId: 'introuvable', viewOnceCount: 3 });
    expect(updated).toEqual(messages);
    for (let i = 0; i < messages.length; i += 1) {
      expect(updated[i]).toBe(messages[i]);
    }
  });
});

describe('recordViewOnceConsumption — la consommation SURVIT au démontage de la route (revue #5676, défaut 7)', () => {
  test('avant tout appel, le témoin part bien de viewOnceCount: 0', () => {
    const before = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === VIEW_ONCE_OFFLINE_WITNESS_ID);
    expect(before?.viewOnceCount).toBe(0);
  });

  test('après record, une SECONDE lecture (nouveau montage simulé) rend viewOnceCount >= maxViewOnceCount', () => {
    recordViewOnceConsumption(VIEW_ONCE_OFFLINE_WITNESS_ID);

    // `messagesOf` REPART du tableau constant à chaque appel — exactement ce
    // qu'un remontage de route fait (`routes/thread.tsx:69`,
    // `useState(() => messagesOf(id))`). Deux appels DISTINCTS, pas une
    // relecture du même tableau : c'est ce que la route rejoue en quittant
    // le fil puis en y revenant.
    const first = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === VIEW_ONCE_OFFLINE_WITNESS_ID);
    const second = messagesOf(PROTECTION_CONVERSATION_ID).find((m) => m.id === VIEW_ONCE_OFFLINE_WITNESS_ID);
    expect(first?.viewOnceCount).toBeGreaterThanOrEqual(first?.maxViewOnceCount ?? Infinity);
    expect(second?.viewOnceCount).toBeGreaterThanOrEqual(second?.maxViewOnceCount ?? Infinity);
  });

  test('un message NON vue-unique ignore un enregistrement (aucun crash, aucun champ étranger touché)', () => {
    const before = messagesOf('c-deploiement');
    recordViewOnceConsumption(before[0]!.id);
    const after = messagesOf('c-deploiement');
    expect(after).toEqual(before);
  });
});

/**
 * LE COMPORTEMENT, PAS LA SOURCE (#7224) — ces témoins montent un vrai
 * `QueryClient`, un vrai transport HTTP bouchonné par son `fetchImpl`, et
 * mesurent ce que la RANGÉE lira : le compte du cache. Un témoin qui se
 * contenterait de vérifier que le port compose son chemin (juste au-dessus)
 * reste VERT si le branchement de la révélation disparaît — il ne dit rien de
 * la loi. Même patron que `receipts.test.ts` pour `markCaughtUp`.
 */
const viewOnce = (id: string, viewOnceCount = 0): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u1',
    content: `secret ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date(1_757_000_000_000),
    isViewOnce: true,
    viewOnceCount,
    maxViewOnceCount: 1,
  });

const seedThread = (client: QueryClient, conversationId: string, messages: readonly Message[]): void => {
  client.setQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId), {
    pages: [{ messages, hasOlder: false, nextCursor: null }],
    pageParams: [undefined],
  });
};

const countOf = (client: QueryClient, conversationId: string, messageId: string): number | undefined =>
  client
    .getQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId))
    ?.pages.flatMap((p) => [...p.messages])
    .find((m) => m.id === messageId)?.viewOnceCount;

const respondingWith = (status: number, body: unknown) =>
  createHttpTransport({
    base: '',
    fetchImpl: (async () => new Response(JSON.stringify(body), { status })) as typeof fetch,
  });

describe('consumeViewOnceOptimistic — la révélation se dit au serveur (#7224)', () => {
  test('le cache porte la consommation AVANT toute réponse réseau (optimiste)', () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    // Une promesse qui ne se résout JAMAIS dans ce test — seul l'AVANT compte.
    const transport = createHttpTransport({ base: '', fetchImpl: (() => new Promise(() => {})) as unknown as typeof fetch });

    void consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'gateway', transport, queryClient: client },
    });

    expect(countOf(client, 'c-a', 'm1')).toBe(1);
  });

  test('la révélation est DITE au serveur : POST …/consume part une fois, chemin exact', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const calls: { readonly url: string; readonly method: string }[] = [];
    const transport = createHttpTransport({
      base: '',
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? 'GET' });
        return new Response(JSON.stringify({ success: true, data: { messageId: 'm1', viewOnceCount: 1, maxViewOnceCount: 1, isFullyConsumed: true } }), { status: 200 });
      }) as typeof fetch,
    });

    await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'gateway', transport, queryClient: client },
    });

    expect(calls).toEqual([{ url: '/api/v1/conversations/c-a/messages/m1/consume', method: 'POST' }]);
  });

  test('sur 200, le compte SERVI atteint la rangée (2, jamais le 1 optimiste)', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const transport = respondingWith(200, {
      success: true,
      data: { messageId: 'm1', viewOnceCount: 2, maxViewOnceCount: 3, isFullyConsumed: false },
    });

    const revealed = await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'gateway', transport, queryClient: client },
    });

    expect(revealed).toBe(true);
    expect(countOf(client, 'c-a', 'm1')).toBe(2);
  });

  test('refus PERMANENT (403) : le compte revient à sa valeur d’AVANT et la révélation est refusée', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const transport = respondingWith(403, { success: false, error: 'Access denied' });

    const revealed = await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'gateway', transport, queryClient: client },
    });

    expect(revealed).toBe(false);
    expect(countOf(client, 'c-a', 'm1')).toBe(0);
  });

  test('le rollback est CIBLÉ : un message arrivé entre-temps RESTE dans le cache', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const transport = createHttpTransport({
      base: '',
      fetchImpl: (async () => {
        // Le fil bouge PENDANT l'aller-retour — `message:new`, un autre patch.
        seedThread(client, 'c-a', [viewOnce('m1', 1), viewOnce('m2')]);
        return new Response(JSON.stringify({ success: false, error: 'Access denied' }), { status: 403 });
      }) as typeof fetch,
    });

    await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'gateway', transport, queryClient: client },
    });

    expect(countOf(client, 'c-a', 'm1')).toBe(0);
    expect(countOf(client, 'c-a', 'm2')).toBe(0);
  });

  test('panne TRANSITOIRE (500) : la consommation RESTE, le secret ne se rouvre pas', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const transport = respondingWith(500, { success: false, error: 'Internal error' });

    const revealed = await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'gateway', transport, queryClient: client },
    });

    expect(revealed).toBe(true);
    expect(countOf(client, 'c-a', 'm1')).toBe(1);
  });

  test('panne RÉSEAU (le transport lève) : la consommation RESTE, aucun rejet ne remonte', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const fail = async (): Promise<never> => {
      throw new Error('offline');
    };
    const transport = Object.assign(fail, { request: fail });

    const revealed = await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'gateway', transport, queryClient: client },
    });

    expect(revealed).toBe(true);
    expect(countOf(client, 'c-a', 'm1')).toBe(1);
  });

  test('source fixtures : AUCUN appel réseau, et le CACHE porte quand même la consommation', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    let called = false;
    const transport = createHttpTransport({
      base: '',
      fetchImpl: (async () => {
        called = true;
        return new Response(null, { status: 200 });
      }) as typeof fetch,
    });

    const revealed = await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'fixtures', transport, queryClient: client },
    });

    expect(called).toBe(false);
    expect(revealed).toBe(true);
    // SANS cette écriture, une rangée recyclée par le virtualiseur remonte sur
    // `viewOnceCount: 0` et ROUVRE le secret dans la même session (revue W5).
    expect(countOf(client, 'c-a', 'm1')).toBe(1);
  });
});
