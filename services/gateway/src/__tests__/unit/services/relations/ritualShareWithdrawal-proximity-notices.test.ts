/**
 * #20542 — tomber sous le Sang efface les alertes « un Sang s'approche » AVANT d'éteindre la
 * proximité : un effacement en échec laisse le partage allumé, et le rejeu le solde. Dans l'ordre
 * inverse, le rejeu relirait une proximité déjà éteinte et n'effacerait plus jamais rien.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { withdrawRitualSharesBetween } from '../../../../services/relations/ritualShareWithdrawal';
import { notificationRawStore } from '../../../helpers/notification-raw-store';

const MOI = '64d000000000000000000001';
const AUTRE = '64d000000000000000000002';
const alerte = (id: string, userId: string, actorId: string) => ({ id, userId, type: 'blood_proximity', actor: { id: actorId }, expiresAt: null });

function monde(options: { readonly effacementEnPanne: boolean }) {
  const lignes = new Map<string, Record<string, unknown>>([
    [`${MOI}:${AUTRE}`, { ownerId: MOI, otherId: AUTRE, listeningTitleShared: false, locationShared: true, locationHistoryShared: true, proximityShared: true }],
    [`${AUTRE}:${MOI}`, { ownerId: AUTRE, otherId: MOI, listeningTitleShared: false, locationShared: true, locationHistoryShared: true, proximityShared: true }],
  ]);
  const notes = notificationRawStore([alerte('moi-chez-autre', AUTRE, MOI), alerte('autre-chez-moi', MOI, AUTRE)]);
  let enPanne = options.effacementEnPanne;
  const prisma = {
    relationFeatureSetting: {
      findUnique: async (args: { where: { ownerId_otherId: { ownerId: string; otherId: string } } }) =>
        lignes.get(`${args.where.ownerId_otherId.ownerId}:${args.where.ownerId_otherId.otherId}`) ?? null,
      updateMany: async (args: { where: { ownerId: string; otherId: string }; data: Record<string, unknown> }) => {
        const cle = `${args.where.ownerId}:${args.where.otherId}`;
        lignes.set(cle, { ...lignes.get(cle), ...args.data });
        return { count: 1 };
      },
    },
    notification: {
      ...notes.prisma.notification,
      findRaw: async (args: { filter: Record<string, unknown> }) => {
        if (enPanne) throw new Error('mongo injoignable');
        return notes.prisma.notification.findRaw(args);
      },
    },
  };
  return { prisma, lignes, notes, reparer: () => { enPanne = false; } };
}

describe('la chute sous le Sang efface les alertes avant d’éteindre la proximité', () => {
  it('nominal : les deux sens perdent leurs alertes, et la proximité s’éteint', async () => {
    const w = monde({ effacementEnPanne: false });
    await withdrawRitualSharesBetween(w.prisma as never, { actorId: MOI, otherId: AUTRE, at: new Date() });

    expect(w.notes.rows()).toEqual([]);
    expect(w.lignes.get(`${MOI}:${AUTRE}`)).toMatchObject({ proximityShared: false });
  });

  it('un effacement en panne lève, laisse la proximité allumée, et le rejeu efface tout', async () => {
    const w = monde({ effacementEnPanne: true });
    await expect(withdrawRitualSharesBetween(w.prisma as never, { actorId: MOI, otherId: AUTRE, at: new Date() })).rejects.toThrow('mongo injoignable');
    expect(w.lignes.get(`${MOI}:${AUTRE}`)).toMatchObject({ proximityShared: true });
    expect(w.lignes.get(`${AUTRE}:${MOI}`)).toMatchObject({ proximityShared: true });

    w.reparer();
    await withdrawRitualSharesBetween(w.prisma as never, { actorId: MOI, otherId: AUTRE, at: new Date() });

    expect(w.notes.rows()).toEqual([]);
    expect(w.lignes.get(`${MOI}:${AUTRE}`)).toMatchObject({ proximityShared: false });
  });
});
