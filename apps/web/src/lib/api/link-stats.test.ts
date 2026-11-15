import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeShareLinkStats, loadShareLinkStats, shareLinkStatsQueryKey } from './link-stats';

/**
 * LES STATISTIQUES D'UN LIEN (#7797) — `GET /api/v1/links/:linkId/stats`,
 * réservé au créateur et aux administrateurs du groupe. La route est livrée
 * en parallèle par la passerelle (#7794) : tant qu'elle répond 404, la page
 * dessine ses emplacements, jamais des zéros.
 */

function fakeTransport(result: ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return result;
  }) as HttpTransport['request'];
  return { transport, requests };
}

const served = () => ({
  visits: 1284,
  arrivals: 412,
  anonymousArrivals: 157,
  arrivalsByLanguage: [
    { language: 'fr', count: 120 },
    { language: 'ES', count: 86 },
  ],
  arrivalsByCountry: [{ country: 'sn', count: 40 }],
  recentArrivals: [
    { participantId: 'p1', displayName: 'Priya', avatar: null, isAnonymous: true, country: 'IN', language: 'en', joinedAt: '2026-09-24T11:58:00.000Z' },
    { participantId: 'p2', displayName: 'Kwame', avatar: 'u/k.png', isAnonymous: false, country: null, language: null, joinedAt: '2026-09-24T11:00:00.000Z' },
  ],
});

describe('decodeShareLinkStats', () => {
  test('décode les compteurs, les répartitions et les arrivées récentes', () => {
    expect(decodeShareLinkStats(served())).toEqual({
      visits: 1284,
      arrivals: 412,
      anonymousArrivals: 157,
      arrivalsByLanguage: [
        { code: 'fr', count: 120 },
        { code: 'es', count: 86 },
      ],
      arrivalsByCountry: [{ country: 'SN', count: 40 }],
      recentArrivals: [
        { participantId: 'p1', displayName: 'Priya', avatar: null, isAnonymous: true, country: 'IN', language: 'en', joinedAt: '2026-09-24T11:58:00.000Z' },
        { participantId: 'p2', displayName: 'Kwame', avatar: 'u/k.png', isAnonymous: false, country: null, language: null, joinedAt: '2026-09-24T11:00:00.000Z' },
      ],
    });
  });

  test('un compteur illisible vaut zéro ; une arrivée sans nom ni date est écartée', () => {
    const decoded = decodeShareLinkStats({
      ...served(),
      visits: -3,
      recentArrivals: [{ participantId: 'p9', displayName: '', avatar: null, isAnonymous: true, country: null, language: null, joinedAt: 'hier' }],
    });
    expect(decoded?.visits).toBe(0);
    expect(decoded?.recentArrivals).toEqual([]);
  });

  test('une charge qui n’a pas la forme attendue est illisible', () => {
    expect(decodeShareLinkStats({ arrivals: 'beaucoup' })).toBeNull();
    expect(decodeShareLinkStats(null)).toBeNull();
  });
});

describe('loadShareLinkStats — GET /api/v1/links/:linkId/stats', () => {
  test('lit la route du créateur, à l’identifiant encodé', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: served() });
    const result = await loadShareLinkStats({ source: 'gateway', transport, linkId: 'mshy_é 1' });
    expect(requests.map((r) => [r.method, r.path])).toEqual([['GET', '/api/v1/links/mshy_%C3%A9%201/stats']]);
    expect(result.ok && result.data?.arrivals).toBe(412);
  });

  test('404 : la route n’est pas encore servie — AUCUNE statistique, jamais une erreur ni des zéros', async () => {
    const { transport } = fakeTransport({ ok: false, status: 404, error: 'Not Found' });
    const result = await loadShareLinkStats({ source: 'gateway', transport, linkId: 'mshy_l1' });
    expect(result).toEqual({ ok: true, data: null });
  });

  test('un autre refus reste un échec', async () => {
    const { transport } = fakeTransport({ ok: false, status: 403, error: 'Forbidden' });
    const result = await loadShareLinkStats({ source: 'gateway', transport, linkId: 'mshy_l1' });
    expect(result.ok).toBe(false);
  });

  test('en fixtures, sans réseau', async () => {
    const { transport, requests } = fakeTransport({ ok: false, status: 0, error: 'jamais appelé' });
    const result = await loadShareLinkStats({ source: 'fixtures', transport, linkId: 'mshy_equipe-deploiement_7f3a' });
    expect(result.ok && (result.data?.arrivals ?? 0) > 0).toBe(true);
    expect(requests).toHaveLength(0);
  });

  test('chaque lien a sa propre entrée de cache, sous la famille des liens', () => {
    expect(shareLinkStatsQueryKey('mshy_l1')).toEqual(['share-links', 'stats', 'mshy_l1']);
  });
});
