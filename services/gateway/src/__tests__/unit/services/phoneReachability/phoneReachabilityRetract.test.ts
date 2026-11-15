/**
 * LE RETRAIT des notifications d'injoignabilité (#18737, audit F5) — supprimées en base PUIS
 * annoncées par le service : la bannière affichée et la cloche s'effacent, pas seulement la ligne.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { retractPhoneReachabilityNotifications } from '../../../../services/phoneReachability/phoneReachabilityDeps';
import { buildNotificationRevocationPushes } from '../../../../services/notifications/notificationRevocationPush';
import type { RetractedNotification } from '../../../../services/notifications/retractedNotifications';

const EMETTEUR = '6900000000000000000000e1';
const LECTEUR = '6900000000000000000000b1';

function monde(rows: ReadonlyArray<Record<string, unknown>>) {
  const filtres: unknown[] = [];
  const supprimes: unknown[] = [];
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
  const annonces: RetractedNotification[][] = [];
  const announcer = { announceNotificationsRetracted: async (r: readonly RetractedNotification[]) => { annonces.push([...r]); } };
  return { prisma: prisma as never, announcer, filtres, supprimes, annonces };
}

describe('retractPhoneReachabilityNotifications', () => {
  it('cible le type et la paire, supprime les lignes trouvées, puis les annonce au service', async () => {
    const m = monde([{ _id: { $oid: 'n1' }, userId: { $oid: LECTEUR }, type: 'device_unreachable', context: {}, delivery: { pushSent: true } }]);
    await retractPhoneReachabilityNotifications(m.prisma, m.announcer, [{ emitterId: EMETTEUR, readerId: LECTEUR }]);
    expect(m.filtres).toEqual([{ type: 'device_unreachable', $or: [{ userId: { $oid: LECTEUR }, 'actor.id': EMETTEUR }] }]);
    expect(m.supprimes).toEqual([{ where: { id: { in: ['n1'] } } }]);
    expect(m.annonces).toEqual([[{ id: 'n1', userId: LECTEUR, pushSent: true }]]);
  });

  it('une bannière livrée part en révocation sur l\'appareil : le push de retrait est bien construit', async () => {
    const m = monde([
      { _id: { $oid: 'n1' }, userId: { $oid: LECTEUR }, type: 'device_unreachable', context: {}, delivery: { pushSent: true } },
      { _id: { $oid: 'n2' }, userId: { $oid: LECTEUR }, type: 'device_unreachable', context: {}, delivery: { pushSent: false } },
    ]);
    await retractPhoneReachabilityNotifications(m.prisma, m.announcer, [{ emitterId: EMETTEUR, readerId: LECTEUR }]);
    const pushes = buildNotificationRevocationPushes(m.annonces[0] ?? []);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.userId).toBe(LECTEUR);
    expect(pushes[0]?.payload.data.notificationIds).toContain('n1');
    expect(JSON.stringify(pushes[0])).not.toContain('n2');
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
