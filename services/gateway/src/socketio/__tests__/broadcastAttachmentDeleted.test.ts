/**
 * #20019 — le retrait d'UNE pièce atteint qui a reçu le message, pas seulement
 * qui est resté dans le fil.
 *
 * `attachment:deleted` (#13608) ne partait qu'à `conversation:<id>`, et n'avait
 * AUCUNE entrée de file. Deux populations ne l'apprenaient donc jamais :
 *
 *  · le lecteur resté sur la LISTE — sa room personnelle est la seule adresse
 *    de `message:new` dès que le message porte une pièce protégée
 *    (`messageNewEmission.emitPerReader`), et on QUITTE `conversation:<id>` en
 *    revenant à la liste ;
 *  · le lecteur HORS LIGNE — son cache de fil (`staleTime: Infinity` côté web)
 *    gardait la pièce jusqu'à un rechargement manuel.
 *
 * C'est l'asymétrie que #19943 et #20007 ont fermée sur les cinq familles d'ids
 * du message, et que son jumeau `message:attachment-updated` ne portait pas :
 * `emitAttachmentUpdated` nomme les rooms personnelles ET enfile depuis
 * toujours.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastAttachmentDeleted } from '../broadcastAttachmentDeleted';
import { liveParticipantTable } from '../../__tests__/helpers/live-audience-double';
import type { MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = '507f1f77bcf86cd799439011';
const MESSAGE = '507f1f77bcf86cd799439022';
const ATTACHMENT = '507f1f77bcf86cd799439033';
const BANNED_AT = new Date('2026-11-01T00:00:00.000Z');

type Emitted = { rooms: string | string[]; event: string; payload: unknown };

const participants = (): MongoDocument[] => [
  { id: 'p-author', userId: 'u-author', conversationId: CONV, isActive: true },
  { id: 'p-list', userId: 'u-list', conversationId: CONV, isActive: true },
  { id: 'p-guest', userId: null, conversationId: CONV, isActive: true },
  { id: 'p-gone', userId: 'u-gone', conversationId: CONV, isActive: false },
  { id: 'p-banned', userId: 'u-banned', conversationId: CONV, isActive: true, bannedAt: BANNED_AT },
];

function prismaOf(rows: MongoDocument[], message: MongoDocument | null = { conversationId: CONV }) {
  return {
    participant: liveParticipantTable(rows),
    message: { findUnique: jest.fn(async () => message) },
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

const roomsOf = (sink: Emitted[]): string[] => {
  const found = sink.find((emitted) => emitted.event === SERVER_EVENTS.ATTACHMENT_DELETED);
  if (!found) return [];
  return Array.isArray(found.rooms) ? [...found.rooms] : [found.rooms];
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('broadcastAttachmentDeleted — l’audience vivante, puis la file', () => {
  it('la room de conversation ET les rooms personnelles des participants VIVANTS', async () => {
    const sink: Emitted[] = [];
    const { manager } = managerInto(sink);

    await broadcastAttachmentDeleted({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      messageId: MESSAGE,
      attachmentId: ATTACHMENT,
    });

    expect(roomsOf(sink)).toEqual([`conversation:${CONV}`, 'user:u-author', 'user:u-list', 'user:p-guest']);
  });

  it('ni le participant parti, ni le participant BANNI', async () => {
    const sink: Emitted[] = [];
    const { manager } = managerInto(sink);

    await broadcastAttachmentDeleted({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      messageId: MESSAGE,
      attachmentId: ATTACHMENT,
    });

    expect(roomsOf(sink)).not.toContain('user:u-gone');
    expect(roomsOf(sink)).not.toContain('user:u-banned');
  });

  it('la charge ne porte que des IDS — jamais rien de la pièce', async () => {
    const sink: Emitted[] = [];
    const { manager } = managerInto(sink);

    await broadcastAttachmentDeleted({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      messageId: MESSAGE,
      attachmentId: ATTACHMENT,
    });

    expect(sink[0].payload).toEqual({ conversationId: CONV, messageId: MESSAGE, attachmentId: ATTACHMENT });
  });

  it('enfile pour les absents, sous une clé de dédup qui nomme la PIÈCE', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);

    await broadcastAttachmentDeleted({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      messageId: MESSAGE,
      attachmentId: ATTACHMENT,
      actorUserId: 'u-author',
    });
    await flush();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      conversationId: CONV,
      actorUserId: 'u-author',
      messageId: MESSAGE,
      eventType: 'attachment-deleted',
      // Deux pièces retirées d'un MÊME message : sous la dédup par défaut
      // (`messageId` + `eventType`), la seconde supplanterait la première et
      // l'absent n'apprendrait qu'un des deux retraits. Même raison, même
      // forme que `emitAttachmentUpdated`.
      dedupKey: ATTACHMENT,
      payload: { conversationId: CONV, messageId: MESSAGE, attachmentId: ATTACHMENT },
    });
  });

  it('un INVITÉ qui retire sa pièce est exclu par sa LIGNE, jamais par un `userId` qu’il n’a pas', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);

    await broadcastAttachmentDeleted({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      messageId: MESSAGE,
      attachmentId: ATTACHMENT,
      // La route est `authOptional` : un invité y retire la pièce qu'il a
      // téléversée, et `authContext.userId` porte alors un `Participant.id`.
      // Le recopier dans `actorUserId` n'exclurait PERSONNE — l'exclusion par
      // `actorUserId` compare `p.userId`, celle par `actorParticipantId`
      // compare `p.id`.
      actorUserId: null,
      actorParticipantId: 'p-guest',
    });
    await flush();

    expect(enqueue.mock.calls[0][0]).toMatchObject({ actorUserId: null, actorParticipantId: 'p-guest' });
  });

  it('un acteur INSCRIT n’envoie aucune identité de participant', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);

    await broadcastAttachmentDeleted({
      prisma: prismaOf(participants()) as never,
      manager: manager as never,
      messageId: MESSAGE,
      attachmentId: ATTACHMENT,
      actorUserId: 'u-author',
    });
    await flush();

    expect(enqueue.mock.calls[0][0]).not.toHaveProperty('actorParticipantId');
  });

  it('une lecture d’audience qui LÈVE replie sur la room de conversation, et enfile quand même', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);
    const prisma = {
      participant: liveParticipantTable(participants(), {
        onRead: () => {
          throw new Error('participant.findMany down');
        },
      }),
      message: { findUnique: jest.fn(async () => ({ conversationId: CONV })) },
    };

    await broadcastAttachmentDeleted({
      prisma: prisma as never,
      manager: manager as never,
      messageId: MESSAGE,
      attachmentId: ATTACHMENT,
    });
    await flush();

    expect(roomsOf(sink)).toEqual([`conversation:${CONV}`]);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('un message introuvable ne diffuse RIEN et n’enfile RIEN — il n’y a pas de conversation à nommer', async () => {
    const sink: Emitted[] = [];
    const { manager, enqueue } = managerInto(sink);

    await broadcastAttachmentDeleted({
      prisma: prismaOf(participants(), null) as never,
      manager: manager as never,
      messageId: MESSAGE,
      attachmentId: ATTACHMENT,
    });
    await flush();

    expect(sink).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('une émission qui LÈVE ne défait pas la suppression, et laisse la file intacte', async () => {
    const enqueue = jest.fn(async (_params: unknown) => undefined);
    const seen: unknown[] = [];
    const manager = {
      getIO: () => ({
        to: () => ({
          emit: () => {
            throw new Error('adapter down');
          },
        }),
      }),
      enqueueOfflineMessageMutation: enqueue,
    };

    await expect(
      broadcastAttachmentDeleted({
        prisma: prismaOf(participants()) as never,
        manager: manager as never,
        messageId: MESSAGE,
        attachmentId: ATTACHMENT,
        onError: (error) => seen.push(error),
      }),
    ).resolves.toBeUndefined();
    await flush();

    expect(seen).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('sans gestionnaire de socket, rien ne lève', async () => {
    await expect(
      broadcastAttachmentDeleted({
        prisma: prismaOf(participants()) as never,
        manager: null,
        messageId: MESSAGE,
        attachmentId: ATTACHMENT,
      }),
    ).resolves.toBeUndefined();
  });
});
