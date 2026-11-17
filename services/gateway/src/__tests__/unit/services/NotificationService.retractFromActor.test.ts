/**
 * #18910 (serveur-notifications-5) — bloquer quelqu'un retire ses notifications.
 *
 * A bloque B. Deux listes se vident, et pas de la même façon :
 *
 *  - côté BLOQUEUR (A, acteur = B) : tout part, tous types, et l'annonce est
 *    faite (`notification:deleted` par ligne + `notification:counts`) — la
 *    demande d'ami « accepter » d'une personne bloquée ne doit plus gonfler la
 *    cloche ;
 *  - côté BLOQUÉ (B, acteur = A) : seuls les types qui portent le CONTENU de
 *    l'acteur partent (extraits, vignettes, avatar de A), et RIEN n'est émis
 *    vers B : une disparition en direct lui apprendrait le blocage, que la
 *    route veut taire.
 *
 * Le double Prisma est à ÉTAT : il filtre comme Mongo, si bien que le témoin
 * lit ce que les listes serviraient après l'appel, pas le détail des appels.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: { deleteMany: jest.fn(), count: jest.fn() },
    $runCommandRaw: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../services/notifications/NotificationService';

const A = '64a000000000000000000001';
const B = '64a000000000000000000002';
const C = '64a000000000000000000003';

type Row = { id: string; userId: string; type: string; actorId: string; isRead: boolean };

const rowOf = (id: string, userId: string, type: string, actorId: string, isRead = false): Row => ({
  id: `64e0000000000000000000${id}`,
  userId,
  type,
  actorId,
  isRead,
});

describe('NotificationService.retractNotificationsFromActor — le blocage (#18910)', () => {
  let service: NotificationService;
  let prisma: any;
  let io: { to: jest.Mock<any>; emit: jest.Mock<any> };
  let rows: Row[];

  const idsOf = (userId: string) => rows.filter((row) => row.userId === userId).map((row) => row.id);
  const emittedTo = (userId: string) => io.to.mock.calls.filter((call: any[]) => call[0] === `user:${userId}`).length;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    io = { to: jest.fn<any>().mockReturnThis(), emit: jest.fn<any>() };
    service.setSocketIO(io as never, new Map());

    rows = [
      rowOf('01', B, 'friend_new_post', A),
      rowOf('02', B, 'friend_new_story', A, true),
      rowOf('03', B, 'friend_request', A),
      rowOf('04', A, 'friend_request', B),
      rowOf('05', A, 'post_like', B),
      rowOf('06', A, 'new_message', B, true),
      rowOf('07', C, 'friend_new_post', A),
      rowOf('08', A, 'post_like', C),
    ];

    prisma.$runCommandRaw.mockImplementation(async (command: any) => {
      const userId = command.filter.userId.$oid;
      const types: string[] | undefined = command.filter.type?.$in;
      const found = rows.filter(
        (row) =>
          row.userId === userId &&
          row.actorId === command.filter['actor.id'] &&
          (types === undefined || types.includes(row.type))
      );
      return {
        cursor: {
          firstBatch: found.slice(0, command.batchSize ?? found.length).map((row) => ({
            _id: { $oid: row.id },
            type: row.type,
            delivery: { pushSent: true },
          })),
        },
      };
    });
    prisma.notification.deleteMany.mockImplementation(async ({ where }: any) => {
      const before = rows.length;
      rows = rows.filter((row) => !where.id.in.includes(row.id));
      return { count: before - rows.length };
    });
    prisma.notification.count.mockImplementation(async ({ where }: any) =>
      rows.filter((row) => row.userId === where.userId && (where.isRead !== false || !row.isRead)).length
    );
  });

  it('côté bloqueur : toutes les notifications de la personne bloquée partent, annoncées, le compteur baisse', async () => {
    const unreadBefore = rows.filter((row) => row.userId === A && !row.isRead).length;

    const removed = await service.retractNotificationsFromActor(A, B);

    expect(removed).toBe(3);
    expect(rows.some((row) => row.userId === A && row.actorId === B)).toBe(false);
    expect(await service.getUnreadCount(A)).toBe(unreadBefore - 2);
    expect(io.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: '64e000000000000000000004' });
    expect(io.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: '64e000000000000000000005' });
    expect(io.emit).toHaveBeenCalledWith('notification:counts', expect.any(Object));
  });

  it('côté bloqué : le contenu de l’acteur part, sans la moindre émission vers lui', async () => {
    const removed = await service.retractNotificationsFromActor(B, A, 'actor-content');

    expect(removed).toBe(2);
    expect(rows.filter((row) => row.userId === B).map((row) => row.type)).toEqual(['friend_request']);
    expect(emittedTo(B)).toBe(0);
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('côté bloqué : une demande d’ami de l’acteur n’est pas du contenu — elle reste', async () => {
    await service.retractNotificationsFromActor(B, A, 'actor-content');

    expect(idsOf(B)).toContain('64e000000000000000000003');
  });

  it('la notification d’un tiers reste intacte', async () => {
    await service.retractNotificationsFromActor(A, B);
    await service.retractNotificationsFromActor(B, A, 'actor-content');

    expect(idsOf(C)).toEqual(['64e000000000000000000007']);
    expect(rows.some((row) => row.id === '64e000000000000000000008')).toBe(true);
  });

  it('une personne très active : tout part, au-delà d’un seul lot de lecture', async () => {
    const many = Array.from({ length: 2500 }, (_, index) => ({
      id: `64f${String(index).padStart(21, '0')}`,
      userId: A,
      type: 'new_message',
      actorId: B,
      isRead: true,
    }));
    rows = [...rows, ...many];

    const removed = await service.retractNotificationsFromActor(A, B);

    expect(removed).toBe(2503);
    expect(rows.some((row) => row.userId === A && row.actorId === B)).toBe(false);
  });

  it('un identifiant qui n’est pas un ObjectId ne lit rien', async () => {
    await expect(service.retractNotificationsFromActor('anon-session', B)).resolves.toBe(0);
    expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
  });

  it('une panne Mongo ne lève pas : le blocage déjà écrit ne doit pas échouer', async () => {
    prisma.$runCommandRaw.mockRejectedValue(new Error('mongo down'));

    await expect(service.retractNotificationsFromActor(A, B)).resolves.toBe(0);
  });
});
