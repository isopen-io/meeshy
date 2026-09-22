/**
 * G-5 (#7347) — `read-status:updated` NOMME le message qu'il décrit.
 *
 * Avant ce lot, `broadcastReadStatus` calculait UN SEUL résumé —
 * `getLatestMessageSummary`, le DERNIER message non supprimé de la
 * conversation — quel que soit le lot RÉELLEMENT figé par l'accusé. Une rafale
 * de lecture sur trois messages de trois auteurs distincts (M1, M2, M3)
 * n'émettait qu'UN événement décrivant M3 ; les coches et compteurs de M1 et M2
 * ne bougeaient jamais tant que M3 ne devenait pas, à son tour, le dernier
 * message d'un autre accusé.
 *
 * Ce fichier fige la forme retenue (doc-comment `ReadStatusSummary`,
 * `packages/shared/types/socketio-events/message.ts`) : quand l'appelant
 * connaît le lot EXACT (`args.messageIds`, le "arriéré figé"), UN résumé PAR
 * message — chacun nommant le sien via `summary.messageId` — dans l'ORDRE
 * fourni. Sans lot exact (repli legacy), le comportement d'AVANT ce lot est
 * intact : un seul événement agrégé sur le dernier message.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { broadcastReadStatus } from '../broadcastReadStatus';
import { makeChainableIO } from '../../__tests__/helpers/chainable-io';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const ACTOR_USER_ID = '507f1f77bcf86cd799439077';
const ACTOR_PARTICIPANT_ID = '507f1f77bcf86cd799439066';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const PEER_USER_ID = '507f1f77bcf86cd799439055';
const READ_STATUS_UPDATED = 'read-status:updated';

const M1 = '507f1f77bcf86cd799439101';
const M2 = '507f1f77bcf86cd799439102';
const M3 = '507f1f77bcf86cd799439103';

const READ_BY_ALL_AT = new Date('2026-09-22T08:00:00.000Z');

function makeHarness(overrides: {
  perMessage?: Map<string, { totalMembers: number; receivedCount: number; readCount: number; readByAllAt: Date | null }>;
  cursorRow?: { lastReadAt: Date | null; lastReadMessageCreatedAt: Date | null } | null;
} = {}) {
  const io = makeChainableIO();

  const findUnique = jest.fn<any>().mockResolvedValue(
    overrides.cursorRow === undefined
      ? { lastReadAt: READ_BY_ALL_AT, lastReadMessageCreatedAt: READ_BY_ALL_AT }
      : overrides.cursorRow
  );
  const findMany = jest.fn<any>().mockResolvedValue([
    { id: ACTOR_PARTICIPANT_ID, userId: ACTOR_USER_ID },
    { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID },
  ]);

  const getConversationReadStatuses = jest.fn<any>().mockResolvedValue(
    overrides.perMessage ??
      new Map([
        [M1, { totalMembers: 2, receivedCount: 2, readCount: 2, readByAllAt: READ_BY_ALL_AT }],
        [M2, { totalMembers: 2, receivedCount: 2, readCount: 1, readByAllAt: null }],
        [M3, { totalMembers: 2, receivedCount: 1, readCount: 0, readByAllAt: null }],
      ])
  );

  const deps = {
    io,
    prisma: {
      conversationReadCursor: { findUnique },
      participant: { findMany },
    } as any,
    readStatusService: {
      getLatestMessageSummary: jest.fn<any>().mockResolvedValue({
        totalMembers: 2,
        deliveredCount: 2,
        readCount: 2,
      }),
      getUnreadCount: jest.fn<any>().mockResolvedValue(0),
      getConversationReadStatuses,
    },
    privacyPreferencesService: {
      shouldShowReadReceipts: jest.fn<any>().mockResolvedValue(true),
    },
  };

  return { io, deps, getConversationReadStatuses };
}

const readArgs = (over: Partial<Record<string, unknown>> = {}) => ({
  conversationId: CONVERSATION_ID,
  participantId: ACTOR_PARTICIPANT_ID,
  userId: ACTOR_USER_ID,
  isAnonymous: false,
  type: 'read' as const,
  ...over,
});

describe('broadcastReadStatus — un résumé PAR message figé (G-5, #7347)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('émet TROIS `read-status:updated` pour une rafale M1 M2 M3 lue, pas un agrégat sur le dernier', async () => {
    const { io, deps } = makeHarness();

    await broadcastReadStatus(deps as any, readArgs({ messageIds: [M1, M2, M3] }));

    const fanOut = io._sendsFor(READ_STATUS_UPDATED).filter((s: any) => s.rooms.length > 1);
    expect(fanOut).toHaveLength(3);
  });

  it('chaque résumé nomme SON message et porte ses propres compteurs + readByAllAt', async () => {
    const { io, deps } = makeHarness();

    await broadcastReadStatus(deps as any, readArgs({ messageIds: [M1, M2, M3] }));

    const fanOut = io._sendsFor(READ_STATUS_UPDATED).filter((s: any) => s.rooms.length > 1);
    const summaries = fanOut.map((s: any) => s.payload.summary);

    expect(summaries).toEqual([
      { messageId: M1, totalMembers: 2, deliveredCount: 2, readCount: 2, readByAllAt: READ_BY_ALL_AT },
      { messageId: M2, totalMembers: 2, deliveredCount: 2, readCount: 1, readByAllAt: null },
      { messageId: M3, totalMembers: 2, deliveredCount: 1, readCount: 0, readByAllAt: null },
    ]);
  });

  it('interroge `getConversationReadStatuses` avec le lot EXACT, dans la conversation appelante', async () => {
    const { deps, getConversationReadStatuses } = makeHarness();

    await broadcastReadStatus(deps as any, readArgs({ messageIds: [M1, M2, M3] }));

    expect(getConversationReadStatuses).toHaveBeenCalledWith(CONVERSATION_ID, [M1, M2, M3], null);
  });

  it("livre aussi TROIS copies à la room personnelle de l'acteur, chacune avec son arriéré", async () => {
    const { io, deps } = makeHarness();

    await broadcastReadStatus(deps as any, readArgs({ messageIds: [M1, M2, M3] }));

    const personal = io
      ._sendsFor(READ_STATUS_UPDATED)
      .filter((s: any) => s.rooms.length === 1 && s.rooms[0] === `user:${ACTOR_USER_ID}`);
    expect(personal).toHaveLength(3);
    for (const send of personal) {
      expect(send.payload).toMatchObject({ lastReadAt: READ_BY_ALL_AT, unreadCount: 0 });
    }
    expect(personal.map((s: any) => s.payload.summary.messageId)).toEqual([M1, M2, M3]);
  });

  it("retombe sur l'agrégat LEGACY (un seul événement) quand aucun lot exact n'est fourni", async () => {
    const { io, deps } = makeHarness();

    await broadcastReadStatus(deps as any, readArgs());

    const fanOut = io._sendsFor(READ_STATUS_UPDATED).filter((s: any) => s.rooms.length > 1);
    expect(fanOut).toHaveLength(1);
    expect(fanOut[0].payload.summary).toEqual({ totalMembers: 2, deliveredCount: 2, readCount: 2 });
  });

  it("retombe sur l'agrégat quand `messageIds` est fourni mais VIDE", async () => {
    const { io, deps } = makeHarness();

    await broadcastReadStatus(deps as any, readArgs({ messageIds: [] }));

    const fanOut = io._sendsFor(READ_STATUS_UPDATED).filter((s: any) => s.rooms.length > 1);
    expect(fanOut).toHaveLength(1);
    expect(fanOut[0].payload.summary).toEqual({ totalMembers: 2, deliveredCount: 2, readCount: 2 });
  });

  it("ignore `messageIds` sur un accusé de RÉCEPTION — la forme par message reste réservée à `read`", async () => {
    const { io, deps, getConversationReadStatuses } = makeHarness();

    await broadcastReadStatus(deps as any, readArgs({ type: 'received', messageIds: [M1, M2, M3] }));

    expect(getConversationReadStatuses).not.toHaveBeenCalled();
    const fanOut = io._sendsFor(READ_STATUS_UPDATED).filter((s: any) => s.rooms.length > 1);
    expect(fanOut).toHaveLength(1);
  });
});
