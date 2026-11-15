/**
 * LE TÉLÉPHONE SUIVI (#14147, spec § 6) — seule la session de téléphone la plus récemment active
 * relève : une tablette, même plus récente et même déclarée `ios`, ne prend jamais sa place. Et
 * une socket OUVERTE de ce téléphone est un signe de vie.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import {
  isPhoneSession,
  isTrackedBatteryDevice,
  isTrackedBatteryDeviceConnected,
  retractBatteryNotifications,
} from '../../../../services/battery/batteryDeps';

const MOI = '6a00000000000000000000a1';
const AUTRE = '6a00000000000000000000b1';
const NOW = new Date('2026-11-15T10:00:00.000Z');

type Session = { id: string; deviceType: string | null; platform: string | null; deviceModel: string | null; lastActivityAt: Date };

const sessions = (rows: readonly Session[]) => ({
  userSession: {
    findMany: async (args: { take?: number }) =>
      [...rows].sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()).slice(0, args.take ?? rows.length),
  },
}) as never;

const IPHONE: Session = { id: 'iphone', deviceType: 'mobile', platform: 'ios', deviceModel: 'iPhone15,2', lastActivityAt: new Date('2026-11-15T09:00:00.000Z') };
const IPAD: Session = { id: 'ipad', deviceType: 'mobile', platform: 'ios', deviceModel: 'iPad13,4', lastActivityAt: new Date('2026-11-15T09:59:00.000Z') };
const TABLETTE: Session = { id: 'tab', deviceType: 'tablet', platform: 'android', deviceModel: 'SM-X200', lastActivityAt: new Date('2026-11-15T09:58:00.000Z') };
const ORDI: Session = { id: 'mac', deviceType: 'desktop', platform: 'web', deviceModel: null, lastActivityAt: new Date('2026-11-15T09:57:00.000Z') };

describe('le téléphone suivi', () => {
  it('une tablette iOS plus récente qu\'un iPhone ne le remplace pas', async () => {
    const prisma = sessions([IPHONE, IPAD, TABLETTE, ORDI]);
    expect(await isTrackedBatteryDevice(prisma, { userId: MOI, sessionId: 'iphone', now: NOW })).toBe(true);
    expect(await isTrackedBatteryDevice(prisma, { userId: MOI, sessionId: 'ipad', now: NOW })).toBe(false);
    expect(await isTrackedBatteryDevice(prisma, { userId: MOI, sessionId: 'tab', now: NOW })).toBe(false);
  });

  it('un téléphone Android sans type lu reste un téléphone ; un compte sans téléphone relève d\'où il peut', async () => {
    expect(isPhoneSession({ deviceType: 'desktop', platform: 'android', deviceModel: 'Pixel 8' })).toBe(true);
    expect(isPhoneSession({ deviceType: 'desktop', platform: 'web', deviceModel: null })).toBe(false);
    expect(await isTrackedBatteryDevice(sessions([IPAD, ORDI]), { userId: MOI, sessionId: 'ipad', now: NOW })).toBe(true);
  });
});

describe('la connexion vivante du téléphone suivi', () => {
  const io = (sockets: ReadonlyArray<{ data?: unknown }>, rooms: string[] = []) => ({
    to: () => ({ emit: () => undefined }),
    in: (room: string) => {
      rooms.push(room);
      return { fetchSockets: async () => sockets };
    },
  }) as never;

  it('une socket de la session du téléphone est un signe de vie ; celle d\'un ordinateur non', async () => {
    const prisma = sessions([IPHONE, ORDI]);
    const rooms: string[] = [];
    expect(await isTrackedBatteryDeviceConnected({ prisma, io: io([{ data: { sessionId: 'iphone' } }], rooms), userId: MOI, now: NOW })).toBe(true);
    expect(rooms).toEqual([ROOMS.user(MOI)]);
    expect(await isTrackedBatteryDeviceConnected({ prisma, io: io([{ data: { sessionId: 'mac' } }]), userId: MOI, now: NOW })).toBe(false);
    expect(await isTrackedBatteryDeviceConnected({ prisma, io: undefined, userId: MOI, now: NOW })).toBe(false);
  });
});

describe('le retrait des notifications de batterie', () => {
  it('une commande, bornée au type et à chaque paire émetteur → lecteur', async () => {
    const commands: unknown[] = [];
    await retractBatteryNotifications({ $runCommandRaw: async (command: unknown) => { commands.push(command); return {}; } } as never, [{ emitterId: MOI, readerId: AUTRE }]);
    await retractBatteryNotifications({ $runCommandRaw: async (command: unknown) => { commands.push(command); return {}; } } as never, []);
    expect(commands).toEqual([{
      delete: 'Notification',
      deletes: [{ q: { type: 'device_battery', $or: [{ userId: { $oid: AUTRE }, 'actor.id': MOI }] }, limit: 0 }],
    }]);
  });
});
