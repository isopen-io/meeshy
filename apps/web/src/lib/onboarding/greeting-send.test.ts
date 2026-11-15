import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { createHttpTransport } from '@/lib/api/http';
import { confirmedCountOf, createOutboxStore, entriesOf } from '@/lib/send/outbox-store';
import { performSend, retrySend, type SendDeps } from '@/lib/send/perform-send';

import { createGreetingSender } from './greeting-send';

/**
 * LE SALUT DE L'ACCUEIL NE PART QU'UNE FOIS (#7729) — un échec suivi d'un
 * nouveau tap REJOUE la tentative (même `clientMessageId`, l'idempotence
 * serveur tient), jamais un second message. Les témoins traversent le VRAI
 * `performSend`/`retrySend` et la vraie outbox : c'est l'outbox de Global que
 * le fil affiche, avec ses bulles « Réessayer ».
 */

const GLOBAL = 'g-global';

type Reply = { readonly status: number; readonly body?: unknown };

function gateway(replies: readonly Reply[]) {
  const bodies: { readonly clientMessageId: string; readonly content: string }[] = [];
  let n = 0;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body ?? '{}')) as { clientMessageId: string; content: string };
    bodies.push({ clientMessageId: sent.clientMessageId, content: sent.content });
    const reply = replies[Math.min(n, replies.length - 1)] ?? { status: 500 };
    n += 1;
    const body = reply.status === 200 ? ack(sent.clientMessageId) : reply.body;
    return new Response(body === undefined ? null : JSON.stringify(body), { status: reply.status });
  }) as typeof fetch;
  return { fetchImpl, bodies };
}

const ack = (clientMessageId: string) => ({
  success: true,
  data: {
    id: `m-${clientMessageId}`,
    clientMessageId,
    conversationId: GLOBAL,
    senderId: 'u-maya',
    createdAt: '2026-09-24T10:00:00.000Z',
    deliveredCount: 0,
    readCount: 0,
  },
});

function harness(replies: readonly Reply[]) {
  const { fetchImpl, bodies } = gateway(replies);
  const outbox = createOutboxStore();
  const deps: SendDeps = {
    source: 'gateway',
    transport: createHttpTransport({ base: '', fetchImpl }),
    queryClient: new QueryClient(),
    outbox,
    online: true,
  };
  const sendGreeting = createGreetingSender({
    outbox,
    send: ({ conversationId, content, language, viewerId, online }) =>
      performSend({ conversationId, draft: { content, originalLanguage: language }, viewerId, deps: { ...deps, online } }),
    retry: ({ conversationId, clientMessageId, online }) => retrySend({ conversationId, clientMessageId, deps: { ...deps, online } }),
  });
  const greet = (content: string, online = true) => sendGreeting({ conversationId: GLOBAL, content, language: 'fr', viewerId: 'u-maya', online });
  return { outbox, bodies, greet };
}

describe('createGreetingSender — un salut, jamais deux', () => {
  test('un envoi accusé rend « sent » et ne laisse rien dans l’outbox', async () => {
    const { outbox, greet } = harness([{ status: 200 }]);
    expect(await greet('Salut, moi c’est Maya — accusé')).toBe('sent');
    expect(entriesOf(outbox.getState(), GLOBAL)).toHaveLength(0);
  });

  test('hors ligne : rien ne part, rien ne s’empile', async () => {
    const { outbox, bodies, greet } = harness([{ status: 200 }]);
    expect(await greet('Salut — hors ligne', false)).toBe('offline');
    expect(bodies).toHaveLength(0);
    expect(entriesOf(outbox.getState(), GLOBAL)).toHaveLength(0);
  });

  test('échec puis nouveau tap, même texte : la MÊME tentative est rejouée — un seul message dans l’outbox de Global', async () => {
    const { outbox, bodies, greet } = harness([{ status: 500 }, { status: 200 }]);

    expect(await greet('Salut, moi c’est Maya — rejoué')).toBe('failed');
    expect(entriesOf(outbox.getState(), GLOBAL)).toHaveLength(1);

    expect(await greet('Salut, moi c’est Maya — rejoué')).toBe('sent');
    expect(entriesOf(outbox.getState(), GLOBAL)).toHaveLength(0);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.clientMessageId).toBe(bodies[0]?.clientMessageId ?? '');
    expect(confirmedCountOf(outbox.getState(), GLOBAL)).toBe(1);
  });

  test('deux échecs de suite gardent UNE seule bulle en échec', async () => {
    const { outbox, bodies, greet } = harness([{ status: 500 }]);
    await greet('Salut — deux échecs');
    await greet('Salut — deux échecs');
    expect(entriesOf(outbox.getState(), GLOBAL)).toHaveLength(1);
    expect(new Set(bodies.map((b) => b.clientMessageId)).size).toBe(1);
  });

  test('échec puis texte MODIFIÉ : l’ancien texte quitte l’outbox avant que le nouveau parte', async () => {
    const { outbox, bodies, greet } = harness([{ status: 500 }, { status: 200 }]);

    await greet('Salut — premier jet');
    expect(await greet('Salut — texte réécrit')).toBe('sent');

    expect(entriesOf(outbox.getState(), GLOBAL)).toHaveLength(0);
    expect(bodies.map((b) => b.content)).toEqual(['Salut — premier jet', 'Salut — texte réécrit']);
    expect(confirmedCountOf(outbox.getState(), GLOBAL)).toBe(1);
  });

  test('la tentative en échec confirmée entre-temps (écho socket, « Réessayer » du fil) : rien ne repart', async () => {
    const { outbox, bodies, greet } = harness([{ status: 500 }, { status: 200 }]);

    await greet('Salut — arrivé malgré le délai');
    const failed = entriesOf(outbox.getState(), GLOBAL)[0]?.message.clientMessageId ?? '';
    outbox.getState().remove(GLOBAL, failed);

    expect(await greet('Salut — arrivé malgré le délai')).toBe('sent');
    expect(bodies).toHaveLength(1);
  });
});
