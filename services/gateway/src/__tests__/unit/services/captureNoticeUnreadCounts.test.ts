/**
 * #9630 — un avis de capture fait monter le non-lu de l'auteur du message
 * capturé, et de lui SEUL. Pour tout autre membre c'est une ligne silencieuse.
 *
 * Les trois lecteurs du compteur sont exercés sur la MÊME base : l'unitaire
 * (`getUnreadCount` — le détail, le retour d'un marquage), le groupé
 * (`getUnreadCountsForParticipants` — le push sur chaque `message:new`) et
 * celui de la liste (`getUnreadCountsForUser` — `GET /conversations` ET
 * l'instantané de reconnexion `_emitUnreadCountsSnapshot`). Le double Prisma
 * ÉVALUE chaque `where` avec la sémantique MongoDB (`helpers/mongo-where.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const CONV = '507f1f77bcf86cd799439011';
const CAPTURER = { id: '507f1f77bcf86cd7994390a1', userId: '507f1f77bcf86cd7994390c1' };
const AUTHOR = { id: '507f1f77bcf86cd7994390a2', userId: '507f1f77bcf86cd7994390c2' };
const READER = { id: '507f1f77bcf86cd7994390a3', userId: '507f1f77bcf86cd7994390c3' };
const PEOPLE = [CAPTURER, AUTHOR, READER];
const JOINED = new Date('2026-10-01T00:00:00.000Z');
const READ_UP_TO = new Date('2026-10-08T10:01:00.000Z');

const CAPTURED = {
  id: '507f1f77bcf86cd799439031',
  conversationId: CONV,
  senderId: AUTHOR.id,
  createdAt: new Date('2026-10-08T10:00:00.000Z'),
  deletedAt: null,
  messageSource: 'user',
  messageType: 'text',
  expiresAt: new Date('2026-10-15T10:00:00.000Z'),
  metadata: null,
};

const NOTICE = {
  id: '507f1f77bcf86cd799439041',
  conversationId: CONV,
  senderId: CAPTURER.id,
  createdAt: new Date('2026-10-08T10:05:00.000Z'),
  deletedAt: null,
  messageSource: 'system',
  messageType: 'system',
  expiresAt: new Date('2026-10-16T10:00:00.000Z'),
  metadata: { kind: 'content-capture', capturedMessageId: CAPTURED.id },
};

const LATER = {
  id: '507f1f77bcf86cd799439051',
  conversationId: CONV,
  senderId: CAPTURER.id,
  createdAt: new Date('2026-10-08T10:06:00.000Z'),
  deletedAt: null,
  messageSource: 'user',
  messageType: 'text',
  metadata: null,
};

const project = (row: MongoDocument, select?: Record<string, unknown>): MongoDocument =>
  select ? Object.fromEntries(Object.keys(select).filter((k) => k in row).map((k) => [k, row[k]])) : row;

function service(messages: MongoDocument[]) {
  const participants = PEOPLE.map((p) => ({ ...p, conversationId: CONV, joinedAt: JOINED, isActive: true }));
  const prisma = {
    message: {
      findMany: async ({ where, select }: { where?: MongoDocument; select?: Record<string, unknown> }) =>
        messages.filter((m) => matchesMongoWhere(m, where)).map((m) => project(m, select)),
      count: async ({ where }: { where?: MongoDocument }) => messages.filter((m) => matchesMongoWhere(m, where)).length,
    },
    participant: {
      findFirst: async ({ where }: { where: { OR: Array<{ id?: string; userId?: string }> } }) =>
        participants.find((p) => where.OR.some((branch) => branch.id === p.id || branch.userId === p.userId)) ?? null,
      findMany: async ({ where }: { where: { OR: Array<{ id?: string; userId?: string }> } }) =>
        participants.filter((p) => where.OR.some((branch) => branch.id === p.id || branch.userId === p.userId)),
    },
    conversationReadCursor: {
      findUnique: async ({ where }: { where: { conversation_participant_cursor: { participantId: string } } }) => ({
        participantId: where.conversation_participant_cursor.participantId,
        lastReadAt: READ_UP_TO,
        lastReadMessageCreatedAt: READ_UP_TO,
      }),
      findMany: async ({ where }: { where: { participantId: { in: string[] } } }) =>
        where.participantId.in.map((participantId) => ({ participantId, lastReadAt: READ_UP_TO, lastReadMessageCreatedAt: READ_UP_TO })),
    },
    userConversationPreferences: { findFirst: async () => null, findMany: async () => [] },
    userMessageDeletion: { findMany: async () => [] },
  };
  return new MessageReadStatusService(prisma as never);
}

const grouped = async (messages: MongoDocument[]) =>
  service(messages).getUnreadCountsForParticipants(PEOPLE.map((p) => ({ ...p, joinedAt: JOINED })), CONV);

describe('le non-lu d’un avis de capture (#9630)', () => {
  it('groupé (push temps réel) : l’auteur du message capturé seul', async () => {
    const counts = await grouped([CAPTURED, NOTICE]);
    expect(counts.get(AUTHOR.id)).toBe(1);
    expect(counts.get(READER.id)).toBe(0);
    expect(counts.get(CAPTURER.id)).toBe(0);
  });

  it('liste et instantané de reconnexion : l’auteur du message capturé seul', async () => {
    const svc = service([CAPTURED, NOTICE]);
    expect((await svc.getUnreadCountsForUser(AUTHOR.userId, [CONV])).get(CONV)).toBe(1);
    expect((await svc.getUnreadCountsForUser(READER.userId, [CONV])).get(CONV)).toBe(0);
  });

  it('unitaire (détail, retour d’un marquage) : l’auteur du message capturé seul', async () => {
    const svc = service([CAPTURED, NOTICE]);
    expect(await svc.getUnreadCount(AUTHOR.id, CONV)).toBe(1);
    expect(await svc.getUnreadCount(READER.id, CONV)).toBe(0);
    expect(await svc.getUnreadCount(CAPTURER.id, CONV)).toBe(0);
  });

  it('les messages ordinaires autour restent comptés pour tous, sur les trois lecteurs', async () => {
    const messages = [CAPTURED, NOTICE, LATER];
    const counts = await grouped(messages);
    expect([counts.get(AUTHOR.id), counts.get(READER.id)]).toEqual([2, 1]);
    const svc = service(messages);
    expect((await svc.getUnreadCountsForUser(READER.userId, [CONV])).get(CONV)).toBe(1);
    expect(await svc.getUnreadCount(READER.id, CONV)).toBe(1);
    expect(await svc.getUnreadCount(AUTHOR.id, CONV)).toBe(2);
  });

  it('un avis dont le message capturé est introuvable ne compte pour personne', async () => {
    const orphan = { ...NOTICE, metadata: { kind: 'content-capture', capturedMessageId: '507f1f77bcf86cd799439099' } };
    const counts = await grouped([CAPTURED, orphan]);
    expect([counts.get(AUTHOR.id), counts.get(READER.id)]).toEqual([0, 0]);
    expect(await service([CAPTURED, orphan]).getUnreadCount(AUTHOR.id, CONV)).toBe(0);
  });

  it('un autre message système reste compté', async () => {
    const join = { ...NOTICE, id: '507f1f77bcf86cd799439061', expiresAt: undefined, metadata: { kind: 'member-joined' } };
    delete (join as MongoDocument).expiresAt;
    const counts = await grouped([CAPTURED, join]);
    expect(counts.get(READER.id)).toBe(1);
    expect(await service([CAPTURED, join]).getUnreadCount(READER.id, CONV)).toBe(1);
  });
});
