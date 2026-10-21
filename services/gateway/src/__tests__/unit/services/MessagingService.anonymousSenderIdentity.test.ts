/**
 * `MessagingService.handleMessage` — un invité porte son nom DONNÉ dans la
 * réponse et l'accusé de l'envoi (#10120), comme la liste des messages.
 *
 * Fichier séparé pour la même raison que `MessagingService.writePermission.test.ts`
 * (`MessagingService.test.ts` est hors budget).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';

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
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';

describe('MessagingService', () => {
  let service: MessagingService;
  let mockPrisma: any;
  let mockTranslationService: any;
  let mockNotificationService: any;

  // Sample test data
  const testUserId = '507f1f77bcf86cd799439011';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';

  const testParticipantId = '507f1f77bcf86cd799439014';

  const createMockMessage = (overrides: Partial<Message> = {}): any => ({
    id: testMessageId,
    conversationId: testConversationId,
    senderId: testParticipantId,
    content: 'Test message content',
    originalLanguage: 'en',
    messageType: 'text',
    replyToId: null,
    deletedAt: null,
    isEdited: false,
    validatedMentions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();

    // Mock global fetch for language detection (MessageValidator.detectLanguage)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ language: 'en' })
    }) as any;

    // Reset mock implementations
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockUpdateOnNewMessage.mockResolvedValue({ messageCount: 10, participantCount: 2 });
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'abc123' });
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({
      isValid: true,
      validUserIds: [],
      invalidUsernames: [],
      errors: []
    });
    mockCreateMentions.mockResolvedValue(undefined);
    mockMarkMessagesAsRead.mockResolvedValue(undefined);
    mockGetUnreadCount.mockResolvedValue(0);

    // Create mock Prisma client
    mockPrisma = {
      conversation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn()
      },
      participant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([])
      },
      message: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        // Lu par `admitMessageForward` (chaque test le surcharge) et par
        // `admitAttachmentReply` (#6601) — vivant par défaut, dans CETTE
        // conversation : un envoi sans forwardedFromId ni replyToId ne l'appelle jamais.
        findUnique: jest.fn().mockResolvedValue({ conversationId: testConversationId, deletedAt: null })
      },
      trackingLink: {
        updateMany: jest.fn()
      },
      messageAttachment: {
        findMany: jest.fn().mockResolvedValue([])
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    // Create mock TranslationService
    mockTranslationService = {
      handleNewMessage: mockHandleNewMessage
    };

    // Create mock NotificationService
    mockNotificationService = {
      createMentionNotification: jest.fn().mockResolvedValue({ id: 'notif123' }),
      createMentionNotificationsBatch: jest.fn().mockResolvedValue(0)
    };

    // Create service instance
    service = new MessagingService(
      mockPrisma as unknown as PrismaClient,
      mockTranslationService,
      mockNotificationService
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleMessage - Basic Flow', () => {
    const validRequest: MessageRequest = {
      conversationId: testConversationId,
      content: 'Hello, this is a test message!'
    };

    beforeEach(() => {
      // Setup default mocks for successful message handling
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        identifier: 'test-conv',
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        isActive: true,
        type: 'user',
        userId: testUserId
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage(),
        sender: {
          id: testParticipantId,
          displayName: 'Test User',
          avatar: null,
          role: 'member',
          isOnline: true,
          type: 'user',
          userId: testUserId,
          language: 'en'
        },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({
        id: testConversationId,
        lastMessageAt: new Date()
      });
    });

    it('should handle a valid message successfully for authenticated user', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.message).toBe('Message envoyé avec succès');
      expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    });
    describe('un invité porte son nom DONNÉ dans la réponse et l’accusé de l’envoi (#10120)', () => {
      // Le double modèle une vraie projection : le profil de session ne revient
      // que si la requête le DEMANDE, et seulement les deux noms.
      const GIVEN_NAME = 'Recette QA 063842';
      const PSEUDO = 'ano_RecetteQA063842';
      const anonymousSenderFor = (args: any) => ({
        id: testParticipantId,
        userId: null,
        displayName: PSEUDO,
        avatar: null,
        type: 'anonymous',
        nickname: null,
        user: null,
        ...(args?.include?.sender?.select?.anonymousSession?.select?.profile?.select?.firstName === true
          ? { anonymousSession: { profile: { firstName: GIVEN_NAME, lastName: '' } } }
          : {}),
      });
      const servedSender = (response: { data?: unknown }) => (response.data as { sender?: Record<string, unknown> }).sender;

      it('un envoi neuf sert le nom donné en displayName et le pseudo en username', async () => {
        mockPrisma.message.create.mockImplementationOnce((args: any) =>
          Promise.resolve({ ...createMockMessage(), sender: anonymousSenderFor(args), attachments: [], replyTo: null })
        );

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(true);
        expect(servedSender(response)).toMatchObject({ displayName: GIVEN_NAME, username: PSEUDO });
        expect(servedSender(response)).not.toHaveProperty('anonymousSession');
      });

      it('un réessai dédupliqué sert la même identité', async () => {
        mockPrisma.message.findFirst.mockImplementationOnce((args: any) =>
          Promise.resolve(
            args?.include?.sender
              ? { ...createMockMessage(), translations: [], sender: anonymousSenderFor(args) }
              : null
          )
        );

        const response = await service.handleMessage(
          { ...validRequest, clientMessageId: 'cmid-retry-invite' },
          testParticipantId
        );

        expect((response.data as { isDuplicate?: boolean }).isDuplicate).toBe(true);
        expect(servedSender(response)).toMatchObject({ displayName: GIVEN_NAME, username: PSEUDO });
        expect(servedSender(response)).not.toHaveProperty('anonymousSession');
      });
    });
  });
});
