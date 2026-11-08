import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeSharedLocation, loadSharedLocations } from './shared-locations';

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

  test('une précision inconnue se lit « city » — jamais plus fine', () => {
    expect(decodeSharedLocation(served({ precision: 'street' }))?.precision).toBe('city');
  });

  test.each([
    ['latitude hors bornes', { latitude: 91 }],
    ['longitude hors bornes', { longitude: -181 }],
    ['rayon négatif', { radiusMeters: -1 }],
    ['échéance illisible', { expiresAt: 'demain' }],
    ['identifiant absent', { userId: '' }],
  ])('refuse %s', (_label, patch) => {
    expect(decodeSharedLocation(served(patch))).toBeNull();
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
    const result = await loadSharedLocations({ source: 'live', transport, bbox });
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.path).toBe('/api/v1/relations/locations?bbox=2,48,3,49');
    expect(result).toEqual({ ok: true, data: [served()] });
  });

  test('saute les lignes illisibles sans perdre les autres', async () => {
    const { transport } = fakeTransport({ ok: true, data: { items: [served(), { userId: 'x' }, served({ userId: '64b000000000000000000002' })] } });
    const result = await loadSharedLocations({ source: 'live', transport, bbox });
    expect(result.ok && result.data.map((item) => item.userId)).toEqual(['64b000000000000000000001', '64b000000000000000000002']);
  });

  test('une charge sans liste se lit vide', async () => {
    const { transport } = fakeTransport({ ok: true, data: null });
    expect(await loadSharedLocations({ source: 'live', transport, bbox })).toEqual({ ok: true, data: [] });
  });

  test('un échec est rendu tel quel', async () => {
    const failure: ApiResult<unknown> = { ok: false, error: { kind: 'network', message: 'hors ligne' } } as ApiResult<unknown>;
    const { transport } = fakeTransport(failure);
    expect(await loadSharedLocations({ source: 'live', transport, bbox })).toEqual(failure as never);
  });
});
