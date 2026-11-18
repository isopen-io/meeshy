import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { INACTIVITY_CHECK_CONFIG, type InactivityAlertState } from '@meeshy/shared/types/inactivity-check';
import { INACTIVITY_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/inactivity-event-names';

import type { ApiResult } from '@/lib/api/http';
import type { SocketClient } from '@/lib/net/socket';

import { INACTIVITY_STATE_TTL_MS, bindInactivityLive, clearInactivityState, inactivityStateOf, inactivityStatesOf, receiveInactivityState } from './inactivity-live';

/**
 * L'ALERTE D'INACTIVITÉ D'UN SANG, REÇUE SUR CET ONGLET (#18738) — `inactivity:alert` range l'état servi dans le
 * cache persisté, `inactivity:cleared` le retire, une alerte trop ancienne n'est plus servie, le rattrapage
 * rejoue l'état à chaque socket accrochée, et l'annonce part à la pastille — jamais au fil.
 */

const ME = 'a'.repeat(24);
const SANG = 'b'.repeat(24);
const AUTRE = 'c'.repeat(24);
const T0 = Date.parse('2026-11-18T20:35:00.000Z');

const state = (overrides: Partial<InactivityAlertState> = {}): InactivityAlertState => ({
  userId: SANG,
  inactiveSince: '2026-11-18T08:00:00.000Z',
  alertedAt: '2026-11-18T20:30:00.000Z',
  ...overrides,
});

const alert = { kind: 'alert', inactiveSince: '2026-11-18T08:00:00.000Z', at: '2026-11-18T20:30:00.000Z' } as const;

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

const noSnapshot = async (): Promise<ApiResult<readonly InactivityAlertState[]>> => ({ ok: true, data: [] });

function harness({ snapshot = noSnapshot }: { readonly snapshot?: () => Promise<ApiResult<readonly InactivityAlertState[]>> } = {}) {
  const client = new QueryClient();
  const heard: { userId: string; kind: string; since: string }[] = [];
  const { socket, fire, listeners } = fakeSocket();
  const unbind = bindInactivityLive({
    socket,
    client,
    viewerId: () => ME,
    snapshot,
    now: () => T0,
    announce: (userId, said) => heard.push({ userId, kind: said.kind, since: said.inactiveSince }),
  });
  return { client, heard, fire, listeners, unbind };
}

describe('l’alerte d’inactivité reçue', () => {
  test('les noms écoutés sont ceux du contrat : `inactivity:alert` et `inactivity:cleared`', () => {
    expect(INACTIVITY_SERVER_EVENTS.INACTIVITY_ALERT).toBe('inactivity:alert');
    expect(INACTIVITY_SERVER_EVENTS.INACTIVITY_CLEARED).toBe('inactivity:cleared');
  });

  test('la durée de vie est celle du contrat', () => {
    expect(INACTIVITY_STATE_TTL_MS).toBe(INACTIVITY_CHECK_CONFIG.stateTtlSeconds * 1_000);
  });

  test('`inactivity:alert` range l’état servi, et l’annonce part à la pastille', () => {
    const { client, heard, fire } = harness();
    fire('inactivity:alert', { userId: SANG, state: state({ lastBattery: { level: 9, measuredAt: '2026-11-18T07:58:00.000Z' } }), announcement: alert });
    expect(inactivityStateOf(client, SANG, T0)?.lastBattery?.level).toBe(9);
    expect(heard).toEqual([{ userId: SANG, kind: 'alert', since: '2026-11-18T08:00:00.000Z' }]);
  });

  test('sans annonce, l’état se range en silence', () => {
    const { client, heard, fire } = harness();
    fire('inactivity:alert', { userId: SANG, state: state() });
    expect(inactivityStateOf(client, SANG, T0)).not.toBeNull();
    expect(heard).toEqual([]);
  });

  test('une alerte plus ancienne que celle gardée n’écrase rien', () => {
    const { client, fire } = harness();
    fire('inactivity:alert', { userId: SANG, state: state({ alertedAt: '2026-11-18T20:30:00.000Z', inactiveSince: '2026-11-18T08:00:00.000Z' }) });
    fire('inactivity:alert', { userId: SANG, state: state({ alertedAt: '2026-11-17T20:30:00.000Z', inactiveSince: '2026-11-17T08:00:00.000Z' }) });
    expect(inactivityStateOf(client, SANG, T0)?.inactiveSince).toBe('2026-11-18T08:00:00.000Z');
  });

  test('`inactivity:cleared` efface l’état, et « va bien » part à la pastille', () => {
    const { client, heard, fire } = harness();
    fire('inactivity:alert', { userId: SANG, state: state() });
    fire('inactivity:cleared', { userId: SANG, announcement: { ...alert, kind: 'responded', at: '2026-11-18T20:40:00.000Z' } });
    expect(inactivityStateOf(client, SANG, T0)).toBeNull();
    expect(heard).toEqual([{ userId: SANG, kind: 'responded', since: '2026-11-18T08:00:00.000Z' }]);
  });

  test('`inactivity:cleared` sans annonce efface en silence', () => {
    const { client, heard, fire } = harness();
    fire('inactivity:alert', { userId: SANG, state: state() });
    fire('inactivity:cleared', { userId: SANG });
    expect(inactivityStateOf(client, SANG, T0)).toBeNull();
    expect(heard).toEqual([]);
  });

  test('ma propre alerte ne m’est jamais montrée', () => {
    const { client, heard, fire } = harness();
    fire('inactivity:alert', { userId: ME, state: state({ userId: ME }), announcement: alert });
    expect(inactivityStateOf(client, ME, T0)).toBeNull();
    expect(heard).toEqual([]);
  });

  test('une alerte au-delà de sa durée de vie n’est plus servie : aucun historique', () => {
    const client = new QueryClient();
    receiveInactivityState(client, state(), T0);
    const later = Date.parse('2026-11-18T20:30:00.000Z') + INACTIVITY_STATE_TTL_MS + 1;
    expect(inactivityStateOf(client, SANG, later)).toBeNull();
    expect(inactivityStatesOf(client, later)).toEqual({});
  });

  test('débrancher retire les écouteurs', () => {
    const { listeners, unbind } = harness();
    expect(listeners()).toBe(2);
    unbind();
    expect(listeners()).toBe(0);
  });
});

describe('le rattrapage à chaque socket accrochée', () => {
  test('ce qui s’est clos pendant la coupure disparaît, ce que le serveur sert reste', async () => {
    const client = new QueryClient();
    receiveInactivityState(client, state(), T0 - 1_000);
    receiveInactivityState(client, state({ userId: AUTRE }), T0 - 1_000);
    const { socket } = fakeSocket();
    bindInactivityLive({
      socket,
      client,
      viewerId: () => ME,
      snapshot: async () => ({ ok: true, data: [state({ userId: AUTRE, lastBattery: { level: 4, measuredAt: '2026-11-18T07:00:00.000Z' } }), state({ userId: ME })] }),
      now: () => T0,
      announce: () => undefined,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(inactivityStateOf(client, SANG, T0)).toBeNull();
    expect(inactivityStateOf(client, AUTRE, T0)?.lastBattery?.level).toBe(4);
    expect(inactivityStateOf(client, ME, T0)).toBeNull();
  });

  test('un état arrivé APRÈS la demande n’est pas effacé par une réponse qui ne le connaissait pas', async () => {
    const pending: { resolve: (value: ApiResult<readonly InactivityAlertState[]>) => void } = { resolve: () => undefined };
    const clock = { now: T0 };
    const client = new QueryClient();
    const { socket, fire } = fakeSocket();
    bindInactivityLive({ socket, client, viewerId: () => ME, snapshot: () => new Promise((resolve) => (pending.resolve = resolve)), now: () => clock.now, announce: () => undefined });
    clock.now = T0 + 500;
    fire('inactivity:alert', { userId: SANG, state: state() });
    pending.resolve({ ok: true, data: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(inactivityStateOf(client, SANG, clock.now)).not.toBeNull();
  });

  test('un rattrapage en échec garde le cache : jamais vidé faute de réseau', async () => {
    const client = new QueryClient();
    receiveInactivityState(client, state(), T0 - 1_000);
    const { socket } = fakeSocket();
    bindInactivityLive({ socket, client, viewerId: () => ME, snapshot: async () => ({ ok: false, status: 0, error: 'x' }), now: () => T0, announce: () => undefined });
    await Promise.resolve();
    expect(inactivityStateOf(client, SANG, T0)).not.toBeNull();
  });

  test('clearInactivityState retire une seule personne', () => {
    const client = new QueryClient();
    receiveInactivityState(client, state(), T0);
    receiveInactivityState(client, state({ userId: AUTRE }), T0);
    clearInactivityState(client, SANG);
    expect(Object.keys(inactivityStatesOf(client, T0))).toEqual([AUTRE]);
  });
});
