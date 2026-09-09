import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Conversation, Message } from '@/lib/api/types';

import { pendingAttachmentOf } from './attachments';
import { entriesOf, createOutboxStore } from './outbox-store';
import { debounceEntryCountForTests, performSend, retrySend, type SendDeps } from './perform-send';

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  }) as typeof fetch;
  return { impl, calls };
}

/** Un `fetchImpl` qui rejoue une SÉQUENCE de réponses, un appel = une réponse. */
function sequencedFetch(responses: readonly { readonly status: number; readonly body?: unknown }[]) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  let n = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const r = responses[Math.min(n, responses.length - 1)]!;
    n += 1;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { impl, calls };
}

const conv = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c-a',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

const m1: Message = {
  id: 'm1',
  conversationId: 'c-a',
  senderId: 'u-other',
  content: 'salut',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: false,
  translations: [],
  createdAt: new Date('2026-09-09T09:00:00.000Z'),
  timestamp: new Date('2026-09-09T09:00:00.000Z'),
};

/**
 * UN `fetchImpl` ROUTÉ PAR CHEMIN (#5668) — les témoins d'attachements
 * traversent DEUX endpoints distincts (`POST /attachments/upload` puis
 * `POST /conversations/:id/messages`, § 0 de la spécification #5668) : un
 * `fetchImpl` unique ne peut plus répondre à l'aveugle par ORDRE d'appel.
 */
function routedFetch(routes: Readonly<Record<string, { readonly status: number; readonly body?: unknown }>>) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const path = Object.keys(routes).find((p) => url.includes(p));
    const response = path === undefined ? { status: 404 } : routes[path]!;
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  }) as typeof fetch;
  return { impl, calls };
}

function pngFile(name = 'a.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

function seededClient(): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { messages: [m1], hasOlder: false });
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, [conv({ id: 'c-a' }), conv({ id: 'c-b' })]);
  return queryClient;
}

function ackBody(id: string, clientMessageId: string, overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      id,
      clientMessageId,
      conversationId: 'c-a',
      senderId: 'u-viewer',
      createdAt: '2026-09-09T10:00:00.000Z',
      deliveredCount: 0,
      readCount: 0,
      ...overrides,
    },
  };
}

