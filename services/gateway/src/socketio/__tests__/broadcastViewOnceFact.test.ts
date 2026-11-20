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
import { LIVE_AUDIENCE_SCAN_CAP } from '../conversationAudienceRooms';
import { liveParticipantTable } from '../../__tests__/helpers/live-audience-double';
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
  it('message:consumed dit QUI a ouvert à l’ouvreur seul ; les autres reçoivent le compteur, sans personne', async () => {
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

    const { participantId: _participantId, ...counts } = consumedPayload;
    expect(sink).toEqual([
      {
        rooms: [`conversation:${CONV}`, 'user:u-sender'],
        event: SERVER_EVENTS.MESSAGE_CONSUMED,
        payload: { ...counts, userId: '' },
      },
      { rooms: 'user:u-reader', event: SERVER_EVENTS.MESSAGE_CONSUMED, payload: consumedPayload },
    ]);
  });

  it('ATTAQUE — l’identité de l’ouvreur n’entre ni dans les rooms des autres ni dans la file qui persiste 48 h', async () => {
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

    const beyondOpener = [...sink.filter((e) => e.rooms !== 'user:u-reader'), ...enqueue.mock.calls.map(([call]) => call)];
    expect(beyondOpener.length).toBeGreaterThan(1);
    expect(JSON.stringify(beyondOpener)).not.toContain('u-reader');
    expect(JSON.stringify(beyondOpener)).not.toContain('p-reader');
  });

  it('un invité de lien qui ouvre est servi par sa room de participant', async () => {
    const sink: Emitted[] = [];
    const { manager } = managerInto(sink);
    const guest = { ...consumedPayload, userId: 'p-guest', participantId: 'p-guest' };

    await broadcastViewOnceFact({
      prisma: prismaOf([...participants(), { id: 'p-guest', userId: null, conversationId: CONV, isActive: true }]) as never,
      manager: manager as never,
      conversationId: CONV,
      messageId: 'm-1',
      eventType: 'consumed',
      payload: guest,
    });

    expect(sink.map((e) => e.rooms)).toEqual([[`conversation:${CONV}`, 'user:u-sender', 'user:u-reader'], 'user:p-guest']);
    expect(sink[1].payload).toEqual(guest);
  });

  it('enfile l’ouverture pour tous les absents, une entrée par ouverture, sans nommer l’ouvreur', async () => {
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
        dedupKey: 'consumed:m-1:1',
        payload: expect.objectContaining({ userId: '', viewOnceCount: 1, isFullyConsumed: true }),
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

/**
 * Ce témoin assertait l'INVERSE jusqu'à #20007 — « au-delà du plafond, la
 * diffusion replie sur la room de conversation seule » — et il gelait ainsi la
 * perte que l'audit de #19954 a nommée : dans une conversation de plus de 2 000
 * participants vivants, un lecteur resté sur la LISTE ne recevait ni ouverture
 * ni purge, et rien ne le rattrapait (la file saute les comptes CONNECTÉS).
 * Il est RÉÉCRIT sciemment, avec sa raison sur place : le plafond ne JETTE plus,
 * il tronque — à 50 000, en le journalisant.
 *
 * Son assertion sur la BORNE est conservée, parce qu'elle garde le seul argument
 * de cette lecture, qu'aucun témoin de comportement ne peut voir. Elle était
 * d'ailleurs ANESTHÉSIÉE : la fixture valait `CAP + 1` sur une constante
 * retirée, et `Array.from({ length: NaN })` rend un tableau VIDE — le témoin
 * passait sur une foule de zéro personne.
 */
describe('l’audience nommée est TRONQUÉE, plus jamais jetée (#20007)', () => {
  it('au-delà de l’ancien plafond, une seule émission couvre tout le monde', async () => {
    const sink: Emitted[] = [];
    const { manager } = managerInto(sink);
    const crowd = Array.from({ length: 2001 }, (_, index) => ({
      id: `507f1f77bcf86cd7994${index.toString(16).padStart(5, '0')}`,
      userId: `u-${String(index).padStart(6, '0')}`,
      conversationId: CONV,
      isActive: true,
    }));
    const table = liveParticipantTable(crowd);

    await broadcastViewOnceFact({
      prisma: { participant: table } as never,
      manager: manager as never,
      conversationId: CONV,
      messageId: 'm-1',
      eventType: 'view-once-purged',
      payload: { messageId: 'm-1', conversationId: CONV },
    });

    const purges = sink.filter((emitted) => emitted.event === SERVER_EVENTS.MESSAGE_VIEW_ONCE_PURGED);
    const rooms = purges.flatMap((emitted) => (Array.isArray(emitted.rooms) ? emitted.rooms : [emitted.rooms]));

    expect(table.reads()).toBe(1);
    expect(purges).toHaveLength(1);
    expect(rooms).toHaveLength(2002);
    expect(rooms.filter((room) => room === `conversation:${CONV}`)).toHaveLength(1);
    expect(rooms).toContain('user:u-000000');
    expect(rooms).toContain('user:u-002000');
    expect(table.lastArgs()).toMatchObject({ take: LIVE_AUDIENCE_SCAN_CAP + 1 });
  });
});
