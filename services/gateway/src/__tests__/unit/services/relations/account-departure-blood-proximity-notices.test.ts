/**
 * #20688 — un compte qui part (suppression, désactivation par un admin, fin de grâce d'une
 * suppression demandée par la personne) efface les alertes « un Sang s'approche » qui le NOMMENT,
 * chez chacun de ses Sangs, et celles de sa propre cloche. Sans cela, B gardait « A, à 500 m »
 * jusqu'à l'échéance (2 h) et au balayage horaire, alors que A n'existe plus.
 *
 * Jugé sur des DOCUMENTS (`notification-raw-store`) : chaque témoin pose les lignes qu'une vraie
 * collection porterait, joue le départ par son chemin de production, et lit ce qui reste.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { withdrawRitualSharesOfUser } from '../../../../services/relations/ritualShareWithdrawal';
import { purgeAccountIsolatedData } from '../../../../services/AccountPurgeService';
import { UserManagementService } from '../../../../services/admin/user-management.service';
import { notificationRawStore, type StoredNotification } from '../../../helpers/notification-raw-store';

const PARTI = '64e000000000000000000001';
const SANG = '64e000000000000000000002';
const TIERS = '64e000000000000000000003';

const alerte = (id: string, userId: string, actorId: string): StoredNotification => ({
  id, userId, type: 'blood_proximity', actor: { id: actorId }, expiresAt: null,
});
const autre = (id: string, userId: string, actorId: string): StoredNotification => ({
  id, userId, type: 'battery_low', actor: { id: actorId }, expiresAt: null,
});

const lignesDeDepart = (): readonly StoredNotification[] => [
  alerte('parti-chez-sang', SANG, PARTI),
  alerte('parti-chez-tiers', TIERS, PARTI),
  alerte('sang-chez-parti', PARTI, SANG),
  alerte('tiers-chez-sang', SANG, TIERS),
  autre('batterie-du-parti-chez-sang', SANG, PARTI),
];

const restantes = (store: ReturnType<typeof notificationRawStore>) => store.rows().map((row) => row.id).sort();

const settings = () => {
  const rows: Array<Record<string, unknown>> = [
    { ownerId: PARTI, otherId: SANG, proximityShared: true, locationShared: true },
    { ownerId: SANG, otherId: PARTI, proximityShared: true, locationShared: true },
  ];
  const touches = (row: Record<string, unknown>, where: { OR?: Array<Record<string, string>>; batteryShared?: boolean }) =>
    (where.OR ?? []).some((branch) => Object.entries(branch).every(([key, value]) => row[key] === value))
    && (where.batteryShared === undefined || row.batteryShared === where.batteryShared);
  return {
    rows,
    updateMany: async (args: { where: { OR?: Array<Record<string, string>>; batteryShared?: boolean }; data: Record<string, unknown> }) => {
      const hit = rows.filter((row) => touches(row, args.where));
      hit.forEach((row) => Object.assign(row, args.data));
      return { count: hit.length };
    },
  };
};

describe('le site unique du départ : withdrawRitualSharesOfUser', () => {
  it('efface les alertes qui nomment le compte et celles de sa cloche, puis éteint les partages', async () => {
    const store = notificationRawStore(lignesDeDepart());
    const relationFeatureSetting = settings();

    await withdrawRitualSharesOfUser({ ...store.prisma, relationFeatureSetting } as never, { userId: PARTI });

    expect(restantes(store)).toEqual(['batterie-du-parti-chez-sang', 'tiers-chez-sang']);
    expect(relationFeatureSetting.rows.every((row) => row.proximityShared === false)).toBe(true);
  });

  it('un effacement en panne lève avant d’éteindre : les partages restent pour le rejeu au retour', async () => {
    const store = notificationRawStore(lignesDeDepart());
    const relationFeatureSetting = settings();
    const enPanne = { ...store.prisma.notification, findRaw: async () => { throw new Error('mongo injoignable'); } };

    await expect(withdrawRitualSharesOfUser({ notification: enPanne, relationFeatureSetting } as never, { userId: PARTI })).rejects.toThrow('mongo injoignable');
    expect(relationFeatureSetting.rows.every((row) => row.proximityShared === true)).toBe(true);
  });
});

function adminWorld() {
  const store = notificationRawStore(lignesDeDepart());
  const prisma = {
    ...store.prisma,
    relationFeatureSetting: settings(),
    user: { update: jest.fn(async () => ({ id: PARTI })), findUnique: jest.fn(async () => null) },
  };
  return { store, service: new UserManagementService(prisma as never) };
}

describe('chaque chemin de départ efface les alertes', () => {
  it('désactivation par un admin', async () => {
    const { store, service } = adminWorld();
    await service.updateStatus(PARTI, { isActive: false });
    expect(restantes(store)).toEqual(['batterie-du-parti-chez-sang', 'tiers-chez-sang']);
  });

  it('suppression par un admin', async () => {
    const { store, service } = adminWorld();
    await service.deleteUser(PARTI, TIERS);
    expect(restantes(store)).toEqual(['batterie-du-parti-chez-sang', 'tiers-chez-sang']);
  });

  it('suppression demandée par la personne (fin de grâce ou « supprimer maintenant ») : la purge du compte', async () => {
    const store = notificationRawStore(lignesDeDepart());
    const vide = () => ({ deleteMany: async () => ({ count: 0 }), findMany: async () => [], updateMany: async () => ({ count: 0 }), count: async () => 0, findFirst: async () => null, update: async () => ({}) });
    const prisma = new Proxy({ ...store.prisma } as Record<string | symbol, unknown>, {
      get: (target, key) => (key in target ? target[key] : typeof key === 'string' && !key.startsWith('$') ? vide() : undefined),
    });

    await purgeAccountIsolatedData(prisma as never, PARTI);

    expect(restantes(store)).toEqual(['batterie-du-parti-chez-sang', 'tiers-chez-sang']);
  });
});
