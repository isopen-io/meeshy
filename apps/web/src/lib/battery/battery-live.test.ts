import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { BATTERY_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/battery-event-names';
import type { BatteryAnnouncement, BatteryReaderState } from '@meeshy/shared/types/battery';

import type { ApiResult } from '@/lib/api/http';
import type { SocketClient } from '@/lib/net/socket';

import { batteryStateOf, batteryStatesOf, bindBatteryLive, clearBatteryState, receiveBatteryState } from './battery-live';

/**
 * LA BATTERIE D'UN PROCHE OU D'UN SANG, REÇUE SUR CET ONGLET (#14147) — le serveur a déjà jugé : ce client range
 * ce qu'il reçoit dans le cache persisté (cache-first au prochain démarrage), le retire à `battery:cleared` ou
 * après 24 h, rattrape à chaque socket accrochée, et remet l'annonce à la pastille — jamais au fil.
 */

const ME = 'a'.repeat(24);
const PROCHE = 'b'.repeat(24);
const SANG = 'c'.repeat(24);
const T0 = Date.parse('2026-11-15T10:00:00.000Z');

const state = (overrides: Partial<BatteryReaderState> = {}): BatteryReaderState => ({
  userId: PROCHE,
  phase: 'low',
  level: 28,
  charging: false,
  lowPower: false,
  measuredAt: '2026-11-15T10:00:00.000Z',
  ...overrides,
});

const announcement = (overrides: Partial<BatteryAnnouncement> = {}): BatteryAnnouncement => ({
  kind: 'low',
  level: 28,
  at: '2026-11-15T10:00:00.000Z',
  ...overrides,
});

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    },
  } as unknown as SocketClient;
  const fire = (event: string, payload: unknown): void => handlers.get(event)?.forEach((handler) => handler(payload));
  const listeners = (): number => [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
  return { socket, fire, listeners };
}

const noSnapshot = async (): Promise<ApiResult<readonly BatteryReaderState[]>> => ({ ok: true, data: [] });

function harness({ snapshot = noSnapshot }: { readonly snapshot?: () => Promise<ApiResult<readonly BatteryReaderState[]>> } = {}) {
  const client = new QueryClient();
  const heard: { userId: string; kind: string }[] = [];
  const { socket, fire, listeners } = fakeSocket();
  const unbind = bindBatteryLive({
    socket,
    client,
    viewerId: () => ME,
    snapshot,
    now: () => T0,
    announce: (userId, said) => heard.push({ userId, kind: said.kind }),
  });
  return { client, heard, fire, listeners, unbind };
}

describe('la batterie reçue', () => {
  test('`battery:changed` range l’état servi, et l’annonce part à la pastille', () => {
    const { client, heard, fire } = harness();
    fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: PROCHE, state: state(), announcement: announcement() });
    expect(batteryStateOf(client, PROCHE, T0)?.level).toBe(28);
    expect(heard).toEqual([{ userId: PROCHE, kind: 'low' }]);
  });

  test('sans annonce, l’état se met à jour en silence', () => {
    const { client, heard, fire } = harness();
    fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: PROCHE, state: state({ level: 18 }) });
    expect(batteryStateOf(client, PROCHE, T0)?.level).toBe(18);
    expect(heard).toEqual([]);
  });

  test('un relevé plus ancien que celui gardé n’écrase rien ; un même instant (extinction présumée) passe', () => {
    const { client, fire } = harness();
    fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: PROCHE, state: state({ level: 4, phase: 'critical', measuredAt: '2026-11-15T10:05:00.000Z' }) });
    fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: PROCHE, state: state({ level: 20, measuredAt: '2026-11-15T10:00:00.000Z' }) });
    expect(batteryStateOf(client, PROCHE, T0)?.level).toBe(4);
    fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: PROCHE, state: state({ level: 4, phase: 'off', measuredAt: '2026-11-15T10:05:00.000Z' }) });
    expect(batteryStateOf(client, PROCHE, T0)?.phase).toBe('off');
  });

  test('`battery:cleared` efface l’icône, et son annonce part à la pastille', () => {
    const { client, heard, fire } = harness();
    fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: PROCHE, state: state() });
    fire(BATTERY_SERVER_EVENTS.BATTERY_CLEARED, { userId: PROCHE, announcement: announcement({ kind: 'ended', level: 40 }) });
    expect(batteryStateOf(client, PROCHE, T0)).toBeNull();
    expect(heard).toEqual([{ userId: PROCHE, kind: 'ended' }]);
  });

  test('ma propre batterie (un autre de mes appareils) ne s’affiche pas ici', () => {
    const { client, fire } = harness();
    fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: ME, state: state({ userId: ME }) });
    expect(batteryStateOf(client, ME, T0)).toBeNull();
  });

  test('un état de plus de 24 h n’est plus servi : aucun historique', () => {
    const client = new QueryClient();
    receiveBatteryState(client, state(), T0);
    expect(batteryStateOf(client, PROCHE, T0 + 24 * 3_600_000 + 1)).toBeNull();
    expect(batteryStatesOf(client, T0 + 24 * 3_600_000 + 1)).toEqual({});
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
    receiveBatteryState(client, state(), T0 - 1_000);
    receiveBatteryState(client, state({ userId: SANG, level: 3, phase: 'critical' }), T0 - 1_000);
    const { socket } = fakeSocket();
    bindBatteryLive({
      socket,
      client,
      viewerId: () => ME,
      snapshot: async () => ({ ok: true, data: [state({ userId: SANG, level: 2, phase: 'critical' })] }),
      now: () => T0,
      announce: () => undefined,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(batteryStateOf(client, PROCHE, T0)).toBeNull();
    expect(batteryStateOf(client, SANG, T0)?.level).toBe(2);
  });

  test('un état arrivé APRÈS la demande n’est pas effacé par une réponse qui ne le connaissait pas', async () => {
    const pending: { resolve: (value: ApiResult<readonly BatteryReaderState[]>) => void } = { resolve: () => undefined };
    const clock = { now: T0 };
    const client = new QueryClient();
    const { socket, fire } = fakeSocket();
    bindBatteryLive({
      socket,
      client,
      viewerId: () => ME,
      snapshot: () => new Promise((resolve) => (pending.resolve = resolve)),
      now: () => clock.now,
      announce: () => undefined,
    });
    clock.now = T0 + 500;
    fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: PROCHE, state: state() });
    pending.resolve({ ok: true, data: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(batteryStateOf(client, PROCHE, clock.now)?.level).toBe(28);
  });

  test('un rattrapage en échec garde le cache : jamais vidé faute de réseau', async () => {
    const client = new QueryClient();
    receiveBatteryState(client, state(), T0 - 1_000);
    const { socket } = fakeSocket();
    bindBatteryLive({ socket, client, viewerId: () => ME, snapshot: async () => ({ ok: false, status: 0, error: 'x' }), now: () => T0, announce: () => undefined });
    await Promise.resolve();
    expect(batteryStateOf(client, PROCHE, T0)?.level).toBe(28);
  });

  test('clearBatteryState retire une seule personne', () => {
    const client = new QueryClient();
    receiveBatteryState(client, state(), T0);
    receiveBatteryState(client, state({ userId: SANG }), T0);
    clearBatteryState(client, PROCHE);
    expect(Object.keys(batteryStatesOf(client, T0))).toEqual([SANG]);
  });
});
