import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeOwnSharedLocation, decodeSharedLocation, loadOwnSharedLocation, loadSharedLocations, sharedLocationsQueryOptions } from './shared-locations';
import { estClefNonPersistable, estClefSouveraine } from './souverain';
import { apiResponseMayBeCached } from '@/lib/net/api-runtime-cache';
import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';

/**
 * **LES POSITIONS QU’ON ME PARTAGE, CÔTÉ PORT (#16984)** — `GET /relations/locations?bbox=`.
 * Décodage tolérant et FERMÉ : rien n’est fabriqué hors de la charge servie. Une ligne
 * illisible se saute (elle ne fait pas tomber les autres), une précision inconnue se
 * lit « ville » (la plus floue), jamais plus fine.
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

const served = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: '64b000000000000000000001',
  latitude: 48.85,
  longitude: 2.35,
  precision: 'neighborhood',
  radiusMeters: 800,
  updatedAt: '2026-11-08T10:00:00.000Z',
  expiresAt: '2026-11-08T11:00:00.000Z',
  ...overrides,
});

describe('decodeSharedLocation', () => {
  test('lit une position servie telle quelle', () => {
    expect(decodeSharedLocation(served())).toEqual(served());
  });

  test('garde le cercle servi (#17013, #17966)', () => {
    expect(decodeSharedLocation(served({ circle: 'BLOOD' }))?.circle).toBe('BLOOD');
  });

  test('un cercle inconnu ou absent ne traverse pas : le marqueur reste neutre, rien n’est deviné', () => {
    expect(decodeSharedLocation(served({ circle: 'ACQUAINTANCE' }))).toEqual(served());
    expect(decodeSharedLocation(served({ circle: 7 }))).toEqual(served());
    expect(Object.keys(decodeSharedLocation(served()) ?? {})).not.toContain('circle');
  });

  test('une précision inconnue se lit « city » — jamais plus fine', () => {
    expect(decodeSharedLocation(served({ precision: 'street' }))?.precision).toBe('city');
  });

  const refused: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]> = [
    ['latitude hors bornes', { latitude: 91 }],
    ['longitude hors bornes', { longitude: -181 }],
    ['rayon négatif', { radiusMeters: -1 }],
    ['échéance illisible', { expiresAt: 'demain' }],
    ['identifiant absent', { userId: '' }],
  ];
  refused.forEach(([label, patch]) => {
    test(`refuse ${label}`, () => {
      expect(decodeSharedLocation(served(patch))).toBeNull();
    });
  });

  test('un champ voisin servi par erreur ne traverse pas', () => {
    const decoded = decodeSharedLocation(served({ accuracy: 4, speed: 12 }));
    expect(decoded).not.toBeNull();
    expect(Object.keys(decoded ?? {}).sort()).toEqual(['expiresAt', 'latitude', 'longitude', 'precision', 'radiusMeters', 'updatedAt', 'userId']);
  });
});

describe('loadSharedLocations', () => {
  const bbox = { minLongitude: 2, minLatitude: 48, maxLongitude: 3, maxLatitude: 49 };

  test('interroge la route avec l’emprise visible', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: { items: [served()] } });
    const result = await loadSharedLocations({ source: 'gateway', transport, bbox });
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.path).toBe('/api/v1/relations/locations?bbox=2,48,3,49');
    expect(result).toEqual({ ok: true, data: [served()] });
  });

  test('saute les lignes illisibles sans perdre les autres', async () => {
    const { transport } = fakeTransport({ ok: true, data: { items: [served(), { userId: 'x' }, served({ userId: '64b000000000000000000002' })] } });
    const result = await loadSharedLocations({ source: 'gateway', transport, bbox });
    expect(result.ok && result.data.map((item) => item.userId)).toEqual(['64b000000000000000000001', '64b000000000000000000002']);
  });

  test('une charge sans liste se lit vide', async () => {
    const { transport } = fakeTransport({ ok: true, data: null });
    expect(await loadSharedLocations({ source: 'gateway', transport, bbox })).toEqual({ ok: true, data: [] });
  });

  test('un échec est rendu tel quel', async () => {
    const failure: ApiResult<unknown> = { ok: false, status: 0, error: 'hors ligne' };
    const { transport } = fakeTransport(failure);
    expect(await loadSharedLocations({ source: 'gateway', transport, bbox })).toEqual(failure);
  });
});

describe('sharedLocationsQueryOptions', () => {
  const bbox = { minLongitude: 2, minLatitude: 48, maxLongitude: 3, maxLatitude: 49 };

  test('les positions de mes liens ne touchent jamais le disque du navigateur (le cache de requêtes y est déshydraté)', () => {
    const { transport } = fakeTransport({ ok: true, data: { items: [] } });
    expect(estClefNonPersistable(sharedLocationsQueryOptions({ source: 'gateway', transport }, bbox).queryKey)).toBe(true);
  });

  test('elles ne se rangent pas sous la clé de l’administration souveraine : leur exclusion dit son intention', () => {
    const { transport } = fakeTransport({ ok: true, data: { items: [] } });
    expect(estClefSouveraine(sharedLocationsQueryOptions({ source: 'gateway', transport }, bbox).queryKey)).toBe(false);
  });

  test('le rattrapage dit SON emprise et l’instant où il est parti : c’est ce qui le rend souverain dans cette emprise', async () => {
    const { transport } = fakeTransport({ ok: true, data: { items: [served()] } });
    const before = Date.now();
    const data = await sharedLocationsQueryOptions({ source: 'gateway', transport }, bbox).queryFn({});
    expect(data.items.map((item) => item.userId)).toEqual(['64b000000000000000000001']);
    expect(data.bbox).toEqual(bbox);
    expect(data.requestedAt).toBeGreaterThanOrEqual(before);
    expect(data.requestedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('le service worker ne garde pas les positions de mes liens (audit #16984)', () => {
  test('la réponse brute de GET /relations/locations n’entre pas dans le seau « api » (NetworkFirst, 7 jours sur disque, rejouée hors réseau)', () => {
    expect(apiResponseMayBeCached(`${relationsEndpoints.locations}?bbox=-180,-90,180,90`)).toBe(false);
  });
});

describe('MON partage, tel que la passerelle le sert (#18389)', () => {
  const ID = '64B000000000000000000001';
  const row = { userId: ID, precision: 'exact', expiresAt: '2026-11-14T09:00:00.000Z' };

  test('lit la liste servie, identifiants en minuscules, et rien d’autre', () => {
    expect(decodeOwnSharedLocation({ recipients: [{ ...row, latitude: 48.85 }], expiresAt: '2026-11-14T09:00:00.000Z', position: { latitude: 1 } })).toEqual({
      recipients: [{ userId: ID.toLowerCase(), precision: 'exact', expiresAt: '2026-11-14T09:00:00.000Z' }],
      expiresAt: '2026-11-14T09:00:00.000Z',
    });
  });

  test('le démarrage servi (`startedAt`, #18580) est gardé tel quel ; absent ou illisible, il n’existe pas', () => {
    expect(decodeOwnSharedLocation({ recipients: [row], expiresAt: null, startedAt: '2026-11-14T08:00:00.000Z' })?.startedAt).toBe('2026-11-14T08:00:00.000Z');
    expect(decodeOwnSharedLocation({ recipients: [row], expiresAt: null, startedAt: 12 })?.startedAt).toBeUndefined();
  });

  test('une ligne illisible se saute ; une précision inconnue se lit « ville »', () => {
    const decoded = decodeOwnSharedLocation({ recipients: [{ userId: 'x' }, { ...row, expiresAt: 'demain' }, { ...row, precision: 'gps' }], expiresAt: null });
    expect(decoded?.recipients).toEqual([{ userId: ID.toLowerCase(), precision: 'city', expiresAt: row.expiresAt }]);
  });

  test('sans liste lisible : « je ne sais pas » (null), jamais « plus aucun partage »', () => {
    expect(decodeOwnSharedLocation(null)).toBeNull();
    expect(decodeOwnSharedLocation({ expiresAt: null })).toBeNull();
    expect(decodeOwnSharedLocation({ recipients: [], expiresAt: null })).toEqual({ recipients: [], expiresAt: null });
  });

  test('appelle GET /relations/locations/mine ; un échec (passerelle d’avant, hors ligne) rend null', async () => {
    const ok = fakeTransport({ ok: true, data: { recipients: [row], expiresAt: row.expiresAt } });
    expect((await loadOwnSharedLocation({ source: 'gateway', transport: ok.transport }))?.recipients).toHaveLength(1);
    expect(ok.requests[0]).toMatchObject({ method: 'GET', path: relationsEndpoints.locationsMine });
    const ko = fakeTransport({ ok: false, error: { kind: 'http', status: 404 } } as unknown as ApiResult<unknown>);
    expect(await loadOwnSharedLocation({ source: 'gateway', transport: ko.transport })).toBeNull();
  });

  test('la relecture ne survit dans aucun cache disque du service worker', () => {
    expect(apiResponseMayBeCached(relationsEndpoints.locationsMine)).toBe(false);
  });
});
