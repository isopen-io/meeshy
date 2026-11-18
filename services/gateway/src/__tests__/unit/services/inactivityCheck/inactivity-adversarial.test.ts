/**
 * AUDIT ADVERSARIAL #18738 — les deux défauts trouvés par l'audit, gardés : une alerte en vol ne
 * contredit pas un « Je vais bien » déjà annoncé, et hors épisode aucune batterie n'est servie.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  noteInactivityActivity,
  sweepInactivity,
  type InactivityPush,
  type InactivityRelayDeps,
} from '../../../../services/inactivityCheck/inactivityRelay';
import { batteryLastReadingFor, batteryStateFor, reportBattery, type BatteryRelayDeps } from '../../../../services/battery/batteryRelay';
import { ADULT_BIRTH, messagingWorld, table } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from '../battery/batteryWorld';

const PERSONNE = '6400000000000000000000e1';
const SANG = '6400000000000000000000b1';
const T0 = Date.parse('2026-11-16T08:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

function deferred() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

describe('course : une alerte en vol ne contredit pas le « Je vais bien » déjà annoncé', () => {
  it('le Sang ne garde pas une alerte poussée APRÈS le retour', async () => {
    const world = messagingWorld({
      links: [[PERSONNE, SANG, 'BLOOD']],
      users: [PERSONNE, SANG].map((id) => ({ id, birthDate: ADULT_BIRTH, role: 'USER' })),
    });
    const emissions: Emission[] = [];
    const pushes: InactivityPush[] = [];
    let now = T0;
    let holdPosition = false;
    const hold = deferred();
    const entered = deferred();
    const deps: InactivityRelayDeps = {
      prisma: { ...world.prisma, relationFeatureSetting: table([]) } as unknown as PrismaClient,
      cache: batteryCacheInMemory(),
      io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as InactivityRelayDeps['io'],
      now: () => now,
      isTrackedDevice: async ({ sessionId }) => sessionId === 's1',
      trackedSession: async () => 's1',
      trackedDeviceConnected: async () => false,
      askWellness: async () => undefined,
      retractWellness: async () => undefined,
      push: async (push) => {
        pushes.push(push);
        return true;
      },
      retractAlerts: async () => undefined,
      lastPositionFor: async () => {
        if (holdPosition) {
          entered.release();
          await hold.gate;
        }
        return null;
      },
      lastBatteryFor: async () => null,
    };
    await noteInactivityActivity(deps, { userId: PERSONNE, sessionId: 's1' });
    now += 12 * HOUR;
    await sweepInactivity(deps);
    now += 30 * MIN;
    holdPosition = true;
    const sweep = sweepInactivity(deps);
    await entered.gate; // l'alerte est rangée, l'éventail est en vol (lecture de position)
    now += MIN;
    await noteInactivityActivity(deps, { userId: PERSONNE, sessionId: null, anyDevice: true }); // « Je vais bien »
    hold.release();
    await sweep;

    const toSang = emissions.filter((e) => e.room === ROOMS.user(SANG)).map((e) => e.event);
    const pushedKinds = pushes.filter((p) => p.readerId === SANG).map((p) => p.announcement.kind);
    // Ce que le Sang voit EN DERNIER doit être le retour, pas l'alerte.
    expect(toSang[toSang.length - 1]).toBe(SERVER_EVENTS.INACTIVITY_CLEARED);
    expect(pushedKinds[pushedKinds.length - 1]).toBe('responded');
  });
});

describe('dernière batterie : seulement ce que le Sang reçoit DÉJÀ par la loi de la batterie', () => {
  it('hors épisode (batterie normale), le Sang ne reçoit aucune batterie, donc l’alerte non plus', async () => {
    const world = messagingWorld({
      links: [[PERSONNE, SANG, 'BLOOD']],
      users: [PERSONNE, SANG].map((id) => ({ id, birthDate: ADULT_BIRTH, role: 'USER' })),
    });
    const deps: BatteryRelayDeps = {
      prisma: { ...world.prisma, relationFeatureSetting: table([]) } as unknown as PrismaClient,
      cache: batteryCacheInMemory(),
      io: undefined,
      now: () => T0,
      context: async ({ readerIds }) => new Map(readerIds.map((id) => [id, { roomOpen: false, lastExchangeAt: null, awaitingReply: false }])),
      push: async () => true,
      isTrackedDevice: async () => true,
      trackedDeviceConnected: async () => false,
      retractPushes: async () => undefined,
    } as unknown as BatteryRelayDeps;
    await reportBattery(deps, { emitterId: PERSONNE, sessionId: 's1', payload: { level: 83, charging: false, lowPower: false, measuredAt: new Date(T0).toISOString() } });

    expect(await batteryStateFor(deps, { readerId: SANG, emitterId: PERSONNE })).toBeNull();
    expect(await batteryLastReadingFor(deps, { readerId: SANG, emitterId: PERSONNE })).toBeNull();
  });
});
