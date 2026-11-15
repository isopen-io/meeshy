/**
 * La porte socket de la batterie (#14147) : un invité n'a pas de cercle, le débit est borné, la
 * session qui relève est celle de la socket, et le balayage ne passe qu'une fois par flotte.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { listenBattery, runBatterySweep, type BatteryHandlerDeps } from '../../../socketio/handlers/BatteryHandler';
import type { BatteryRelayDeps } from '../../../services/battery/batteryRelay';
import { messagingWorld, table } from '../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from '../services/battery/batteryWorld';

const MOI = '6900000000000000000000a1';
const NOW = Date.parse('2026-11-15T10:00:00.000Z');

function porte(options: { readonly isAnonymous?: boolean; readonly within?: boolean | null; readonly withinPull?: boolean | null } = {}) {
  const world = messagingWorld({ users: [{ id: MOI }] });
  const cache = batteryCacheInMemory();
  const sessions: Array<string | null> = [];
  const relay: BatteryRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: table([]) } as unknown as PrismaClient,
    cache,
    io: undefined,
    now: () => NOW,
    context: async () => new Map(),
    push: async () => false,
    isTrackedDevice: async ({ sessionId }) => {
      sessions.push(sessionId);
      return true;
    },
  };
  const deps: BatteryHandlerDeps = {
    relay,
    pull: { prisma: relay.prisma, cache, io: undefined, now: relay.now, wake: async () => undefined },
    callerOf: () => ({ userId: MOI, isAnonymous: options.isAnonymous ?? false }),
    withinRate: async () => (options.within === undefined ? true : options.within),
    withinPullRate: async () => (options.withinPull === undefined ? true : options.withinPull),
  };
  const handlers = new Map<string, (...args: unknown[]) => void>();
  listenBattery({ id: 'sock', data: { sessionId: 'sess-1' }, on: (event, listener) => { handlers.set(event, listener); } }, deps);
  const call = (event: string, payload: unknown) =>
    new Promise<Record<string, unknown>>((resolve) => handlers.get(event)!(payload, resolve));
  return { relay, cache, sessions, call };
}

const releve = { level: 18, charging: false, lowPower: false, measuredAt: new Date(NOW).toISOString() };

describe('BatteryHandler — la porte', () => {
  it('un invité est refusé et rien n\'est rangé', async () => {
    const p = porte({ isAnonymous: true });
    expect(await p.call('battery:report', releve)).toMatchObject({ success: false });
    expect(p.cache.entries.size).toBe(0);
  });

  it('un compte inscrit relève depuis la session de SA socket : l\'épisode est rangé', async () => {
    const p = porte();
    expect(await p.call('battery:report', releve)).toEqual({ success: true, data: { tracked: true } });
    expect(p.sessions).toEqual(['sess-1']);
    expect([...p.cache.entries.keys()]).toContain(`battery:state:${MOI}`);
  });

  it('au-delà du débit : BATTERY_RATE_LIMITED, rien n\'est rangé', async () => {
    const p = porte({ within: false });
    expect(await p.call('battery:report', releve)).toMatchObject({ success: false, code: 'BATTERY_RATE_LIMITED' });
    expect(p.cache.entries.size).toBe(0);
  });

  it('les demandes de relevé ont leur propre débit, comme par REST : au-delà, BATTERY_RATE_LIMITED', async () => {
    const p = porte({ withinPull: false });
    expect(await p.call('battery:pull', { userId: '6900000000000000000000b1' })).toMatchObject({ success: false, code: 'BATTERY_RATE_LIMITED' });
  });

  it('une demande de relevé de soi est refusée', async () => {
    const p = porte();
    expect(await p.call('battery:pull', { userId: MOI })).toMatchObject({ success: false, code: 'BATTERY_PULL_FORBIDDEN' });
  });

  it('le balayage passe une fois par fenêtre de verrou, quelle que soit la flotte', async () => {
    const p = porte();
    expect(await runBatterySweep(p.relay)).toBe(0);
    expect(await runBatterySweep(p.relay)).toBeNull();
  });
});

describe('BatteryHandler — le signe de vie', () => {
  it('une socket du téléphone suivi est un signe de vie qui repousse l\'extinction présumée ; une autre session ne dit rien', async () => {
    const { ensureBatterySweep, noteBatteryAlive, stopBatterySweep } = await import('../../../socketio/handlers/BatteryHandler');
    const { readBatteryRecord, storeBatteryRecord } = await import('../../../services/battery/batteryStore');
    const p = porte();
    const tracked = new Set(['phone']);
    const relay = { ...p.relay, now: () => NOW + 12 * 60_000, isTrackedDevice: async ({ sessionId }: { sessionId: string | null }) => tracked.has(sessionId ?? '') };
    stopBatterySweep();
    ensureBatterySweep(relay);
    const { batteryEpisodeStep } = await import('@meeshy/shared/utils/battery-episode');
    const { BATTERY_CONFIG } = await import('@meeshy/shared/types/battery');
    const critical = batteryEpisodeStep(null, { kind: 'reading', ...releve, level: 4 }, BATTERY_CONFIG).state;
    const off = { episode: critical, anchor: null, deviceLabel: null };
    await storeBatteryRecord(p.cache, MOI, off);

    noteBatteryAlive({ userId: MOI, sessionId: 'laptop' });
    await new Promise((resolve) => setImmediate(resolve));
    expect((await readBatteryRecord(p.cache, MOI))?.episode.lastSeenAt).toBe(releve.measuredAt);

    noteBatteryAlive({ userId: MOI, sessionId: 'phone' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await readBatteryRecord(p.cache, MOI))?.episode.lastSeenAt).toBe(new Date(NOW + 12 * 60_000).toISOString());
    stopBatterySweep();
  });
});
