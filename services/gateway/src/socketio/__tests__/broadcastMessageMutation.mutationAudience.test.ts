/**
 * #19943 — `message:deleted`, `message:pinned` et `message:unpinned` atteignent
 * qui a reçu `message:new`, pas seulement qui est resté dans le fil.
 *
 * `message:new` part en régime PAR LECTEUR dès que le message porte une pièce
 * protégée (`messageNewEmission.emitPerReader`) : sa destination est la room
 * PERSONNELLE de chaque participant admis, room qu'un lecteur garde en quittant
 * `conversation:<id>` pour la liste. Les trois mutations ci-dessus ne partaient
 * qu'à `conversation:<id>` — donc PAS à ces lecteurs-là, que la file hors ligne
 * ne rattrape pas davantage (elle saute les comptes CONNECTÉS). Leur cache de
 * fil gardait la bulle d'un message supprimé, et ignorait toute épingle.
 *
 * Le jumeau `expired` avait reçu exactement ce correctif (#18556) ; le
 * commentaire de `MessageMutationParams` promettait « same audiences, for the
 * same reason » pour les deux moitiés.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastMessageMutation } from '../broadcastMessageMutation';
import { LIVE_AUDIENCE_SCAN_CAP } from '../conversationAudienceRooms';
import { liveParticipantTable, type LiveParticipantTableHooks } from '../../__tests__/helpers/live-audience-double';
import { type MongoDocument } from '../../__tests__/helpers/mongo-where';

type Emitted = { rooms: string | string[]; event: string; payload: unknown };

const CONV = '507f1f77bcf86cd799439011';

const BANNED_AT = new Date('2026-11-01T00:00:00.000Z');

const participants = (): MongoDocument[] => [
  { id: 'p-sender', userId: 'u-sender', conversationId: CONV, isActive: true },
  { id: 'p-list', userId: 'u-list', conversationId: CONV, isActive: true },
  { id: 'p-guest', userId: null, conversationId: CONV, isActive: true },
  { id: 'p-gone', userId: 'u-gone', conversationId: CONV, isActive: false },
  // #20007 — ACTIF et BANNI. C'est la seule ligne qui distingue
  // `PARTICIPATION_VIVANTE` (`isActive` ET `bannedAt` nul ou absent) d'un
  // `isActive: true` nu : sans elle, la clause `bannedAt` pouvait quitter la loi
  // sans faire rougir un seul témoin d'audience (audit adversarial de #19954).
  { id: 'p-banned', userId: 'u-banned', conversationId: CONV, isActive: true, bannedAt: BANNED_AT },
];

function participantsOf(rows: MongoDocument[], hooks?: LiveParticipantTableHooks) {
  return {
    // Le double EXIGE `take` et JETTE sur toute autre forme : un double qui
    // l'ignorerait laisserait retirer de la production la seule borne du
    // chemin sans faire rougir un témoin.
    participant: liveParticipantTable(rows, hooks),
    conversationShareLink: { findMany: jest.fn(async () => []) },
    message: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
  };
}

/** La forme de PRODUCTION d'un id : `Participant.id` est un ObjectId (24 hex). */
const crowd = (count: number): MongoDocument[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `507f1f77bcf86cd7994${index.toString(16).padStart(5, '0')}`,
    userId: `u-${String(index).padStart(6, '0')}`,
    conversationId: CONV,
    isActive: true,
  }));

const allRoomsOf = (sink: Emitted[], event: string): string[] =>
  sink
    .filter((emitted) => emitted.event === event)
    .flatMap((emitted) => (Array.isArray(emitted.rooms) ? emitted.rooms : [emitted.rooms]));

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

const roomsOf = (sink: Emitted[], event: string): string[] => {
  const found = sink.find((e) => e.event === event);
  if (!found) return [];
  return Array.isArray(found.rooms) ? [...found.rooms] : [found.rooms];
};

