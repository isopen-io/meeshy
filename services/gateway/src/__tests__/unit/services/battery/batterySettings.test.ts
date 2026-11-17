/**
 * LES RÉGLAGES DE LA BATTERIE (#14147, spec § 2 et § 6) — l'émetteur coupe tout ou choisit par
 * personne ; le lecteur choisit ce qu'il reçoit de chacun. Ce qui est servi est l'EFFET : un
 * Sang sans réglage partage, un Proche sans accord ne partage pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  readBatteryEmitterSettings,
  readBatteryPersonSettings,
  writeBatteryEmitterSettings,
  writeBatteryPersonSettings,
} from '../../../../services/battery/batterySettings';
import { matchesMongoWhere } from '../../../helpers/mongo-where';
import { ADULT_BIRTH, messagingWorld, table, type Row } from '../../../helpers/messaging-circle-world';

const MOI = '6800000000000000000000e1';
const SANG = '6800000000000000000000b1';
const PROCHE = '6800000000000000000000c1';
const NOW = new Date('2026-11-15T10:00:00.000Z');

function monde() {
  const world = messagingWorld({
    links: [[MOI, SANG, 'BLOOD'], [MOI, PROCHE, 'CLOSE']],
    users: [MOI, SANG, PROCHE].map((id) => ({ id, birthDate: ADULT_BIRTH, role: 'USER' })),
  });
  const users = (world.prisma as unknown as { user: ReturnType<typeof table> }).user;
  const settings = table([]);
  const prisma = {
    ...world.prisma,
    user: { ...users, update: async (args: { where: Row; data: Row }) => {
      const row = users.rows.find((r) => matchesMongoWhere(r, args.where))!;
      Object.assign(row, args.data);
      return row;
    } },
    relationFeatureSetting: {
      ...settings,
      upsert: async (args: { where: { ownerId_otherId: Row }; create: Row; update: Row }) => {
        const found = settings.rows.find((r) => matchesMongoWhere(r, args.where.ownerId_otherId));
        if (found) Object.assign(found, args.update);
        else settings.rows.push({ ...args.create });
        return found ?? args.create;
      },
    },
  };
  return { prisma: prisma as never, settings, users };
}

describe('les réglages de la batterie', () => {
  it('par défaut : partage global ouvert, le Sang partage, le Proche non, réception « all »', async () => {
    const m = monde();
    expect(await readBatteryEmitterSettings(m.prisma, MOI)).toEqual({ sharingEnabled: true });
    expect(await readBatteryPersonSettings(m.prisma, { ownerId: MOI, otherId: SANG, now: NOW })).toEqual({ userId: SANG, shared: true, receive: 'all' });
    expect(await readBatteryPersonSettings(m.prisma, { ownerId: MOI, otherId: PROCHE, now: NOW })).toEqual({ userId: PROCHE, shared: false, receive: 'all' });
  });

  it('la coupure globale ferme tout, et se lève', async () => {
    const m = monde();
    expect(await writeBatteryEmitterSettings(m.prisma, { userId: MOI, update: { sharingEnabled: false }, now: NOW })).toEqual({ sharingEnabled: false });
    expect(m.users.rows.find((r) => r.id === MOI)?.batterySharingDisabledAt).toEqual(NOW);
    expect((await readBatteryPersonSettings(m.prisma, { ownerId: MOI, otherId: SANG, now: NOW })).shared).toBe(false);
    expect(await writeBatteryEmitterSettings(m.prisma, { userId: MOI, update: { sharingEnabled: true }, now: NOW })).toEqual({ sharingEnabled: true });
    expect(m.users.rows.find((r) => r.id === MOI)?.batterySharingDisabledAt).toBeNull();
  });

  it('accorder au Proche, retirer au Sang : la colonne garde ce que j\'ai DIT, et la date du retrait', async () => {
    const m = monde();
    expect(await writeBatteryPersonSettings(m.prisma, { ownerId: MOI, otherId: PROCHE, update: { shared: true }, now: NOW })).toMatchObject({ shared: true });
    expect(await writeBatteryPersonSettings(m.prisma, { ownerId: MOI, otherId: SANG, update: { shared: false }, now: NOW })).toMatchObject({ shared: false });
    expect(m.settings.rows).toEqual([
      { ownerId: MOI, otherId: PROCHE, batteryShared: true, batteryWithdrawnAt: null },
      { ownerId: MOI, otherId: SANG, batteryShared: false, batteryWithdrawnAt: NOW },
    ]);
  });

  it('ce que je reçois de quelqu\'un : « all » s\'écrit comme l\'absence', async () => {
    const m = monde();
    expect(await writeBatteryPersonSettings(m.prisma, { ownerId: MOI, otherId: SANG, update: { receive: 'pill' }, now: NOW })).toMatchObject({ receive: 'pill' });
    expect(m.settings.rows).toEqual([{ ownerId: MOI, otherId: SANG, batteryReceive: 'pill' }]);
    await writeBatteryPersonSettings(m.prisma, { ownerId: MOI, otherId: SANG, update: { receive: 'all' }, now: NOW });
    expect(m.settings.rows).toEqual([{ ownerId: MOI, otherId: SANG, batteryReceive: null }]);
  });
});
