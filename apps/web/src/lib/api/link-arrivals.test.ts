import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  decodeShareLinkArrivalsPage,
  loadShareLinkArrivals,
  seedArrivalsFromStats,
  shareLinkArrivalsQueryKey,
  shareLinkArrivalsQueryOptions,
} from './link-arrivals';
import type { ShareLinkStats } from './link-stats';

/**
 * LA LISTE COMPLÈTE DES ARRIVÉES D'UN LIEN (#7813) — `GET
 * /api/v1/links/:linkId/arrivals?cursor=&limit=`, réservée aux lecteurs des
 * statistiques. Une arrivée n'y porte que nom, badge sans compte, pays,
 * langue et date.
 */

function fakeTransport(results: ReadonlyArray<ApiResult<unknown>>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => results[0]) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return results[Math.min(requests.length - 1, results.length - 1)];
  }) as HttpTransport['request'];
  return { transport, requests };
}

const served = (nextCursor: string | null = 'c2') => ({
  arrivals: [
    { displayName: 'Priya', isAnonymous: true, country: 'in', language: 'EN', joinedAt: '2026-09-24T11:58:00.000Z' },
    { displayName: 'Kwame', isAnonymous: false, country: null, language: null, joinedAt: '2026-09-24T11:00:00.000Z' },
  ],
  nextCursor,
});

describe('decodeShareLinkArrivalsPage', () => {
  test('décode les arrivées et la suite', () => {
    expect(decodeShareLinkArrivalsPage(served())).toEqual({
      arrivals: [
        { displayName: 'Priya', isAnonymous: true, country: 'IN', language: 'en', joinedAt: '2026-09-24T11:58:00.000Z' },
        { displayName: 'Kwame', isAnonymous: false, country: null, language: null, joinedAt: '2026-09-24T11:00:00.000Z' },
      ],
      nextCursor: 'c2',
    });
  });

  test('une arrivée sans nom ou sans date lisible est écartée, pas toute la page', () => {
    const decoded = decodeShareLinkArrivalsPage({
      arrivals: [
        { displayName: '', isAnonymous: true, country: null, language: null, joinedAt: '2026-09-24T11:58:00.000Z' },
        { displayName: 'Ana', isAnonymous: true, country: 'XYZ', language: 'pt', joinedAt: 'hier' },
        { displayName: 'Lou', isAnonymous: true, country: 'XYZ', language: 'pt', joinedAt: '2026-09-24T11:00:00.000Z' },
      ],
      nextCursor: null,
    });
    expect(decoded?.arrivals).toEqual([{ displayName: 'Lou', isAnonymous: true, country: null, language: 'pt', joinedAt: '2026-09-24T11:00:00.000Z' }]);
    expect(decoded?.nextCursor).toBeNull();
  });

  test('ne garde de la charge que les cinq champs affichés', () => {
    const decoded = decodeShareLinkArrivalsPage({
      arrivals: [{ ...served().arrivals[0], avatar: 'u/p.png', participantId: 'p1', isOnline: true }],
      nextCursor: null,
    });
    expect(Object.keys(decoded?.arrivals[0] ?? {}).sort()).toEqual(['country', 'displayName', 'isAnonymous', 'joinedAt', 'language']);
  });

  test('une charge qui n’a pas la forme attendue est illisible', () => {
    expect(decodeShareLinkArrivalsPage({ arrivals: 'beaucoup' })).toBeNull();
    expect(decodeShareLinkArrivalsPage(null)).toBeNull();
  });
});

describe('loadShareLinkArrivals — GET /api/v1/links/:linkId/arrivals', () => {
  test('la première page part sans curseur, à l’identifiant encodé', async () => {
    const { transport, requests } = fakeTransport([{ ok: true, data: served() }]);
    const result = await loadShareLinkArrivals({ source: 'gateway', transport, linkId: 'mshy_é 1', cursor: null });
    expect(requests.map((r) => [r.method, r.path])).toEqual([['GET', '/api/v1/links/mshy_%C3%A9%201/arrivals?limit=30']]);
    expect(result.ok && result.data.nextCursor).toBe('c2');
  });

  test('la suivante renvoie le curseur tel quel, encodé', async () => {
    const { transport, requests } = fakeTransport([{ ok: true, data: served(null) }]);
    await loadShareLinkArrivals({ source: 'gateway', transport, linkId: 'mshy_a', cursor: 'MTc1OD+/=' });
    expect(requests[0]?.path).toBe('/api/v1/links/mshy_a/arrivals?limit=30&cursor=MTc1OD%2B%2F%3D');
  });

  test('un refus de la passerelle reste un refus', async () => {
    const { transport } = fakeTransport([{ ok: false, status: 403, error: 'Permissions insuffisantes' }]);
    const result = await loadShareLinkArrivals({ source: 'gateway', transport, linkId: 'mshy_a', cursor: null });
    expect(result.ok).toBe(false);
  });

  test('une réponse illisible est une erreur, jamais une liste vide', async () => {
    const { transport } = fakeTransport([{ ok: true, data: { arrivals: 7 } }]);
    const result = await loadShareLinkArrivals({ source: 'gateway', transport, linkId: 'mshy_a', cursor: null });
    expect(result.ok).toBe(false);
  });
});

describe('shareLinkArrivalsQueryOptions', () => {
  test('rangée dans la famille persistée des liens, une entrée par lien', () => {
    expect(shareLinkArrivalsQueryKey('mshy_a')).toEqual(['share-links', 'arrivals', 'mshy_a']);
  });

  test('la page suivante est désignée par le curseur servi, la dernière n’en a pas', () => {
    const { transport } = fakeTransport([{ ok: true, data: served() }]);
    const options = shareLinkArrivalsQueryOptions({ source: 'gateway', transport }, 'mshy_a');
    expect(options.initialPageParam).toBeNull();
    expect(options.getNextPageParam({ arrivals: [], nextCursor: 'c2' })).toBe('c2');
    expect(options.getNextPageParam({ arrivals: [], nextCursor: null })).toBeUndefined();
  });
});

describe('seedArrivalsFromStats — ce qu’on a déjà en main se peint tout de suite', () => {
  const stats = (overrides: Partial<ShareLinkStats> = {}): ShareLinkStats => ({
    visits: 3,
    arrivals: 2,
    anonymousArrivals: 1,
    arrivalsByLanguage: [],
    arrivalsByCountry: [],
    recentArrivals: [
      { participantId: 'p1', displayName: 'Priya', avatar: 'u/p.png', isAnonymous: true, country: 'IN', language: 'en', joinedAt: '2026-09-24T11:58:00.000Z' },
    ],
    ...overrides,
  });

  test('les arrivées récentes deviennent une première page, sans identifiant ni visage', () => {
    expect(seedArrivalsFromStats(stats())).toEqual({
      arrivals: [{ displayName: 'Priya', isAnonymous: true, country: 'IN', language: 'en', joinedAt: '2026-09-24T11:58:00.000Z' }],
    });
  });

  test('sans statistiques en main, rien à peindre', () => {
    expect(seedArrivalsFromStats(null)).toBeNull();
    expect(seedArrivalsFromStats(undefined)).toBeNull();
  });
});
