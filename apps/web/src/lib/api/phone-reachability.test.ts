import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  decodePhoneReachabilityCleared,
  decodePhoneReachabilityChanged,
  decodePhoneReachabilityState,
  loadPhoneReachabilityEmitterSettings,
  loadPhoneReachabilityPersonSettings,
  loadPhoneReachabilitySnapshot,
  savePhoneReachabilityEmitterSettings,
  savePhoneReachabilityPersonSettings,
} from './phone-reachability';

/**
 * LE TÉLÉPHONE INJOIGNABLE, TEL QUE LA PASSERELLE LE SERT (#18737) — un décodeur qui ne garde que les champs du
 * contrat, tolère une cause et une annonce inconnues (un client plus ancien que le serveur ne casse pas), et un
 * port REST pour le rattrapage et les réglages.
 */

const EMITTER = '65a1b2c3d4e5f60718293a4b';
const SINCE = '2026-11-15T14:10:00.000Z';

const served = (overrides: Readonly<Record<string, unknown>> = {}) => ({ userId: EMITTER, unreachableSince: SINCE, cause: 'battery', ...overrides });

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

describe('decodePhoneReachabilityState', () => {
  test('garde les champs du contrat', () => {
    expect(decodePhoneReachabilityState(served())).toEqual(served());
    expect(decodePhoneReachabilityState(served({ cause: 'network' }))?.cause).toBe('network');
  });

  test('une cause inconnue se lit `unknown`, sans perdre l’état', () => {
    expect(decodePhoneReachabilityState(served({ cause: 'solar-flare' }))?.cause).toBe('unknown');
    expect(decodePhoneReachabilityState(served({ cause: undefined }))?.cause).toBe('unknown');
  });

  test('un instant illisible ou une personne absente : rien', () => {
    expect(decodePhoneReachabilityState(served({ unreachableSince: 'hier' }))).toBeNull();
    expect(decodePhoneReachabilityState(served({ userId: '' }))).toBeNull();
    expect(decodePhoneReachabilityState(null)).toBeNull();
  });

  test('un champ en trop ne traverse pas', () => {
    const decoded = decodePhoneReachabilityState(served({ secret: 'x' }));
    expect(decoded !== null && 'secret' in decoded).toBe(false);
  });
});

describe('les événements', () => {
  test('`phone:unreachable` porte l’état et l’annonce quand elle est servie', () => {
    const data = decodePhoneReachabilityChanged({ userId: EMITTER, state: served(), announcement: { kind: 'unreachable', at: SINCE } });
    expect(data).toEqual({ userId: EMITTER, state: served(), announcement: { kind: 'unreachable', at: SINCE } });
  });

  test('une annonce d’un genre inconnu est ignorée, l’état reste lu', () => {
    const data = decodePhoneReachabilityChanged({ userId: EMITTER, state: served(), announcement: { kind: 'teleported', at: SINCE } });
    expect(data?.state.cause).toBe('battery');
    expect(data !== null && 'announcement' in data).toBe(false);
  });

  test('un état d’une autre personne que celle nommée est refusé', () => {
    expect(decodePhoneReachabilityChanged({ userId: 'b'.repeat(24), state: served() })).toBeNull();
  });

  test('`phone:reachable` nomme la personne, et son annonce éventuelle', () => {
    expect(decodePhoneReachabilityCleared({ userId: EMITTER, announcement: { kind: 'reachable', at: SINCE } })).toEqual({ userId: EMITTER, announcement: { kind: 'reachable', at: SINCE } });
    expect(decodePhoneReachabilityCleared({ userId: EMITTER, extra: 1 })).toEqual({ userId: EMITTER });
    expect(decodePhoneReachabilityCleared({})).toBeNull();
  });
});

describe('le rattrapage', () => {
  test('`GET /relations/phone-reachability` rend les états lisibles, et eux seuls', async () => {
    const { deps, calls } = transport({ ok: true, data: { items: [served(), served({ unreachableSince: 'jamais' })] } });
    const result = await loadPhoneReachabilitySnapshot(deps);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/relations/phone-reachability' });
    expect(result.ok && result.data).toEqual([served()]);
  });

  test('un échec reste un échec : le cache n’est pas vidé faute de réseau', async () => {
    const { deps } = transport({ ok: false, status: 0, error: 'x' });
    expect((await loadPhoneReachabilitySnapshot(deps)).ok).toBe(false);
  });
});

describe('les réglages', () => {
  test('par personne : ce que je partage, faux tant que le serveur ne dit pas vrai', async () => {
    const { deps, calls } = transport({ ok: true, data: { userId: EMITTER } });
    const result = await loadPhoneReachabilityPersonSettings(deps, EMITTER);
    expect(calls[0]).toMatchObject({ method: 'GET', path: `/api/v1/relations/${EMITTER}/phone-reachability/settings` });
    expect(result.ok && result.data).toEqual({ shared: false });
  });

  test('l’écriture par personne part en `{ shared }` strict', async () => {
    const { deps, calls } = transport({ ok: true, data: { userId: EMITTER, shared: true } });
    const result = await savePhoneReachabilityPersonSettings(deps, EMITTER, true);
    expect(calls[0]).toMatchObject({ method: 'PUT', path: `/api/v1/relations/${EMITTER}/phone-reachability/settings`, body: { shared: true } });
    expect(result.ok && result.data).toEqual({ shared: true });
  });

  test('global : prévenir mes Proches, vrai par défaut', async () => {
    const read = transport({ ok: true, data: {} });
    const loaded = await loadPhoneReachabilityEmitterSettings(read.deps);
    expect(read.calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/me/device/reachability/settings' });
    expect(loaded.ok && loaded.data).toEqual({ sharingEnabled: true });
    const write = transport({ ok: true, data: { sharingEnabled: false } });
    const saved = await savePhoneReachabilityEmitterSettings(write.deps, false);
    expect(write.calls[0]).toMatchObject({ method: 'PUT', path: '/api/v1/me/device/reachability/settings', body: { sharingEnabled: false } });
    expect(saved.ok && saved.data).toEqual({ sharingEnabled: false });
  });
});
