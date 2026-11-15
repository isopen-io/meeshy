/**
 * #7433 — the latest-message summary NAMES the message it describes.
 *
 * The thread's latest message is not necessarily authored by the sender who
 * receives `read-status:updated`: when it is the peer's, its counters say
 * whether the sender read it. Without the message id, iOS applied them to
 * the sender's own messages and painted false « Lu » ticks.
 *
 * Extracted from `MessageReadStatusService.test.ts`, which sits in the
 * size-budget debt (#4531, `DETTE_HERITEE` = 5264 lines): the rule is to
 * extract before adding, never to grow a file already in debt.
 *
 * @jest-environment node
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

const mockPrisma: any = {
  message: { findFirst: jest.fn() },
  participant: { findMany: jest.fn() },
  conversationReadCursor: { findMany: jest.fn() },
  messageStatusEntry: { findMany: jest.fn() }
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

describe('MessageReadStatusService.getLatestMessageSummary — names its message (#7433)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
  });

  it('names the message it summarises, so a client never applies it to another one', async () => {
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'm-latest',
      createdAt: new Date('2024-06-01T10:00:00Z'),
      senderId: 'sender-id'
    });
    mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    const service = new MessageReadStatusService(mockPrisma as any);

    const result = await service.getLatestMessageSummary('507f1f77bcf86cd799439012');

    expect(result.messageId).toBe('m-latest');
  });
});
