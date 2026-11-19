/**
 * AUDIT ADVERSARIAL #18738, SECONDE PASSE — gardés : un « Je vais bien » pendant l'envoi de l'alerte
 * ne produit qu'UN « va bien », jamais un « va bien » pour une alerte jamais reçue, et un
 * rafraîchissement en vol ne ressuscite pas l'alerte après le retour.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  noteInactivityActivity,
  refreshInactivityServedOf,
  refreshInactivityBetween,
  sweepInactivity,
  type InactivityPush,
  type InactivityRelayDeps,
} from '../../../../services/inactivityCheck/inactivityRelay';
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
  const gate = new Promise<void>((r) => { release = r; });
  return { gate, release };
}

function harness() {
  const world = messagingWorld({
    links: [[PERSONNE, SANG, 'BLOOD']],
    users: [PERSONNE, SANG].map((id) => ({ id, birthDate: ADULT_BIRTH, role: 'USER' })),
  });
  const emissions: Emission[] = [];
  const pushes: InactivityPush[] = [];
  const ctl = { now: T0, holdPush: false, holdPosition: false, hold: deferred(), entered: deferred() };
  const deps: InactivityRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: table([]) } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as InactivityRelayDeps['io'],
    now: () => ctl.now,
    isTrackedDevice: async ({ sessionId }) => sessionId === 's1',
    trackedSession: async () => 's1',
    trackedDeviceConnected: async () => false,
    askWellness: async () => undefined,
    retractWellness: async () => undefined,
    push: async (push) => {
      if (ctl.holdPush && push.announcement.kind === 'alert') { ctl.entered.release(); await ctl.hold.gate; }
      pushes.push(push);
      return true;
    },
    retractAlerts: async () => undefined,
    lastPositionFor: async () => {
      if (ctl.holdPosition) { ctl.entered.release(); await ctl.hold.gate; }
      return { latitude: 1, longitude: 2, recordedAt: new Date(T0).toISOString() };
    },
    lastBatteryFor: async () => null,
  };
  return { deps, emissions, pushes, ctl };
}

async function alerted(h: ReturnType<typeof harness>) {
  await noteInactivityActivity(h.deps, { userId: PERSONNE, sessionId: 's1' });
  h.ctl.now += 12 * HOUR;
  await sweepInactivity(h.deps);
  h.ctl.now += 30 * MIN;
}

describe('audit 2', () => {
  it('« Je vais bien » pendant l’envoi de l’alerte : le Sang reçoit UN seul « responded »', async () => {
    const h = harness();
    await alerted(h);
    h.ctl.holdPush = true;
    const sweep = sweepInactivity(h.deps);
    await h.ctl.entered.gate;
    h.ctl.now += MIN;
    await noteInactivityActivity(h.deps, { userId: PERSONNE, sessionId: null, anyDevice: true });
    h.ctl.hold.release();
    await sweep;
    const responded = h.pushes.filter((p) => p.readerId === SANG && p.announcement.kind === 'responded');
    expect(responded).toHaveLength(1);
  });

  it('« Je vais bien » avant l’éventail : le Sang ne reçoit pas un « est de retour » pour une alerte jamais reçue', async () => {
    const h = harness();
    await alerted(h);
    h.ctl.holdPosition = true;
    const sweep = sweepInactivity(h.deps);
    await h.ctl.entered.gate;
    h.ctl.now += MIN;
    await noteInactivityActivity(h.deps, { userId: PERSONNE, sessionId: null, anyDevice: true });
    h.ctl.hold.release();
    await sweep;
    const toSang = h.pushes.filter((p) => p.readerId === SANG).map((p) => p.announcement.kind);
    expect(toSang).toEqual([]);
  });

  it('refreshInactivityServedOf en vol pendant un « Je vais bien » : la dernière émission reste le retour', async () => {
    const h = harness();
    await alerted(h);
    await sweepInactivity(h.deps); // alerte partie
    h.ctl.holdPosition = true;
    h.ctl.hold = deferred(); h.ctl.entered = deferred();
    const refresh = refreshInactivityServedOf(h.deps, PERSONNE);
    await h.ctl.entered.gate;
    h.ctl.now += MIN;
    h.ctl.holdPosition = false;
    await noteInactivityActivity(h.deps, { userId: PERSONNE, sessionId: null, anyDevice: true });
    h.ctl.hold.release();
    await refresh;
    const toSang = h.emissions.filter((e) => e.room === ROOMS.user(SANG)).map((e) => e.event);
    expect(toSang[toSang.length - 1]).toBe(SERVER_EVENTS.INACTIVITY_CLEARED);
  });
});
