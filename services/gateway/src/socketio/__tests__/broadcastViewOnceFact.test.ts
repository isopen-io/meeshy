/**
 * #18556 — l'ouverture d'une vue unique et la purge de son contenu se voient
 * « sous nos yeux », chez tous ceux qui ont le message à l'écran, sur tous
 * leurs appareils.
 *
 * `message:consumed` et `message:view-once-purged` ne partaient que dans la
 * room de conversation, sans file : l'expéditeur resté sur la liste, ou
 * hors ligne, ne l'apprenait jamais.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastViewOnceFact } from '../broadcastViewOnceFact';
import { matchesMongoWhere, type MongoDocument } from '../../__tests__/helpers/mongo-where';

type Emitted = { rooms: string | string[]; event: string; payload: unknown };

const CONV = '507f1f77bcf86cd799439011';

const participants = (): MongoDocument[] => [
  { id: 'p-sender', userId: 'u-sender', conversationId: CONV, isActive: true },
  { id: 'p-reader', userId: 'u-reader', conversationId: CONV, isActive: true },
  { id: 'p-gone', userId: 'u-gone', conversationId: CONV, isActive: false },
];

function prismaOf(rows: MongoDocument[]) {
  return {
    participant: {
      findMany: jest.fn(async (args: { where?: MongoDocument }) =>
        rows.filter((row) => matchesMongoWhere(row, args?.where ?? {})),
      ),
    },
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
    },
  };
}

const consumedPayload = {
  messageId: 'm-1',
  conversationId: CONV,
  userId: 'u-reader',
  participantId: 'p-reader',
  byAuthor: false,
  viewOnceCount: 1,
  maxViewOnceCount: 1,
  isFullyConsumed: true,
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('les faits de vue unique atteignent chaque participant actif (#18556)', () => {
  it('message:consumed part en UNE diffusion vers la room de conversation et les rooms personnelles', async () => {
    const sink: Emitted[] = [];
    const { manager } = managerInto(sink);

    await broadcastViewOnceFact({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      conversationId: CONV,
      messageId: 'm-1',
      eventType: 'consumed',
      payload: consumedPayload,
    });

    expect(sink).toEqual([
      {
        rooms: [`conversation:${CONV}`, 'user:u-sender', 'user:u-reader'],
        event: SERVER_EVENTS.MESSAGE_CONSUMED,
        payload: consumedPayload,
      },
    ]);
  });

  it('enfile l’ouverture pour tous les absents, ouvreur compris, une entrée par ouvreur', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);

    await broadcastViewOnceFact({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      conversationId: CONV,
      messageId: 'm-1',
      eventType: 'consumed',
      payload: consumedPayload,
    });
    await flush();

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'consumed',
        actorUserId: null,
        messageId: 'm-1',
        dedupKey: 'consumed:m-1:p-reader',
      }),
    );
  });

  it('message:view-once-purged atteint les rooms personnelles et la file hors ligne', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);

    await broadcastViewOnceFact({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      conversationId: CONV,
      messageId: 'm-1',
      eventType: 'view-once-purged',
      payload: { messageId: 'm-1', conversationId: CONV },
    });
    await flush();

    expect(sink.map((e) => [e.event, e.rooms])).toEqual([
      [SERVER_EVENTS.MESSAGE_VIEW_ONCE_PURGED, [`conversation:${CONV}`, 'user:u-sender', 'user:u-reader']],
    ]);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'view-once-purged', actorUserId: null, messageId: 'm-1' }),
    );
  });

  it('replie sur la room de conversation quand les participants sont illisibles, et ne lève jamais', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);
    enqueue.mockRejectedValueOnce(new Error('redis down'));
    const prisma = prismaOf([]);
    prisma.participant.findMany.mockRejectedValueOnce(new Error('mongo down'));
    const onError = jest.fn();

    await expect(
      broadcastViewOnceFact({
        prisma: prisma as never,
        manager: manager as never,
        conversationId: CONV,
        messageId: 'm-1',
        eventType: 'view-once-purged',
        payload: { messageId: 'm-1', conversationId: CONV },
        onError,
      }),
    ).resolves.toBeUndefined();
    await flush();

    expect(sink.map((e) => e.rooms)).toEqual([`conversation:${CONV}`]);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
