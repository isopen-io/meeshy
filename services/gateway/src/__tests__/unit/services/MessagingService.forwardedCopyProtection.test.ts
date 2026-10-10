/**
 * La copie ne sort pas moins protégée que sa source (#9572) — câblage côté
 * ENVOI (`MessagingService.handleMessage`).
 *
 * Transférer impose la durée, l'après-lecture et le flou de la source ; une
 * source introuvable ou illisible dégénère en message ordinaire sans rien
 * recopier ; une diffusion par un non-auteur échoue sans laisser de ligne. La
 * règle elle-même est prouvée dans `copyExitProtection.test.ts` et
 * `forwardAdmission.test.ts` ; ces cas ont quitté `MessagingService.test.ts`,
 * hors budget de taille.
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
import { armForwardSourceReader, readableForwardSource } from './forwardSourceReaderDouble';

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

    describe('transfert — la dernière sortie de l’éphémère et de la vue unique', () => {
      const forwardedFromId = '507f1f77bcf86cd799439099';
      // La projection ENTIÈRE que la garde exige (#9572) : une ligne à qui il
      // manque une colonne de protection est refusée, pas tenue pour ordinaire.
      const LOADED_SOURCE = {
        ...readableForwardSource(forwardedFromId), // #9579 — l'expéditeur LIT la source (`forwardSourceReaderDouble.ts`)
        isBlurred: false,
        ephemeralDuration: null,
        attachments: [] as Array<Record<string, unknown>>,
      };
      beforeEach(() => armForwardSourceReader(mockPrisma));

      it('fait hériter la copie de la DURÉE éphémère de la source (#7451)', async () => {
        mockPrisma.message.findUnique.mockResolvedValue({
          ...LOADED_SOURCE,
          isViewOnce: false, effectFlags: 1, ephemeralDuration: 30,
          expiresAt: new Date('2026-08-19T11:00:00.000Z')
        });

        const before = Date.now();
        const response = await service.handleMessage({ ...validRequest, forwardedFromId }, testParticipantId);
        const after = Date.now();

        expect(response.success).toBe(true);
        const written = mockPrisma.message.create.mock.calls[0][0].data;
        // Une DURÉE, jamais une échéance : le décompte repart de la réception.
        expect(written.ephemeralDuration).toBe(30);
        // `expiresAt` en base = l'heure INTERNE de destruction. Copie bornée
        // (#9572) que personne n'a reçue : « envoi + durée + grâce » (#9588).
        const DUREE_ET_GRACE_MS = 30_000 + 60 * 60 * 1000;
        expect(written.expiresAt.getTime()).toBeGreaterThanOrEqual(before + DUREE_ET_GRACE_MS);
        expect(written.expiresAt.getTime()).toBeLessThanOrEqual(after + DUREE_ET_GRACE_MS);
        // Le bit EPHEMERAL se déduit de la DURÉE dans `saveMessage`.
        expect(written.effectFlags & 1).toBe(1);
      });

      describe('le serveur impose la protection de la copie (#9572)', () => {
        const SEPT_JOURS_MS = 7 * 24 * 60 * 60 * 1000;
        const GRACE_MS = 60 * 60 * 1000;
        const FLAME = 1 | 8;
        const flameSource = (over: Record<string, unknown> = {}) => ({
          ...LOADED_SOURCE,
          isViewOnce: false,
          effectFlags: 1,
          ephemeralDuration: 15,
          expiresAt: new Date('2026-08-19T11:00:00.000Z'),
          _count: { attachments: 0 },
          ...over,
        });
        const written = () => mockPrisma.message.create.mock.calls[0][0].data;

        it('borne la durée par celle de la source et pose durée ET après lecture, quoi que dise la requête', async () => {
          mockPrisma.message.findUnique.mockResolvedValue(flameSource());

          const before = Date.now();
          const response = await service.handleMessage(
            {
              ...validRequest,
              forwardedFromId,
              ephemeralDuration: 86_400,
              effectFlags: 0,
              isBlurred: false,
              expiresAt: new Date('2030-01-01T00:00:00.000Z'),
            } as any,
            testParticipantId
          );

          const after = Date.now();

          expect(response.success).toBe(true);
          // La durée BORNÉE survit jusqu'à la colonne : c'est elle que
          // `startEphemeralCountdowns` lit pour poser l'échéance de chaque
          // destinataire. Sans elle la copie n'aurait que le plafond de sept jours.
          expect(written().ephemeralDuration).toBe(15);
          expect(written().effectFlags & FLAME).toBe(FLAME);
          // Personne n'a encore rien reçu : la copie bornée meurt à « envoi +
          // durée bornée + grâce » (#9588), jamais au plafond de sept jours.
          expect(written().expiresAt.getTime()).toBeGreaterThanOrEqual(before + 15_000 + GRACE_MS);
          expect(written().expiresAt.getTime()).toBeLessThanOrEqual(after + 15_000 + GRACE_MS);
          expect(written().expiresAt.getTime()).toBeLessThan(new Date('2030-01-01T00:00:00.000Z').getTime());
          expect(written().forwardedFromId).toBe(forwardedFromId);
        });

        // Le contraste : le plafond de sept jours (#7450) reste celui d'un envoi
        // à durée qui n'est PAS une copie — rien ne le borne, rien ne l'a reçu.
        it('laisse au plafond de sept jours un envoi à durée qui n’est pas une copie', async () => {
          const before = Date.now();
          const response = await service.handleMessage({ ...validRequest, ephemeralDuration: 30 } as any, testParticipantId);
          const after = Date.now();

          expect(response.success).toBe(true);
          expect(mockPrisma.message.findUnique).not.toHaveBeenCalled();
          expect(written().ephemeralDuration).toBe(30);
          expect(written().effectFlags & 8).toBe(0);
          expect(written().expiresAt.getTime()).toBeGreaterThanOrEqual(before + SEPT_JOURS_MS);
          expect(written().expiresAt.getTime()).toBeLessThanOrEqual(after + SEPT_JOURS_MS);
        });

        it('garde une durée demandée plus courte que celle de la source', async () => {
          mockPrisma.message.findUnique.mockResolvedValue(flameSource());

          await service.handleMessage({ ...validRequest, forwardedFromId, ephemeralDuration: 5 } as any, testParticipantId);

          expect(written().ephemeralDuration).toBe(5);
          expect(written().effectFlags & FLAME).toBe(FLAME);
        });

        it('donne la durée de la source à un ancien client qui n’en envoie aucune', async () => {
          mockPrisma.message.findUnique.mockResolvedValue(flameSource());

          await service.handleMessage({ ...validRequest, forwardedFromId }, testParticipantId);

          expect(written().ephemeralDuration).toBe(15);
        });

        it('impose le flou de la source, message ou pièce', async () => {
          mockPrisma.message.findUnique.mockResolvedValue(flameSource({ isBlurred: true }));
          await service.handleMessage({ ...validRequest, forwardedFromId, isBlurred: false } as any, testParticipantId);
          expect(written().isBlurred).toBe(true);
          expect(written().effectFlags & 2).toBe(2);

          mockPrisma.message.create.mockClear();
          mockPrisma.message.findUnique.mockResolvedValue({
            ...LOADED_SOURCE,
            isViewOnce: false,
            effectFlags: 0,
            expiresAt: null,
            attachments: [{ isViewOnce: false, isBlurred: true, effectFlags: 0 }],
          });
          await service.handleMessage({ ...validRequest, forwardedFromId, isBlurred: false } as any, testParticipantId);
          expect(written().isBlurred).toBe(true);
        });

        it('écrase un `forwardImposes` glissé dans la requête par le client', async () => {
          mockPrisma.message.findUnique.mockResolvedValue(flameSource());

          await service.handleMessage(
            { ...validRequest, forwardedFromId, ephemeralDuration: 86_400, forwardImposes: null } as any,
            testParticipantId
          );
          expect(written().ephemeralDuration).toBe(15);
          expect(written().effectFlags & FLAME).toBe(FLAME);

          mockPrisma.message.create.mockClear();
          await service.handleMessage(
            {
              ...validRequest,
              forwardedFromId,
              forwardImposes: { ephemeralDuration: 999_999, isBlurred: false },
            } as any,
            testParticipantId
          );
          expect(written().ephemeralDuration).toBe(15);
        });

        it.each([
          ['une flamme après lecture', { effectFlags: 1 | 8, ephemeralDuration: null }],
          ['une copie déjà transférée — durée ET après lecture', { effectFlags: 1 | 8, ephemeralDuration: 15 }],
          ['une pièce en vue unique', { effectFlags: 0, ephemeralDuration: null, expiresAt: null, attachments: [{ isViewOnce: true, isBlurred: false, effectFlags: 0 }] }],
          ['une échéance sans durée', { effectFlags: 1, ephemeralDuration: null }],
        ])('refuse %s, sans rien écrire', async (_label, over) => {
          mockPrisma.message.findUnique.mockResolvedValue(flameSource(over));

          const response = await service.handleMessage({ ...validRequest, forwardedFromId }, testParticipantId);

          expect(response.success).toBe(false);
          expect(mockPrisma.message.create).not.toHaveBeenCalled();
        });

        it.each([
          ['introuvable', () => mockPrisma.message.findUnique.mockResolvedValue(null)],
          ['illisible', () => mockPrisma.message.findUnique.mockRejectedValue(new Error('mongo down'))],
        ])('source %s et corps fourni par le client : message ORDINAIRE, rien de la source n’est recopié', async (_label, arrange) => {
          arrange();
          mockPrisma.messageAttachment.findMany.mockClear();
          mockPrisma.messageAttachment.create = jest.fn();

          const response = await service.handleMessage({ ...validRequest, forwardedFromId }, testParticipantId);

          expect(response.success).toBe(true);
          expect(written().forwardedFromId ?? null).toBeNull();
          expect(written().forwardedFromConversationId ?? null).toBeNull();
          expect(written().content).toBe(validRequest.content);
          expect(mockPrisma.messageAttachment.findMany).not.toHaveBeenCalledWith({ where: { messageId: forwardedFromId } });
          expect(mockPrisma.messageAttachment.create).not.toHaveBeenCalled();
        });
      });

      // #9572 — la protection de la source est lue AVANT l'écriture, le
      // contrôle de propriété APRÈS (`copyAttachmentsFromMessage`). Un
      // non-auteur n'obtient ni succès (donc aucune diffusion `message:new`,
      // que l'appelant n'émet que sur succès), ni ligne laissée derrière.
      it('refuse la diffusion d’un non-auteur : envoi en échec, ligne créée puis SUPPRIMÉE, aucune pièce copiée', async () => {
        mockPrisma.message.findUnique.mockResolvedValue({
          sender: { id: '507f1f77bcf86cd7994390ff', userId: '507f1f77bcf86cd7994390fe' },
          isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null,
          forwardedFromId: null, attachments: []
        });
        mockPrisma.message.delete = jest.fn().mockResolvedValue({});
        mockPrisma.messageAttachment.create = jest.fn();

        const response = await service.handleMessage(
          { ...validRequest, content: '', copyAttachmentsFromMessageId: '507f1f77bcf86cd799439099' },
          testParticipantId
        );

        expect(response.success).toBe(false);
        expect(mockPrisma.messageAttachment.create).not.toHaveBeenCalled();
        const created = mockPrisma.message.create.mock.results[0]?.value;
        const createdId = (await created)?.id;
        expect(mockPrisma.message.delete).toHaveBeenCalledWith({ where: { id: createdId } });
      });
    });
  });
});
