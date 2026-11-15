import { describe, expect, test } from 'bun:test';

import { STARRED_MESSAGES_DEFAULT_LIMIT } from '@meeshy/shared/types/message-star';

import type { HttpRequest, HttpTransport } from './http';
import { STARRED_LIST_QUERY_KEY } from './starred-messages-cache';
import { STARRED_LIST_PAGE_SIZE, loadStarredMessagesPage, starredListInfiniteOptions } from './starred-messages-list';

/**
 * **LE PORT DE L'ÉCRAN DES MESSAGES FAVORIS** (#7286) — `GET
 * /me/starred-messages?limit=&cursor=`, keyset OPAQUE sur l'étoile.
 *
 * Deux affirmations tiennent ce port honnête : le curseur est transmis TEL
 * QUEL (jamais relu comme un nombre), et une ligne mal formée est ÉCARTÉE,
 * jamais peinte à moitié — le décodeur est une frontière de confiance.
 */

const line = (messageId: string, patch: Record<string, unknown> = {}) => ({
  id: `star-${messageId}`,
  starredAt: '2026-09-21T10:00:00.000Z',
  message: {
    id: messageId,
    conversationId: 'c-1',
    messageType: 'text',
    createdAt: '2026-09-20T10:00:00.000Z',
    editedAt: null,
    isProtected: false,
    content: 'Bonjour',
    originalLanguage: 'fr',
    translations: [{ id: 't1', messageId, targetLanguage: 'en', translatedContent: 'Hello' }],
    attachments: [],
  },
  sender: { id: 'p-1', userId: 'u-1', displayName: 'Amina', avatar: null, username: 'amina' },
  conversation: { id: 'c-1', identifier: 'equipe', type: 'group', name: 'Équipe', avatar: null },
  ...patch,
});

function recording(reply: unknown): { readonly transport: HttpTransport; readonly calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (req: HttpRequest) => {
      calls.push(req);
      return reply;
    },
  } as unknown as HttpTransport;
  return { transport, calls };
}

describe('loadStarredMessagesPage', () => {
  test('la taille de page est le DÉFAUT du contrat', () => {
    expect(STARRED_LIST_PAGE_SIZE).toBe(STARRED_MESSAGES_DEFAULT_LIMIT);
  });

  test('première page sans curseur, suivante avec le curseur OPAQUE tel quel', async () => {
    const { transport, calls } = recording({ ok: true, status: 200, data: [], pagination: { limit: 20, hasMore: false, nextCursor: null } });
    await loadStarredMessagesPage({ source: 'gateway', transport });
    await loadStarredMessagesPage({ source: 'gateway', transport, cursor: 'eyJjIjoiMjAyNi0wOS0yMSJ9==' });
    expect(calls[0]?.path).toBe(`/api/v1/me/starred-messages?limit=${STARRED_LIST_PAGE_SIZE}`);
    expect(calls[1]?.path).toBe(`/api/v1/me/starred-messages?limit=${STARRED_LIST_PAGE_SIZE}&cursor=eyJjIjoiMjAyNi0wOS0yMSJ9%3D%3D`);
    expect(calls[1]?.path).not.toContain('NaN');
  });

  test('les lignes servies et la pagination keyset', async () => {
    const { transport } = recording({
      ok: true,
      status: 200,
      data: [line('m1'), line('m2')],
      pagination: { limit: 20, hasMore: true, nextCursor: 'k2', form: 'keyset' },
    });
    const result = await loadStarredMessagesPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items.map((item) => item.message.id)).toEqual(['m1', 'm2']);
    expect(result.data.items[0]?.message.translations[0]?.translatedContent).toBe('Hello');
    expect(result.data.pagination).toEqual({ limit: 20, hasMore: true, nextCursor: 'k2' });
  });

  test('une ligne mal formée est ÉCARTÉE, ses voisines servies', async () => {
    const { transport } = recording({
      ok: true,
      status: 200,
      data: [line('m1'), line('m2', { conversation: null }), { n: 'importe quoi' }, line('m3')],
      pagination: { limit: 20, hasMore: false, nextCursor: null },
    });
    const result = await loadStarredMessagesPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items.map((item) => item.message.id)).toEqual(['m1', 'm3']);
  });

  test('un placeholder (message protégé) passe tel que servi : sans texte, sans traduction, sans pièce', async () => {
    const placeholder = line('m9', {
      message: {
        id: 'm9',
        conversationId: 'c-1',
        messageType: 'text',
        createdAt: '2026-09-20T10:00:00.000Z',
        editedAt: null,
        isProtected: true,
        content: null,
        originalLanguage: null,
        translations: [],
        attachments: [],
      },
    });
    const { transport } = recording({ ok: true, status: 200, data: [placeholder], pagination: { limit: 20, hasMore: false, nextCursor: null } });
    const result = await loadStarredMessagesPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const message = result.data.items[0]?.message;
    expect(message?.isProtected).toBe(true);
    expect(message?.content).toBeNull();
    expect(message?.translations).toEqual([]);
    expect(message?.attachments).toEqual([]);
  });

  test('un refus est PROPAGÉ, jamais transformé en liste vide', async () => {
    const { transport } = recording({ ok: false, status: 401, error: 'Unauthorized' });
    expect((await loadStarredMessagesPage({ source: 'gateway', transport })).ok).toBe(false);
  });
});

describe('starredListInfiniteOptions', () => {
  test('la clé est CELLE que le geste et l’écho écrivent', () => {
    expect(starredListInfiniteOptions({ source: 'gateway', transport: {} as HttpTransport }).queryKey).toBe(STARRED_LIST_QUERY_KEY);
  });

  test('la page suivante prend le curseur servi ; une page sans suite arrête', () => {
    const options = starredListInfiniteOptions({ source: 'gateway', transport: {} as HttpTransport });
    const withMore = { items: [], pagination: { limit: 20, hasMore: true, nextCursor: 'k2' } };
    const last = { items: [], pagination: { limit: 20, hasMore: false, nextCursor: null } };
    expect(options.initialPageParam).toBeUndefined();
    expect(options.getNextPageParam(withMore)).toBe('k2');
    expect(options.getNextPageParam(last)).toBeUndefined();
  });
});
