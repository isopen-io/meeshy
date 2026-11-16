/**
 * #18556 — le départ constaté par le serveur ne consomme que ce que le lecteur
 * a LU PENDANT UN REGARD : une flamme-œil d'un autre, encore servie, dont le
 * `readAt` tombe dans une période où la conversation était à l'écran.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  DEPARTURE_READ_MAX_PAGES,
  DEPARTURE_READ_PAGE,
  readAfterReadIdsAtDeparture,
} from '../afterReadDeparture';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const CONV = '507f1f77bcf86cd799439011';
const READER = 'p-reader';
const SENDER = 'p-sender';
const NOW = new Date('2026-11-14T12:00:00.000Z');
const LATER = new Date('2026-11-21T12:00:00.000Z');
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;
const at = (clock: string) => new Date(`2026-11-14T${clock}.000Z`);
const REGARD = [{ from: at('11:58:00'), to: at('12:00:00') }];

type Paged = { where: MongoDocument; skip?: number; take?: number };

function prismaOf(messages: MongoDocument[], entries: MongoDocument[]) {
  return {
    message: {
      findMany: jest.fn(async (args: { where: MongoDocument }) =>
        messages.filter((row) => matchesMongoWhere(row, args.where)),
      ),
    },
    messageStatusEntry: {
      findMany: jest.fn(async (args: Paged) => {
        const matched = entries
          .filter((row) => matchesMongoWhere(row, args.where))
          .sort((a, b) => (a.readAt as Date).getTime() - (b.readAt as Date).getTime());
        const skip = args.skip ?? 0;
        return matched.slice(skip, skip + (args.take ?? matched.length));
      }),
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
  conversationId: CONV,
  participantId: READER,
  readAt: at('11:59:00'),
  ...overrides,
});

const departure = (regards = REGARD) => ({ conversationId: CONV, participantId: READER, regards, now: NOW });

describe('readAfterReadIdsAtDeparture (#18556)', () => {
  it('rend les flammes-œil lues par le lecteur pendant son regard, et elles seules', async () => {
    const prisma = prismaOf(
      [
        flame('m-read'),
        flame('m-unread'),
        flame('m-own', { senderId: READER }),
        flame('m-duration', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL }),
        flame('m-dead', { deletedAt: NOW }),
        flame('m-lapsed', { expiresAt: at('11:00:00') }),
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
        read('m-elsewhere', { conversationId: '507f1f77bcf86cd799439099' }),
        read('m-consumed', { ephemeralExpiresAt: at('11:59:30') }),
        read('m-read', { participantId: 'p-other' }),
      ],
    );

    expect(await readAfterReadIdsAtDeparture(prisma as never, departure())).toEqual(['m-read']);
  });

  it('ATTAQUE — un readAt posé HORS de tout regard (bannière, widget, autre conversation à l’écran) n’est pas consommé', async () => {
    const prisma = prismaOf(
      [flame('m-before'), flame('m-gap'), flame('m-after'), flame('m-first'), flame('m-second')],
      [
        read('m-before', { readAt: at('09:30:00') }),
        read('m-first', { readAt: at('10:02:00') }),
        read('m-gap', { readAt: at('10:30:00') }),
        read('m-second', { readAt: at('11:01:00') }),
        read('m-after', { readAt: at('11:30:00') }),
      ],
    );

    const ids = await readAfterReadIdsAtDeparture(
      prisma as never,
      departure([
        { from: at('10:00:00'), to: at('10:05:00') },
        { from: at('11:00:00'), to: at('11:02:00') },
      ]),
    );

    expect(ids).toEqual(['m-first', 'm-second']);
  });

  it('une copie bornée dont le décompte court encore est consommée aussi', async () => {
    const prisma = prismaOf(
      [flame('m-copy', { ephemeralDuration: 3600 })],
      [read('m-copy', { ephemeralExpiresAt: at('12:30:00') })],
    );

    expect(await readAfterReadIdsAtDeparture(prisma as never, departure())).toEqual(['m-copy']);
  });

  it('sans regard, rien n’est lu', async () => {
    const prisma = prismaOf([flame('m-read')], [read('m-read')]);

    expect(await readAfterReadIdsAtDeparture(prisma as never, departure([]))).toEqual([]);
    expect(prisma.messageStatusEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('ne lit aucun message quand rien n’a été lu pendant le regard', async () => {
    const prisma = prismaOf([flame('m-window')], [read('m-window', { readAt: at('11:30:00') })]);

    expect(await readAfterReadIdsAtDeparture(prisma as never, departure())).toEqual([]);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('une flamme lue au début d’une longue visite n’est pas écartée par les lectures qui la suivent', async () => {
    const plain = Array.from({ length: DEPARTURE_READ_PAGE + 20 }, (_, index) => `plain-${index}`);
    const prisma = prismaOf(
      [flame('m-early'), flame('m-late')],
      [
        read('m-early', { readAt: at('11:58:01') }),
        ...plain.map((id) => read(id, { readAt: at('11:59:00') })),
        read('m-late', { readAt: at('11:59:59') }),
      ],
    );

    expect(await readAfterReadIdsAtDeparture(prisma as never, departure())).toEqual(['m-early', 'm-late']);
    expect(prisma.messageStatusEntry.findMany).toHaveBeenCalledTimes(2);
  });

  it('s’arrête au plafond de passes plutôt que de balayer sans fin', async () => {
    const prisma = prismaOf([], []);
    prisma.messageStatusEntry.findMany.mockImplementation(async () =>
      Array.from({ length: DEPARTURE_READ_PAGE }, (_, index) => read(`plain-${index}`)),
    );

    expect(await readAfterReadIdsAtDeparture(prisma as never, departure())).toEqual([]);
    expect(prisma.messageStatusEntry.findMany).toHaveBeenCalledTimes(DEPARTURE_READ_MAX_PAGES);
  });
});
