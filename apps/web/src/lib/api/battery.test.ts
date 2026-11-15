import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  decodeBatteryChanged,
  decodeBatteryCleared,
  decodeBatteryState,
  loadBatteryEmitterSettings,
  loadBatteryPersonSettings,
  loadBatterySnapshot,
  requestBatteryPull,
  saveBatteryEmitterSettings,
  saveBatteryPersonSettings,
} from './battery';

/**
 * LA BATTERIE DES PROCHES, TELLE QUE LA PASSERELLE LA SERT (#14147) — un décodeur qui ne garde que les champs du
 * contrat, bornés comme le serveur les borne, et un port REST qui dit chaque refus par son NOM.
 */

const EMITTER = '65a1b2c3d4e5f60718293a4b';

const served = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: EMITTER,
  phase: 'low',
  level: 22,
  charging: false,
  lowPower: true,
  estimatedMinutes: 95,
  measuredAt: '2026-11-15T10:00:00.000Z',
  deviceLabel: 'iPhone',
  ...overrides,
});

type Reply = ApiResult<unknown>;

function transport(reply: Reply) {
  const calls: HttpRequest[] = [];
  const port = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return reply as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport: port }, calls };
}

describe('decodeBatteryState', () => {
  test('garde les champs du contrat', () => {
    expect(decodeBatteryState(served())).toEqual(served());
  });

  test('une phase hors épisode (`normal`) ou inconnue n’est pas servie', () => {
    expect(decodeBatteryState(served({ phase: 'normal' }))).toBeNull();
    expect(decodeBatteryState(served({ phase: 'exploding' }))).toBeNull();
  });

  test('un niveau hors 0..100 ou non entier est refusé', () => {
    expect(decodeBatteryState(served({ level: 101 }))).toBeNull();
    expect(decodeBatteryState(served({ level: 12.5 }))).toBeNull();
  });

  test('un champ en trop ne traverse pas ; une estimation illisible s’efface sans perdre l’état', () => {
    const decoded = decodeBatteryState(served({ secret: 'x', estimatedMinutes: -3, deviceLabel: 'x'.repeat(61) }));
    expect(decoded).not.toBeNull();
    expect(decoded !== null && 'secret' in decoded).toBe(false);
    expect(decoded !== null && 'estimatedMinutes' in decoded).toBe(false);
    expect(decoded !== null && 'deviceLabel' in decoded).toBe(false);
  });
});

describe('les événements', () => {
  test('`battery:changed` porte l’état et l’annonce quand elle est servie', () => {
    const data = decodeBatteryChanged({ userId: EMITTER, state: served(), announcement: { kind: 'threshold', level: 20, threshold: 20, at: '2026-11-15T10:00:00.000Z' } });
    expect(data?.state.level).toBe(22);
    expect(data?.announcement).toEqual({ kind: 'threshold', level: 20, threshold: 20, at: '2026-11-15T10:00:00.000Z' });
  });

  test('une annonce d’un genre inconnu est ignorée, l’état reste lu', () => {
    const data = decodeBatteryChanged({ userId: EMITTER, state: served(), announcement: { kind: 'teleported', level: 3, at: '2026-11-15T10:00:00.000Z' } });
    expect(data?.state.level).toBe(22);
    expect(data !== null && 'announcement' in data).toBe(false);
  });

  test('un état d’une autre personne que celle nommée est refusé', () => {
    expect(decodeBatteryChanged({ userId: 'b'.repeat(24), state: served() })).toBeNull();
  });

  test('`battery:cleared` nomme la personne, et son annonce éventuelle', () => {
    expect(decodeBatteryCleared({ userId: EMITTER, announcement: { kind: 'ended', level: 40, at: '2026-11-15T10:00:00.000Z' } })).toEqual({
      userId: EMITTER,
      announcement: { kind: 'ended', level: 40, at: '2026-11-15T10:00:00.000Z' },
    });
    expect(decodeBatteryCleared({})).toBeNull();
  });
});

describe('le rattrapage', () => {
  test('`GET /relations/battery` rend les états lisibles, et eux seuls', async () => {
    const { deps, calls } = transport({ ok: true, data: { items: [served(), served({ phase: 'normal' })] } });
    const result = await loadBatterySnapshot(deps);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/relations/battery' });
    expect(result.ok && result.data).toEqual([served()]);
  });
});

describe('le relevé à la demande', () => {
  test('une demande acceptée', async () => {
    const { deps, calls } = transport({ ok: true, data: { requestedAt: '2026-11-15T10:00:00.000Z', episodeOnly: true } });
    expect(await requestBatteryPull(deps, EMITTER)).toBe('requested');
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/api/v1/relations/${EMITTER}/battery/pull` });
  });

  test('chaque refus se dit par son nom', async () => {
    const outcome = async (reply: Reply) => requestBatteryPull(transport(reply).deps, EMITTER);
    expect(await outcome({ ok: false, status: 429, error: 'x', code: 'BATTERY_PULL_TOO_SOON' })).toBe('too-soon');
    expect(await outcome({ ok: false, status: 403, error: 'x', code: 'BATTERY_PULL_FORBIDDEN' })).toBe('forbidden');
    expect(await outcome({ ok: false, status: 429, error: 'x', code: 'BATTERY_RATE_LIMITED' })).toBe('rate-limited');
    expect(await outcome({ ok: false, status: 429, error: 'x' })).toBe('rate-limited');
    expect(await outcome({ ok: false, status: 0, error: 'x' })).toBe('offline');
    expect(await outcome({ ok: false, status: 500, error: 'x' })).toBe('failed');
  });
});

describe('les réglages', () => {
  test('par personne : ce que je partage et ce que je reçois ; un mode inconnu se lit au défaut', async () => {
    const { deps, calls } = transport({ ok: true, data: { userId: EMITTER, shared: true, receive: 'louder' } });
    const result = await loadBatteryPersonSettings(deps, EMITTER);
    expect(calls[0]).toMatchObject({ method: 'GET', path: `/api/v1/relations/${EMITTER}/battery/settings` });
    expect(result.ok && result.data).toEqual({ shared: true, receive: 'all' });
  });

  test('l’écriture est PARTIELLE : un seul champ part', async () => {
    const { deps, calls } = transport({ ok: true, data: { userId: EMITTER, shared: false, receive: 'pill' } });
    const result = await saveBatteryPersonSettings(deps, EMITTER, { receive: 'pill' });
    expect(calls[0]).toMatchObject({ method: 'PUT', path: `/api/v1/relations/${EMITTER}/battery/settings`, body: { receive: 'pill' } });
    expect(result.ok && result.data).toEqual({ shared: false, receive: 'pill' });
  });

  test('globaux : le partage de ma batterie, vrai par défaut', async () => {
    const read = transport({ ok: true, data: {} });
    const loaded = await loadBatteryEmitterSettings(read.deps);
    expect(read.calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/me/device/battery/settings' });
    expect(loaded.ok && loaded.data).toEqual({ sharingEnabled: true });
    const write = transport({ ok: true, data: { sharingEnabled: false } });
    const saved = await saveBatteryEmitterSettings(write.deps, false);
    expect(write.calls[0]).toMatchObject({ method: 'PUT', path: '/api/v1/me/device/battery/settings', body: { sharingEnabled: false } });
    expect(saved.ok && saved.data).toEqual({ sharingEnabled: false });
  });
});
