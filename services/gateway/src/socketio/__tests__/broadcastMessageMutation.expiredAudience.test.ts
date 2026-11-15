/**
 * #18556 — la destruction d'un éphémère brûle « sous nos yeux », chez TOUS ceux
 * qui l'ont à l'écran, expéditeur compris, sur tous leurs appareils.
 *
 * `message:expired` ne partait que dans la room de conversation : un participant
 * resté sur la liste (room `user:` seule) ne le recevait pas, et la file hors
 * ligne excluait l'AUTEUR, nommé acteur d'une destruction que personne n'a faite.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastMessageMutation } from '../broadcastMessageMutation';
import { matchesMongoWhere, type MongoDocument } from '../../__tests__/helpers/mongo-where';

type Emitted = { rooms: string | string[]; event: string; payload: unknown };

const CONV = '507f1f77bcf86cd799439011';

function participantsOf(rows: MongoDocument[]) {
  return {
    participant: {
      findMany: jest.fn(async (args: { where?: MongoDocument }) =>
        rows.filter((row) => matchesMongoWhere(row, args?.where ?? {})),
      ),
    },
    conversationShareLink: { findMany: jest.fn(async () => []) },
    message: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
  };
}

function managerInto(sink: Emitted[]) {
  const enqueue = jest.fn(async (_params: unknown) => undefined);
  return {
    enqueue,
    manager: {
      getIO: () => ({
        to: (rooms: string | string[]) => ({
          emit: (event: string, payload: unknown) => {
            sink.push({ rooms, event, payload });
          },
        }),
      }),
      enqueueOfflineMessageMutation: enqueue,
      emitUnreadCountsToRecipients: jest.fn(async () => undefined),
    },
  };
}

const participants = (): MongoDocument[] => [
  { id: 'p-sender', userId: 'u-sender', conversationId: CONV, isActive: true },
  { id: 'p-reader', userId: 'u-reader', conversationId: CONV, isActive: true },
  { id: 'p-guest', userId: null, conversationId: CONV, isActive: true },
  { id: 'p-gone', userId: 'u-gone', conversationId: CONV, isActive: false },
];

const expire = (prisma: unknown, manager: unknown) =>
  broadcastMessageMutation({
    prisma: prisma as never,
    manager: manager as never,
    conversationId: CONV,
    actorUserId: 'u-sender',
    eventType: 'expired',
    authorId: 'p-sender',
    messageId: 'm-1',
    payload: { messageId: 'm-1', conversationId: CONV },
  });

describe('message:expired atteint chaque participant actif, où qu’il soit (#18556)', () => {
  it('part en UNE diffusion vers la room de conversation ET les rooms personnelles des participants actifs', async () => {
    const sink: Emitted[] = [];
    const { manager } = managerInto(sink);

    await expire(participantsOf(participants()), manager);

    const expired = sink.filter((e) => e.event === SERVER_EVENTS.MESSAGE_EXPIRED);
    expect(expired).toHaveLength(1);
    expect(expired[0].rooms).toEqual([
      `conversation:${CONV}`,
      'user:u-sender',
      'user:u-reader',
      'user:p-guest',
    ]);
  });

  it('replie sur la seule room de conversation quand la liste des participants est illisible', async () => {
    const sink: Emitted[] = [];
    const { manager } = managerInto(sink);
    const prisma = participantsOf([]);
    prisma.participant.findMany.mockRejectedValueOnce(new Error('mongo down'));

    await expire(prisma, manager);

    expect(sink.filter((e) => e.event === SERVER_EVENTS.MESSAGE_EXPIRED)).toEqual([
      { rooms: `conversation:${CONV}`, event: SERVER_EVENTS.MESSAGE_EXPIRED, payload: { messageId: 'm-1', conversationId: CONV } },
    ]);
  });

  it('enfile pour TOUS les absents, auteur compris : une expiration n’a pas d’acteur', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);

    await expire(participantsOf(participants()), manager);

    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'expired', actorUserId: null }));
  });

  it('une suppression garde son acteur : l’auteur d’un retrait demandé n’en reçoit pas le rejeu', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);

    await broadcastMessageMutation({
      prisma: participantsOf(participants()) as never,
      manager: manager as never,
      conversationId: CONV,
      actorUserId: 'u-sender',
      eventType: 'deleted',
      authorId: 'p-sender',
      messageId: 'm-1',
      payload: { messageId: 'm-1', conversationId: CONV, deletedAt: new Date(0).toISOString() },
    });

    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'deleted', actorUserId: 'u-sender' }));
    expect(sink.find((e) => e.event === SERVER_EVENTS.MESSAGE_DELETED)?.rooms).toBe(`conversation:${CONV}`);
  });
});