describe('performSend', () => {
  test('2xx : outbox VIDE, page = [m1, confirmé], confirmé.deliveredCount = celui de l’accusé, un seul appel', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: ackBody('m9', 'IGNORED') });
    const queryClient = seededClient();
    const outbox = createOutboxStore();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 1', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });

    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(0);
    const page = queryClient.getQueryData<{ readonly messages: readonly Message[] }>(messagesQueryKey('c-a'));
    expect(page?.messages).toHaveLength(2);
    expect(page?.messages[0]).toBe(m1);
    expect(page?.messages[1]?.id).toBe('m9');
    expect(page?.messages[1]?.deliveredCount).toBe(0);
    const sentClientMessageId = JSON.parse(String(calls[0]?.init.body)).clientMessageId as string;
    expect((page?.messages[1] as { readonly clientMessageId?: string }).clientMessageId).toBe(sentClientMessageId);
    expect(calls.length).toBe(1);
  });

  /**
   * REVUE-CORRECTION #5813, DÉFAUT MAJEUR 6 — `draft.replyTo` (le message
   * cité ENTIER) doit atteindre l'entrée d'outbox AVANT tout accusé serveur,
   * pour que la bulle optimiste rende sa citation et son saut sans attendre
   * le réseau. `online: false` isole ce test du transport : aucun appel ne
   * part, l'entrée reste `pending`/`failed` selon D-16, ce qui n'est pas ce
   * qu'on vérifie ici.
   */
  test('draft.replyTo (le message cité ENTIER) atteint le message local AVANT tout accusé', async () => {
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: fakeFetch({ status: 200 }).impl }),
      queryClient,
      outbox,
      online: false,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'je réponds', originalLanguage: 'fr', replyToId: m1.id, replyTo: m1 },
      viewerId: 'u-viewer',
      deps,
    });

    const entry = entriesOf(outbox.getState(), 'c-a')[0];
    expect(entry?.message.replyToId).toBe(m1.id);
    expect(entry?.message.replyTo).toBe(m1);
  });

  test('pas de doublon : un message clientMessageId déjà présent (écho socket) est REMPLACÉ, jamais dupliqué', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c-a'), { messages: [], hasOlder: false });
    const outbox = createOutboxStore();

    // Le `fetchImpl` LIT le `clientMessageId` que `performSend` vient de
    // générer dans le corps de la requête, et simule un écho socket déjà
    // reçu AVANT l'accusé REST : la page porte déjà une ligne sous ce même
    // `clientMessageId` au moment où le 2xx arrive.
    const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const cid = JSON.parse(String(init?.body)).clientMessageId as string;
      queryClient.setQueryData(messagesQueryKey('c-a'), {
        messages: [{ ...m1, id: 'echo', clientMessageId: cid }],
        hasOlder: false,
      });
      return new Response(JSON.stringify(ackBody('m9', cid)), { status: 200 });
    }) as typeof fetch;
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 2', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });

    const page = queryClient.getQueryData<{ readonly messages: readonly Message[] }>(messagesQueryKey('c-a'));
    expect(page?.messages).toHaveLength(1);
    expect(page?.messages[0]?.id).toBe('m9');
  });

  test('4xx (403 USER_BLOCKED) : entrée failed, lastError.status/code posés, page toBe-identique', async () => {
    const { impl } = fakeFetch({ status: 403, body: { success: false, error: 'blocked', code: 'USER_BLOCKED' } });
    const queryClient = seededClient();
    const before = queryClient.getQueryData(messagesQueryKey('c-a'));
    const outbox = createOutboxStore();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 3', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });

    const entries = entriesOf(outbox.getState(), 'c-a');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.delivery).toBe('failed');
    expect(entries[0]?.lastError?.status).toBe(403);
    expect(entries[0]?.lastError?.code).toBe('USER_BLOCKED');
    expect(queryClient.getQueryData(messagesQueryKey('c-a'))).toBe(before);
  });

  test('réseau : pending pendant le vol, failed status:0 après rejet du fetch', async () => {
    const deferred: { reject: ((e: unknown) => void) | null } = { reject: null };
    const deferredImpl = (async () =>
      new Promise<Response>((_resolve, r) => {
        deferred.reject = r;
      })) as typeof fetch;
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: deferredImpl }),
      queryClient,
      outbox,
      online: true,
    };

    const promise = performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 4', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(entriesOf(outbox.getState(), 'c-a')[0]?.delivery).toBe('pending');

    deferred.reject?.(new Error('offline'));
    await promise;
    const entry = entriesOf(outbox.getState(), 'c-a')[0];
    expect(entry?.delivery).toBe('failed');
    expect(entry?.lastError?.status).toBe(0);
  });

  test('5xx : failed, lastError.status === 500', async () => {
    const { impl } = fakeFetch({ status: 500, body: { success: false, error: 'panne' } });
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 4b', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });
    const entry = entriesOf(outbox.getState(), 'c-a')[0];
    expect(entry?.delivery).toBe('failed');
    expect(entry?.lastError?.status).toBe(500);
  });

  test('timeout RÉEL : pending à 10ms, failed code:TIMEOUT à 60ms', async () => {
    const neverResolves = (async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        signal?.addEventListener('abort', () => reject(signal.reason));
      })) as typeof fetch;
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: neverResolves, timeoutMs: 20 }),
      queryClient,
      outbox,
      online: true,
    };

    const promise = performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 5', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(entriesOf(outbox.getState(), 'c-a')[0]?.delivery).toBe('pending');

    await new Promise((r) => setTimeout(r, 50));
    await promise;
    const entry = entriesOf(outbox.getState(), 'c-a')[0];
    expect(entry?.delivery).toBe('failed');
    expect(entry?.lastError?.code).toBe('TIMEOUT');
  });

  /**
   * AUCUNE EXCEPTION NE LAISSE UN MESSAGE SUR L'HORLOGE (revue-correction
   * #5813). `performSend` est appelé en `void` par le hook : une exception y
   * devient un rejet non traité, et l'entrée d'outbox reste `pending` POUR
   * TOUJOURS — une horloge qui tourne sans reprise possible, exactement le
   * mensonge d'interface que `check-thread-states.mjs` existe pour interdire.
   * `ApiResult` ne rejette jamais (doctrine `http.ts`), mais ce module reçoit
   * son transport de l'extérieur : la garde tient sur ce qu'on lui DONNE, pas
   * sur ce qu'on espère. Direction de l'erreur choisie par le COÛT DE
   * RÉPARATION : un « Réessayer » de trop se rejoue (l'appel est idempotent
   * par `clientMessageId`) ; une horloge figée ne se répare pas.
   */
  test('un transport qui LÈVE ⇒ failed, jamais une horloge figée', async () => {
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    const deps: SendDeps = {
      source: 'gateway',
      transport: {
        request: () => {
          throw new Error('transport cassé');
        },
      } as unknown as SendDeps['transport'],
      queryClient,
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour transport cassé', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });

    const entry = entriesOf(outbox.getState(), 'c-a')[0];
    expect(entry?.delivery).toBe('failed');
  });

  test('retrySend REJOUE avec le MÊME clientMessageId et la MÊME originalLanguage (compte d’appels = 2)', async () => {
    const { impl, calls } = sequencedFetch([
      { status: 500, body: { success: false, error: 'panne' } },
      { status: 200, body: ackBody('m9', 'ignored') },
    ]);
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 6', originalLanguage: 'en' },
      viewerId: 'u-viewer',
      deps,
    });
    const failedEntry = entriesOf(outbox.getState(), 'c-a')[0]!;
    expect(failedEntry.delivery).toBe('failed');
    const clientMessageId = failedEntry.message.clientMessageId;
    const firstBody = JSON.parse(String(calls[0]?.init.body));

    const retryPromise = retrySend({ conversationId: 'c-a', clientMessageId, deps });
    await Promise.resolve();
    const inFlight = entriesOf(outbox.getState(), 'c-a')[0];
    expect(inFlight?.attempts).toBe(2);
    await retryPromise;

    expect(calls.length).toBe(2);
    const secondBody = JSON.parse(String(calls[1]?.init.body));
    expect(secondBody.clientMessageId).toBe(firstBody.clientMessageId);
    expect(secondBody.originalLanguage).toBe('en');
    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(0);
    const page = queryClient.getQueryData<{ readonly messages: readonly Message[] }>(messagesQueryKey('c-a'));
    expect(page?.messages.some((m) => m.id === 'm9')).toBe(true);
  });

  test('hors ligne : échec immédiat, aucun appel, lastError absent ; retrySend hors ligne reste failed sans appel', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: ackBody('m9', 'x') });
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: false,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 7', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });
    expect(calls.length).toBe(0);
    const entry = entriesOf(outbox.getState(), 'c-a')[0]!;
    expect(entry.delivery).toBe('failed');
    expect(entry.lastError).toBeUndefined();

    await retrySend({ conversationId: 'c-a', clientMessageId: entry.message.clientMessageId, deps });
    expect(calls.length).toBe(0);
    expect(entriesOf(outbox.getState(), 'c-a')[0]?.delivery).toBe('failed');
  });

  test('source fixtures : fetchImpl jamais appelé, entrée retirée, id fx-sent-…', async () => {
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const deps: SendDeps = {
      source: 'fixtures',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 8', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });

    expect(calls).toBe(0);
    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(0);
    const page = queryClient.getQueryData<{ readonly messages: readonly Message[] }>(messagesQueryKey('c-a'));
    expect(page?.messages).toHaveLength(2);
    expect(page?.messages[1]?.id).toMatch(/^fx-sent-/);
  });

  test('la liste suit l’envoi : conv(c-a).lastMessage, lastMessageAt, lastMessageOriginalLanguage posés ; lastMessageTranslations ABSENT ; c-b intact', async () => {
    const { impl } = fakeFetch({ status: 200, body: ackBody('m9', 'x', { content: 'bonjour 9' }) });
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    const before = queryClient.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)!;
    const cB = before.find((c) => c.id === 'c-b')!;
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'bonjour 9', originalLanguage: 'en' },
      viewerId: 'u-viewer',
      deps,
    });

    const after = queryClient.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)!;
    const cA = after.find((c) => c.id === 'c-a')!;
    expect(cA.lastMessage?.id).toBe('m9');
    expect(cA.lastMessageAt as unknown).toBe('2026-09-09T10:00:00.000Z');
    expect(cA.lastMessageOriginalLanguage).toBe('en');
    expect('lastMessageTranslations' in cA).toBe(false);
    expect(after.find((c) => c.id === 'c-b')).toBe(cB);
  });

  /**
   * LA CARTE DU DÉBOUNCE NE RETIENT RIEN (revue-correction #5813). Elle vit à
   * l'échelle du MODULE et sa clé porte le TEXTE ENTIER du message : sans
   * purge, une session de messagerie garde en mémoire tout ce que
   * l'utilisateur a jamais écrit, pour une valeur dont la durée utile est de
   * 600 ms (dimension 3, « aucun cache non borné »). Ce témoin ne regarde pas
   * l'implémentation : il compte ce que le module RETIENT.
   */
  test('la carte du débounce est PURGÉE — trois envois distincts ne laissent pas trois clés vivantes', async () => {
    const { impl } = fakeFetch({ status: 200, body: ackBody('m9', 'x') });
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    // Une horloge LOIN devant celle des témoins voisins (qui, eux, n'injectent
    // pas `now` et prennent donc `Date.now()`) : leurs clés sont périmées dès
    // le premier appel, et ce témoin ne compte que les siennes.
    let clock = Date.now() + 10_000_000;
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
      now: () => clock,
    };

    for (const content of ['purge-a', 'purge-b', 'purge-c']) {
      await performSend({ conversationId: 'c-a', draft: { content, originalLanguage: 'fr' }, viewerId: 'u-viewer', deps });
      clock += 10;
    }
    expect(debounceEntryCountForTests()).toBe(3);

    clock += 10_000;
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'purge-d', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps,
    });
    // Les trois clés périmées sont parties ; seule la courante reste.
    expect(debounceEntryCountForTests()).toBe(1);
  });

  test('dédoublonnage 600ms : deux envois du même (content, replyToId) sous 600ms ⇒ UN appel ; au-delà ⇒ deux ; contenus différents ⇒ deux, jamais sérialisés', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: ackBody('m9', 'x') });
    const outbox = createOutboxStore();
    const queryClient = seededClient();
    let clock = 10_000_000;
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
      now: () => clock,
    };

    const draft = { content: 'texte-debounce-a', originalLanguage: 'fr' } as const;
    const p1 = performSend({ conversationId: 'c-a', draft, viewerId: 'u-viewer', deps });
    clock += 300;
    const p2 = performSend({ conversationId: 'c-a', draft, viewerId: 'u-viewer', deps });
    // Aucune résolution n'a encore eu lieu : les deux appels, s'il y en a deux,
    // sont déjà partis en parallèle — jamais sérialisés.
    await Promise.all([p1, p2]);
    expect(calls.length).toBe(1);

    clock += 700;
    await performSend({ conversationId: 'c-a', draft, viewerId: 'u-viewer', deps });
    expect(calls.length).toBe(2);

    const draftB = { content: 'texte-debounce-b', originalLanguage: 'fr' } as const;
    const p3 = performSend({ conversationId: 'c-a', draft: draftB, viewerId: 'u-viewer', deps });
    const p4 = performSend({ conversationId: 'c-a', draft: draftB, viewerId: 'u-viewer', deps: { ...deps, now: () => clock + 100000 } });
    await Promise.all([p3, p4]);
    expect(calls.length).toBe(4);
  });
});

