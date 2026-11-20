import { describe, expect, test } from 'bun:test';

import { FALL_CLEARED_REASONS } from '@meeshy/shared/types/fall-detection';

import { FALL_CLEARED_REASONS_WEB, decodeFallCleared, decodeFallDetected, decodeFallState, fallPersonSettingsQueryKey, loadFallPersonSettings, loadFallSnapshot, saveFallPersonSettings } from './fall';
import { persistableQuery } from './query-client';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * LA CHUTE DÉTECTÉE DE MES SANGS, TELLE QUE LA PASSERELLE LA SERT (#18748, SAN-01) — un décodeur qui ne garde que les
 * champs du contrat (`fall:detected`, `fall:cleared`, l'état du rattrapage), tolère une position, une batterie, une
 * annonce ou une raison illisibles sans perdre l'état, et un port REST pour le rattrapage et le réglage par personne.
 */

const EMITTER = '65a1b2c3d4e5f60718293a4b';
const DETECTED = '2026-11-19T16:42:00.000Z';
const EXPIRES = '2026-11-19T22:42:00.000Z';

const served = (overrides: Readonly<Record<string, unknown>> = {}) => ({ userId: EMITTER, detectedAt: DETECTED, expiresAt: EXPIRES, ...overrides });

const POSITION = { latitude: 48.8566, longitude: 2.3522, accuracy: 25, recordedAt: '2026-11-19T16:40:00.000Z' };
const BATTERY = { level: 41, measuredAt: '2026-11-19T16:30:00.000Z' };

function transport(reply: ApiResult<unknown>) {
  const calls: HttpRequest[] = [];
  const port = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return reply as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport: port }, calls };
}

describe('mon réglage de chute par personne ne se range jamais sur le disque', () => {
  test('sa clé est sous le préfixe hors disque : elle dit qui je préviens d’une donnée de santé', () => {
    expect(persistableQuery({ state: { status: 'success' }, queryKey: fallPersonSettingsQueryKey(EMITTER) })).toBe(false);
  });
});

describe('les valeurs écrites en littéral sont celles du contrat', () => {
  test('les raisons de `fall:cleared`', () => {
    expect(FALL_CLEARED_REASONS_WEB).toEqual(FALL_CLEARED_REASONS);
  });
});

describe('decodeFallState', () => {
  test('garde les champs du contrat, la position et la batterie quand elles sont servies', () => {
    expect(decodeFallState(served())).toEqual(served());
    expect(decodeFallState(served({ lastPosition: POSITION, lastBattery: BATTERY }))).toEqual(served({ lastPosition: POSITION, lastBattery: BATTERY }));
  });

  test('une position ou une batterie illisible se tait, l’état reste lu', () => {
    expect(decodeFallState(served({ lastPosition: { latitude: 200, longitude: 2, recordedAt: DETECTED }, lastBattery: { level: 'neuf', measuredAt: DETECTED } }))).toEqual(served());
  });

  test('un instant illisible ou une personne absente : rien', () => {
    expect(decodeFallState(served({ detectedAt: 'tout à l’heure' }))).toBeNull();
    expect(decodeFallState(served({ expiresAt: undefined }))).toBeNull();
    expect(decodeFallState(served({ userId: '' }))).toBeNull();
    expect(decodeFallState(null)).toBeNull();
  });

  test('un champ en trop ne traverse pas', () => {
    const decoded = decodeFallState(served({ heartRate: 140, lastPosition: { ...POSITION, address: '1 rue' } }));
    expect(decoded !== null && 'heartRate' in decoded).toBe(false);
    expect(decoded?.lastPosition !== undefined && 'address' in decoded.lastPosition).toBe(false);
  });
});

describe('les événements', () => {
  test('`fall:detected` porte l’état et l’annonce quand elle est servie', () => {
    const announcement = { kind: 'detected', at: DETECTED };
    expect(decodeFallDetected({ userId: EMITTER, state: served(), announcement })).toEqual({ userId: EMITTER, state: served(), announcement });
  });

  test('une annonce d’un genre inconnu est ignorée, l’état reste lu', () => {
    const data = decodeFallDetected({ userId: EMITTER, state: served(), announcement: { kind: 'tumbled', at: DETECTED } });
    expect(data?.state.detectedAt).toBe(DETECTED);
    expect(data !== null && 'announcement' in data).toBe(false);
  });

  test('un état d’une autre personne que celle nommée est refusé', () => {
    expect(decodeFallDetected({ userId: 'b'.repeat(24), state: served() })).toBeNull();
  });

  test('`fall:cleared` nomme la personne et sa raison ; une raison inconnue vaut `withdrawn`', () => {
    expect(decodeFallCleared({ userId: EMITTER, reason: 'responded' })).toEqual({ userId: EMITTER, reason: 'responded' });
    expect(decodeFallCleared({ userId: EMITTER, reason: 'teleported' })).toEqual({ userId: EMITTER, reason: 'withdrawn' });
    expect(decodeFallCleared({ userId: EMITTER })).toEqual({ userId: EMITTER, reason: 'withdrawn' });
    expect(decodeFallCleared({})).toBeNull();
  });
});

describe('le rattrapage', () => {
  test('`GET /relations/falls` rend les états lisibles, et eux seuls', async () => {
    const { deps, calls } = transport({ ok: true, data: { items: [served(), served({ detectedAt: 'jamais' })] } });
    const result = await loadFallSnapshot(deps);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/relations/falls' });
    expect(result.ok && result.data).toEqual([served()]);
  });

  test('un échec reste un échec : le cache n’est pas vidé faute de réseau', async () => {
    const { deps } = transport({ ok: false, status: 0, error: 'x' });
    expect((await loadFallSnapshot(deps)).ok).toBe(false);
  });
});

describe('le réglage par personne', () => {
  test('prévenue ou non, faux tant que le serveur ne dit pas vrai ; l’écriture part en `{ shared }` strict', async () => {
    const { deps, calls } = transport({ ok: true, data: { userId: EMITTER } });
    const result = await loadFallPersonSettings(deps, EMITTER);
    expect(calls[0]).toMatchObject({ method: 'GET', path: `/api/v1/relations/${EMITTER}/fall/settings` });
    expect(result.ok && result.data).toEqual({ shared: false });
    const write = transport({ ok: true, data: { userId: EMITTER, shared: true } });
    const saved = await saveFallPersonSettings(write.deps, EMITTER, true);
    expect(write.calls[0]).toMatchObject({ method: 'PUT', path: `/api/v1/relations/${EMITTER}/fall/settings`, body: { shared: true } });
    expect(saved.ok && saved.data).toEqual({ shared: true });
  });
});
