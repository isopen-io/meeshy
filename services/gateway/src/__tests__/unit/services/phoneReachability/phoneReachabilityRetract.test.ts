/**
 * LE RETRAIT des notifications d'injoignabilité (#18737, audit F5) — supprimées en base PUIS
 * annoncées par le service : la bannière affichée et la cloche s'effacent, pas seulement la ligne.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { retractPhoneReachabilityNotifications } from '../../../../services/phoneReachability/phoneReachabilityDeps';

const EMETTEUR = '6900000000000000000000e1';
const LECTEUR = '6900000000000000000000b1';

function monde(rows: ReadonlyArray<Record<string, unknown>>) {
  const filtres: unknown[] = [];
  const supprimes: unknown[] = [];
  const annonces: unknown[] = [];
  const prisma = {
    notification: {
      findRaw: async (args: { filter: unknown }) => {
        filtres.push(args.filter);
        return rows;
      },
      deleteMany: async (args: unknown) => {
        supprimes.push(args);
        return { count: rows.length };
      },
    },
  };
  const announcer = { announceNotificationsRetracted: async (r: unknown) => { annonces.push(r); } };
  return { prisma: prisma as never, announcer, filtres, supprimes, annonces };
}

describe('retractPhoneReachabilityNotifications', () => {
  it('cible le type et la paire, supprime les lignes trouvées, puis les annonce au service', async () => {
    const m = monde([{ _id: { $oid: 'n1' }, userId: { $oid: LECTEUR } }]);
    await retractPhoneReachabilityNotifications(m.prisma, m.announcer, [{ emitterId: EMETTEUR, readerId: LECTEUR }]);
    expect(m.filtres).toEqual([{ type: 'device_unreachable', $or: [{ userId: { $oid: LECTEUR }, 'actor.id': EMETTEUR }] }]);
    expect(m.supprimes).toEqual([{ where: { id: { in: ['n1'] } } }]);
    expect(m.annonces).toEqual([[{ id: 'n1', userId: LECTEUR }]]);
  });

  it('rien trouvé, rien supprimé ni annoncé ; aucune paire, aucune lecture', async () => {
    const m = monde([]);
    await retractPhoneReachabilityNotifications(m.prisma, m.announcer, [{ emitterId: EMETTEUR, readerId: LECTEUR }]);
    await retractPhoneReachabilityNotifications(m.prisma, m.announcer, []);
    expect(m.filtres).toHaveLength(1);
    expect(m.supprimes).toEqual([]);
    expect(m.annonces).toEqual([]);
  });
});
