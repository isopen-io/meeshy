/**
 * #7226 regression — the sender must never appear in their own "Received
 * by" / "Read by" sheet (`getMessageStatusDetails`, feuille « Infos du
 * message », W7).
 *
 * Extracted from `MessageReadStatusService.test.ts` (#7240): that file was
 * already over the size-budget ratchet (#4531, `DETTE_HERITEE` =
 * 5264 lines) before this test existed, and the rule (CLAUDE.md, budget de
 * taille) is to extract before adding, not to grow a file already in debt.
 * This test mirrors `getMessageReadStatus`'s « Denominator = active
 * recipients EXCLUDING the sender » rule for its sibling reader: a frozen
 * entry for the sender (write-once `MessageStatusEntry`, e.g. legacy data
 * or a future write path) must not resurrect them into
 * `evaluatedParticipantIds`, and the cursor query itself is scoped to
 * exclude the sender's own id.
 *
 * @jest-environment node
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

// Mock the NotificationService import (used dynamically in markMessagesAsRead)
jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn().mockResolvedValue(0)
  }))
}));

// Mock Prisma client — only the models `getMessageStatusDetails` touches.
const mockPrisma: any = {
  conversationReadCursor: {
    findMany: jest.fn()
  },
  messageStatusEntry: {
    findMany: jest.fn()
  },
  message: {
    findUnique: jest.fn()
  },
  participant: {
    findMany: jest.fn()
  }
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

describe('MessageReadStatusService.getMessageStatusDetails — author excluded from receipts (#7226)', () => {
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';

  let service: MessageReadStatusService;

  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
    service = new MessageReadStatusService(mockPrisma as any);
  });

  it('excludes the sender from the list, even when a frozen entry names them', async () => {
    const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
    mockPrisma.message.findUnique.mockResolvedValue({
      createdAt: msgCreatedAt,
      conversationId: testConversationId,
      senderId: 'author-p',
    });
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
      { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
    ]);
    mockPrisma.participant.findMany.mockResolvedValue([
      { id: 'p1', displayName: 'Alice', avatar: null },
      { id: 'author-p', displayName: 'Auteur', avatar: null },
    ]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
      {
        participantId: 'author-p',
        deliveredAt: msgCreatedAt,
        receivedAt: msgCreatedAt,
        readAt: msgCreatedAt,
        readDevice: 'ios',
      },
    ]);

    const result = await service.getMessageStatusDetails(testMessageId);

    expect(result.statuses.map(s => s.participantId)).toEqual(['p1']);
    expect(result.statuses.some(s => s.participantId === 'author-p')).toBe(false);
    expect(mockPrisma.conversationReadCursor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: testConversationId, participantId: { not: 'author-p' } },
      })
    );
  });
});
