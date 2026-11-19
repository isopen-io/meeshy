import { describe, expect, test } from 'bun:test';

import { INACTIVITY_ANNOUNCEMENT_KINDS, INACTIVITY_CHECK_CONFIG, INACTIVITY_DELAY_HOURS } from '@meeshy/shared/types/inactivity-check';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  INACTIVITY_ANNOUNCEMENT_KINDS_WEB,
  INACTIVITY_DEFAULT_DELAY_HOURS,
  INACTIVITY_DELAY_CHOICES,
  decodeInactivityAlert,
  decodeInactivityCleared,
  decodeInactivityState,
  loadInactivityPersonSettings,
  loadInactivitySnapshot,
  loadWellnessSettings,
  saveInactivityPersonSettings,
  saveWellnessSettings,
  sendWellnessOk,
} from './inactivity';

/**
 * LA VÉRIFICATION D'INACTIVITÉ, TELLE QUE LA PASSERELLE LA SERT (#18738) — un décodeur qui ne garde que les champs
 * du contrat (`inactivity:alert`, `inactivity:cleared`, l'état du rattrapage), tolère une position, une batterie ou
 * une annonce illisibles sans perdre l'état, et un port REST pour « Je vais bien » et les réglages.
 */

const EMITTER = '65a1b2c3d4e5f60718293a4b';
const SINCE = '2026-11-18T08:00:00.000Z';
const ALERTED = '2026-11-18T20:30:00.000Z';

const served = (overrides: Readonly<Record<string, unknown>> = {}) => ({ userId: EMITTER, inactiveSince: SINCE, alertedAt: ALERTED, ...overrides });

const POSITION = { latitude: 48.8566, longitude: 2.3522, accuracy: 25, recordedAt: '2026-11-18T07:55:00.000Z' };
const BATTERY = { level: 9, measuredAt: '2026-11-18T07:58:00.000Z' };

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

describe('les valeurs écrites en littéral sont celles du contrat', () => {
  test('délais, délai par défaut et genres d’annonce', () => {
    expect(INACTIVITY_DELAY_CHOICES).toEqual(INACTIVITY_DELAY_HOURS);
    expect(INACTIVITY_DEFAULT_DELAY_HOURS).toBe(INACTIVITY_CHECK_CONFIG.defaultDelayHours);
    expect(INACTIVITY_ANNOUNCEMENT_KINDS_WEB).toEqual(INACTIVITY_ANNOUNCEMENT_KINDS);
  });
});

describe('decodeInactivityState', () => {
  test('garde les champs du contrat, la position et la batterie quand elles sont servies', () => {
    expect(decodeInactivityState(served())).toEqual(served());
    expect(decodeInactivityState(served({ lastPosition: POSITION, lastBattery: BATTERY }))).toEqual(served({ lastPosition: POSITION, lastBattery: BATTERY }));
  });

  test('une position ou une batterie illisible se tait, l’état reste lu', () => {
    const decoded = decodeInactivityState(served({ lastPosition: { latitude: 200, longitude: 2, recordedAt: SINCE }, lastBattery: { level: 'neuf', measuredAt: SINCE } }));
    expect(decoded).toEqual(served());
  });

  test('une position sans précision reste lue sans elle', () => {
    const { accuracy: _accuracy, ...withoutAccuracy } = POSITION;
    expect(decodeInactivityState(served({ lastPosition: withoutAccuracy }))?.lastPosition).toEqual(withoutAccuracy);
  });

  test('un instant illisible ou une personne absente : rien', () => {
    expect(decodeInactivityState(served({ inactiveSince: 'hier' }))).toBeNull();
    expect(decodeInactivityState(served({ alertedAt: undefined }))).toBeNull();
    expect(decodeInactivityState(served({ userId: '' }))).toBeNull();
    expect(decodeInactivityState(null)).toBeNull();
  });

  test('un champ en trop ne traverse pas', () => {
    const decoded = decodeInactivityState(served({ secret: 'x', lastPosition: { ...POSITION, address: '1 rue' } }));
    expect(decoded !== null && 'secret' in decoded).toBe(false);
    expect(decoded?.lastPosition !== undefined && 'address' in decoded.lastPosition).toBe(false);
  });
});