/**
 * LES PIÈCES JOINTES (#5668) — deux appels réseau distincts, DANS L'ORDRE :
 * `POST /attachments/upload` (multipart) PUIS
 * `POST /conversations/:id/messages` (JSON, `attachmentIds`).
 */
describe('performSend — pièces jointes (#5668)', () => {
  test('un vocal PUR (aucun texte) : upload PUIS message avec attachmentIds + messageType, SANS clé content', async () => {
    const { impl, calls } = routedFetch({
      '/attachments/upload': {
        status: 200,
        body: { success: true, data: { attachments: [{ id: 'att-1', messageId: '', fileName: 'voix.webm', originalName: 'voix.webm', mimeType: 'audio/webm', fileSize: 3, fileUrl: 'https://x/voix.webm' }] } },
      },
      '/conversations/c-a/messages': { status: 200, body: ackBody('m9', 'x') },
    });
    const queryClient = seededClient();
    const outbox = createOutboxStore();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient,
      outbox,
      online: true,
    };
    const pending = [pendingAttachmentOf(new File([new Uint8Array(3)], 'voix.webm', { type: 'audio/webm' }), { durationMs: 900 })];

    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', attachments: pending },
      viewerId: 'u-viewer',
      deps,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain('/attachments/upload');
    expect(calls[0]?.init.body).toBeInstanceOf(FormData);
    expect(calls[1]?.url).toContain('/conversations/c-a/messages');
    const sentBody = JSON.parse(String(calls[1]?.init.body));
    expect(sentBody.attachmentIds).toEqual(['att-1']);
    expect(sentBody.messageType).toBe('audio');
    expect('content' in sentBody).toBe(false);
    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(0);
  });

  test('texte + photo : messageType image, une seule photo ⇒ une seule catégorie', async () => {
    const { impl, calls } = routedFetch({
      '/attachments/upload': {
        status: 200,
        body: { success: true, data: { attachments: [{ id: 'att-2', messageId: '', fileName: 'a.png', originalName: 'a.png', mimeType: 'image/png', fileSize: 3, fileUrl: 'https://x/a.png' }] } },
      },
      '/conversations/c-a/messages': { status: 200, body: ackBody('m9', 'x') },
    });
    const outbox = createOutboxStore();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient: seededClient(),
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: 'regarde', originalLanguage: 'fr', attachments: [pendingAttachmentOf(pngFile())] },
      viewerId: 'u-viewer',
      deps,
    });

    const sentBody = JSON.parse(String(calls[1]?.init.body));
    expect(sentBody.content).toBe('regarde');
    expect(sentBody.messageType).toBe('image');
  });

  /**
   * RÉCONCILIATION PAR COMPTE (§ 0 « UPLOAD_PARTIAL ») — `uploadMultiple`
   * avale les échecs PAR FICHIER sous `success: true` : moins d'attachements
   * que de fichiers envoyés est un ÉCHEC, jamais un envoi partiel silencieux.
   * `POST …/messages` n'est JAMAIS appelé dans ce cas.
   */
  test('upload PARTIEL (moins d’attachements que de fichiers) ⇒ failed UPLOAD_PARTIAL, message JAMAIS envoyé', async () => {
    const { impl, calls } = routedFetch({
      '/attachments/upload': {
        status: 200,
        body: { success: true, data: { attachments: [{ id: 'att-3', messageId: '', fileName: 'a.png', originalName: 'a.png', mimeType: 'image/png', fileSize: 3, fileUrl: 'https://x/a.png' }] } },
      },
    });
    const outbox = createOutboxStore();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient: seededClient(),
      outbox,
      online: true,
    };
    const pending = [pendingAttachmentOf(pngFile('a.png')), pendingAttachmentOf(pngFile('b.png'))];

    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', attachments: pending },
      viewerId: 'u-viewer',
      deps,
    });

    expect(calls).toHaveLength(1); // jamais de second appel vers …/messages.
    const entry = entriesOf(outbox.getState(), 'c-a')[0]!;
    expect(entry.delivery).toBe('failed');
    expect(entry.lastError?.code).toBe('UPLOAD_PARTIAL');
  });

  /**
   * REPRISE SANS RE-UPLOAD (§ 0 « Reprise ») — l'upload a RÉUSSI, mais
   * `POST …/messages` a échoué (500). `retrySend` ne rappelle PAS
   * `/attachments/upload` : il réutilise `attachmentIds` déjà obtenus.
   */
  test('upload réussi puis message en échec : retrySend NE RE-UPLOAD PAS, réutilise attachmentIds', async () => {
    let messageAttempts = 0;
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url.includes('/attachments/upload')) {
        return new Response(
          JSON.stringify({ success: true, data: { attachments: [{ id: 'att-4', messageId: '', fileName: 'a.png', originalName: 'a.png', mimeType: 'image/png', fileSize: 3, fileUrl: 'https://x/a.png' }] } }),
          { status: 200 },
        );
      }
      messageAttempts += 1;
      if (messageAttempts === 1) return new Response(JSON.stringify({ success: false, error: 'panne' }), { status: 500 });
      return new Response(JSON.stringify(ackBody('m9', 'x')), { status: 200 });
    }) as typeof fetch;

    const outbox = createOutboxStore();
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient: seededClient(),
      outbox,
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(pngFile())] },
      viewerId: 'u-viewer',
      deps,
    });
    const failedEntry = entriesOf(outbox.getState(), 'c-a')[0]!;
    expect(failedEntry.delivery).toBe('failed');
    expect(failedEntry.upload?.attachmentIds).toEqual(['att-4']);
    const uploadCallsBeforeRetry = calls.filter((c) => c.url.includes('/attachments/upload')).length;
    expect(uploadCallsBeforeRetry).toBe(1);

    await retrySend({ conversationId: 'c-a', clientMessageId: failedEntry.message.clientMessageId, deps });

    const uploadCallsAfterRetry = calls.filter((c) => c.url.includes('/attachments/upload')).length;
    expect(uploadCallsAfterRetry).toBe(1); // JAMAIS un second upload.
    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(0); // la reprise a réussi.
  });
});
