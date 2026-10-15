import { describe, expect, test } from 'bun:test';

import { message } from './fixtures-base';
import type { Message } from './types';
import type { ApiResult, HttpTransport } from './http';
import { MESSAGE_SEARCH_LIMIT, searchConversationMessages, searchMessagesIn } from './messages-search';

/**
 * LE PORT DE LA RECHERCHE DANS UNE CONVERSATION — `GET
 * /api/v1/conversations/:id/messages/search`. Ce qui est prouvé ici : la
 * requête part ROGNÉE vers la bonne route avec la bonne page, le curseur
 * suit, la pagination est lue à la RACINE de la réponse, et la source
 * `fixtures` rejoue la loi de la passerelle (contenu OU traduction, du plus
 * récent au plus ancien).
 */

function fakeTransport(result: ApiResult<unknown>): HttpTransport & { requests: unknown[] } {
  const transport = (async () => result) as unknown as HttpTransport & { requests: unknown[] };
  transport.requests = [];
  transport.request = (async (req) => {
    transport.requests.push(req);
    return result;
  }) as HttpTransport['request'];
  return transport;
}

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 14, 10, minutes));
const row = (fields: { readonly id: string; readonly content: string; readonly createdAt: Date } & Partial<Message>): Message =>
  message({ senderId: 'u-1', originalLanguage: 'fr', translations: [], ...fields });

describe('searchConversationMessages — en gateway', () => {
  test('appelle GET …/messages/search?q=<rognée>&limit=20, sans curseur à la première page', async () => {
    const transport = fakeTransport({ ok: true, data: [] });
    await searchConversationMessages({ source: 'gateway', transport, conversationId: 'c 1', query: '  bon jour ' });
    const req = transport.requests[0] as { readonly method: string; readonly path: string };
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/api/v1/conversations/c%201/messages/search?q=bon+jour&limit=20');
  });

  test('la page suivante renvoie le curseur tel que servi', async () => {
    const transport = fakeTransport({ ok: true, data: [] });
    await searchConversationMessages({ source: 'gateway', transport, conversationId: 'c1', query: 'bon', cursor: 'm-42' });
    expect((transport.requests[0] as { readonly path: string }).path).toBe('/api/v1/conversations/c1/messages/search?q=bon&limit=20&cursor=m-42');
  });

  test('lit `cursorPagination` à la racine : hasMore et nextCursor', async () => {
    const served = row({ id: 'm1', content: 'bonjour', createdAt: at(1) });
    const transport = fakeTransport({ ok: true, data: [served], cursorPagination: { hasMore: true, nextCursor: 'm1', limit: 20 } } as ApiResult<unknown>);
    const result = await searchConversationMessages({ source: 'gateway', transport, conversationId: 'c1', query: 'bon' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results.map((m) => m.id)).toEqual(['m1']);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.nextCursor).toBe('m1');
  });

  test('sans pagination servie : plus rien après', async () => {
    const transport = fakeTransport({ ok: true, data: [] });
    const result = await searchConversationMessages({ source: 'gateway', transport, conversationId: 'c1', query: 'bon' });
    expect(result.ok && result.data).toEqual({ results: [], hasMore: false, nextCursor: null });
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const transport = fakeTransport({ ok: false, status: 404, error: 'Conversation introuvable' });
    const result = await searchConversationMessages({ source: 'gateway', transport, conversationId: 'c1', query: 'bon' });
    expect(result.ok).toBe(false);
  });
});

describe('searchMessagesIn — la loi de la passerelle pour les fixtures', () => {
  const corpus = [
    row({ id: 'a', content: 'Bonjour à tous', createdAt: at(1) }),
    row({ id: 'b', content: 'Rien à voir', createdAt: at(2) }),
    row({
      id: 'c',
      content: 'Good morning',
      createdAt: at(3),
      translations: [{ id: 't', messageId: 'c', targetLanguage: 'fr', translatedContent: 'BONJOUR le matin', translationModel: 'basic', createdAt: at(3) }],
    }),
    row({ id: 'd', content: 'bonjour supprimé', createdAt: at(4), deletedAt: at(5) }),
  ];

  test('contenu OU traduction, insensible à la casse, du plus récent au plus ancien, jamais un supprimé', () => {
    expect(searchMessagesIn(corpus, ' bonjour ', null).results.map((m) => m.id)).toEqual(['c', 'a']);
  });

  test('pagine par curseur d’identifiant', () => {
    const many = Array.from({ length: MESSAGE_SEARCH_LIMIT + 3 }, (_, i) => row({ id: `m${i}`, content: 'mot', createdAt: at(i) }));
    const first = searchMessagesIn(many, 'mot', null);
    expect(first.results).toHaveLength(MESSAGE_SEARCH_LIMIT);
    expect(first.hasMore).toBe(true);
    const second = searchMessagesIn(many, 'mot', first.nextCursor);
    expect(second.results.map((m) => m.id)).toEqual(['m2', 'm1', 'm0']);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });
});