const mutate = async (
  prisma: unknown,
  manager: unknown,
  kind: 'deleted' | 'pinned' | 'unpinned',
): Promise<void> => {
  const base = { prisma: prisma as never, manager: manager as never, conversationId: CONV, actorUserId: 'u-sender', messageId: 'm-1' };
  if (kind === 'deleted') {
    await broadcastMessageMutation({
      ...base,
      eventType: 'deleted',
      authorId: 'p-sender',
      payload: { messageId: 'm-1', conversationId: CONV, deletedAt: new Date(0).toISOString() },
    });
    return;
  }
  if (kind === 'pinned') {
    await broadcastMessageMutation({
      ...base,
      eventType: 'pinned',
      payload: { messageId: 'm-1', conversationId: CONV, pinnedAt: new Date(0).toISOString(), pinnedBy: 'u-sender' },
    });
    return;
  }
  await broadcastMessageMutation({
    ...base,
    eventType: 'unpinned',
    payload: { messageId: 'm-1', conversationId: CONV },
  });
};

const EVENT_OF = {
  deleted: SERVER_EVENTS.MESSAGE_DELETED,
  pinned: SERVER_EVENTS.MESSAGE_PINNED,
  unpinned: SERVER_EVENTS.MESSAGE_UNPINNED,
} as const;

describe('#19943 — les mutations d’ids atteignent la liste comme le fil', () => {
  for (const kind of ['deleted', 'pinned', 'unpinned'] as const) {
    it(`${kind} : la room de conversation ET les rooms personnelles des participants VIVANTS`, async () => {
      const sink: Emitted[] = [];
      const { manager } = managerInto(sink);

      await mutate(participantsOf(participants()), manager, kind);

      const rooms = roomsOf(sink, EVENT_OF[kind]);
      expect(rooms).toEqual(
        expect.arrayContaining([`conversation:${CONV}`, 'user:u-sender', 'user:u-list', 'user:p-guest']),
      );
    });

    it(`${kind} : un participant qui a QUITTÉ la conversation n’est pas adressé`, async () => {
      const sink: Emitted[] = [];
      const { manager } = managerInto(sink);

      await mutate(participantsOf(participants()), manager, kind);

      expect(roomsOf(sink, EVENT_OF[kind])).not.toContain('user:u-gone');
    });

    it(`${kind} : un participant BANNI n’est pas adressé`, async () => {
      const sink: Emitted[] = [];
      const { manager } = managerInto(sink);

      await mutate(participantsOf(participants()), manager, kind);

      expect(allRoomsOf(sink, EVENT_OF[kind])).not.toContain('user:u-banned');
    });

    it(`${kind} : une lecture qui LÈVE replie sur la room de conversation, jamais sur rien`, async () => {
      const sink: Emitted[] = [];
      const { manager } = managerInto(sink);
      const prisma = participantsOf(participants(), {
        onRead: () => {
          throw new Error('participant.findMany down');
        },
      });

      await mutate(prisma, manager, kind);

      expect(roomsOf(sink, EVENT_OF[kind])).toEqual([`conversation:${CONV}`]);
    });

    it(`${kind} : une grande audience part en UNE émission, et n’oublie personne`, async () => {
      const sink: Emitted[] = [];
      const { manager } = managerInto(sink);
      // 2 001 : le seuil qui JETAIT l'audience entière avant ce lot, et qui
      // repliait la diffusion sur la room de conversation seule.
      const prisma = participantsOf(crowd(2001));

      await mutate(prisma, manager, kind);

      const emissions = sink.filter((emitted) => emitted.event === EVENT_OF[kind]);
      const rooms = allRoomsOf(sink, EVENT_OF[kind]);
      // UNE émission : Socket.IO ne dédoublonne que par émission, et `to()`
      // prend le tableau entier.
      expect(emissions).toHaveLength(1);
      expect(rooms).toHaveLength(2002);
      expect(rooms.filter((room) => room === `conversation:${CONV}`)).toHaveLength(1);
      expect(rooms).toContain('user:u-000000');
      expect(rooms).toContain('user:u-002000');
      expect(prisma.participant.lastArgs()).toMatchObject({ take: LIVE_AUDIENCE_SCAN_CAP + 1 });
    });
  }
});
