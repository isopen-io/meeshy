/**
 * G-8 (#7347) — répondre marque lu tout l'arriéré de l'expéditeur
 * (`MessagingService.runPostSaveSideEffects` → `markMessagesAsRead`), et ce
 * marquage n'émettait AUCUN `read-status:updated` : les coches des messages
 * ainsi lus restaient grises chez leurs auteurs jusqu'au rechargement.
 *
 * `announceSenderBacklogRead` relit les entrées que CETTE écriture a figées
 * (`readAt ≥ frozenSince`) et les confie à `broadcastReadStatus`, qui en tire
 * un résumé PAR message.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { announceSenderBacklogRead } from '../senderBacklogRead';
import { makeChainableIO } from '../../../__tests__/helpers/chainable-io';
import { RECEIPTS_MAX_WRITE_MESSAGE_IDS } from '../../../routes/conversations/receipts-contracts';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439066';
const SENDER_USER_ID = '507f1f77bcf86cd799439077';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const PEER_USER_ID = '507f1f77bcf86cd799439055';
const M1 = '507f1f77bcf86cd799439101';
const M2 = '507f1f77bcf86cd799439102';
const FROZEN_SINCE = new Date('2026-09-22T08:00:00.000Z');
const READ_STATUS_UPDATED = 'read-status:updated';

function makeDeps(frozenIds: readonly string[] = [M1, M2]) {
  const io = makeChainableIO();
  const entryFindMany = jest.fn<any>().mockResolvedValue(frozenIds.map((messageId) => ({ messageId })));
  const shouldShowReadReceipts = jest.fn<any>().mockResolvedValue(true);
  const getConversationReadStatuses = jest.fn<any>().mockResolvedValue(
    new Map(
      frozenIds.map((id) => [id, { totalMembers: 1, receivedCount: 1, readCount: 1, readByAllAt: FROZEN_SINCE }])
    )
  );
  const deps = {
    io,
    prisma: {
      messageStatusEntry: { findMany: entryFindMany },
      conversationReadCursor: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      participant: {
        findMany: jest.fn<any>().mockResolvedValue([
          { id: SENDER_PARTICIPANT_ID, userId: SENDER_USER_ID },
          { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID },
        ]),
      },
    } as any,
    readStatusService: {
      getLatestMessageSummary: jest.fn<any>().mockResolvedValue({ totalMembers: 1, deliveredCount: 1, readCount: 1 }),
      getUnreadCount: jest.fn<any>().mockResolvedValue(0),
      getConversationReadStatuses,
    },
    privacyPreferencesService: { shouldShowReadReceipts },
  };
  return { io, deps, entryFindMany, shouldShowReadReceipts };
}

const announce = (over: Partial<Parameters<typeof announceSenderBacklogRead>[0]>) =>
  announceSenderBacklogRead({
    depsProvider: undefined,
    frozenCount: 2,
    frozenSince: FROZEN_SINCE,
    participantId: SENDER_PARTICIPANT_ID,
    conversationId: CONVERSATION_ID,
    senderUserId: SENDER_USER_ID,
    ...over,
  });

describe('announceSenderBacklogRead — répondre émet l’événement pour l’arriéré figé (G-8, #7347)', () => {
  it('émet un `read-status:updated` PAR message que la réponse vient de marquer lu', async () => {
    const { io, deps } = makeDeps();

    await announce({ depsProvider: () => deps });

    const fanOut = io._sendsFor(READ_STATUS_UPDATED).filter((s: any) => s.rooms.length > 1);
    expect(fanOut.map((s: any) => s.payload.summary.messageId)).toEqual([M1, M2]);
    expect(fanOut.every((s: any) => s.payload.type === 'read')).toBe(true);
  });

  it('relit les SEULES entrées figées par cette écriture, bornées au plafond d’écriture', async () => {
    const { deps, entryFindMany } = makeDeps();

    await announce({ depsProvider: () => deps });

    expect(entryFindMany).toHaveBeenCalledWith({
      where: {
        participantId: SENDER_PARTICIPANT_ID,
        conversationId: CONVERSATION_ID,
        readAt: { gte: FROZEN_SINCE },
      },
      select: { messageId: true },
      take: RECEIPTS_MAX_WRITE_MESSAGE_IDS,
    });
  });

  it('ne relit ni n’émet rien quand la réponse n’a rien figé (aucun arriéré)', async () => {
    const { io, deps, entryFindMany } = makeDeps();

    await announce({ depsProvider: () => deps, frozenCount: 0 });

    expect(entryFindMany).not.toHaveBeenCalled();
    expect(io._sendsFor(READ_STATUS_UPDATED)).toHaveLength(0);
  });

  it('se tait sans diffuseur câblé — jamais une erreur', async () => {
    await expect(announce({ depsProvider: undefined })).resolves.toBeUndefined();
  });

  it('interroge la préférence d’accusés d’un invité sous son Participant.id, en anonyme', async () => {
    const { deps, shouldShowReadReceipts } = makeDeps();

    await announce({ depsProvider: () => deps, senderUserId: null });

    expect(shouldShowReadReceipts).toHaveBeenCalledWith(SENDER_PARTICIPANT_ID, true);
  });

  it('respecte `showReadReceipts` désactivé : aucun résumé ne part vers la conversation', async () => {
    const { io, deps, shouldShowReadReceipts } = makeDeps();
    shouldShowReadReceipts.mockResolvedValue(false);

    await announce({ depsProvider: () => deps });

    expect(io._sendsFor(READ_STATUS_UPDATED)).toHaveLength(0);
  });
});
