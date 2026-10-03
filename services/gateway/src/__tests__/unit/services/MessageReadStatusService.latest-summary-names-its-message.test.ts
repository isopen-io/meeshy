/**
 * #7433 — `getLatestMessageSummary` NOMME le message qu'il résume.
 *
 * Le dernier message du fil n'est pas forcément celui de l'expéditeur qui
 * reçoit l'événement : quand c'est celui du PAIR, les compteurs disent si
 * l'expéditeur, lui, l'a lu. Sans le nom du message, iOS les appliquait à ses
 * propres messages et peignait de faux « Lu ».
 *
 * Extrait de `MessageReadStatusService.test.ts`, déjà hors du budget de taille
 * (#4531, `DETTE_HERITEE` = 5264 lignes) : la règle est d'extraire avant
 * d'ajouter, jamais de faire grossir un fichier endetté.
 *
 * @jest-environment node
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn().mockResolvedValue(0)
  }))
}));

// Les seuls modèles que `getLatestMessageSummary` lit.
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
  const testConversationId = '507f1f77bcf86cd799439012';

  let service: MessageReadStatusService;

  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
    service = new MessageReadStatusService(mockPrisma as any);
  });

  it('names the message it summarises, so a client never applies it to another one', async () => {
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'm-latest',
      createdAt: new Date('2024-06-01T10:00:00Z'),
      senderId: 'sender-id',
    });
    mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

    const result = await service.getLatestMessageSummary(testConversationId);

    expect(result.messageId).toBe('m-latest');
  });
});
