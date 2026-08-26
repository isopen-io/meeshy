/**
 * Masquer un message pour soi et laisser sa notification derrière.
 *
 * `Notification.content` et `metadata.messagePreview` sont un EXTRAIT du message,
 * dénormalisé à la création. `retractMessageNotifications` le dit déjà pour le
 * rappel : « aucun filtre à la lecture ne peut les rattraper — la ligne ne relit
 * jamais le message, elle en détient une copie ». La conséquence pour « supprimer
 * pour moi » et « effacer l'historique » est la même, et elle n'avait pas été
 * tirée : la conversation cesse de montrer le message, et la cloche continue d'en
 * afficher l'extrait, avec un `action: view_message` qui ouvre une conversation
 * sur un message que le lecteur ne verra pas.
 *
 * Le geste existe déjà en deux exemplaires — `retractMessageNotifications`
 * (rappel, tous lecteurs) et `NotificationService.retractFriendRequestNotifications`
 * (demande d'amitié supprimée, un lecteur). Celui-ci est le troisième : un
 * lecteur, ses messages masqués. Retrait plutôt que neutralisation, pour la même
 * raison que les deux autres, et parce que c'est le seul geste que les clients
 * savent recevoir (`notification:deleted`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  retractNotificationsForHiddenMessages,
  retractNotificationsForClearedHistory,
} from '../../../services/messaging/retractHiddenMessageNotifications';

const USER = '507f1f77bcf86cd799439021';
const OTHER_USER = '507f1f77bcf86cd799439022';
const CONV = '507f1f77bcf86cd799439012';

/** La LIGNE relue : `delivery` en fait partie — la révocation push le lit. */
type Row = { id: string; userId: string; delivery?: unknown };

/** Ce que le hub reçoit : la ligne réduite, `pushSent` résolu. */
type AnnouncedRow = { id: string; userId: string; pushSent: boolean };

const makePrisma = (found: Row[] = []) => ({
  notification: {
    findMany: jest.fn(async (_args: Record<string, unknown>) => found),
    deleteMany: jest.fn(async (_args: Record<string, unknown>) => ({ count: found.length })),
  },
});

const makeAnnouncer = () => ({
  announceNotificationsRetracted: jest.fn(async (_rows: readonly AnnouncedRow[]) => undefined),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callArgs = (mock: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } }, i = 0): any =>
  mock.mock.calls[i]?.[0];

describe('retractNotificationsForHiddenMessages', () => {
  it('ne retire que les notifications DU lecteur, pour SES messages masqués', async () => {
    const prisma = makePrisma([{ id: 'n1', userId: USER, delivery: { pushSent: true } }]);

    await retractNotificationsForHiddenMessages(
      prisma as never,
      { userId: USER, messageIds: ['m1', 'm2'] },
      makeAnnouncer()
    );

    const where = { userId: USER, messageId: { in: ['m1', 'm2'] } };
    expect(callArgs(prisma.notification.findMany).where).toEqual(where);
    expect(callArgs(prisma.notification.deleteMany).where).toEqual(where);
  });

  it('annonce les lignes retirées APRÈS l\'écriture, jamais avant', async () => {
    const prisma = makePrisma([{ id: 'n1', userId: USER, delivery: { pushSent: true } }]);
    const announcer = makeAnnouncer();
    const order: string[] = [];
    prisma.notification.deleteMany.mockImplementation(async () => {
      order.push('delete');
      return { count: 1 };
    });
    announcer.announceNotificationsRetracted.mockImplementation(async () => {
      order.push('announce');
    });

    await retractNotificationsForHiddenMessages(
      prisma as never,
      { userId: USER, messageIds: ['m1'] },
      announcer
    );

    expect(order).toEqual(['delete', 'announce']);
    expect(announcer.announceNotificationsRetracted).toHaveBeenCalledWith([
      { id: 'n1', userId: USER, pushSent: true },
    ]);
  });

  it('n\'écrit rien et n\'annonce rien quand aucune notification ne porte ces messages', async () => {
    const prisma = makePrisma([]);
    const announcer = makeAnnouncer();

    const retracted = await retractNotificationsForHiddenMessages(
      prisma as never,
      { userId: USER, messageIds: ['m1'] },
      announcer
    );

    expect(retracted).toBe(0);
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
    expect(announcer.announceNotificationsRetracted).not.toHaveBeenCalled();
  });

  it('ne touche pas la base pour une liste de messages vide', async () => {
    const prisma = makePrisma([]);

    await retractNotificationsForHiddenMessages(
      prisma as never,
      { userId: USER, messageIds: [] },
      makeAnnouncer()
    );

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('ne fait pas échouer la suppression quand le retrait échoue', async () => {
    const prisma = makePrisma([{ id: 'n1', userId: USER, delivery: { pushSent: true } }]);
    prisma.notification.deleteMany.mockRejectedValue(new Error('mongo down') as never);

    await expect(
      retractNotificationsForHiddenMessages(
        prisma as never,
        { userId: USER, messageIds: ['m1'] },
        makeAnnouncer()
      )
    ).resolves.toBe(0);
  });
});

describe('retractNotificationsForClearedHistory', () => {
  const before = new Date('2026-05-21T12:00:00.000Z');

  it('vise les messages de CETTE conversation antérieurs à la coupure, pour CE lecteur', async () => {
    const prisma = makePrisma([{ id: 'n1', userId: USER, delivery: { pushSent: true } }]);

    await retractNotificationsForClearedHistory(
      prisma as never,
      { userId: USER, conversationId: CONV, before },
      makeAnnouncer()
    );

    const where = {
      userId: USER,
      message: { is: { conversationId: CONV, createdAt: { lt: before } } },
    };
    expect(callArgs(prisma.notification.findMany).where).toEqual(where);
    expect(callArgs(prisma.notification.deleteMany).where).toEqual(where);
  });

  it('laisse intactes les notifications d\'un autre lecteur de la même conversation', async () => {
    const prisma = makePrisma([{ id: 'n1', userId: USER, delivery: { pushSent: true } }]);
    const announcer = makeAnnouncer();

    await retractNotificationsForClearedHistory(
      prisma as never,
      { userId: USER, conversationId: CONV, before },
      announcer
    );

    expect(callArgs(prisma.notification.findMany).where.userId).toBe(USER);
    expect(announcer.announceNotificationsRetracted).toHaveBeenCalledWith([
      { id: 'n1', userId: USER, pushSent: true },
    ]);
    expect(callArgs(prisma.notification.findMany).where.userId).not.toBe(OTHER_USER);
  });

  it('ne fait pas échouer l\'effacement quand le retrait échoue', async () => {
    const prisma = makePrisma([]);
    prisma.notification.findMany.mockRejectedValue(new Error('mongo down') as never);

    await expect(
      retractNotificationsForClearedHistory(
        prisma as never,
        { userId: USER, conversationId: CONV, before },
        makeAnnouncer()
      )
    ).resolves.toBe(0);
  });
});

describe('l\'annonce et le retrait ne partagent pas leur sort', () => {
  it('rend le nombre DÉTRUIT même quand l\'annonce échoue', async () => {
    const prisma = makePrisma([{ id: 'n1', userId: USER, delivery: { pushSent: true } }]);
    const announcer = makeAnnouncer();
    announcer.announceNotificationsRetracted.mockRejectedValue(new Error('socket down') as never);

    const retracted = await retractNotificationsForHiddenMessages(
      prisma as never,
      { userId: USER, messageIds: ['m1'] },
      announcer
    );

    expect(retracted).toBe(1);
    expect(prisma.notification.deleteMany).toHaveBeenCalled();
  });
});
