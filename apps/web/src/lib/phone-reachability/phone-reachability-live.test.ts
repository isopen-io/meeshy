import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { PHONE_REACHABILITY_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/phone-reachability-event-names';
import type { PhoneReachabilityState } from '@meeshy/shared/types/phone-reachability';

import type { ApiResult } from '@/lib/api/http';
import type { SocketClient } from '@/lib/net/socket';

import {
  bindPhoneReachabilityLive,
  clearPhoneReachabilityState,
  phoneReachabilityStateOf,
  phoneReachabilityStatesOf,
  receivePhoneReachabilityState,
} from './phone-reachability-live';

/**
 * LE TÉLÉPHONE INJOIGNABLE D'UN PROCHE OU D'UN SANG, REÇU SUR CET ONGLET (#18737) — le serveur a déjà jugé : ce
 * client range l'état dans le cache persisté, le retire à `phone:reachable` ou passé sa durée de vie, rattrape à
 * chaque socket accrochée, et remet l'annonce à la pastille — jamais au fil.
 */

const ME = 'a'.repeat(24);
const PROCHE = 'b'.repeat(24);
const SANG = 'c'.repeat(24);
const T0 = Date.parse('2026-11-15T14:30:00.000Z');
const HOUR = 3_600_000;

const state = (overrides: Partial<PhoneReachabilityState> = {}): PhoneReachabilityState => ({
  userId: PROCHE,
  unreachableSince: '2026-11-15T14:10:00.000Z',
  cause: 'network',
  ...overrides,
});

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

const noSnapshot = async (): Promise<ApiResult<readonly PhoneReachabilityState[]>> => ({ ok: true, data: [] });

function harness({ snapshot = noSnapshot }: { readonly snapshot?: () => Promise<ApiResult<readonly PhoneReachabilityState[]>> } = {}) {
  const client = new QueryClient();
  const heard: { userId: string; kind: string; since: string | null }[] = [];
  const { socket, fire, listeners } = fakeSocket();
  const unbind = bindPhoneReachabilityLive({
    socket,
    client,
    viewerId: () => ME,
    snapshot,
    now: () => T0,
    announce: (userId, said, served) => heard.push({ userId, kind: said.kind, since: served?.unreachableSince ?? null }),
  });
  return { client, heard, fire, listeners, unbind };
}

describe('le téléphone injoignable reçu', () => {
  test('les noms écoutés sont ceux du contrat', () => {
    expect(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_UNREACHABLE).toBe('phone:unreachable');
    expect(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_REACHABLE).toBe('phone:reachable');
  });

  test('`phone:unreachable` range l’état servi, et l’annonce part à la pastille avec l’heure', () => {
    const { client, heard, fire } = harness();
    fire('phone:unreachable', { userId: PROCHE, state: state(), announcement: { kind: 'unreachable', at: '2026-11-15T14:30:00.000Z' } });
    expect(phoneReachabilityStateOf(client, PROCHE, T0)?.cause).toBe('network');
    expect(heard).toEqual([{ userId: PROCHE, kind: 'unreachable', since: '2026-11-15T14:10:00.000Z' }]);
  });

  test('sans annonce (lecteur hors conversation), l’état se range en silence', () => {
    const { client, heard, fire } = harness();
    fire('phone:unreachable', { userId: PROCHE, state: state({ cause: 'battery' }) });
    expect(phoneReachabilityStateOf(client, PROCHE, T0)?.cause).toBe('battery');
    expect(heard).toEqual([]);
  });

  test('un état plus ancien que celui gardé n’écrase rien', () => {
    const { client, fire } = harness();
    fire('phone:unreachable', { userId: PROCHE, state: state({ unreachableSince: '2026-11-15T14:20:00.000Z' }) });
    fire('phone:unreachable', { userId: PROCHE, state: state({ unreachableSince: '2026-11-15T13:00:00.000Z' }) });
    expect(phoneReachabilityStateOf(client, PROCHE, T0)?.unreachableSince).toBe('2026-11-15T14:20:00.000Z');
  });

  test('`phone:reachable` efface le glyphe, et son annonce part à la pastille', () => {
    const { client, heard, fire } = harness();
    fire('phone:unreachable', { userId: PROCHE, state: state() });
    fire('phone:reachable', { userId: PROCHE, announcement: { kind: 'reachable', at: '2026-11-15T14:30:00.000Z' } });
    expect(phoneReachabilityStateOf(client, PROCHE, T0)).toBeNull();
    expect(heard).toEqual([{ userId: PROCHE, kind: 'reachable', since: null }]);
  });

  test('`phone:reachable` sans annonce efface en silence', () => {
    const { client, heard, fire } = harness();
    fire('phone:unreachable', { userId: PROCHE, state: state() });
    fire('phone:reachable', { userId: PROCHE });
    expect(phoneReachabilityStateOf(client, PROCHE, T0)).toBeNull();
    expect(heard).toEqual([]);
  });

  test('mon propre téléphone ne m’est jamais montré', () => {
    const { client, heard, fire } = harness();
    fire('phone:unreachable', { userId: ME, state: state({ userId: ME }), announcement: { kind: 'unreachable', at: '2026-11-15T14:30:00.000Z' } });
    expect(phoneReachabilityStateOf(client, ME, T0)).toBeNull();
    expect(heard).toEqual([]);
  });

  test('un état au-delà de sa durée de vie n’est plus servi : aucun historique', () => {
    const client = new QueryClient();
    receivePhoneReachabilityState(client, state(), T0);
    const later = Date.parse('2026-11-15T14:10:00.000Z') + 72 * HOUR + 1;
    expect(phoneReachabilityStateOf(client, PROCHE, later)).toBeNull();
    expect(phoneReachabilityStatesOf(client, later)).toEqual({});
  });

  test('débrancher retire les écouteurs', () => {
    const { listeners, unbind } = harness();
    expect(listeners()).toBe(2);
    unbind();
    expect(listeners()).toBe(0);
  });
});

describe('le rattrapage à chaque socket accrochée', () => {
  test('ce qui s’est rétabli pendant la coupure disparaît, ce que le serveur sert reste', async () => {
    const client = new QueryClient();
    receivePhoneReachabilityState(client, state(), T0 - 1_000);
    receivePhoneReachabilityState(client, state({ userId: SANG }), T0 - 1_000);
    const { socket } = fakeSocket();
    bindPhoneReachabilityLive({
      socket,
      client,
      viewerId: () => ME,
      snapshot: async () => ({ ok: true, data: [state({ userId: SANG, cause: 'battery' }), state({ userId: ME })] }),
      now: () => T0,
      announce: () => undefined,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(phoneReachabilityStateOf(client, PROCHE, T0)).toBeNull();
    expect(phoneReachabilityStateOf(client, SANG, T0)?.cause).toBe('battery');
    expect(phoneReachabilityStateOf(client, ME, T0)).toBeNull();
  });

  test('un état arrivé APRÈS la demande n’est pas effacé par une réponse qui ne le connaissait pas', async () => {
    const pending: { resolve: (value: ApiResult<readonly PhoneReachabilityState[]>) => void } = { resolve: () => undefined };
    const clock = { now: T0 };
    const client = new QueryClient();
    const { socket, fire } = fakeSocket();
    bindPhoneReachabilityLive({ socket, client, viewerId: () => ME, snapshot: () => new Promise((resolve) => (pending.resolve = resolve)), now: () => clock.now, announce: () => undefined });
    clock.now = T0 + 500;
    fire('phone:unreachable', { userId: PROCHE, state: state() });
    pending.resolve({ ok: true, data: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(phoneReachabilityStateOf(client, PROCHE, clock.now)).not.toBeNull();
  });

  test('un rattrapage en échec garde le cache : jamais vidé faute de réseau', async () => {
    const client = new QueryClient();
    receivePhoneReachabilityState(client, state(), T0 - 1_000);
    const { socket } = fakeSocket();
    bindPhoneReachabilityLive({ socket, client, viewerId: () => ME, snapshot: async () => ({ ok: false, status: 0, error: 'x' }), now: () => T0, announce: () => undefined });
    await Promise.resolve();
    expect(phoneReachabilityStateOf(client, PROCHE, T0)).not.toBeNull();
  });

  test('clearPhoneReachabilityState retire une seule personne', () => {
    const client = new QueryClient();
    receivePhoneReachabilityState(client, state(), T0);
    receivePhoneReachabilityState(client, state({ userId: SANG }), T0);
    clearPhoneReachabilityState(client, PROCHE);
    expect(Object.keys(phoneReachabilityStatesOf(client, T0))).toEqual([SANG]);
  });
});
