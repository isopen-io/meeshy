import { describe, expect, test } from 'bun:test';
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';

import type { PhoneCallState } from '@meeshy/shared/types/phone-call';
import { PHONE_CALL_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/phone-call-event-names';

import type { ApiResult } from '@/lib/api/http';
import { persistableQuery } from '@/lib/api/query-client';
import type { SocketClient } from '@/lib/net/socket';

import { PHONE_CALL_STATES_QUERY_KEY, bindPhoneCallLive, clearPhoneCallState, phoneCallStateOf, phoneCallStatesOf, receivePhoneCallState } from './phone-call-live';

/**
 * « EN APPEL » D'UN SANG, REÇU SUR CET ONGLET (#18753) — `phone-call:started` REMPLACE l'état gardé (une mise à jour
 * silencieuse aussi), `phone-call:ended` l'efface, un état dont `expiresAt` est passé ne s'affiche plus — y compris
 * relu d'un cache restauré —, le rattrapage fait foi pour ce qui n'a pas bougé depuis la demande, et l'annonce part à
 * la pastille, jamais au fil.
 */

const ME = 'a'.repeat(24);
const SANG = 'b'.repeat(24);
const AUTRE = 'c'.repeat(24);
const T0 = Date.parse('2026-11-19T14:12:00.000Z');

const state = (overrides: Partial<PhoneCallState> = {}): PhoneCallState => ({
  userId: SANG,
  since: '2026-11-19T14:00:00.000Z',
  expiresAt: '2026-11-19T17:10:00.000Z',
  ...overrides,
});

const started = { kind: 'started', at: '2026-11-19T14:02:13.000Z' } as const;

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
    on: (event: string, handler: (payload: unknown) => void) => void handlers.set(event, (handlers.get(event) ?? new Set()).add(handler)),
    off: (event: string, handler: (payload: unknown) => void) => void handlers.get(event)?.delete(handler),
  } as unknown as SocketClient;
  const fire = (event: string, payload: unknown): void => handlers.get(event)?.forEach((handler) => handler(payload));
  const listeners = (): number => [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
  return { socket, fire, listeners };
}

const noSnapshot = async (): Promise<ApiResult<readonly PhoneCallState[]>> => ({ ok: true, data: [] });

