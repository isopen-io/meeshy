/**
 * G-8 (#7347) — l'arriéré que la réponse marque lu part vers la conversation,
 * un `read-status:updated` par message. Hors de `MessagingService.test.ts`,
 * déjà hors budget de taille (#4531).
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

// Create mock functions first
const mockHandleNewMessage = jest.fn();
const mockUpdateOnNewMessage = jest.fn();
const mockFindExistingTrackingLink = jest.fn();
const mockCreateTrackingLink = jest.fn();
const mockProcessExplicitLinksInContent = jest.fn(
  async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })
);
const mockExtractMentions = jest.fn();
const mockResolveUsernames = jest.fn();
const mockValidateMentionPermissions = jest.fn();
const mockCreateMentions = jest.fn();
const mockMarkMessagesAsRead = jest.fn();
const mockGetUnreadCount = jest.fn();

// Mock MessageTranslationService
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({
    handleNewMessage: mockHandleNewMessage
  }))
}));

// Mock ConversationStatsService
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: mockUpdateOnNewMessage
  }
}));

// Les COMPTEURS de conversation (distincts des statistiques de langue
// ci-dessus). Seul le singleton est doublé : `resolveAttachmentType` et
// `statsAuthorKey` restent les vrais, sans quoi ces tests prouveraient la
// cohérence du double et non celle du système.
const mockOnNewMessage: any = jest.fn(async () => undefined);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onNewMessage: (...a: any[]) => mockOnNewMessage(...a)
  }
}));

// Mock TrackingLinkService
// `processExplicitLinksInContent` porte désormais l'algorithme `[[url]]` /
// `<url>` en UN seul exemplaire ; l'envoi le traverse au lieu d'appeler
// lui-même `findExistingTrackingLink` / `createTrackingLink`. Le double garde
// ces deux-là (d'autres chemins les utilisent) et gagne le point d'entrée réel.
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: mockFindExistingTrackingLink,
    createTrackingLink: mockCreateTrackingLink,
    processExplicitLinksInContent: mockProcessExplicitLinksInContent,
    collectContentTrackingLinks: jest.fn(async () => [])
  }))
}));

// Mock MentionService
const mockExtractMentionsWithParticipants = jest.fn().mockReturnValue([]);
jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: mockExtractMentions,
    extractMentionsWithParticipants: mockExtractMentionsWithParticipants,
    resolveUsernames: mockResolveUsernames,
    validateMentionPermissions: mockValidateMentionPermissions,
    createMentions: mockCreateMentions
  }))
}));

// Mock MessageReadStatusService
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: mockMarkMessagesAsRead,
    getUnreadCount: mockGetUnreadCount
  }))
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Import after mocks are set up
import { MessagingService } from '../../../services/MessagingService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';

describe('MessagingService — la réponse diffuse l’arriéré marqué lu (G-8, #7347)', () => {
  const testUserId = '507f1f77bcf86cd799439011';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';
  const testParticipantId = '507f1f77bcf86cd799439099';
  let mockPrisma: any;
  let mockTranslationService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ language: 'en' }) }) as any;
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockPrisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: testConversationId, type: 'private' }),
        findFirst: jest.fn().mockResolvedValue({ id: testConversationId, identifier: 'test-conv', type: 'private' }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({
          id: testParticipantId, conversationId: testConversationId, isActive: true, type: 'user', userId: testUserId,
        }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: {
        create: jest.fn().mockResolvedValue({
          id: testMessageId, conversationId: testConversationId, senderId: testParticipantId, content: 'Hello',
          originalLanguage: 'en', messageType: 'text', replyToId: null, deletedAt: null, isEdited: false,
          validatedMentions: [], createdAt: new Date(), updatedAt: new Date(),
          sender: { id: testParticipantId, userId: testUserId }, attachments: [], replyTo: null,
        }),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      trackingLink: { updateMany: jest.fn() },
      messageAttachment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    mockTranslationService = { handleNewMessage: mockHandleNewMessage };
  });

    it("diffuse l'arriéré que la réponse vient de marquer lu — un `read-status:updated` par message (G-8, #7347)", async () => {
      mockPrisma.conversation.update.mockResolvedValue({});
      mockMarkMessagesAsRead.mockResolvedValue(2);
      const BACKLOG = ['507f1f77bcf86cd799439201', '507f1f77bcf86cd799439202'];
      const emitted: Array<{ event: string; payload: any }> = [];
      const chain = (): any => ({ to: chain, except: chain, emit: (event: string, payload: any) => emitted.push({ event, payload }) });
      const entryFindMany = jest.fn().mockResolvedValue(BACKLOG.map((messageId) => ({ messageId })));
      const withBroadcast = new MessagingService(
        mockPrisma as unknown as PrismaClient,
        mockTranslationService,
        undefined,
        () => ({
          io: { to: chain } as any,
          prisma: {
            messageStatusEntry: { findMany: entryFindMany },
            conversationReadCursor: { findUnique: jest.fn().mockResolvedValue(null) },
            participant: { findMany: jest.fn().mockResolvedValue([{ id: 'peer-p', userId: 'peer-u' }]) },
          } as any,
          readStatusService: {
            getLatestMessageSummary: jest.fn(),
            getUnreadCount: jest.fn().mockResolvedValue(0),
            getConversationReadStatuses: jest.fn().mockResolvedValue(
              new Map(BACKLOG.map((id) => [id, { totalMembers: 1, receivedCount: 1, readCount: 1, readByAllAt: null }]))
            ),
          },
          privacyPreferencesService: { shouldShowReadReceipts: jest.fn().mockResolvedValue(true) },
        })
      );

      await withBroadcast.handleMessage({ conversationId: testConversationId, content: 'Hello' }, testParticipantId);
      for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));

      expect(entryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ participantId: testParticipantId, conversationId: testConversationId }) })
      );
      const ids = emitted.filter((e) => e.event === 'read-status:updated').map((e) => e.payload.summary.messageId);
      expect([...new Set(ids)]).toEqual(BACKLOG);
    });
});
