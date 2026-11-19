import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { FallState } from '@meeshy/shared/types/fall-detection';
import { FALL_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/fall-event-names';

import type { ApiResult } from '@/lib/api/http';
import { persistableQuery } from '@/lib/api/query-client';
import type { SocketClient } from '@/lib/net/socket';

import { FALL_STATES_QUERY_KEY, bindFallLive, clearFallState, fallStateOf, fallStatesOf, receiveFallState } from './fall-live';

/**
 * LA CHUTE DÉTECTÉE D'UN SANG, REÇUE SUR CET ONGLET (#18748) — `fall:detected` range l'état servi dans le cache EN
 * MÉMOIRE (il porte la dernière position : jamais sur le disque), `fall:cleared` le retire, un état dont `expiresAt`
 * est passé n'est plus servi, le rattrapage rejoue l'état à chaque socket accrochée, et l'annonce part à la
 * pastille — jamais au fil.
 */

const ME = 'a'.repeat(24);
const SANG = 'b'.repeat(24);
const AUTRE = 'c'.repeat(24);
const T0 = Date.parse('2026-11-19T16:45:00.000Z');

const state = (overrides: Partial<FallState> = {}): FallState => ({
  userId: SANG,
  detectedAt: '2026-11-19T16:42:00.000Z',
  expiresAt: '2026-11-19T22:42:00.000Z',
  ...overrides,
});

const detected = { kind: 'detected', at: '2026-11-19T16:42:00.000Z' } as const;

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

const noSnapshot = async (): Promise<ApiResult<readonly FallState[]>> => ({ ok: true, data: [] });

function harness({ snapshot = noSnapshot }: { readonly snapshot?: () => Promise<ApiResult<readonly FallState[]>> } = {}) {
  const client = new QueryClient();
  const heard: { userId: string; kind: string }[] = [];
  const { socket, fire, listeners } = fakeSocket();
  const unbind = bindFallLive({ socket, client, viewerId: () => ME, snapshot, now: () => T0, announce: (userId, kind) => heard.push({ userId, kind }) });
  return { client, heard, fire, listeners, unbind };
}

describe('la chute détectée reçue', () => {
  test('les noms écoutés sont ceux du contrat : `fall:detected` et `fall:cleared`', () => {
    expect(FALL_SERVER_EVENTS.FALL_DETECTED).toBe('fall:detected');
    expect(FALL_SERVER_EVENTS.FALL_CLEARED).toBe('fall:cleared');
  });

  test('`fall:detected` range l’état servi, et l’annonce part à la pastille', () => {
    const { client, heard, fire } = harness();
    fire('fall:detected', { userId: SANG, state: state({ lastBattery: { level: 41, measuredAt: '2026-11-19T16:30:00.000Z' } }), announcement: detected });
    expect(fallStateOf(client, SANG, T0)?.lastBattery?.level).toBe(41);
    expect(heard).toEqual([{ userId: SANG, kind: 'detected' }]);
  });

  test('sans annonce, l’état se range en silence', () => {
    const { client, heard, fire } = harness();
    fire('fall:detected', { userId: SANG, state: state() });
    expect(fallStateOf(client, SANG, T0)).not.toBeNull();
    expect(heard).toEqual([]);
  });

  test('une chute plus ancienne que celle gardée n’écrase rien', () => {
    const { client, fire } = harness();
    fire('fall:detected', { userId: SANG, state: state() });
    fire('fall:detected', { userId: SANG, state: state({ detectedAt: '2026-11-19T15:00:00.000Z', expiresAt: '2026-11-19T21:00:00.000Z' }) });
    expect(fallStateOf(client, SANG, T0)?.detectedAt).toBe('2026-11-19T16:42:00.000Z');
  });

  test('`fall:cleared` « a répondu » efface l’état et annonce le retour', () => {
    const { client, heard, fire } = harness();
    fire('fall:detected', { userId: SANG, state: state() });
    fire('fall:cleared', { userId: SANG, reason: 'responded' });
    expect(fallStateOf(client, SANG, T0)).toBeNull();
    expect(heard).toEqual([{ userId: SANG, kind: 'responded' }]);
  });

  test('`fall:cleared` expiré ou retiré efface en silence', () => {
    const { client, heard, fire } = harness();
    fire('fall:detected', { userId: SANG, state: state() });
    fire('fall:detected', { userId: AUTRE, state: state({ userId: AUTRE }) });
    fire('fall:cleared', { userId: SANG, reason: 'expired' });
    fire('fall:cleared', { userId: AUTRE, reason: 'withdrawn' });
    expect(fallStatesOf(client, T0)).toEqual({});
    expect(heard).toEqual([]);
  });

  test('ma propre chute ne m’est jamais montrée ici', () => {
    const { client, heard, fire } = harness();
    fire('fall:detected', { userId: ME, state: state({ userId: ME }), announcement: detected });
    expect(fallStateOf(client, ME, T0)).toBeNull();
    expect(heard).toEqual([]);
  });

  test('un état dont `expiresAt` est passé n’est plus servi, ni rangé', () => {
    const client = new QueryClient();
    receiveFallState(client, state(), T0);
    const later = Date.parse('2026-11-19T22:42:00.000Z');
    expect(fallStateOf(client, SANG, later)).toBeNull();
    expect(fallStatesOf(client, later)).toEqual({});
    receiveFallState(client, state({ userId: AUTRE, expiresAt: '2026-11-19T16:44:00.000Z' }), T0);
    expect(fallStateOf(client, AUTRE, T0)).toBeNull();
  });

  test('débrancher retire les écouteurs', () => {
    const { listeners, unbind } = harness();
    expect(listeners()).toBe(2);
    unbind();
    expect(listeners()).toBe(0);
  });
});

describe('la position d’un Sang ne se range jamais sur le disque', () => {
  test('le cache des chutes (qui porte lastPosition) n’est pas persistable', () => {
    expect(persistableQuery({ state: { status: 'success' }, queryKey: FALL_STATES_QUERY_KEY })).toBe(false);
  });
});

describe('le rattrapage à chaque socket accrochée', () => {
  test('ce qui s’est clos pendant la coupure disparaît, ce que le serveur sert reste', async () => {
    const client = new QueryClient();
    receiveFallState(client, state(), T0 - 1_000);
    const { socket } = fakeSocket();
    bindFallLive({
      socket,
      client,
      viewerId: () => ME,
      snapshot: async () => ({ ok: true, data: [state({ userId: AUTRE, lastBattery: { level: 4, measuredAt: '2026-11-19T16:00:00.000Z' } }), state({ userId: ME })] }),
      now: () => T0,
      announce: () => undefined,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fallStateOf(client, SANG, T0)).toBeNull();
    expect(fallStateOf(client, AUTRE, T0)?.lastBattery?.level).toBe(4);
    expect(fallStateOf(client, ME, T0)).toBeNull();
  });

  test('un état arrivé APRÈS la demande n’est pas effacé par une réponse qui ne le connaissait pas', async () => {
    const pending: { resolve: (value: ApiResult<readonly FallState[]>) => void } = { resolve: () => undefined };
    const clock = { now: T0 };
    const client = new QueryClient();
    const { socket, fire } = fakeSocket();
    bindFallLive({ socket, client, viewerId: () => ME, snapshot: () => new Promise((resolve) => (pending.resolve = resolve)), now: () => clock.now, announce: () => undefined });
    clock.now = T0 + 500;
    fire('fall:detected', { userId: SANG, state: state() });
    pending.resolve({ ok: true, data: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(fallStateOf(client, SANG, clock.now)).not.toBeNull();
  });

  test('un rattrapage en échec garde le cache : jamais vidé faute de réseau', async () => {
    const client = new QueryClient();
    receiveFallState(client, state(), T0 - 1_000);
    const { socket } = fakeSocket();
    bindFallLive({ socket, client, viewerId: () => ME, snapshot: async () => ({ ok: false, status: 0, error: 'x' }), now: () => T0, announce: () => undefined });
    await Promise.resolve();
    expect(fallStateOf(client, SANG, T0)).not.toBeNull();
  });

  test('clearFallState retire une seule personne', () => {
    const client = new QueryClient();
    receiveFallState(client, state(), T0);
    receiveFallState(client, state({ userId: AUTRE }), T0);
    clearFallState(client, SANG);
    expect(Object.keys(fallStatesOf(client, T0))).toEqual([AUTRE]);
  });
});
