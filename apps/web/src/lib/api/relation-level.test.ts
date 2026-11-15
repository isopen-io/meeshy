import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeRelationLevel, loadRelationLevel, relationLevelProvider } from './relation-level';

/**
 * LE NIVEAU EFFECTIF DE MON LIEN AVEC UNE PERSONNE (#13998, #13997) —
 * `GET /api/v1/relations/:userId`. La réponse ne dit RIEN de plus que le
 * niveau ; `PUBLIC` dit aussi « bloqué » et « inconnu ». Toute lecture qui
 * doute rend `null` : le logo de cercle de l'export se ferme sur le doute.
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

const served = (effectiveLevel: unknown = 'CLOSE') => ({ userId: '64b000000000000000000001', effectiveLevel });

describe('decodeRelationLevel', () => {
  for (const level of ['PUBLIC', 'COMMUNITY', 'ACQUAINTANCE', 'FRIEND', 'CLOSE', 'BLOOD']) {
    test(`lit le niveau ${level}`, () => {
      expect(decodeRelationLevel(served(level))).toBe(level);
    });
  }

  test('un champ de plus est ignoré : un client ancien lit une passerelle récente', () => {
    expect(decodeRelationLevel({ ...served('BLOOD'), grantedByMe: 'CLOSE', since: '2026-10-31' })).toBe('BLOOD');
  });

  test('un niveau réservé, inconnu, absent ou une charge illisible : null', () => {
    expect(decodeRelationLevel(served('ATOM'))).toBeNull();
    expect(decodeRelationLevel(served('close'))).toBeNull();
    expect(decodeRelationLevel({ userId: 'u1' })).toBeNull();
    expect(decodeRelationLevel(served(3))).toBeNull();
    expect(decodeRelationLevel(null)).toBeNull();
    expect(decodeRelationLevel('CLOSE')).toBeNull();
  });
});

describe('loadRelationLevel — GET /api/v1/relations/:userId', () => {
  test('lit la route générée, à l’identifiant encodé, et rend le niveau servi', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: served('BLOOD') });
    const result = await loadRelationLevel({ source: 'gateway', transport, userId: 'u 1/é' });
    expect(requests.map((r) => [r.method, r.path])).toEqual([['GET', '/api/v1/relations/u%201%2F%C3%A9']]);
    expect(result).toEqual({ ok: true, data: 'BLOOD' });
  });

  test('le signal de l’appelant est transmis', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: served() });
    const signal = new AbortController().signal;
    await loadRelationLevel({ source: 'gateway', transport, userId: 'u1', signal });
    expect(requests[0]?.signal).toBe(signal);
  });

  test('une charge illisible : succès sans niveau, jamais une exception', async () => {
    const { transport } = fakeTransport({ ok: true, data: { effectiveLevel: 'ATOM' } });
    expect(await loadRelationLevel({ source: 'gateway', transport, userId: 'u1' })).toEqual({ ok: true, data: null });
  });

  test('un refus reste un échec', async () => {
    const { transport } = fakeTransport({ ok: false, status: 429, error: 'Too Many Requests' });
    const result = await loadRelationLevel({ source: 'gateway', transport, userId: 'u1' });
    expect(result.ok).toBe(false);
  });

  test('en fixtures : aucun appel, aucun niveau', async () => {
    const { transport, requests } = fakeTransport({ ok: false, status: 0, error: 'jamais appelé' });
    expect(await loadRelationLevel({ source: 'fixtures', transport, userId: 'u1' })).toEqual({ ok: true, data: null });
    expect(requests).toHaveLength(0);
  });
});

describe('relationLevelProvider — le fournisseur du port de l’export', () => {
  const signal = new AbortController().signal;
  const gateway = (result: ApiResult<unknown>) => ({ source: 'gateway' as const, transport: fakeTransport(result).transport });

  test('rend le niveau effectif servi pour l’auteur, signal transmis', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: served('CLOSE') });
    const provider = relationLevelProvider({ source: 'gateway', transport });
    expect(await provider({ authorId: '64b000000000000000000001', signal })).toBe('CLOSE');
    expect(requests.map((r) => r.path)).toEqual(['/api/v1/relations/64b000000000000000000001']);
    expect(requests[0]?.signal).toBe(signal);
  });

  test('un échec ou un niveau illisible : null, le logo se ferme', async () => {
    const failing = relationLevelProvider(gateway({ ok: false, status: 500, error: 'boom' }));
    const unreadable = relationLevelProvider(gateway({ ok: true, data: 'x' }));
    expect(await failing({ authorId: 'u1', signal })).toBeNull();
    expect(await unreadable({ authorId: 'u1', signal })).toBeNull();
  });

  test('en fixtures : null, sans réseau', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: served('BLOOD') });
    const provider = relationLevelProvider({ source: 'fixtures', transport });
    expect(await provider({ authorId: 'u1', signal })).toBeNull();
    expect(requests).toHaveLength(0);
  });
});
