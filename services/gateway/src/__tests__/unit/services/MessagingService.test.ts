/**
 * Unit tests for MessagingService
 *
 * Comprehensive test suite covering:
 * - Message handling (handleMessage)
 * - Request validation
 * - Permission checking for registered and anonymous users
 * - Conversation ID resolution
 * - Language detection
 * - Link processing (markdown, tracking links)
 * - Message saving and updates
 * - Translation queuing
 * - Stats updates
 * - Mention notifications
 * - Error handling
 *
 * Coverage target: > 65%
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
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';

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
        // Lu par `admitMessageForward` pour connaître l'état de la SOURCE d'un
        // transfert. Nul par défaut : sans `forwardedFromId` le garde ne lit
        // rien, et un envoi ordinaire ne doit pas dépendre de ce double.
        findUnique: jest.fn().mockResolvedValue(null)
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

    describe('transfert — la dernière sortie de l’éphémère et de la vue unique', () => {
      // `forwardedFromId` traversait `handleMessage` sans qu'une ligne de code
      // serveur ne lise l'état de la source : la copie naissait sans échéance
      // et sans budget, et survivait à la destruction de l'original. Ces trois
      // cas prouvent le CÂBLAGE — la règle elle-même est prouvée dans
      // `forwardAdmission.test.ts`.
      const forwardedFromId = '507f1f77bcf86cd799439099';

      it('refuse le transfert d’un message à vue unique, sans rien écrire', async () => {
        mockPrisma.message.findUnique.mockResolvedValue({
          isViewOnce: true,
          effectFlags: 0,
          expiresAt: null,
          createdAt: new Date('2026-08-12T11:00:00.000Z')
        });

        const response = await service.handleMessage(
          { ...validRequest, forwardedFromId },
          testParticipantId
        );

        expect(response.success).toBe(false);
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      it('fait hériter la copie de la durée éphémère de la source', async () => {
        mockPrisma.message.findUnique.mockResolvedValue({
          isViewOnce: false,
          effectFlags: 0,
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          expiresAt: new Date('2026-08-12T11:00:30.000Z')
        });

        const before = Date.now();
        const response = await service.handleMessage(
          { ...validRequest, forwardedFromId },
          testParticipantId
        );
        const after = Date.now();

        expect(response.success).toBe(true);
        const written = mockPrisma.message.create.mock.calls[0][0].data;
        // 30 s de durée d'origine, recomptées depuis l'envoi du transfert.
        expect(written.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30_000);
        expect(written.expiresAt.getTime()).toBeLessThanOrEqual(after + 30_000);
        // Le bit EPHEMERAL se déduit de l'échéance dans `saveMessage` — sans
        // lui les clients rendraient la copie comme un message ordinaire.
        expect(written.effectFlags & 1).toBe(1);
      });

      it('n’impose aucune échéance quand la source est un message ordinaire', async () => {
        mockPrisma.message.findUnique.mockResolvedValue({
          isViewOnce: false,
          effectFlags: 0,
          expiresAt: null,
          createdAt: new Date('2026-08-12T11:00:00.000Z')
        });

        const response = await service.handleMessage(
          { ...validRequest, forwardedFromId },
          testParticipantId
        );

        expect(response.success).toBe(true);
        expect(mockPrisma.message.create.mock.calls[0][0].data.expiresAt).toBeNull();
      });

      // Vécu prod 2026-08-19 (« le transfert des médias n'aboutit pas ») : la
      // route acceptait un forward sans texte, puis MessageValidator le
      // rejetait en CONTENT_EMPTY — les attachments d'un forward sont copiés
      // CÔTÉ SERVEUR, le corps n'a donc ni content ni attachmentIds.
      it('transfère un média SANS texte : forwardedFromId seul rend le corps non-vide', async () => {
        mockPrisma.message.findUnique.mockResolvedValue({
          isViewOnce: false,
          effectFlags: 0,
          expiresAt: null,
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          // Ce que la copie serveur donnera au transfert. Le double DOIT le
          // porter : c'est la seule chose qui distingue ce transfert d'une
          // bulle vide (cf. le cas « source introuvable » plus bas).
          _count: { attachments: 1 }
        });

        const response = await service.handleMessage(
          { ...validRequest, content: '', forwardedFromId },
          testParticipantId
        );

        expect(response.success).toBe(true);
        expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
      });

      // Vécu : la source a disparu entre le geste et l'envoi (éphémère balayé,
      // rejeu hors-ligne tardif). `sanitizeForwardReferences` garde l'id bien
      // formé, l'admission dégénérait en best-effort et `copyForwardedAttachments`
      // rendait la main sans rien copier — une ligne sans contenu, sans pièce
      // jointe et sans chiffré était créée puis DIFFUSÉE : une bulle vide chez
      // tous les destinataires, que personne ne peut réparer.
      it('refuse un transfert sans texte dont la source est introuvable, sans rien écrire', async () => {
        mockPrisma.message.findUnique.mockResolvedValue(null);

        const response = await service.handleMessage(
          { ...validRequest, content: '', forwardedFromId },
          testParticipantId
        );

        expect(response.success).toBe(false);
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      it('refuse un transfert sans texte dont la source ne porte aucune pièce jointe', async () => {
        mockPrisma.message.findUnique.mockResolvedValue({
          isViewOnce: false,
          effectFlags: 0,
          expiresAt: null,
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          _count: { attachments: 0 }
        });

        const response = await service.handleMessage(
          { ...validRequest, content: '', forwardedFromId },
          testParticipantId
        );

        expect(response.success).toBe(false);
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      it('laisse passer un transfert de TEXTE dont la source n’a aucune pièce jointe', async () => {
        // Le client envoie le texte transféré : le corps ne dépend pas de la
        // copie serveur, et une source sans pièce jointe y est la normale.
        mockPrisma.message.findUnique.mockResolvedValue({
          isViewOnce: false,
          effectFlags: 0,
          expiresAt: null,
          createdAt: new Date('2026-08-12T11:00:00.000Z'),
          _count: { attachments: 0 }
        });

        const response = await service.handleMessage(
          { ...validRequest, forwardedFromId },
          testParticipantId
        );

        expect(response.success).toBe(true);
        expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
      });

      // Le picker iOS historique envoyait `forwardedFromConversationId: ""`
      // (conversation?.id ?? ""). Zod (`z.string().optional()`) l'accepte,
      // Prisma (`@db.ObjectId`) refuse l'ÉCRITURE : l'envoi mourait en
      // « Erreur interne » APRÈS validation. La provenance de conversation est
      // facultative — une référence illisible s'abandonne, l'envoi survit.
      it('abandonne un forwardedFromConversationId malformé au lieu de casser l’écriture', async () => {
        mockPrisma.message.findUnique.mockResolvedValue({
          isViewOnce: false,
          effectFlags: 0,
          expiresAt: null,
          createdAt: new Date('2026-08-12T11:00:00.000Z')
        });

        const response = await service.handleMessage(
          { ...validRequest, forwardedFromId, forwardedFromConversationId: '' },
          testParticipantId
        );

        expect(response.success).toBe(true);
        const written = mockPrisma.message.create.mock.calls[0][0].data;
        expect(written.forwardedFromConversationId ?? null).toBeNull();
        expect(written.forwardedFromId).toBe(forwardedFromId);
      });

      // Un rejeu hors-ligne peut porter l'id LOCAL d'un message optimiste
      // (`ofq_*`) comme source. Même philosophie best-effort que
      // `admitMessageForward` sur source introuvable : l'envoi dégénère en
      // message ordinaire — sans lecture DB inutile, sans « Erreur interne ».
      it('dégénère en message ordinaire quand forwardedFromId n’est pas un ObjectId', async () => {
        const response = await service.handleMessage(
          { ...validRequest, forwardedFromId: 'ofq_local_abc123' },
          testParticipantId
        );

        expect(response.success).toBe(true);
        const written = mockPrisma.message.create.mock.calls[0][0].data;
        expect(written.forwardedFromId ?? null).toBeNull();
        expect(mockPrisma.message.findUnique).not.toHaveBeenCalled();
      });

      // Diffuser à plusieurs destinataires n'est PAS transférer : la copie
      // serveur des pièces jointes ne doit jamais poser `forwardedFromId` —
      // sans quoi le destinataire verrait un badge « Transféré depuis … » qui
      // révélerait le nom de la conversation d'un autre destinataire.
      it('copie les pièces jointes SANS marquer le message comme transféré', async () => {
        // Contrôle de propriété de `copyAttachmentsFromMessage` : identité
        // (mêmes `Participant.id`, ou même `User.id` derrière deux
        // `Participant` de conversations différentes — cf. round de
        // correction 1). Le mock par défaut (`findUnique` → null) ferait
        // refuser la copie ; ce test prouve le câblage côté ENVOI, la règle
        // de propriété étant déjà prouvée par `copyAttachments.test.ts`.
        mockPrisma.message.findUnique.mockResolvedValue({
          sender: { id: testParticipantId, userId: testUserId }
        });
        // `copyAttachmentsFromMessage` refuse désormais une source SANS
        // pièce jointe (round de correction 1, garde `empty-source`) : ce
        // test doit en fournir au moins une pour exercer le câblage nominal.
        mockPrisma.messageAttachment.findMany.mockResolvedValue([
          { id: 'att-1', mimeType: 'image/jpeg', filePath: '/p/1', fileUrl: 'u/1', fileName: 'f', originalName: 'f', fileSize: 10 }
        ]);
        mockPrisma.messageAttachment.create = jest.fn().mockResolvedValue({ id: 'copy-1' });

        const response = await service.handleMessage(
          { ...validRequest, content: '', copyAttachmentsFromMessageId: '507f1f77bcf86cd799439099' },
          testParticipantId
        );
        expect(response.success).toBe(true);
        const written = mockPrisma.message.create.mock.calls[0][0].data;
        expect(written.forwardedFromId ?? null).toBeNull();
        // Preuve que la branche copie a bien tourné (pas un simple message
        // texte vide qui laisserait passer l'assertion ci-dessus par hasard).
        expect(mockPrisma.messageAttachment.findMany).toHaveBeenCalledWith({
          where: { messageId: '507f1f77bcf86cd799439099' }
        });
      });
    });

    describe('conteneur TERMINAL et RANG D’ÉCRITURE — le conteneur gouverne enfin', () => {
      // Deux règles, une position. Le schéma déclare la première sur
      // `Conversation.closedAt` ; la clôture ne touche PAS les lignes
      // `Participant`, et TOUTES les gardes d'envoi lisent
      // `Participant.isActive` — un champ homonyme sur un autre modèle. La
      // seconde vivait dans `MessageValidator.checkPermissions`, que ce service
      // n'appelle PAS. Ces cas prouvent le CÂBLAGE ; les règles sont prouvées
      // dans `conversationWriteAdmission.test.ts`.
      const closed = {
        id: testConversationId,
        type: 'private',
        isActive: false,
        closedAt: new Date('2026-08-15T10:00:00.000Z')
      };

      const announcementChannel = {
        id: testConversationId,
        type: 'group',
        isActive: true,
        closedAt: null,
        isAnnouncementChannel: true,
        defaultWriteRole: 'admin'
      };

      const senderWithRole = (role: string) => ({
        id: testParticipantId,
        conversationId: testConversationId,
        isActive: true,
        type: 'user',
        userId: testUserId,
        role,
        user: { role: 'USER' }
      });

      it('refuse l’envoi dans une conversation close, sans rien écrire', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue(closed);

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(false);
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      // `leave.ts` ferme en n'écrivant QUE `isActive` (constat latent nº 2 du
      // cycle 30) : le câblage doit tenir sur cette forme-là aussi.
      it('refuse l’envoi dans une conversation fermée sans `closedAt`', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue({
          id: testConversationId,
          type: 'private',
          isActive: false
        });

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(false);
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      it('refuse un simple membre dans un canal d’annonces', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue(announcementChannel);
        mockPrisma.participant.findUnique.mockResolvedValue(senderWithRole('member'));

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(false);
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      // Non-régression jumelle de celle du bas : une garde qui refuserait tout
      // canal d'annonces passerait le cas précédent.
      it('laisse un admin publier dans le même canal d’annonces', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue(announcementChannel);
        mockPrisma.participant.findUnique.mockResolvedValue(senderWithRole('admin'));

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(true);
        expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
      });

      // Le discriminant de PLACEMENT. Un rejeu porte un `clientMessageId` dont
      // la ligne existe déjà : le message a été accepté AVANT la clôture. Le
      // refuser maintenant ferait marquer « échoué » un message pourtant
      // délivré. Même raison, et même position, que `admitMessageForward` :
      // après le dedup précoce. Une garde posée avant le dedup passe les deux
      // premiers cas et échoue celui-ci.
      it('laisse un REJEU aboutir alors même que la conversation vient de fermer', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue(closed);
        mockPrisma.message.findFirst.mockResolvedValueOnce({
          ...createMockMessage(),
          translations: [{ language: 'fr', content: 'bonjour' }]
        });

        const response = await service.handleMessage(
          { ...validRequest, clientMessageId: 'cmid-retry-après-clôture' },
          testParticipantId
        );

        expect(response.success).toBe(true);
        expect((response.data as { isDuplicate?: boolean }).isDuplicate).toBe(true);
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      // L'autre borne du placement : `detectLanguage` sort par `global.fetch`
      // vers le translator (~266 ms à froid). Un envoi qui va être refusé ne
      // doit pas l'acheter.
      it('refuse AVANT la détection de langue — un refus ne paie pas le traducteur', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue(closed);

        await service.handleMessage(
          { conversationId: testConversationId, content: 'Bonjour' },
          testParticipantId
        );

        expect(global.fetch).not.toHaveBeenCalled();
      });

      // Non-régression : une garde qui refuserait TOUJOURS passerait tous les
      // cas de refus ci-dessus.
      it('laisse passer l’envoi dans une conversation active', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue({
          id: testConversationId,
          type: 'private',
          isActive: true,
          closedAt: null
        });

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(true);
        expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
      });
    });

    describe('droit d’écriture du PARTICIPANT — canSendMessages (#4855)', () => {
      // `participant.permissions` est l'instantané figé au join ;
      // `anonymousSession.rights` est la surcharge que l'hôte pose ensuite via
      // `PATCH …/participants/:id/rights`. Seul `routes/links/messages.ts`
      // appliquait ce droit avant #4855 — ni cette route REST canonique ni
      // `message:send` (qui convergent tous deux ici) ne le lisaient : un hôte
      // qui retirait le droit d'écrire à un invité voyait le composeur des
      // clients obéissants se fermer pendant qu'un envoi direct passait.
      const participantWithRights = (overrides: {
        permissions?: Record<string, boolean>;
        rights?: Record<string, boolean>;
      }) => ({
        id: testParticipantId,
        conversationId: testConversationId,
        isActive: true,
        type: 'anonymous',
        permissions: { canSendMessages: true, ...overrides.permissions },
        ...(overrides.rights ? { anonymousSession: { rights: overrides.rights } } : {})
      });

      it('refuse un invité dont l’hôte a retiré canSendMessages APRÈS le join', async () => {
        mockPrisma.participant.findUnique.mockResolvedValue(
          participantWithRights({ rights: { canSendMessages: false } })
        );

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(false);
        expect(response.error).toContain('autorisé');
        expect((response as unknown as { code?: string }).code).toBe('WRITE_NOT_PERMITTED');
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      it('refuse quand canSendMessages est fermé dès l’instantané, sans surcharge', async () => {
        mockPrisma.participant.findUnique.mockResolvedValue(
          participantWithRights({ permissions: { canSendMessages: false } })
        );

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(false);
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
      });

      it('laisse écrire un invité dont l’instantané autorise, sans surcharge', async () => {
        mockPrisma.participant.findUnique.mockResolvedValue(participantWithRights({}));

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(true);
        expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
      });

      // Non-régression : une garde qui lirait l'instantané BRUT plutôt que la
      // loi résolue (`resolveParticipantRights`) laisserait passer ce cas —
      // exactement le défaut de #4855.
      it('la surcharge FERMANTE de l’hôte prime sur un instantané ouvert', async () => {
        mockPrisma.participant.findUnique.mockResolvedValue(
          participantWithRights({ permissions: { canSendMessages: true }, rights: { canSendMessages: false } })
        );

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(false);
      });

      // Un participant chargé SANS `permissions` (auto-création legacy, forme
      // héritée du cache) ne doit pas être refusé par une simple absence —
      // seul un refus EXPLICITE bloque, comme partout ailleurs dans ce module.
      it('n’est jamais refusé quand `permissions` est absent de la ligne chargée', async () => {
        mockPrisma.participant.findUnique.mockResolvedValue({
          id: testParticipantId,
          conversationId: testConversationId,
          isActive: true
        });

        const response = await service.handleMessage(validRequest, testParticipantId);

        expect(response.success).toBe(true);
      });
    });

    it('carries no metadata envelope on the ACK — the send response is the message and nothing else', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect((response as unknown as Record<string, unknown>).metadata).toBeUndefined();
    });

    it('flags an early-dedup hit as isDuplicate and skips re-save', async () => {
      // Sequential retry: a message with this clientMessageId already exists.
      // The early-dedup branch must set the in-process `isDuplicate` marker so
      // the socket layer suppresses the `message:new` re-broadcast — otherwise
      // every recipient gets the bubble twice. Regression guard.
      const existing = {
        ...createMockMessage(),
        translations: [{ language: 'fr', content: 'bonjour' }]
      };
      mockPrisma.message.findFirst.mockResolvedValueOnce(existing);

      const response = await service.handleMessage(
        { ...validRequest, clientMessageId: 'cmid-retry-123' },
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect((response.data as { isDuplicate?: boolean }).isDuplicate).toBe(true);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('resolves early-dedup senderId to the User id, matching the non-dedup path', async () => {
      // `createSuccessResponse` normalises `senderId` (Participant.id → User.id)
      // because clients compare `senderId` against their own `userId`. The
      // early-dedup path must honour that contract too, exactly like the
      // concurrent P2002 dedup path (MessageProcessor.saveMessage) and the
      // fresh-send path — otherwise a sequential retry would resolve to the raw
      // Participant.id. The mock models a real projection: the `sender` relation
      // is only returned when the query actually requests the include.
      const baseExisting = {
        ...createMockMessage(),
        translations: [{ language: 'fr', content: 'bonjour' }]
      };
      mockPrisma.message.findFirst.mockImplementationOnce((args: any) =>
        Promise.resolve(
          args?.include?.sender
            ? { ...baseExisting, sender: { id: testParticipantId, userId: testUserId } }
            : baseExisting
        )
      );

      const response = await service.handleMessage(
        { ...validRequest, clientMessageId: 'cmid-retry-sender' },
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect((response.data as { isDuplicate?: boolean }).isDuplicate).toBe(true);
      expect((response.data as { senderId?: string }).senderId).toBe(testUserId);
      expect((response.data as { senderId?: string }).senderId).not.toBe(testParticipantId);
    });

    it('should return error for invalid request (empty content)', async () => {
      const invalidRequest: MessageRequest = {
        conversationId: testConversationId,
        content: ''
      };

      const response = await service.handleMessage(
        invalidRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('empty');
    });

    it('should return error for missing conversationId', async () => {
      const invalidRequest: MessageRequest = {
        conversationId: '',
        content: 'Test message'
      };

      const response = await service.handleMessage(
        invalidRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Conversation ID');
    });

    it('should return error when conversation not found', async () => {
      // First mock - identifier lookup returns null
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      // For ObjectId format, it goes directly to that ID
      // So we need to use an identifier format

      const response = await service.handleMessage(
        { ...validRequest, conversationId: 'mshy_non-existent-conv' },
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Conversation non trouv');
    });

    it('should handle errors gracefully', async () => {
      // To trigger an error, we need to let validation pass but fail somewhere else
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      // Make message.create throw an error
      mockPrisma.message.create.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Erreur interne lors de l\'envoi du message');
    });
  });

  describe('handleMessage - Authentication Context', () => {
    const validRequest: MessageRequest = {
      conversationId: testConversationId,
      content: 'Test message'
    };

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage(),
        sender: { id: testUserId, username: 'testuser' },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({});
    });

    it('should create JWT authentication context when jwtToken is provided', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      // Message should be created with senderId = participantId
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: testParticipantId,
          })
        })
      );
    });

    it('should create session authentication context when sessionToken is provided', async () => {
      const anonymousParticipantId = 'anon-participant-123';

      // With unified Participant model, anonymous participants use the same findUnique path
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: anonymousParticipantId,
        conversationId: testConversationId,
        isActive: true
      });

      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ senderId: anonymousParticipantId }),
        sender: { id: anonymousParticipantId, displayName: 'AnonUser', type: 'anonymous' },
        attachments: [],
        replyTo: null
      });

      const response = await service.handleMessage(
        validRequest,
        anonymousParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: anonymousParticipantId
          })
        })
      );
    });

    it('should handle anonymous participant via unified Participant model', async () => {
      const anonymousParticipantId = 'anon-participant-456';

      // With unified Participant model, anonymous participants are resolved the same way
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: anonymousParticipantId,
        conversationId: testConversationId,
        isActive: true
      });

      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ senderId: anonymousParticipantId }),
        sender: { id: anonymousParticipantId, type: 'anonymous' },
        attachments: [],
        replyTo: null
      });

      const response = await service.handleMessage(
        validRequest,
        anonymousParticipantId
      );

      expect(response.success).toBe(true);
    });
  });

  describe('handleMessage - Validation', () => {
    it('should reject content exceeding 4000 characters', async () => {
      const longContent = 'A'.repeat(4001);
      const request: MessageRequest = {
        conversationId: testConversationId,
        content: longContent
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('4000');
    });

    it('should allow message with only attachments and empty content', async () => {
      const request: MessageRequest = {
        conversationId: testConversationId,
        content: '',
        attachments: [{ id: 'att1', type: 'image', url: 'https://example.com/image.jpg' }]
      };

      // This should not fail validation
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ content: '' }),
        sender: { id: testUserId },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({});

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
    });

    it('should reject anonymous message without display name', async () => {
      // Validation checks for isAnonymous && !anonymousDisplayName
      const request: MessageRequest = {
        conversationId: testConversationId,
        content: 'Anonymous message',
        isAnonymous: true
        // Missing anonymousDisplayName
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Anonymous display name');
    });

    it(`should reject more than ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`, async () => {
      const attachments = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, (_, i) => ({
        id: `att${i}`,
        type: 'image' as const,
        url: `https://example.com/image${i}.jpg`
      }));

      const request: MessageRequest = {
        conversationId: testConversationId,
        content: 'Message with too many attachments',
        attachments
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain(String(MAX_ATTACHMENTS_PER_MESSAGE));
    });
  });

  describe('handleMessage - Permissions', () => {
    const validRequest: MessageRequest = {
      conversationId: testConversationId,
      content: 'Test message'
    };

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
    });

    it('should deny access when user is not a member', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue(null);

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Permissions insuffisantes');
    });

    it('should deny access when participant is inactive', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: false
      });

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Permissions insuffisantes');
    });

    it('should deny when participant belongs to different conversation', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: 'different-conv-id',
        isActive: true
      });

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Permissions insuffisantes');
    });

    it('should allow access to global conversation', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'global',
        identifier: 'global-chat'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'global',
        identifier: 'global-chat'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        isActive: true
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage(),
        sender: { id: testUserId, username: 'testuser' },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({});

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
    });
  });

  describe('handleMessage - Link Processing', () => {
    const baseRequest: MessageRequest = {
      conversationId: testConversationId,
      content: 'Check out this link'
    };

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.conversation.update.mockResolvedValue({});
    });

    it('should preserve markdown links without tracking', async () => {
      const request: MessageRequest = {
        ...baseRequest,
        content: 'Check [this link](https://example.com) out'
      };

      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ content: request.content }),
        sender: { id: testUserId },
        attachments: [],
        replyTo: null
      });

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
      // Markdown links should be preserved
      const createCall = mockPrisma.message.create.mock.calls[0][0];
      expect(createCall.data.content).toContain('[this link](https://example.com)');
    });

    it('should not track raw URLs', async () => {
      const request: MessageRequest = {
        ...baseRequest,
        content: 'Visit https://example.com for more info'
      };

      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ content: request.content }),
        sender: { id: testUserId },
        attachments: [],
        replyTo: null
      });

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
      // Raw URLs should remain unchanged
      const createCall = mockPrisma.message.create.mock.calls[0][0];
      expect(createCall.data.content).toContain('https://example.com');
      expect(createCall.data.content).not.toContain('m+');
    });
  });

  describe('handleMessage - Conversation ID Resolution', () => {
    beforeEach(() => {
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage(),
        sender: { id: testUserId },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({});
    });

    it('should resolve MongoDB ObjectId format directly', async () => {
      const objectId = '507f1f77bcf86cd799439012';

      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: objectId,
        type: 'private'
      });

      const request: MessageRequest = {
        conversationId: objectId,
        content: 'Test message'
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      // Should succeed with direct ObjectId lookup
      expect(response.success).toBe(true);
    });

    it('should resolve identifier format via findFirst', async () => {
      const identifier = 'mshy_test-conv-123';
      const resolvedId = '507f1f77bcf86cd799439012';

      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: resolvedId,
        identifier: identifier,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: resolvedId,
        type: 'private'
      });

      const request: MessageRequest = {
        conversationId: identifier,
        content: 'Test message'
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { identifier: identifier },
        select: { id: true }
      });
    });
  });

  describe('handleMessage - Translation Queuing', () => {
    const validRequest: MessageRequest = {
      conversationId: testConversationId,
      content: 'Test message'
    };

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage(),
        sender: { id: testUserId },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({});
    });

    it('should queue message for translation after saving', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockHandleNewMessage).toHaveBeenCalledTimes(1);
      expect(mockHandleNewMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testMessageId,
          conversationId: testConversationId,
          content: expect.any(String)
        })
      );
    });

    it('acknowledges without announcing a translation status the sender cannot use', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect((response as unknown as Record<string, unknown>).metadata).toBeUndefined();
    });

    it('should use provided originalLanguage when matching detected language', async () => {
      // Override fetch mock to return 'fr' so it matches the provided originalLanguage
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ language: 'fr' })
      }) as any;

      const request: MessageRequest = {
        ...validRequest,
        originalLanguage: 'fr'
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalLanguage: 'fr'
          })
        })
      );
    });

    // Regression guard: the socket schema is `originalLanguage: z.string().optional()`,
    // so an EMPTY STRING is a valid value — a common outcome when client-side
    // detection fails and the client sends `originalLanguage: ''`. A nullish
    // (`??`) guard lets `''` through, skipping detection and persisting
    // `originalLanguage=''`. Downstream that broadcasts as `'fr'` (Prisme
    // corruption): a French-preference recipient sees the untranslated original.
    // The empty/whitespace claim MUST fall through to language detection.
    it('should detect language when originalLanguage is an empty string', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ language: 'es' })
      }) as any;

      const request: MessageRequest = {
        ...validRequest,
        content: 'Hola qué tal',
        originalLanguage: ''
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalLanguage: 'es'
          })
        })
      );
    });

    it('should detect language when originalLanguage is whitespace only', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ language: 'de' })
      }) as any;

      const request: MessageRequest = {
        ...validRequest,
        content: 'Guten Tag',
        originalLanguage: '   '
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalLanguage: 'de'
          })
        })
      );
      expect(mockPrisma.message.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originalLanguage: '   ' })
        })
      );
    });

    // Root-cause guard (iteration 218): clients send the raw platform locale as
    // their `originalLanguage` claim — iOS `Locale.current` ('fr_FR'), web
    // `navigator.language` ('fr-FR'), or a bare-uppercase 'FR'. Persisting that
    // verbatim (as the old trust-the-claim branch did) fragments EVERY downstream
    // consumer keyed on `Message.originalLanguage`: the NLLB source code, the
    // translation cache key (MessageTranslationService.generateKey), per-language
    // stats and admin analytics aggregates. The claim MUST be canonicalised via
    // the SSOT `normalizeLanguageCode` at the write boundary so the DB is the
    // single source of truth — 'fr-FR'/'fr_FR'/'FR' all persist as 'fr' without
    // a detector round-trip.
    it('should canonicalize a BCP-47 / region-tagged originalLanguage claim before persisting', async () => {
      // Detector must NOT be consulted — a non-empty claim is still trusted,
      // only normalised. Fail loudly if this triggers a detection round-trip.
      global.fetch = jest.fn().mockRejectedValue(new Error('detector must not be called')) as any;

      const request: MessageRequest = {
        ...validRequest,
        originalLanguage: 'fr-FR'
      };

      const response = await service.handleMessage(request, testParticipantId);

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originalLanguage: 'fr' })
        })
      );
      expect(mockPrisma.message.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originalLanguage: 'fr-FR' })
        })
      );
    });

    it('should keep an irreducible claim verbatim rather than dropping it to the detector', async () => {
      // A supported ISO 639-3 code without a 639-1 reduction ('bas' = Basaa) is
      // already canonical: normalizeLanguageCode returns it unchanged, and the
      // claim is trusted (no detector call, no data loss).
      global.fetch = jest.fn().mockRejectedValue(new Error('detector must not be called')) as any;

      const request: MessageRequest = {
        ...validRequest,
        originalLanguage: 'bas'
      };

      const response = await service.handleMessage(request, testParticipantId);

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originalLanguage: 'bas' })
        })
      );
    });
  });

  describe('getReadStatusService', () => {
    it('should return the read status service instance', () => {
      const readStatusService = service.getReadStatusService();

      expect(readStatusService).toBeDefined();
      expect(typeof readStatusService.markMessagesAsRead).toBe('function');
    });
  });

  describe('Error Handling', () => {
    const validRequest: MessageRequest = {
      conversationId: testConversationId,
      content: 'Test message'
    };

    it('should handle Prisma errors gracefully', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.message.create.mockRejectedValue(new Error('Database connection failed'));

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Erreur interne lors de l\'envoi du message');
    });

    it('should handle translation service errors gracefully', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage(),
        sender: { id: testUserId },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockHandleNewMessage.mockRejectedValue(new Error('Translation service unavailable'));

      // Should still succeed - translation errors should not fail the message.
      // Translation is queued as a background post-save side effect (off the
      // ACK path), so the send response always reports "pending"; a translator
      // failure is captured and logged asynchronously, never surfaced here.
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect((response as unknown as Record<string, unknown>).metadata).toBeUndefined();
    });

    it('reports a failed send as an error string, without a debug envelope', async () => {
      mockPrisma.conversation.findFirst.mockRejectedValue(new Error('Database error'));

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(typeof response.error).toBe('string');
      expect((response as unknown as Record<string, unknown>).metadata).toBeUndefined();
    });
  });

  describe('Message Response Metadata', () => {
    const validRequest: MessageRequest = {
      conversationId: testConversationId,
      content: 'Test message with https://example.com link'
    };

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ content: validRequest.content }),
        sender: { id: testUserId },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({});
    });

    it('does not announce a delivery status the ACK path never measured', async () => {
      // Le bloc `deliveryStatus` valait `{recipientCount: 1, deliveredCount: 1,
      // readCount: 1}` — trois CONSTANTES, pas une mesure : un envoi dans un
      // groupe de douze annonçait « livré à 1 / lu par 1 » à l'instant même de
      // la persistance, avant que le moindre destinataire ait reçu quoi que ce
      // soit. Le compte réel se calcule (getConversationReadStatuses) et se
      // sert par les routes d'accusés ; il n'a rien à faire sur l'ACK.
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect((response as unknown as Record<string, unknown>).metadata).toBeUndefined();
    });

    it('does not scan the sent content to build a context nobody reads', async () => {
      // `validRequest.content` porte un lien : l'ancien `context.containsLinks`
      // le prouvait, au prix de deux balayages du contenu (extractMentions +
      // containsLinks) sur le chemin de l'ACK — celui que l'architecture garde
      // délibérément libre de tout effet de bord.
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(validRequest.content).toContain('https://');
      expect((response as unknown as Record<string, unknown>).metadata).toBeUndefined();
    });

    it('acknowledges with the persisted message the socket layer actually forwards', async () => {
      // Ce que les TROIS appelants de handleMessage consomment réellement :
      // `success`, `data` (id + horodatage serveur), `error`. Rien d'autre.
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.data.id).toBe(testMessageId);
      expect(response.data.conversationId).toBe(testConversationId);
    });
  });

  describe('Reply To Messages', () => {
    const parentMessageId = '507f1f77bcf86cd799439099';

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId,
        conversationId: testConversationId,
        userId: testUserId,
        isActive: true
      });
      mockPrisma.conversation.update.mockResolvedValue({});
    });

    it('should save replyToId when provided', async () => {
      const request: MessageRequest = {
        conversationId: testConversationId,
        content: 'This is a reply',
        replyToId: parentMessageId
      };

      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ replyToId: parentMessageId }),
        sender: { id: testUserId },
        attachments: [],
        replyTo: {
          id: parentMessageId,
          content: 'Parent message',
          sender: { id: 'otherUser', username: 'other' }
        }
      });

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            replyToId: parentMessageId
          })
        })
      );
    });
  });

  describe('Anonymous Participant Not Found', () => {
    it('should error when anonymous participant not found for saving', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });

      // Participant not found
      mockPrisma.participant.findUnique.mockResolvedValue(null);

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Test message', isAnonymous: true, anonymousDisplayName: 'AnonUser' },
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Permissions insuffisantes pour envoyer des messages');
    });
  });

  describe('handleMessage - With Attachments', () => {
    // Regression guard for the read-after-write removal in commit 05c754c3:
    // `MessageProcessor.saveMessage` calls `prisma.message.create` with
    // `include: { attachments: true }`, but the linking via
    // `associateAttachmentsToMessage` happens AFTER the create. The in-memory
    // `message.attachments` array therefore stays empty unless we refresh it.
    // Without that refresh, every message:new broadcast and every REST
    // response carries `attachments: []`, which on iOS causes the persistence
    // layer to overwrite optimistic attachment data with NULL — making the
    // user's audio/image disappear.
    const attachmentIds = [
      '507f1f77bcf86cd799439021',
      '507f1f77bcf86cd799439022'
    ];

    const mockLinkedAttachments = [
      {
        id: attachmentIds[0],
        messageId: testMessageId,
        fileName: 'photo-1.jpg',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 12345,
        fileUrl: '/uploads/photo-1.jpg',
        filePath: '/uploads/photo-1.jpg',
        thumbnailUrl: null,
        width: 800,
        height: 600,
        duration: null,
        bitrate: null,
        sampleRate: null,
        codec: null,
        channels: null,
        fps: null,
        videoCodec: null,
        pageCount: null,
        lineCount: null,
        metadata: null,
        uploadedBy: testUserId,
        isAnonymous: false,
        createdAt: new Date()
      },
      {
        id: attachmentIds[1],
        messageId: testMessageId,
        fileName: 'voice-note.m4a',
        originalName: 'voice-note.m4a',
        mimeType: 'audio/mp4',
        fileSize: 67890,
        fileUrl: '/uploads/voice-note.m4a',
        filePath: '/uploads/voice-note.m4a',
        thumbnailUrl: null,
        width: null,
        height: null,
        duration: 5000,
        bitrate: 128000,
        sampleRate: 44100,
        codec: 'aac',
        channels: 1,
        fps: null,
        videoCodec: null,
        pageCount: null,
        lineCount: null,
        metadata: null,
        uploadedBy: testUserId,
        isAnonymous: false,
        createdAt: new Date()
      }
    ];

    beforeEach(() => {
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
      // prisma.message.create returns the freshly-inserted row with the
      // include snapshot — at this moment attachments are NOT yet linked
      // (linking happens via updateMany right after). Mirror that real
      // behaviour by returning attachments: [] from the create.
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
      // associateAttachmentsToMessage mutates the DB rows
      mockPrisma.messageAttachment.updateMany = jest.fn().mockResolvedValue({
        count: attachmentIds.length
      });
      // After linking, a fresh findMany scoped to messageId MUST return the
      // linked rows. This is what saveMessage needs to merge into the
      // returned message.
      mockPrisma.messageAttachment.findMany = jest.fn().mockImplementation((args: any) => {
        const where = args?.where ?? {};
        if (where.messageId === testMessageId) {
          return Promise.resolve(mockLinkedAttachments);
        }
        if (where.id?.in) {
          // processAudioAttachments path — return only the audio row,
          // matched by id, with the select-shape fields it needs.
          return Promise.resolve(
            mockLinkedAttachments
              .filter((att) => where.id.in.includes(att.id))
              .map((att) => ({
                id: att.id,
                mimeType: att.mimeType,
                fileUrl: att.fileUrl,
                filePath: att.filePath,
                duration: att.duration,
                metadata: att.metadata
              }))
          );
        }
        return Promise.resolve([]);
      });
    });

    // REGRESSION GUARD for the read-after-write removal in commit 05c754c3.
    // This test fails on the pre-fix code (received attachments=[]) and
    // passes on the fix. See "ÉTAPE 4 bis" in MessageProcessor.saveMessage.
    it('should return the linked attachments on the saved message', async () => {
      const response = await service.handleMessage(
        {
          conversationId: testConversationId,
          content: '',
          attachmentIds
        } as MessageRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      const savedMessage = response.data as unknown as { attachments: Array<{ id: string }> };
      expect(Array.isArray(savedMessage.attachments)).toBe(true);
      expect(savedMessage.attachments).toHaveLength(attachmentIds.length);
      expect(savedMessage.attachments.map((a) => a.id).sort()).toEqual(
        [...attachmentIds].sort()
      );
    });

    // PREREQUISITE check (NOT a regression guard) — passes regardless of the
    // fix because handleAttachments() linking was never broken; the bug was
    // that the in-memory message.attachments array wasn't refreshed AFTER
    // the link. Kept here so future readers see the linking call is still
    // wired up; the regression guard is the test above.
    it('should call messageAttachment.updateMany to link attachments (prerequisite)', async () => {
      await service.handleMessage(
        {
          conversationId: testConversationId,
          content: '',
          attachmentIds
        } as MessageRequest,
        testParticipantId
      );

      expect(mockPrisma.messageAttachment.updateMany).toHaveBeenCalledWith({
        where: { id: { in: attachmentIds } },
        data: { messageId: testMessageId }
      });
    });

    // LE témoin du cycle. `handleMessage` est l'entrée COMMUNE du socket et de
    // `POST /conversations/:id/messages` — le chemin PRIMAIRE d'iOS. Le
    // comptage ne vivait que dans le handler socket : tout message parti par
    // REST n'était jamais compté, pendant que sa suppression décrémentait, et
    // les compteurs passaient sous zéro sans qu'aucun recalcul périodique ne
    // les relève. Ce test échoue sur le code d'avant : `onNewMessage` n'y était
    // pas appelé du tout depuis cette classe.
    it('crédite les compteurs de la conversation, quel que soit le tuyau', async () => {
      mockOnNewMessage.mockClear();

      await service.handleMessage(
        {
          conversationId: testConversationId,
          content: 'une légende',
          attachmentIds
        } as MessageRequest,
        testParticipantId
      );
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockOnNewMessage).toHaveBeenCalledTimes(1);
      const [, conversationId, authorKey, content, attachmentTokens] = mockOnNewMessage.mock.calls[0];
      expect(conversationId).toBe(testConversationId);
      // Crédité sous l'UTILISATEUR, pas sous son `Participant` — la clé de
      // `recompute()`, donc celle qui sera débitée à la suppression.
      expect(authorKey).toBe(testUserId);
      // Le contenu compté est celui qui est PERSISTÉ, pas celui de la requête.
      // C'est ce que relit `recompute()`, l'autorité — et la différence n'est
      // pas cosmétique : un message chiffré stocke `''`, si bien que compter la
      // requête ferait diverger l'incrément de son propre recalcul.
      expect(content).toBe('Test message content');
      // Les pièces jointes vues ici sont celles de l'ÉTAPE 4 bis (rafraîchies
      // après le lien). Lire le snapshot de `message.create` rendrait `[]` et
      // les compteurs image/audio ne monteraient jamais.
      expect(attachmentTokens).toEqual(['image', 'audio']);
    });
  });
});

describe('MessagingService - Tracking Links Processing', () => {
  let service: MessagingService;
  let mockPrisma: any;
  let mockTranslationService: any;

  const testUserId = '507f1f77bcf86cd799439011';
  const testParticipantId = '507f1f77bcf86cd799439099';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';

  const createMockMessage = (overrides: any = {}): any => ({
    id: testMessageId,
    conversationId: testConversationId,
    senderId: testUserId,
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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ language: 'en' })
    }) as any;
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'xyz789' });

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
        update: jest.fn()
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

    mockTranslationService = {
      handleNewMessage: mockHandleNewMessage
    };

    service = new MessagingService(
      mockPrisma as unknown as PrismaClient,
      mockTranslationService
    );
  });

  it('should process double bracket [[url]] tracking links', async () => {
    const content = 'Check this out: [[https://example.com/page]]';

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId: testUserId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      ...createMockMessage({ content: 'Check this out: m+xyz789' }),
      sender: { id: testUserId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId: testConversationId, content },
      testParticipantId
      );

    expect(response.success).toBe(true);
    // Le contenu passe par le traitement des liens explicites — c'est LUI qui
    // trouve ou crée le lien. L'assertion portait sur `findExistingTrackingLink`,
    // une étape INTERNE de l'algorithme que l'envoi recopiait ; il ne la recopie
    // plus, et un test qui nomme les pas d'un algorithme se casse dès qu'on le
    // range ailleurs.
    expect(mockProcessExplicitLinksInContent).toHaveBeenCalledWith(
      expect.objectContaining({ content, conversationId: testConversationId })
    );
  });

  it('should process angle bracket <url> tracking links', async () => {
    const content = 'Visit <https://example.com/special> now';

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId: testUserId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      ...createMockMessage({ content: 'Visit m+xyz789 now' }),
      sender: { id: testUserId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId: testConversationId, content },
      testParticipantId
      );

    expect(response.success).toBe(true);
    expect(mockProcessExplicitLinksInContent).toHaveBeenCalledWith(
      expect.objectContaining({ content, conversationId: testConversationId })
    );
  });

  it('should handle tracking link creation errors gracefully', async () => {
    const content = 'Check this: [[https://example.com/page]]';

    // Make tracking link creation fail
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockImplementation(() => {
      throw new Error('Tracking link creation failed');
    });

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId: testUserId,
      isActive: true
    });
    // Content should fallback to URL without brackets on error
    mockPrisma.message.create.mockResolvedValue({
      ...createMockMessage({ content: 'Check this: https://example.com/page' }),
      sender: { id: testUserId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId: testConversationId, content },
      testParticipantId
      );

    // Should still succeed - tracking errors shouldn't fail message
    expect(response.success).toBe(true);
  });

  it('should reuse existing tracking links for same URL', async () => {
    const content = 'Link: [[https://example.com/page]]';

    // Return existing tracking link
    mockFindExistingTrackingLink.mockResolvedValue({ token: 'existing123' });

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId: testUserId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      ...createMockMessage({ content: 'Link: m+existing123' }),
      sender: { id: testUserId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId: testConversationId, content },
      testParticipantId
      );

    expect(response.success).toBe(true);
    // Should not create new link when one exists
    expect(mockCreateTrackingLink).not.toHaveBeenCalled();
  });
});

describe('MessagingService - Mention Processing', () => {
  let service: MessagingService;
  let mockPrisma: any;
  let mockTranslationService: any;
  let mockNotificationService: any;

  const testUserId = '507f1f77bcf86cd799439011';
  const testParticipantId = '507f1f77bcf86cd799439099';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';

  const createMockMessage = (overrides: any = {}): any => ({
    id: testMessageId,
    conversationId: testConversationId,
    senderId: testUserId,
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
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({
      isValid: true,
      validUserIds: [],
      invalidUsernames: [],
      errors: []
    });
    mockCreateMentions.mockResolvedValue(undefined);

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
        update: jest.fn()
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

    mockTranslationService = {
      handleNewMessage: mockHandleNewMessage
    };

    mockNotificationService = {
      createMentionNotification: jest.fn().mockResolvedValue({ id: 'notif123' }),
      createMentionNotificationsBatch: jest.fn().mockResolvedValue(0)
    };

    service = new MessagingService(
      mockPrisma as unknown as PrismaClient,
      mockTranslationService,
      mockNotificationService
    );
  });

  it('should process mentions with mentionedUserIds from request', async () => {
    const mentionedUserIds = ['user456', 'user789'];

    mockValidateMentionPermissions.mockResolvedValue({
      isValid: true,
      validUserIds: mentionedUserIds,
      invalidUsernames: [],
      errors: []
    });
    mockPrisma.user.findMany.mockResolvedValue([
      { username: 'user1' },
      { username: 'user2' }
    ]);

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: testConversationId,
      type: 'private',
      title: 'Test Conv',
      members: [{ userId: testUserId }]
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId: testUserId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      ...createMockMessage({ content: 'Hey @user1 @user2!' }),
      sender: { id: testUserId, username: 'sender' },
      attachments: [],
      replyTo: null
    });
    mockPrisma.message.update.mockResolvedValue({});
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({
      username: 'sender',
      avatar: null
    });

    const response = await service.handleMessage(
      { conversationId: testConversationId, content: 'Hey @user1 @user2!', mentionedUserIds },
      testParticipantId
      );

    expect(response.success).toBe(true);
    expect(mockValidateMentionPermissions).toHaveBeenCalled();
    expect(mockCreateMentions).toHaveBeenCalled();
  });

  it('should handle mention validation errors gracefully', async () => {
    mockExtractMentions.mockReturnValue(['nonexistent']);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockImplementation(() => {
      throw new Error('Validation error');
    });

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: testConversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId: testUserId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      ...createMockMessage({ content: 'Hey @nonexistent!' }),
      sender: { id: testUserId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId: testConversationId, content: 'Hey @nonexistent!' },
      testParticipantId
      );

    // Should still succeed - mention errors shouldn't fail message
    expect(response.success).toBe(true);
  });
});

describe('MessagingService - Edge Cases', () => {
  let service: MessagingService;
  let mockPrisma: any;
  let mockTranslationService: any;
  const testParticipantId = '507f1f77bcf86cd799439099';
  const testConversationId = '507f1f77bcf86cd799439012';

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

    mockPrisma = {
      conversation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn()
      },
      participant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([])
      },
      message: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null)
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

    mockTranslationService = {
      handleNewMessage: mockHandleNewMessage
    };

    service = new MessagingService(
      mockPrisma as unknown as PrismaClient,
      mockTranslationService
    );
  });

  it('should handle Unicode content correctly', async () => {
    const unicodeContent = 'Hello World! Emojis and accents: cafe, nino';
    const conversationId = '507f1f77bcf86cd799439012';
    const userId = '507f1f77bcf86cd799439011';

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg123',
      conversationId,
      senderId: userId,
      content: unicodeContent,
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(),
      sender: { id: userId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId, content: unicodeContent },
      testParticipantId
      );

    expect(response.success).toBe(true);
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: unicodeContent.trim()
        })
      })
    );
  });

  it('should trim whitespace from content', async () => {
    const contentWithWhitespace = '   Test message with spaces   ';
    const conversationId = '507f1f77bcf86cd799439012';
    const userId = '507f1f77bcf86cd799439011';

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg123',
      conversationId,
      senderId: userId,
      content: contentWithWhitespace.trim(),
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(),
      sender: { id: userId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId, content: contentWithWhitespace },
      testParticipantId
      );

    expect(response.success).toBe(true);
    const createCall = mockPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.content).toBe('Test message with spaces');
  });

  it('should handle special characters in content', async () => {
    const specialContent = 'Test with <html> tags & "quotes" \'apostrophes\'';
    const conversationId = '507f1f77bcf86cd799439012';
    const userId = '507f1f77bcf86cd799439011';

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg123',
      conversationId,
      senderId: userId,
      content: specialContent,
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(),
      sender: { id: userId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId, content: specialContent },
      testParticipantId
      );

    expect(response.success).toBe(true);
  });

  it('should handle newlines and formatting in content', async () => {
    const formattedContent = 'Line 1\nLine 2\n\tIndented line';
    const conversationId = '507f1f77bcf86cd799439012';
    const userId = '507f1f77bcf86cd799439011';

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg123',
      conversationId,
      senderId: userId,
      content: formattedContent,
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(),
      sender: { id: userId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId, content: formattedContent },
      testParticipantId
      );

    expect(response.success).toBe(true);
    const createCall = mockPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.content).toContain('\n');
    expect(createCall.data.content).toContain('\t');
  });

  it('should handle exactly 4000 character content (boundary)', async () => {
    const exactLimitContent = 'A'.repeat(4000);
    const conversationId = '507f1f77bcf86cd799439012';
    const userId = '507f1f77bcf86cd799439011';

    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      type: 'private'
    });
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      userId,
      isActive: true
    });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg123',
      conversationId,
      senderId: userId,
      content: exactLimitContent,
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(),
      sender: { id: userId },
      attachments: [],
      replyTo: null
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const response = await service.handleMessage(
      { conversationId, content: exactLimitContent },
      testParticipantId
      );

    // Should succeed at exactly 2000 chars
    expect(response.success).toBe(true);
  });

  it('should handle message with only whitespace as empty', async () => {
    const whitespaceOnly = '   \t\n   ';
    const conversationId = '507f1f77bcf86cd799439012';
    const userId = '507f1f77bcf86cd799439011';

    const response = await service.handleMessage(
      { conversationId, content: whitespaceOnly },
      testParticipantId
      );

    expect(response.success).toBe(false);
    expect(response.error).toContain('empty');
  });

  describe('handleMessage — early clientMessageId dedup', () => {
    const CLIENT_MSG_ID = 'cid_550e8400-e29b-41d4-a716-446655440000';
    const SENDER_USER_ID = '507f1f77bcf86cd799439011';
    const BASE_MSG_ID = '507f1f77bcf86cd799439013';

    const makeExistingMsg = (overrides: Record<string, unknown> = {}) => ({
      id: BASE_MSG_ID,
      conversationId: testConversationId,
      senderId: testParticipantId,
      content: 'Hello',
      originalLanguage: 'en',
      messageType: 'text',
      replyToId: null,
      deletedAt: null,
      isEdited: false,
      validatedMentions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      clientMessageId: CLIENT_MSG_ID,
      translations: { fr: 'Bonjour' },
      sender: null,
      attachments: [],
      replyTo: null,
      ...overrides
    });

    beforeEach(() => {
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
        userId: SENDER_USER_ID
      });
    });

    it('returns success without calling message.create when existing record found', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(makeExistingMsg());

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello', clientMessageId: CLIENT_MSG_ID },
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientMessageId: CLIENT_MSG_ID })
        })
      );
    });

    it('returns the existing message id in the response on early dedup hit', async () => {
      const EXISTING_ID = '507f1f77bcf86cd799439099';
      mockPrisma.message.findFirst.mockResolvedValue(makeExistingMsg({ id: EXISTING_ID }));

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello', clientMessageId: CLIENT_MSG_ID },
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.data?.id).toBe(EXISTING_ID);
    });

    it('queues re-translation when existing record has no translations', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(makeExistingMsg({ translations: {} }));

      await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello', clientMessageId: CLIENT_MSG_ID },
        testParticipantId
      );

      expect(mockHandleNewMessage).toHaveBeenCalled();
    });

    it('proceeds normally (calls message.create) when clientMessageId not in DB', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);
      mockPrisma.message.create.mockResolvedValue({
        ...makeExistingMsg(),
        sender: { id: testParticipantId, displayName: 'Test User', avatar: null, role: 'member', isOnline: true, type: 'user', userId: SENDER_USER_ID, language: 'en' },
      });
      mockPrisma.conversation.update.mockResolvedValue({});

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello', clientMessageId: CLIENT_MSG_ID },
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).toHaveBeenCalled();
    });

    it('skips early dedup check when no clientMessageId is provided', async () => {
      mockPrisma.message.create.mockResolvedValue({
        ...makeExistingMsg({ clientMessageId: undefined }),
        sender: { id: testParticipantId, displayName: 'Test User', avatar: null, role: 'member', isOnline: true, type: 'user', userId: SENDER_USER_ID, language: 'en' },
      });
      mockPrisma.conversation.update.mockResolvedValue({});

      await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      expect(mockPrisma.message.findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ clientMessageId: expect.anything() }) })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // P2002 isDuplicate handling (lines 209-227)
  // ---------------------------------------------------------------------------

  describe('handleMessage — P2002 dedup (isDuplicate path)', () => {
    const CLIENT_MSG_ID = 'cid-p2002-test';
    const p2002Error = Object.assign(new Error('P2002'), { code: 'P2002' });
    const testUserId = '507f1f77bcf86cd799439011';
    const testMessageId = '507f1f77bcf86cd799439013';

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId, identifier: 'test-conv', type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId, type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId, conversationId: testConversationId,
        isActive: true, type: 'user', userId: testUserId
      });
    });

    const existingMsg = () => ({
      id: testMessageId, conversationId: testConversationId,
      senderId: testParticipantId, content: 'Hello',
      originalLanguage: 'en', messageType: 'text', replyToId: null,
      deletedAt: null, isEdited: false, validatedMentions: [],
      createdAt: new Date(), updatedAt: new Date(),
      clientMessageId: CLIENT_MSG_ID,
      translations: { fr: 'Bonjour' },
      sender: null, attachments: [], replyTo: null,
    });

    it('returns success from deduplicated message when P2002 fires (lines 209-227)', async () => {
      // Early dedup: miss (no existing message yet on first findFirst)
      mockPrisma.message.findFirst.mockResolvedValueOnce(null);
      // create throws P2002
      mockPrisma.message.create.mockRejectedValueOnce(p2002Error);
      // MessageProcessor P2002 recovery findFirst returns existing message
      mockPrisma.message.findFirst.mockResolvedValueOnce(existingMsg());

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello', clientMessageId: CLIENT_MSG_ID },
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    });

    it('queues re-translation when isDuplicate and translations are empty (line 211)', async () => {
      mockPrisma.message.findFirst.mockResolvedValueOnce(null);
      mockPrisma.message.create.mockRejectedValueOnce(p2002Error);
      // Recovery returns message with null translations → triggers re-translation
      mockPrisma.message.findFirst.mockResolvedValueOnce({
        ...existingMsg(),
        translations: null,
      });

      await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello', clientMessageId: CLIENT_MSG_ID },
        testParticipantId
      );

      // queueTranslation runs in the background — flush microtasks
      await Promise.resolve();
      await Promise.resolve();

      expect(mockHandleNewMessage).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // runPostSaveSideEffects error paths (lines 286, 292, 296, 300)
  // ---------------------------------------------------------------------------

  describe('handleMessage — runPostSaveSideEffects error paths', () => {
    const testUserId = '507f1f77bcf86cd799439011';
    const testMessageId = '507f1f77bcf86cd799439013';

    const baseMsg = () => ({
      id: testMessageId, conversationId: testConversationId,
      senderId: testParticipantId, content: 'Hello',
      originalLanguage: 'en', messageType: 'text', replyToId: null,
      deletedAt: null, isEdited: false, validatedMentions: [],
      createdAt: new Date(), updatedAt: new Date(),
      sender: { id: testParticipantId, displayName: 'Test', avatar: null, role: 'member', isOnline: true, type: 'user', userId: testUserId, language: 'en' },
      attachments: [], replyTo: null,
    });

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId, identifier: 'test-conv', type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId, type: 'private'
      });
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: testParticipantId, conversationId: testConversationId,
        isActive: true, type: 'user', userId: testUserId
      });
      mockPrisma.message.create.mockResolvedValue(baseMsg());
    });

    it('logs error and still returns success when updateConversation fails (line 286)', async () => {
      mockPrisma.conversation.update.mockRejectedValue(new Error('conv update fail'));

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      // Flush background promises
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      expect(response.success).toBe(true);
    });

    it('logs error and still returns success when markMessagesAsRead fails (line 292)', async () => {
      mockPrisma.conversation.update.mockResolvedValue({});
      mockMarkMessagesAsRead.mockRejectedValue(new Error('read status fail'));

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      expect(response.success).toBe(true);
    });

    it('logs error and still returns success when queueTranslation fails (line 296)', async () => {
      mockPrisma.conversation.update.mockResolvedValue({});
      mockHandleNewMessage.mockRejectedValue(new Error('translation fail'));

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      expect(response.success).toBe(true);
    });

    it('logs error and still returns success when updateStats fails (lines 300, 385-389)', async () => {
      mockPrisma.conversation.update.mockResolvedValue({});
      mockUpdateOnNewMessage.mockRejectedValue(new Error('stats fail'));

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      expect(response.success).toBe(true);
    });

    it('flips firstMessageSentAt when it is currently null, without touching the unconditional lastMessageAt bump', async () => {
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversation.updateMany.mockResolvedValue({ count: 1 });

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      // Flush background promises — mêmes 3 `await Promise.resolve()` que le
      // test voisin « logs error and still returns success when
      // updateConversation fails », runPostSaveSideEffects étant fire-and-forget.
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      expect(response.success).toBe(true);
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lastMessageAt: expect.any(Date) } })
      );
      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: testConversationId, firstMessageSentAt: null }),
          data: expect.objectContaining({ firstMessageSentAt: expect.any(Date) }),
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // ensureParticipantFromMember (lines 505-561)
  // ---------------------------------------------------------------------------

  describe('handleMessage — ensureParticipantFromMember auto-create', () => {
    const testUserId = '507f1f77bcf86cd799439011';
    const testMessageId = '507f1f77bcf86cd799439013';

    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId, identifier: 'test-conv', type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId, type: 'private'
      });
      // findUnique returns null → triggers ensureParticipantFromMember
      mockPrisma.participant.findUnique.mockResolvedValue(null);
      // findFirst also returns null
      mockPrisma.participant.findFirst.mockResolvedValue(null);
    });

    it('auto-creates participant from legacy ConversationMember (lines 505-558)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUserId, username: 'alice', displayName: 'Alice',
        firstName: 'Alice', lastName: null, avatar: null, systemLanguage: 'fr'
      });
      (mockPrisma as any).$runCommandRaw = jest.fn().mockResolvedValue({
        cursor: {
          firstBatch: [{ role: 'MEMBER', canSendMessage: true, canSendFiles: true, canSendImages: true, canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false, joinedAt: null }]
        }
      });
      const newParticipant = { id: 'new-participant-id', conversationId: testConversationId, isActive: true };
      mockPrisma.participant.create = jest.fn().mockResolvedValue(newParticipant);

      mockPrisma.message.create.mockResolvedValue({
        id: testMessageId, conversationId: testConversationId,
        senderId: 'new-participant-id', content: 'Hello',
        originalLanguage: 'en', messageType: 'text', replyToId: null,
        deletedAt: null, isEdited: false, validatedMentions: [],
        createdAt: new Date(), updatedAt: new Date(),
        sender: { id: 'new-participant-id', displayName: 'Alice', avatar: null, role: 'member', isOnline: true, type: 'user', userId: testUserId, language: 'fr' },
        attachments: [], replyTo: null,
      });
      mockPrisma.conversation.update.mockResolvedValue({});

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.participant.create).toHaveBeenCalled();
    });

    it('returns null and falls through to permission error when user not found (line 502)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (mockPrisma as any).$runCommandRaw = jest.fn().mockResolvedValue({
        cursor: { firstBatch: [] }
      });

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      // participant is null → permissions error
      expect(response.success).toBe(false);
    });

    it('returns null when legacy member not found (line 516)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUserId, username: 'alice', displayName: 'Alice',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'fr'
      });
      (mockPrisma as any).$runCommandRaw = jest.fn().mockResolvedValue({
        cursor: { firstBatch: [] }
      });

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      expect(response.success).toBe(false);
    });

    it('catches and returns null on error in ensureParticipantFromMember (lines 559-561)', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));
      (mockPrisma as any).$runCommandRaw = jest.fn();

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Hello' },
        testParticipantId
      );

      expect(response.success).toBe(false);
    });
  });
});
