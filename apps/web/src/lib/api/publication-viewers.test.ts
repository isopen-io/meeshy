import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';

import { fetchStoryViewers } from './publication-viewers';

function stubTransport(handler: (request: HttpRequest) => ApiResult<unknown>): HttpTransport {
  return {
    request: async (request: HttpRequest) => handler(request) as never,
  } as unknown as HttpTransport;
}

describe('fetchStoryViewers — fixtures, miroir de `GET /posts/:postId/interactions`', () => {
  test('ma story (`st-mienne`) rend ses trois vues, `viewedAt desc`', async () => {
    const result = await fetchStoryViewers({ source: 'fixtures', transport: stubTransport(() => ({ ok: true, data: {} })), postId: 'st-mienne' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.viewers).toHaveLength(3);
    expect(result.data.pagination).toEqual({ total: 3, offset: 0, limit: 50, hasMore: false });
    /* Une ligne au repli `username` — `authorSelect` sert `displayName` nullable. */
    expect(result.data.viewers.some((v) => v.displayName === null)).toBe(true);
    /* Une ligne AVEC réaction. */
    expect(result.data.viewers.some((v) => v.reaction !== null)).toBe(true);
  });

  test('une story d’AUTRUI ⇒ 403 FORBIDDEN — le viewer de fixtures n’en est pas l’auteur', async () => {
    const result = await fetchStoryViewers({ source: 'fixtures', transport: stubTransport(() => ({ ok: true, data: {} })), postId: 'st-amie-1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  test('un identifiant INCONNU ⇒ 404 POST_NOT_FOUND', async () => {
    const result = await fetchStoryViewers({ source: 'fixtures', transport: stubTransport(() => ({ ok: true, data: {} })), postId: 'st-inexistante' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
    expect(result.code).toBe('POST_NOT_FOUND');
  });
});

describe('fetchStoryViewers — le transport RÉEL', () => {
  test('appelle exactement la route de la passerelle, et restitue `pagination`', async () => {
    const seen: { request: HttpRequest | null } = { request: null };
    const transport = stubTransport((request) => {
      seen.request = request;
      return {
        ok: true,
        data: { viewers: [{ id: 'u-1', username: 'a', displayName: 'A', avatarUrl: null, viewedAt: '2026-09-24T10:00:00Z', reaction: null }] },
        pagination: { total: 1, offset: 0, limit: 50, hasMore: false },
      };
    });
    const result = await fetchStoryViewers({ source: 'gateway', transport, postId: 'p-1' });
    expect(seen.request?.method).toBe('GET');
    expect(seen.request?.path).toBe('/api/v1/posts/p-1/interactions');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pagination).toEqual({ total: 1, offset: 0, limit: 50, hasMore: false });
  });

  test('`engagement: "unavailable"` passe tel quel ; absent, il reste absent (#9727)', async () => {
    const row = { id: 'u-1', username: 'a', displayName: 'A', avatarUrl: null, viewedAt: '2026-09-24T10:00:00Z', reaction: null };
    const unavailable = await fetchStoryViewers({
      source: 'gateway',
      transport: stubTransport(() => ({ ok: true, data: { viewers: [row], engagement: 'unavailable' } })),
      postId: 'p-1',
    });
    const served = await fetchStoryViewers({ source: 'gateway', transport: stubTransport(() => ({ ok: true, data: { viewers: [row] } })), postId: 'p-1' });
    expect(unavailable.ok && unavailable.data.engagement).toBe('unavailable');
    expect(served.ok && 'engagement' in served.data).toBe(false);
  });

  test('un refus de la passerelle passe TEL QUEL', async () => {
    const transport = stubTransport(() => ({ ok: false, status: 403, error: 'Only the author can view interactions', code: 'FORBIDDEN' }));
    const result = await fetchStoryViewers({ source: 'gateway', transport, postId: 'p-1' });
    expect(result).toEqual({ ok: false, status: 403, error: 'Only the author can view interactions', code: 'FORBIDDEN' });
  });
});

describe('fetchStoryViewers — les visiteurs sans compte (#10483)', () => {
  const page = (extra: Record<string, unknown>) =>
    stubTransport(() => ({ ok: true, data: { viewers: [], ...extra }, pagination: { total: 0, offset: 0, limit: 50, hasMore: false } }));

  test('un serveur qui sert `anonymousViewCount` le transmet', async () => {
    const result = await fetchStoryViewers({ source: 'gateway', transport: page({ anonymousViewCount: 4 }), postId: 'p-1' });
    expect(result.ok && result.data.anonymousViewCount).toBe(4);
  });

  test('#11065 — le compte de vues RELU avec la liste est transmis ; absent ou invalide ⇒ rien', async () => {
    const served = await fetchStoryViewers({ source: 'gateway', transport: page({ viewCount: 4 }), postId: 'p-1' });
    expect(served.ok && served.data.viewCount).toBe(4);
    for (const extra of [{}, { viewCount: null }, { viewCount: -1 }, { viewCount: 2.5 }, { viewCount: 'x' }]) {
      const result = await fetchStoryViewers({ source: 'gateway', transport: page(extra), postId: 'p-1' });
      expect(result.ok && result.data.viewCount).toBeUndefined();
    }
  });

  test('un ancien serveur (champ absent) ou une valeur invalide ⇒ aucun compte de visiteurs', async () => {
    for (const extra of [{}, { anonymousViewCount: null }, { anonymousViewCount: -1 }, { anonymousViewCount: 'x' }]) {
      const result = await fetchStoryViewers({ source: 'gateway', transport: page(extra), postId: 'p-1' });
      expect(result.ok && result.data.anonymousViewCount).toBeUndefined();
    }
  });
});