function harness({ snapshot = noSnapshot, clock = { now: T0 } }: { readonly snapshot?: () => Promise<ApiResult<readonly PhoneCallState[]>>; readonly clock?: { now: number } } = {}) {
  const client = new QueryClient();
  const heard: { userId: string; kind: string; since: string | null }[] = [];
  const { socket, fire, listeners } = fakeSocket();
  const unbind = bindPhoneCallLive({
    socket,
    client,
    viewerId: () => ME,
    snapshot,
    now: () => clock.now,
    announce: (userId, said, served) => heard.push({ userId, kind: said.kind, since: served?.since ?? null }),
  });
  return { client, heard, fire, listeners, unbind };
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('« en appel » reçu', () => {
  test('les noms écoutés sont ceux du contrat', () => {
    expect(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_STARTED).toBe('phone-call:started');
    expect(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_ENDED).toBe('phone-call:ended');
  });

  test('`started` range l’état servi, et l’annonce part à la pastille', () => {
    const { client, heard, fire } = harness();
    fire('phone-call:started', { userId: SANG, state: state(), announcement: started });
    expect(phoneCallStateOf(client, SANG, T0)?.since).toBe('2026-11-19T14:00:00.000Z');
    expect(heard).toEqual([{ userId: SANG, kind: 'started', since: '2026-11-19T14:00:00.000Z' }]);
  });

  test('un `started` SANS annonce REMPLACE l’état tenu, en silence — jamais une fusion', () => {
    const { client, heard, fire } = harness();
    fire('phone-call:started', { userId: SANG, state: state(), announcement: started });
    fire('phone-call:started', { userId: SANG, state: state({ since: '2026-11-19T14:05:00.000Z', expiresAt: '2026-11-19T17:20:00.000Z' }) });
    expect(phoneCallStateOf(client, SANG, T0)).toMatchObject({ since: '2026-11-19T14:05:00.000Z', expiresAt: '2026-11-19T17:20:00.000Z' });
    expect(heard).toHaveLength(1);
  });

  test('`ended` efface l’état, et « a raccroché » part à la pastille', () => {
    const { client, heard, fire } = harness();
    fire('phone-call:started', { userId: SANG, state: state() });
    fire('phone-call:ended', { userId: SANG, announcement: { kind: 'ended', at: '2026-11-19T14:20:00.000Z' } });
    expect(phoneCallStateOf(client, SANG, T0)).toBeNull();
    expect(heard).toEqual([{ userId: SANG, kind: 'ended', since: null }]);
  });

  test('`ended` sans annonce efface en silence', () => {
    const { client, heard, fire } = harness();
    fire('phone-call:started', { userId: SANG, state: state() });
    fire('phone-call:ended', { userId: SANG });
    expect(phoneCallStateOf(client, SANG, T0)).toBeNull();
    expect(heard).toEqual([]);
  });

  test('mon propre état ne m’est jamais montré', () => {
    const { client, heard, fire } = harness();
    fire('phone-call:started', { userId: ME, state: state({ userId: ME }), announcement: started });
    expect(phoneCallStateOf(client, ME, T0)).toBeNull();
    expect(heard).toEqual([]);
  });

  test('un état dont `expiresAt` est passé ne s’affiche plus', () => {
    const client = new QueryClient();
    receivePhoneCallState(client, state(), T0);
    const after = Date.parse('2026-11-19T17:10:00.000Z');
    expect(phoneCallStateOf(client, SANG, after - 1)).not.toBeNull();
    expect(phoneCallStateOf(client, SANG, after)).toBeNull();
    expect(phoneCallStatesOf(client, after)).toEqual({});
  });

  test('un état déjà expiré à l’arrivée n’est pas rangé, et l’écriture suivante retire les états expirés', () => {
    const client = new QueryClient();
    receivePhoneCallState(client, state({ expiresAt: '2026-11-19T14:11:00.000Z' }), T0);
    expect(Object.keys(client.getQueryData<Record<string, unknown>>(PHONE_CALL_STATES_QUERY_KEY) ?? {})).toEqual([]);
    receivePhoneCallState(client, state({ userId: AUTRE, expiresAt: '2026-11-19T14:30:00.000Z' }), T0);
    receivePhoneCallState(client, state(), Date.parse('2026-11-19T14:40:00.000Z'));
    expect(Object.keys(client.getQueryData<Record<string, unknown>>(PHONE_CALL_STATES_QUERY_KEY) ?? {})).toEqual([SANG]);
  });

  test('débrancher retire les écouteurs', () => {
    const { listeners, unbind } = harness();
    expect(listeners()).toBe(2);
    unbind();
    expect(listeners()).toBe(0);
  });
});

describe('le cache restauré au rechargement', () => {
  test('« en appel » n’est pas une position : il se persiste comme le reste du compte', () => {
    expect(persistableQuery({ state: { status: 'success' }, queryKey: PHONE_CALL_STATES_QUERY_KEY })).toBe(true);
  });

  test('un état expiré pendant que l’onglet était fermé ne réapparaît pas', () => {
    const before = new QueryClient();
    receivePhoneCallState(before, state(), T0);
    const restored = new QueryClient();
    hydrate(restored, JSON.parse(JSON.stringify(dehydrate(before))));
    expect(phoneCallStateOf(restored, SANG, T0)).not.toBeNull();
    const reopened = Date.parse('2026-11-19T18:00:00.000Z');
    expect(phoneCallStateOf(restored, SANG, reopened)).toBeNull();
    expect(phoneCallStatesOf(restored, reopened)).toEqual({});
  });
});

describe('le rattrapage à chaque socket accrochée', () => {
  test('ce qui s’est clos pendant la coupure disparaît, ce que le serveur sert REMPLACE ce qui est tenu', async () => {
    const client = new QueryClient();
    receivePhoneCallState(client, state(), T0 - 1_000);
    receivePhoneCallState(client, state({ userId: AUTRE }), T0 - 1_000);
    const { socket } = fakeSocket();
    bindPhoneCallLive({
      socket,
      client,
      viewerId: () => ME,
      snapshot: async () => ({ ok: true, data: [state({ userId: AUTRE, since: '2026-11-19T14:10:00.000Z' }), state({ userId: ME })] }),
      now: () => T0,
      announce: () => undefined,
    });
    await flush();
    expect(phoneCallStateOf(client, SANG, T0)).toBeNull();
    expect(phoneCallStateOf(client, AUTRE, T0)?.since).toBe('2026-11-19T14:10:00.000Z');
    expect(phoneCallStateOf(client, ME, T0)).toBeNull();
  });

  test('un `started` arrivé APRÈS la demande n’est pas écrasé ni effacé par une réponse qui ne le connaissait pas', async () => {
    const pending: { resolve: (value: ApiResult<readonly PhoneCallState[]>) => void } = { resolve: () => undefined };
    const clock = { now: T0 };
    const { client, fire } = harness({ snapshot: () => new Promise((resolve) => (pending.resolve = resolve)), clock });
    clock.now = T0 + 500;
    fire('phone-call:started', { userId: SANG, state: state({ since: '2026-11-19T14:10:00.000Z' }) });
    fire('phone-call:started', { userId: AUTRE, state: state({ userId: AUTRE }) });
    pending.resolve({ ok: true, data: [state({ userId: AUTRE, since: '2026-11-19T13:00:00.000Z' })] });
    await flush();
    expect(phoneCallStateOf(client, SANG, clock.now)?.since).toBe('2026-11-19T14:10:00.000Z');
    expect(phoneCallStateOf(client, AUTRE, clock.now)?.since).toBe('2026-11-19T14:00:00.000Z');
  });

  test('un `ended` arrivé APRÈS la demande n’est pas ressuscité par une réponse plus ancienne', async () => {
    const pending: { resolve: (value: ApiResult<readonly PhoneCallState[]>) => void } = { resolve: () => undefined };
    const clock = { now: T0 };
    const { client, fire } = harness({ snapshot: () => new Promise((resolve) => (pending.resolve = resolve)), clock });
    clock.now = T0 + 500;
    fire('phone-call:ended', { userId: SANG });
    pending.resolve({ ok: true, data: [state()] });
    await flush();
    expect(phoneCallStateOf(client, SANG, clock.now)).toBeNull();
  });

  test('un rattrapage en échec garde le cache : jamais vidé faute de réseau', async () => {
    const client = new QueryClient();
    receivePhoneCallState(client, state(), T0 - 1_000);
    const { socket } = fakeSocket();
    bindPhoneCallLive({ socket, client, viewerId: () => ME, snapshot: async () => ({ ok: false, status: 0, error: 'x' }), now: () => T0, announce: () => undefined });
    await flush();
    expect(phoneCallStateOf(client, SANG, T0)).not.toBeNull();
  });

  test('clearPhoneCallState retire une seule personne', () => {
    const client = new QueryClient();
    receivePhoneCallState(client, state(), T0);
    receivePhoneCallState(client, state({ userId: AUTRE }), T0);
    clearPhoneCallState(client, SANG);
    expect(Object.keys(phoneCallStatesOf(client, T0))).toEqual([AUTRE]);
  });
});
