import { describe, expect, test } from 'bun:test';

import { searchEverywhereMessages, searchEverywherePosts, postSearchTarget } from './global-search';
import type { HttpTransport, HttpRequest } from './http';

/**
 * #14619 / #14620 — LES PORTS DE LA RECHERCHE GÉNÉRALE. `GET /messages/search`
 * et `GET /posts/search` (contrat posté sur les deux issues) : la requête part
 * ROGNÉE, le curseur opaque revient tel quel, une ligne sans identifiant est
 * écartée, et une page qui n'annonce pas de suite s'arrête.
 */

type Seen = { path?: string; headers?: Readonly<Record<string, string>> };

const transportRendant = (data: unknown, pagination: unknown, seen: Seen = {}): HttpTransport =>
  ({
    request: async (request: HttpRequest) => {
      seen.path = request.path;
      if (request.headers !== undefined) seen.headers = request.headers;
      return { ok: true, status: 200, data, pagination };
    },
  }) as unknown as HttpTransport;

const hit = (id: string) => ({
  id,
  conversationId: 'c1',
  createdAt: '2026-11-01T10:00:00.000Z',
  messageType: 'text',
  content: 'on se voit à la plage',
  servedLanguage: 'fr',
  originalContent: 'see you at the beach',
  originalLanguage: 'en',
  sender: { id: 'p1', userId: 'u1', displayName: 'Ada', username: 'ada', avatar: null },
  conversation: { id: 'c1', identifier: 'conv-c1', type: 'group', title: 'Plage', avatar: null },
});

describe('searchEverywhereMessages', () => {
  test('envoie la requête rognée et le curseur, rend les messages et le curseur suivant', async () => {
    const seen: Seen = {};
    const result = await searchEverywhereMessages({
      source: 'gateway',
      transport: transportRendant([hit('m1'), { id: 42 }], { limit: 20, hasMore: true, nextCursor: 'abc' }, seen),
      query: '  plage ',
      cursor: 'prev',
    });
    expect(seen.path).toBe('/api/v1/messages/search?q=plage&limit=20&cursor=prev');
    expect(seen.headers).toMatchObject({ 'X-Search-Caps': '1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.hits.map((h) => h.id)).toEqual(['m1']);
    expect(result.data.hits[0]?.content).toBe('on se voit à la plage');
    expect(result.data.nextCursor).toBe('abc');
  });

  test('#16957 — un résultat d’une passerelle ancienne arrive sans voile ni transcription, jamais indéfini', async () => {
    const result = await searchEverywhereMessages({ source: 'gateway', transport: transportRendant([hit('m1')], {}), query: 'plage' });
    expect(result.ok && result.data.hits[0]).toMatchObject({ isBlurred: false, match: 'content', transcript: null });
  });

  test('#16957 — le voile et la transcription servis traversent le port', async () => {
    const transcript = { attachmentId: 'a1', mediaKind: 'audio', text: 'plage', servedLanguage: null, durationMs: 1200 };
    const result = await searchEverywhereMessages({
      source: 'gateway',
      transport: transportRendant([{ ...hit('m1'), isBlurred: true, match: 'transcript', transcript }, { ...hit('m2'), transcript: { mediaKind: 'hologram' } }], {}),
      query: 'plage',
    });
    expect(result.ok && result.data.hits.map((h) => [h.isBlurred, h.match, h.transcript])).toEqual([
      [true, 'transcript', transcript],
      [false, 'content', null],
    ]);
  });

  test('une page sans suite annoncée s’arrête', async () => {
    const result = await searchEverywhereMessages({
      source: 'gateway',
      transport: transportRendant([hit('m1')], { limit: 20, hasMore: false, nextCursor: 'zzz' }),
      query: 'plage',
    });
    expect(result.ok && result.data.nextCursor).toBe(null);
  });
});

describe('searchEverywherePosts', () => {
  test('interroge les trois formats et rend les publications servies', async () => {
    const seen: Seen = {};
    const result = await searchEverywherePosts({
      source: 'gateway',
      transport: transportRendant([{ id: 'p1', type: 'REEL', createdAt: '2026-11-01T10:00:00.000Z' }, { type: 'POST' }], { limit: 20, hasMore: false, nextCursor: null }, seen),
      query: 'soleil',
    });
    expect(seen.path).toBe('/api/v1/posts/search?q=soleil&limit=20&types=POST%2CREEL%2CSTORY');
    expect(result.ok && result.data.posts.map((p) => p.id)).toEqual(['p1']);
    expect(result.ok && result.data.nextCursor).toBe(null);
  });
});

describe('postSearchTarget — un résultat ouvre son écran', () => {
  test('post, réel et story vont chacun à leur adresse', () => {
    expect(postSearchTarget({ id: 'a', type: 'POST' })).toEqual({ to: 'post', params: { post: 'a' } });
    expect(postSearchTarget({ id: 'b', type: 'REEL' })).toEqual({ to: 'reel', params: { post: 'b' } });
    expect(postSearchTarget({ id: 'c', type: 'STORY' })).toEqual({ to: 'story', params: { post: 'c' } });
  });
});
