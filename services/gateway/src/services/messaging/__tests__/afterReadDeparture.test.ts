/**
 * #18556 — le départ constaté par le serveur ne consomme que ce que le lecteur
 * a LU : une flamme-œil d'un autre, encore servie, dont il a un `readAt`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { readAfterReadIdsAtDeparture } from '../afterReadDeparture';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const CONV = '507f1f77bcf86cd799439011';
const READER = 'p-reader';
const SENDER = 'p-sender';
const NOW = new Date('2026-11-14T12:00:00.000Z');
const OPENED = new Date('2026-11-14T11:58:00.000Z');
const LATER = new Date('2026-11-21T12:00:00.000Z');
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

function prismaOf(messages: MongoDocument[], entries: MongoDocument[]) {
  return {
    message: {
      findMany: jest.fn(async (args: { where: MongoDocument }) =>
        messages.filter((row) => matchesMongoWhere(row, args.where)),
      ),
    },
    messageStatusEntry: {
      findMany: jest.fn(async (args: { where: MongoDocument }) =>
        entries.filter((row) => matchesMongoWhere(row, args.where)),
      ),
    },
  };
}

const flame = (id: string, overrides: MongoDocument = {}): MongoDocument => ({
  id,
  conversationId: CONV,
  senderId: SENDER,
  effectFlags: AFTER_READ,
  expiresAt: LATER,
  deletedAt: null,
  ...overrides,
});

const read = (messageId: string, overrides: MongoDocument = {}): MongoDocument => ({
  messageId,
  participantId: READER,
  readAt: new Date('2026-11-14T11:59:00.000Z'),
  ...overrides,
});

describe('readAfterReadIdsAtDeparture (#18556)', () => {
  it('rend les flammes-œil lues par le lecteur, et elles seules', async () => {
    const prisma = prismaOf(
      [
        flame('m-read'),
        flame('m-unread'),
        flame('m-own', { senderId: READER }),
        flame('m-duration', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL }),
        flame('m-dead', { deletedAt: NOW }),
        flame('m-lapsed', { expiresAt: new Date('2026-11-14T11:00:00.000Z') }),
        flame('m-elsewhere', { conversationId: '507f1f77bcf86cd799439099' }),
        flame('m-consumed'),
      ],
      [
        read('m-read'),
        read('m-unread', { readAt: null }),
        read('m-own'),
        read('m-duration'),
        read('m-dead'),
        read('m-lapsed'),
        read('m-elsewhere'),
        read('m-consumed', { ephemeralExpiresAt: new Date('2026-11-14T11:59:30.000Z') }),
        read('m-read', { participantId: 'p-other' }),
      ],
    );

    const ids = await readAfterReadIdsAtDeparture(prisma as never, {
      conversationId: CONV,
      participantId: READER,
      openedAt: OPENED,
      now: NOW,
    });

    expect(ids).toEqual(['m-read']);
  });

  it('un readAt posé AVANT l’ouverture (accusé de fenêtre : notification, widget) n’est pas consommé', async () => {
    const prisma = prismaOf(
      [flame('m-window'), flame('m-seen')],
      [
        read('m-window', { readAt: new Date('2026-11-14T11:30:00.000Z') }),
        read('m-seen', { readAt: new Date('2026-11-14T11:58:30.000Z') }),
      ],
    );

    const ids = await readAfterReadIdsAtDeparture(prisma as never, {
      conversationId: CONV,
      participantId: READER,
      openedAt: OPENED,
      now: NOW,
    });

    expect(ids).toEqual(['m-seen']);
  });

  it('ne lit pas les accusés quand aucune flamme-œil n’est servie', async () => {
    const prisma = prismaOf([flame('m-duration', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL })], []);

    const ids = await readAfterReadIdsAtDeparture(prisma as never, {
      conversationId: CONV,
      participantId: READER,
      openedAt: OPENED,
      now: NOW,
    });

    expect(ids).toEqual([]);
    expect(prisma.messageStatusEntry.findMany).not.toHaveBeenCalled();
  });
});
