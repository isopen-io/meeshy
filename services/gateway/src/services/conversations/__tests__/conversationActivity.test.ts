/**
 * **TOUTE ACTIVITÉ REMONTE LA CONVERSATION EN TÊTE, POUR TOUS** (#9026).
 *
 * `recordConversationActivity` écrit `Conversation.lastActivityAt` de façon
 * MONOTONE (une activité plus ancienne, arrivée en retard, ne recule jamais la
 * ligne) ; `announceConversationActivity` l'écrit puis sert le rang à chaque
 * participant par `conversation:updated`. Best-effort : l'action est déjà
 * commise, une panne se journalise et ne lève jamais.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import { announceConversationActivity, recordConversationActivity } from '../conversationActivity';

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const AT = new Date('2026-10-01T10:00:00.000Z');
const LAST_MESSAGE_AT = new Date('2026-10-01T09:00:00.000Z');

type Emitted = { room: string; event: string; payload: Record<string, unknown> };

type Row = { lastActivityAt: Date | null };

/** Un Prisma qui APPLIQUE le `where` monotone sur une ligne en mémoire. */
function makePrisma(row: Row) {
  const updateMany = jest.fn(async (args: { where: { id: string; OR: Array<Record<string, unknown>> }; data: Row }) => {
    const current = row.lastActivityAt;
    const admitted = args.where.OR.some((clause) => {
      const filter = clause.lastActivityAt as null | { lt: Date };
      if (filter === null) return current === null;
      return current !== null && current.getTime() < filter.lt.getTime();
    });
    if (!admitted) return { count: 0 };
    row.lastActivityAt = args.data.lastActivityAt;
    return { count: 1 };
  });
  return {
    conversation: {
      updateMany,
      findUnique: jest.fn(async () => ({
        lastReactionId: null,
        activeCallId: null,
        lastMessageAt: LAST_MESSAGE_AT,
        lastActivityAt: row.lastActivityAt,
      })),
    },
    message: { findUnique: jest.fn(async () => null) },
    reaction: { findUnique: jest.fn(async () => null) },
    callSession: { findUnique: jest.fn(async () => null) },
    participant: {
      findMany: jest.fn(async () => [
        { id: 'p-bob', userId: 'u-bob', joinedAt: new Date('2026-01-01'), user: { systemLanguage: 'fr', role: 'USER' } },
        { id: 'p-guest', userId: null, joinedAt: new Date('2026-01-01'), user: null },
      ]),
    },
    conversationShareLink: { findMany: jest.fn(async () => []) },
  };
}

const makeIo = (sink: Emitted[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: Record<string, unknown>) => {
      sink.push({ room, event, payload });
    },
  }),
});

describe('recordConversationActivity — écriture monotone', () => {
  it('pose lastActivityAt sur une conversation qui n’en avait pas', async () => {
    const row: Row = { lastActivityAt: null };
    const prisma = makePrisma(row);

    await recordConversationActivity({ prisma: prisma as never, conversationId: CONVERSATION_ID, at: AT });

    expect(row.lastActivityAt).toEqual(AT);
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: AT } }] },
      data: { lastActivityAt: AT },
    });
  });

  it('fait avancer une activité plus ancienne', async () => {
    const row: Row = { lastActivityAt: new Date('2026-10-01T08:00:00.000Z') };

    await recordConversationActivity({ prisma: makePrisma(row) as never, conversationId: CONVERSATION_ID, at: AT });

    expect(row.lastActivityAt).toEqual(AT);
  });

  it('ne recule JAMAIS une activité plus récente (arrivée en retard)', async () => {
    const later = new Date('2026-10-01T11:00:00.000Z');
    const row: Row = { lastActivityAt: later };

    await recordConversationActivity({ prisma: makePrisma(row) as never, conversationId: CONVERSATION_ID, at: AT });

    expect(row.lastActivityAt).toEqual(later);
  });

  it('ne lève jamais : une panne de base est avalée', async () => {
    const prisma = makePrisma({ lastActivityAt: null });
    prisma.conversation.updateMany.mockRejectedValueOnce(new Error('down') as never);

    await expect(
      recordConversationActivity({ prisma: prisma as never, conversationId: CONVERSATION_ID, at: AT }),
    ).resolves.toBeUndefined();
  });
});

describe('announceConversationActivity — le rang servi à chaque participant', () => {
  it('écrit l’activité puis pousse listRankAt dans la room personnelle de CHAQUE participant (invité compris)', async () => {
    const row: Row = { lastActivityAt: null };
    const emitted: Emitted[] = [];

    await announceConversationActivity({
      prisma: makePrisma(row) as never,
      io: makeIo(emitted) as never,
      conversationId: CONVERSATION_ID,
      at: AT,
      updatedByUserId: 'u-alice',
    });

    expect(row.lastActivityAt).toEqual(AT);
    expect(emitted.map((e) => e.room).sort()).toEqual(['user:p-guest', 'user:u-bob']);
    for (const { event, payload } of emitted) {
      expect(event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
      expect(payload).toMatchObject({ conversationId: CONVERSATION_ID, listRankAt: AT.toISOString(), updatedBy: { id: 'u-alice' } });
    }
  });

  it('écrit l’activité même sans io (la remontée survit au rechargement)', async () => {
    const row: Row = { lastActivityAt: null };

    await announceConversationActivity({
      prisma: makePrisma(row) as never,
      io: null,
      conversationId: CONVERSATION_ID,
      at: AT,
      updatedByUserId: 'u-alice',
    });

    expect(row.lastActivityAt).toEqual(AT);
  });
});
