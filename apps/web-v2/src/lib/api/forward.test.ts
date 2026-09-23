import { describe, expect, test } from 'bun:test';

import { forwardBodyOf, forwardMessages } from './forward';
import { createHttpTransport } from './http';

/**
 * LE TRANSPORT DU TRANSFERT (#5866) — le corps qui part, et rien d'autre.
 *
 * LE PIÈGE QUE CES TÉMOINS GARDENT : `MessageProcessor.handleAttachments`
 * (`services/gateway/src/services/messaging/MessageProcessor.ts:726-727`) est
 * un `else if` — poser `attachmentIds` DÉSACTIVE la copie serveur des pièces
 * jointes. Un transfert qui « renvoie bien les pièces » ne transfère donc
 * AUCUNE pièce. Le serveur copie la ligne et réutilise le même blob : aucun
 * ré-upload, jamais. iOS le déclare en invariant
 * (`MessageForwardService.swift:42-44`).
 */

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  return { impl, calls };
}

const ACK = {
  success: true,
  data: { id: 'm9', conversationId: 'c-cible', createdAt: '2026-09-23T10:00:00.000Z' },
};

describe('forwardBodyOf — ce qui part, et ce qui NE part JAMAIS', () => {
  test('le corps porte `forwardedFromId` et la conversation d’origine', () => {
    const body = forwardBodyOf({
      message: { id: 'm1', content: 'bonjour', originalLanguage: 'fr' },
      sourceConversationId: 'c-source',
      clientMessageId: 'cid_1',
    });
    expect(body).toEqual({
      content: 'bonjour',
      originalLanguage: 'fr',
      clientMessageId: 'cid_1',
      forwardedFromId: 'm1',
      forwardedFromConversationId: 'c-source',
    });
  });

  test('AUCUN `attachmentIds`, même sur un message qui n’a QUE des pièces jointes', () => {
    const body = forwardBodyOf({
      message: { id: 'm2', content: '', originalLanguage: 'fr' },
      sourceConversationId: 'c-source',
      clientMessageId: 'cid_2',
    });
    expect('attachmentIds' in body).toBe(false);
    expect('content' in body).toBe(false);
    expect(body.forwardedFromId).toBe('m2');
  });

  test('une conversation d’origine ABSENTE s’OMET — `""` casse l’écriture Prisma `@db.ObjectId`', () => {
    const body = forwardBodyOf({
      message: { id: 'm3', content: 'x', originalLanguage: 'fr' },
      clientMessageId: 'cid_3',
    });
    expect('forwardedFromConversationId' in body).toBe(false);
  });
});

describe('forwardMessages — N messages sélectionnés ⇒ N envois', () => {
  test('trois messages partent vers la cible, dans l’ordre du fil, avec des cid DISTINCTS', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: ACK });
    const result = await forwardMessages({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      messages: [
        { id: 'a', content: 'un', originalLanguage: 'fr' },
        { id: 'b', content: 'deux', originalLanguage: 'fr' },
        { id: 'c', content: '', originalLanguage: 'fr' },
      ],
      sourceConversationId: 'c-source',
      targetConversationId: 'c-cible',
    });

    expect(result).toEqual({ ok: true, count: 3 });
    expect(calls.length).toBe(3);
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/conversations/c-cible/messages',
      '/api/v1/conversations/c-cible/messages',
      '/api/v1/conversations/c-cible/messages',
    ]);
    const bodies = calls.map((c) => JSON.parse(String(c.init.body)) as Record<string, unknown>);
    expect(bodies.map((b) => b.forwardedFromId)).toEqual(['a', 'b', 'c']);
    expect(bodies.every((b) => !('attachmentIds' in b))).toBe(true);
    expect(new Set(bodies.map((b) => String(b.clientMessageId))).size).toBe(3);
  });

  test('un refus serveur rend l’échec, avec le message du serveur', async () => {
    const { impl } = fakeFetch({
      status: 403,
      body: { success: false, error: 'Un message à vue unique ne peut pas être transféré' },
    });
    const result = await forwardMessages({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      messages: [{ id: 'a', content: 'un', originalLanguage: 'fr' }],
      targetConversationId: 'c-cible',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Un message à vue unique ne peut pas être transféré');
  });
});
