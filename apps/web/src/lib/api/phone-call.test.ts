import { describe, expect, test } from 'bun:test';

import { PHONE_CALL_ANNOUNCEMENT_KINDS } from '@meeshy/shared/types/phone-call';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  PHONE_CALL_ANNOUNCEMENT_KINDS_WEB,
  decodePhoneCallEnded,
  decodePhoneCallStarted,
  decodePhoneCallState,
  loadPhoneCallEmitterSettings,
  loadPhoneCallPersonSettings,
  loadPhoneCallSnapshot,
  savePhoneCallEmitterSettings,
  savePhoneCallPersonSettings,
} from './phone-call';

/**
 * « EN APPEL », TEL QUE LA PASSERELLE LE SERT (#18753, ACT-01) — un décodeur qui ne garde que les champs du contrat
 * (`phone-call:started`, `phone-call:ended`, l'état du rattrapage) : jamais d'interlocuteur, même si un champ en trop
 * arrivait. Le web ne RAPPORTE rien (un navigateur ne voit pas les appels) : aucun `POST /me/device/call` d'ici.
 */

const EMITTER = '65a1b2c3d4e5f60718293a4b';
const SINCE = '2026-11-19T14:00:00.000Z';
const EXPIRES = '2026-11-19T17:02:00.000Z';

const served = (overrides: Readonly<Record<string, unknown>> = {}) => ({ userId: EMITTER, since: SINCE, expiresAt: EXPIRES, ...overrides });

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
  test('genres d’annonce', () => {
    expect(PHONE_CALL_ANNOUNCEMENT_KINDS_WEB).toEqual(PHONE_CALL_ANNOUNCEMENT_KINDS);
  });
});

describe('decodePhoneCallState', () => {
  test('garde les trois champs du contrat, et rien d’autre', () => {
    expect(decodePhoneCallState(served({ peer: 'Marie', number: '+33600000000' }))).toEqual(served());
  });

  test('un état sans début ou sans échéance lisible est refusé', () => {
    expect(decodePhoneCallState(served({ since: 'hier' }))).toBeNull();
    expect(decodePhoneCallState(served({ expiresAt: undefined }))).toBeNull();
    expect(decodePhoneCallState({ since: SINCE, expiresAt: EXPIRES })).toBeNull();
    expect(decodePhoneCallState('x')).toBeNull();
  });
});

describe('decodePhoneCallStarted / decodePhoneCallEnded', () => {
  test('`started` porte l’état, et l’annonce quand elle est servie', () => {
    expect(decodePhoneCallStarted({ userId: EMITTER, state: served(), announcement: { kind: 'started', at: SINCE } })).toEqual({
      userId: EMITTER,
      state: served(),
      announcement: { kind: 'started', at: SINCE },
    });
    expect(decodePhoneCallStarted({ userId: EMITTER, state: served() })).toEqual({ userId: EMITTER, state: served() });
  });

  test('un état d’une autre personne que celle annoncée est refusé', () => {
    expect(decodePhoneCallStarted({ userId: EMITTER, state: served({ userId: 'b'.repeat(24) }) })).toBeNull();
  });

  test('une annonce d’un genre inconnu est ignorée sans perdre l’état', () => {
    expect(decodePhoneCallStarted({ userId: EMITTER, state: served(), announcement: { kind: 'ringing', at: SINCE } })).toEqual({ userId: EMITTER, state: served() });
  });

  test('`ended` porte la personne, et l’annonce quand elle est servie', () => {
    expect(decodePhoneCallEnded({ userId: EMITTER, announcement: { kind: 'ended', at: EXPIRES } })).toEqual({ userId: EMITTER, announcement: { kind: 'ended', at: EXPIRES } });
    expect(decodePhoneCallEnded({ userId: EMITTER })).toEqual({ userId: EMITTER });
    expect(decodePhoneCallEnded({})).toBeNull();
  });
});

describe('le port REST', () => {
  test('le rattrapage lit `GET /relations/phone-calls` et ne garde que les états lisibles', async () => {
    const { deps, calls } = transport({ ok: true, data: { items: [served(), { userId: EMITTER }] } });
    expect(await loadPhoneCallSnapshot(deps)).toEqual({ ok: true, data: [served()] });
    expect(calls.map((call) => [call.method, call.path])).toEqual([['GET', '/api/v1/relations/phone-calls']]);
  });

  test('mon réglage global : vrai par défaut, un champ absent ne le coupe pas', async () => {
    const { deps, calls } = transport({ ok: true, data: {} });
    expect(await loadPhoneCallEmitterSettings(deps)).toEqual({ ok: true, data: { sharingEnabled: true } });
    expect(calls[0]?.path).toBe('/api/v1/me/device/call/settings');
  });

  test('couper mon partage part en `{ sharingEnabled: false }`, et rien d’autre', async () => {
    const { deps, calls } = transport({ ok: true, data: { sharingEnabled: false } });
    expect(await savePhoneCallEmitterSettings(deps, false)).toEqual({ ok: true, data: { sharingEnabled: false } });
    expect(calls.map((call) => [call.method, call.path, call.body])).toEqual([['PUT', '/api/v1/me/device/call/settings', { sharingEnabled: false }]]);
  });

  test('le réglage par personne : faux tant que le serveur ne dit pas vrai', async () => {
    const { deps, calls } = transport({ ok: true, data: { userId: EMITTER } });
    expect(await loadPhoneCallPersonSettings(deps, EMITTER)).toEqual({ ok: true, data: { shared: false } });
    expect(calls[0]?.path).toBe(`/api/v1/relations/${EMITTER}/phone-call/settings`);
  });

  test('le réglage par personne part en `{ shared }`', async () => {
    const { deps, calls } = transport({ ok: true, data: { userId: EMITTER, shared: true } });
    expect(await savePhoneCallPersonSettings(deps, EMITTER, true)).toEqual({ ok: true, data: { shared: true } });
    expect(calls.map((call) => [call.method, call.body])).toEqual([['PUT', { shared: true }]]);
  });

  test('un échec du réseau remonte tel quel', async () => {
    const { deps } = transport({ ok: false, status: 0, error: 'hors ligne' });
    expect(await loadPhoneCallSnapshot(deps)).toEqual({ ok: false, status: 0, error: 'hors ligne' });
  });
});
