import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { loadReelsPage, reelsQueryKey, REELS_PAGE_SIZE } from './reels';

/**
 * LE PORT DES RÉELS (#6457) — `GET /api/v1/social/posts?scope=reels`, la route
 * UNIFIÉE dont `/posts/feed/reels` n'est plus qu'un alias déprécié
 * (`services/gateway/src/routes/posts/feed.ts`, `SUCCESSEURS_SOCIAL_POSTS.reels`).
 * Un client NEUF n'adopte pas une adresse que la passerelle annonce en retrait.
 */
const scripted = (response: ApiResult<unknown>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return Promise.resolve(response);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

describe('loadReelsPage — passerelle', () => {
  test('sans graine : le fil « Pour toi », vingt réels, sans `seed`', async () => {
    const { requests, transport } = scripted({ ok: true, data: [], pagination: { limit: 20, hasMore: false, nextCursor: null } as never });
    await loadReelsPage({ source: 'gateway', transport });
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.path).toBe(`/api/v1/social/posts?scope=reels&limit=${REELS_PAGE_SIZE}`);
  });

  test('avec graine et curseur : le fil d’affinité du réel touché, curseur transmis tel quel', async () => {
    const { requests, transport } = scripted({ ok: true, data: [], pagination: { limit: 20, hasMore: false, nextCursor: null } as never });
    await loadReelsPage({ source: 'gateway', transport, seed: 'r 1', cursor: 'opaque==' });
    expect(requests[0]?.path).toBe('/api/v1/social/posts?scope=reels&limit=20&seed=r+1&cursor=opaque%3D%3D');
  });

  test('annonce X-Canvas-Caps: 3 (#6903) — sans lui, un réel composé arrive sans sa scène', async () => {
    const { requests, transport } = scripted({ ok: true, data: [], pagination: { limit: 20, hasMore: false, nextCursor: null } as never });
    await loadReelsPage({ source: 'gateway', transport });
    expect(requests[0]?.headers).toEqual({ 'X-Canvas-Caps': '3' });
  });

  test('graine + curseur : l’en-tête ne se perd pas sur la seconde page', async () => {
    const { requests, transport } = scripted({ ok: true, data: [], pagination: { limit: 20, hasMore: false, nextCursor: null } as never });
    await loadReelsPage({ source: 'gateway', transport, seed: 'r1', cursor: 'c2' });
    expect(requests[0]?.headers).toEqual({ 'X-Canvas-Caps': '3' });
  });

  test('ne garde que des RÉELS bien formés, et lit le curseur de la route unifiée', async () => {
    const { transport } = scripted({
      ok: true,
      data: [
        { id: 'r1', type: 'REEL', createdAt: '2026-09-14T08:00:00.000Z' },
        { id: 'p1', type: 'POST', createdAt: '2026-09-14T08:00:00.000Z' },
        { type: 'REEL' },
        null,
      ],
      pagination: { limit: 20, hasMore: true, nextCursor: 'c2', form: 'keyset' } as never,
    });
    const result = await loadReelsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.posts.map((p) => p.id)).toEqual(['r1']);
    expect(result.data.pagination).toEqual({ limit: 20, hasMore: true, nextCursor: 'c2' });
  });

  test('une erreur de la passerelle remonte telle quelle', async () => {
    const { transport } = scripted({ ok: false, status: 401, error: 'Authentication required', code: 'UNAUTHORIZED' });
    const result = await loadReelsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
  });
});

describe('loadReelsPage — fixtures', () => {
  test('sert des réels factices par le MÊME chemin, et exclut la graine comme la passerelle', async () => {
    const { transport, requests } = scripted({ ok: true, data: [] });
    const first = await loadReelsPage({ source: 'fixtures', transport });
    expect(requests).toHaveLength(0);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.posts.length).toBeGreaterThanOrEqual(4);
    expect(first.data.posts.every((p) => p.type === 'REEL')).toBe(true);

    const seedId = first.data.posts[0]?.id ?? '';
    const seeded = await loadReelsPage({ source: 'fixtures', transport, seed: seedId });
    expect(seeded.ok && seeded.data.posts.some((p) => p.id === seedId)).toBe(false);
  });
});

describe('reelsQueryKey — un fil par graine, sous une même racine', () => {
  test('la racine `reels` couvre toutes les graines', () => {
    expect(reelsQueryKey()).toEqual(['reels', '']);
    expect(reelsQueryKey('r1')).toEqual(['reels', 'r1']);
  });
});
