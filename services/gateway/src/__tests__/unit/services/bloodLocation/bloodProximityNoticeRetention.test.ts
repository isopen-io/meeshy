/**
 * UNE ALERTE « UN SANG S'APPROCHE » NE SURVIT NI À SON ÉCHÉANCE NI À L'EFFACEMENT (#20542).
 *
 * Jugé sur des DOCUMENTS : chaque témoin pose les lignes qu'une vraie collection porterait, joue le
 * geste, et lit ce qui reste. Un témoin par chemin d'effacement, et pour chacun ce qu'il ne touche pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  eraseBloodProximityNoticesOf,
  purgeExpiredBloodProximityNotices,
  retractBloodProximityNotices,
} from '../../../../services/bloodLocation/bloodProximityNoticeRetention';
import { notificationRawStore, type StoredNotification } from '../../../helpers/notification-raw-store';

const LINA = '64c000000000000000000001';
const MOI = '64c000000000000000000002';
const TIERS = '64c000000000000000000003';
const NOW = new Date('2026-11-27T12:00:00.000Z');
const HEURE = 3_600_000;

const alerte = (id: string, userId: string, actorId: string, expiresAt: Date = new Date(NOW.getTime() + HEURE)): StoredNotification => ({
  id, userId, type: 'blood_proximity', actor: { id: actorId }, expiresAt,
});
const autre = (id: string, userId: string, actorId: string, type = 'battery_low'): StoredNotification => ({
  id, userId, type, actor: { id: actorId }, expiresAt: new Date(NOW.getTime() - HEURE),
});
const ids = (rows: readonly StoredNotification[]) => rows.map((row) => row.id).sort();

describe('l’échéance efface la ligne, pas seulement son affichage', () => {
  it('une alerte échue part ; une alerte encore valable et les autres types restent', async () => {
    const store = notificationRawStore([
      alerte('echue', MOI, LINA, new Date(NOW.getTime() - 1)),
      alerte('valable', MOI, LINA),
      autre('batterie-echue', MOI, LINA),
      { id: 'sans-echeance', userId: MOI, type: 'blood_proximity', actor: { id: LINA }, expiresAt: null },
    ]);

    await expect(purgeExpiredBloodProximityNotices(store.prisma as never, NOW)).resolves.toBe(1);
    expect(ids(store.rows())).toEqual(['batterie-echue', 'sans-echeance', 'valable']);
  });
});

describe('effacer son historique efface ce que les alertes disent de soi, chez tout le monde', () => {
  it('les alertes qui nomment Lina, chez chacun de ses Sangs, et celles qu’elle a reçues, partent', async () => {
    const store = notificationRawStore([
      alerte('chez-moi', MOI, LINA),
      alerte('chez-tiers', TIERS, LINA),
      alerte('chez-lina', LINA, MOI),
      alerte('entre-deux-autres', MOI, TIERS),
      autre('batterie-de-lina', MOI, LINA),
    ]);

    await eraseBloodProximityNoticesOf(store.prisma as never, LINA);

    expect(ids(store.rows())).toEqual(['batterie-de-lina', 'entre-deux-autres']);
  });

  it('un identifiant qui n’est pas un ObjectId n’envoie aucune commande', async () => {
    const store = notificationRawStore([alerte('chez-moi', MOI, LINA)]);
    await eraseBloodProximityNoticesOf(store.prisma as never, 'pas-un-id');
    expect(store.commands).toEqual([]);
    expect(store.rows()).toHaveLength(1);
  });
});

describe('retirer la proximité efface chez le lecteur ce que l’émetteur lui a montré', () => {
  it('sens par sens : seule la ligne du lecteur qui nomme l’émetteur part', async () => {
    const store = notificationRawStore([
      alerte('lina-chez-moi', MOI, LINA),
      alerte('moi-chez-lina', LINA, MOI),
      alerte('lina-chez-tiers', TIERS, LINA),
      alerte('tiers-chez-moi', MOI, TIERS),
    ]);

    await retractBloodProximityNotices(store.prisma as never, [{ emitterId: LINA, readerId: MOI }]);

    expect(ids(store.rows())).toEqual(['lina-chez-tiers', 'moi-chez-lina', 'tiers-chez-moi']);
  });

  it('les deux sens d’une baisse sous le Sang partent ensemble, en une commande', async () => {
    const store = notificationRawStore([alerte('lina-chez-moi', MOI, LINA), alerte('moi-chez-lina', LINA, MOI), alerte('lina-chez-tiers', TIERS, LINA)]);

    await retractBloodProximityNotices(store.prisma as never, [{ emitterId: LINA, readerId: MOI }, { emitterId: MOI, readerId: LINA }]);

    expect(ids(store.rows())).toEqual(['lina-chez-tiers']);
    expect(store.commands).toHaveLength(1);
  });

  it('sans paire valable, aucune commande ne part — un `$or` vide n’effacerait pas « rien », il serait refusé', async () => {
    const store = notificationRawStore([alerte('lina-chez-moi', MOI, LINA)]);
    await retractBloodProximityNotices(store.prisma as never, [{ emitterId: 'x', readerId: MOI }]);
    expect(store.commands).toEqual([]);
  });
});
