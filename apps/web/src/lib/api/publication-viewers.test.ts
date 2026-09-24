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

  test('un refus de la passerelle passe TEL QUEL', async () => {
    const transport = stubTransport(() => ({ ok: false, status: 403, error: 'Only the author can view interactions', code: 'FORBIDDEN' }));
    const result = await fetchStoryViewers({ source: 'gateway', transport, postId: 'p-1' });
    expect(result).toEqual({ ok: false, status: 403, error: 'Only the author can view interactions', code: 'FORBIDDEN' });
  });
});
