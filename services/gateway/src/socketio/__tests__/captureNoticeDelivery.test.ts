/**
 * #9629 b, #9630 — un avis de capture ne part pas à la room : il est porté à
 * chaque destinataire de son audience, sur sa room PERSONNELLE, et seul
 * l'auteur du message capturé voit son non-lu bouger. Aucun
 * `conversation:updated` : la ligne est silencieuse.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { captureNoticeDelivery, captureNoticeDeliveryThrough } from '../captureNoticeDelivery';

const CONV = '507f1f77bcf86cd799439011';
const CAPTURER = '507f1f77bcf86cd7994390a1';
const AUTHOR = '507f1f77bcf86cd7994390a2';
const GUEST = '507f1f77bcf86cd7994390a3';
const JOINED = new Date('2026-01-01T00:00:00.000Z');

const notice = {
  id: '507f1f77bcf86cd799439041',
  conversationId: CONV,
  senderId: CAPTURER,
  content: 'Alice (@alice) a capturé l’éphémère du 08/10/2026 à 10:00 (UTC)',
  originalLanguage: 'fr',
  messageType: 'system',
  messageSource: 'system',
  metadata: { kind: 'content-capture', capturedMessageId: '507f1f77bcf86cd799439031' },
  expiresAt: new Date('2026-10-09T10:05:00.000Z'),
  createdAt: new Date('2026-10-08T10:05:00.000Z'),
  updatedAt: new Date('2026-10-08T10:05:00.000Z'),
};

function recordingIo() {
  const emitted: { room: string; event: string; payload: Record<string, unknown> }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: Record<string, unknown>) => {
        emitted.push({ room, event, payload });
        return true;
      },
    }),
  };
  return { io, emitted };
}

function context() {
  const { io, emitted } = recordingIo();
  const countedFor: string[][] = [];
  const readStatusService = {
    getUnreadCountsForParticipants: async (participants: ReadonlyArray<{ id: string }>) => {
      countedFor.push(participants.map((p) => p.id));
      return new Map(participants.map((p) => [p.id, 1]));
    },
  };
  return { io, emitted, countedFor, readStatusService, prisma: {} as PrismaClient };
}

const recipients = [
  { id: CAPTURER, userId: 'u-capturer', joinedAt: JOINED },
  { id: AUTHOR, userId: 'u-author', joinedAt: JOINED },
  { id: GUEST, userId: null, joinedAt: JOINED },
];

describe('captureNoticeDelivery', () => {
  it('porte `message:new` sur la room personnelle de chaque destinataire, jamais sur la room de la conversation', async () => {
    const ctx = context();
    await captureNoticeDelivery(ctx as never)({ message: notice, conversationId: CONV, recipients, unreadRecipients: [] });

    const news = ctx.emitted.filter((e) => e.event === SERVER_EVENTS.MESSAGE_NEW);
    expect(news.map((e) => e.room).sort()).toEqual([ROOMS.user('u-capturer'), ROOMS.user('u-author'), ROOMS.user(GUEST)].sort());
    expect(ctx.emitted.some((e) => e.room === ROOMS.conversation(CONV))).toBe(false);
    expect(news[0]?.payload).toMatchObject({
      id: notice.id,
      conversationId: CONV,
      messageType: 'system',
      messageSource: 'system',
      metadata: notice.metadata,
      content: notice.content,
    });
    expect(news[0]?.payload).not.toHaveProperty('clientMessageId');
  });

  it('n’émet aucun `conversation:updated` — la ligne ne remonte la conversation chez personne', async () => {
    const ctx = context();
    await captureNoticeDelivery(ctx as never)({ message: notice, conversationId: CONV, recipients, unreadRecipients: [recipients[1]] });
    expect(ctx.emitted.some((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED)).toBe(false);
  });

  it('ne recompte et ne pousse le non-lu que chez l’auteur du message capturé', async () => {
    const ctx = context();
    await captureNoticeDelivery(ctx as never)({ message: notice, conversationId: CONV, recipients, unreadRecipients: [recipients[1]] });

    expect(ctx.countedFor).toEqual([[AUTHOR]]);
    const unread = ctx.emitted.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED);
    expect(unread.map((e) => e.room)).toEqual([ROOMS.user('u-author')]);
  });

  it('ne recompte rien quand personne n’a de non-lu à recevoir', async () => {
    const ctx = context();
    await captureNoticeDelivery(ctx as never)({ message: notice, conversationId: CONV, recipients, unreadRecipients: [] });
    expect(ctx.countedFor).toEqual([]);
  });
});

describe('captureNoticeDeliveryThrough — le transport REST', () => {
  it('passe par le serveur Socket.IO du manager', async () => {
    const { io, emitted } = recordingIo();
    const gateway = { getManager: () => ({ getIO: () => io }) };
    await captureNoticeDeliveryThrough(gateway as never, {} as PrismaClient)({
      message: notice,
      conversationId: CONV,
      recipients: [recipients[0]],
      unreadRecipients: [],
    });
    expect(emitted.map((e) => [e.room, e.event])).toEqual([[ROOMS.user('u-capturer'), SERVER_EVENTS.MESSAGE_NEW]]);
  });

  it('ne fait rien sans manager — l’avis reste persisté', async () => {
    await expect(
      captureNoticeDeliveryThrough({ getManager: () => null } as never, {} as PrismaClient)({
        message: notice,
        conversationId: CONV,
        recipients,
        unreadRecipients: [],
      }),
    ).resolves.toBeUndefined();
  });
});