describe('les événements', () => {
  test('`inactivity:alert` porte l’état et l’annonce quand elle est servie', () => {
    const announcement = { kind: 'alert', inactiveSince: SINCE, at: ALERTED };
    expect(decodeInactivityAlert({ userId: EMITTER, state: served(), announcement })).toEqual({ userId: EMITTER, state: served(), announcement });
  });

  test('une annonce d’un genre inconnu est ignorée, l’état reste lu', () => {
    const data = decodeInactivityAlert({ userId: EMITTER, state: served(), announcement: { kind: 'teleported', inactiveSince: SINCE, at: ALERTED } });
    expect(data?.state.inactiveSince).toBe(SINCE);
    expect(data !== null && 'announcement' in data).toBe(false);
  });

  test('un état d’une autre personne que celle nommée est refusé', () => {
    expect(decodeInactivityAlert({ userId: 'b'.repeat(24), state: served() })).toBeNull();
  });

  test('`inactivity:cleared` nomme la personne, et son annonce éventuelle', () => {
    const announcement = { kind: 'responded', inactiveSince: SINCE, at: ALERTED };
    expect(decodeInactivityCleared({ userId: EMITTER, announcement })).toEqual({ userId: EMITTER, announcement });
    expect(decodeInactivityCleared({ userId: EMITTER, extra: 1 })).toEqual({ userId: EMITTER });
    expect(decodeInactivityCleared({})).toBeNull();
  });
});

describe('le rattrapage', () => {
  test('`GET /relations/inactivity` rend les états lisibles, et eux seuls', async () => {
    const { deps, calls } = transport({ ok: true, data: { items: [served(), served({ inactiveSince: 'jamais' })] } });
    const result = await loadInactivitySnapshot(deps);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/relations/inactivity' });
    expect(result.ok && result.data).toEqual([served()]);
  });

  test('un échec reste un échec : le cache n’est pas vidé faute de réseau', async () => {
    const { deps } = transport({ ok: false, status: 0, error: 'x' });
    expect((await loadInactivitySnapshot(deps)).ok).toBe(false);
  });
});

describe('« Je vais bien »', () => {
  test('`POST /me/wellness/ok`, et l’accusé dit si l’appareil est le téléphone suivi', async () => {
    const { deps, calls } = transport({ ok: true, data: { tracked: false } });
    const result = await sendWellnessOk(deps);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/me/wellness/ok' });
    expect(result.ok && result.data).toEqual({ tracked: false });
  });
});

describe('les réglages', () => {
  test('mon délai : 6, 12 ou 24 h, `null` pour coupée ; un champ absent ou illisible vaut le défaut', async () => {
    const off = transport({ ok: true, data: { delayHours: null } });
    expect((await loadWellnessSettings(off.deps)).ok && (await loadWellnessSettings(off.deps))).toEqual({ ok: true, data: { delayHours: null } });
    expect(off.calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/me/wellness/settings' });
    const absent = transport({ ok: true, data: {} });
    expect(await loadWellnessSettings(absent.deps)).toEqual({ ok: true, data: { delayHours: 12 } });
    const odd = transport({ ok: true, data: { delayHours: 7 } });
    expect(await loadWellnessSettings(odd.deps)).toEqual({ ok: true, data: { delayHours: 12 } });
  });

  test('l’écriture de mon délai part en `{ delayHours }` strict', async () => {
    const { deps, calls } = transport({ ok: true, data: { delayHours: 6 } });
    const result = await saveWellnessSettings(deps, 6);
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/api/v1/me/wellness/settings', body: { delayHours: 6 } });
    expect(result.ok && result.data).toEqual({ delayHours: 6 });
    const off = transport({ ok: true, data: { delayHours: null } });
    await saveWellnessSettings(off.deps, null);
    expect(off.calls[0]?.body).toEqual({ delayHours: null });
  });

  test('par personne : prévenu ou non, faux tant que le serveur ne dit pas vrai', async () => {
    const { deps, calls } = transport({ ok: true, data: { userId: EMITTER } });
    const result = await loadInactivityPersonSettings(deps, EMITTER);
    expect(calls[0]).toMatchObject({ method: 'GET', path: `/api/v1/relations/${EMITTER}/inactivity/settings` });
    expect(result.ok && result.data).toEqual({ shared: false });
    const write = transport({ ok: true, data: { userId: EMITTER, shared: true } });
    const saved = await saveInactivityPersonSettings(write.deps, EMITTER, true);
    expect(write.calls[0]).toMatchObject({ method: 'PUT', path: `/api/v1/relations/${EMITTER}/inactivity/settings`, body: { shared: true } });
    expect(saved.ok && saved.data).toEqual({ shared: true });
  });
});
