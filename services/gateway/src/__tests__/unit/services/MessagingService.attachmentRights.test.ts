/**
 * `MessagingService.handleMessage` — droits DE PIÈCE JOINTE (#5151).
 *
 * FICHIER SÉPARÉ, comme `MessagingService.writePermission.test.ts` (#4855) :
 * `MessagingService.test.ts` est hors budget, un comportement nouveau rejoint
 * un fichier à sa taille plutôt que le tas (§ `gateway-test-file-size-budget.test.ts`).
 *
 * `canSendFiles`/`canSendImages`/`canSendVideos`/`canSendAudios` gouvernent ce
 * qu'on a le droit de JOINDRE — distinct de `canSendMessages`, qui gouverne ce
 * qu'on a le droit d'ÉCRIRE. Un participant peut avoir `canSendMessages: true`
 * et `canSendImages: false` : `upload.ts` ne gardait que le TÉLÉVERSEMENT du
 * fichier, jamais son admission au moment où il est RATTACHÉ à un message
 * envoyé par la route REST canonique ou par `message:send-with-attachments`
 * (les deux convergent sur `handleMessage`).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';

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

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({
    handleNewMessage: mockHandleNewMessage
  }))
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: mockUpdateOnNewMessage
  }
}));

const mockOnNewMessage: any = jest.fn(async () => undefined);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onNewMessage: (...a: any[]) => mockOnNewMessage(...a)
  }
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: mockFindExistingTrackingLink,
    createTrackingLink: mockCreateTrackingLink,
    processExplicitLinksInContent: mockProcessExplicitLinksInContent,
    collectContentTrackingLinks: jest.fn(async () => [])
  }))
}));

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

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: mockMarkMessagesAsRead,
    getUnreadCount: mockGetUnreadCount
  }))
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

import { MessagingService } from '../../../services/MessagingService';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';

describe('MessagingService.handleMessage — droits DE PIÈCE JOINTE (#5151)', () => {
  let service: MessagingService;
  let mockPrisma: any;
  let mockTranslationService: any;
  let mockNotificationService: any;

  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';
  const testParticipantId = '507f1f77bcf86cd799439014';
  const testAttachmentId = '507f1f77bcf86cd799439055';

  const createMockMessage = (overrides: Partial<Message> = {}): any => ({
    id: testMessageId,
    conversationId: testConversationId,
    senderId: testParticipantId,
    content: '',
    originalLanguage: 'en',
    messageType: 'image',
    replyToId: null,
    deletedAt: null,
    isEdited: false,
    validatedMentions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  const requestWithAttachments = (attachmentIds: string[] = [testAttachmentId]): MessageRequest => ({
    conversationId: testConversationId,
    content: '',
    attachmentIds
  });

  const participantWithRights = (overrides: {
    permissions?: Record<string, boolean>;
    rights?: Record<string, boolean>;
  }) => ({
    id: testParticipantId,
    conversationId: testConversationId,
    isActive: true,
    type: 'anonymous',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      ...overrides.permissions
    },
    ...(overrides.rights ? { anonymousSession: { rights: overrides.rights } } : {})
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ language: 'en' })
    }) as any;

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

    mockPrisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: testConversationId, type: 'private' }),
        findFirst: jest.fn().mockResolvedValue({ id: testConversationId, identifier: 'test-conv', type: 'private' }),
        update: jest.fn().mockResolvedValue({ id: testConversationId, lastMessageAt: new Date() })
      },
      participant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([])
      },
      message: {
        create: jest.fn().mockResolvedValue({
          ...createMockMessage(),
          sender: {
            id: testParticipantId, displayName: 'Test User', avatar: null, role: 'member',
            isOnline: true, type: 'user', userId: undefined, language: 'en'
          },
          attachments: [],
          replyTo: null
        }),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null)
      },
      trackingLink: { updateMany: jest.fn() },
      messageAttachment: {
        findMany: jest.fn().mockResolvedValue([{ mimeType: 'image/jpeg' }])
      },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) }
    };

    mockTranslationService = { handleNewMessage: mockHandleNewMessage };
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("refuse une IMAGE quand l'hôte a fermé canSendImages APRÈS le join, sans créer le message", async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ rights: { canSendImages: false } })
    );
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'image/jpeg' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(false);
    expect((response as unknown as { code?: string }).code).toBe('ATTACHMENT_RIGHT_NOT_PERMITTED');
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse dès l’instantané, sans surcharge, pour une VIDÉO', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ permissions: { canSendVideos: false } })
    );
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'video/mp4' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(false);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse un AUDIO fermé', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ permissions: { canSendAudios: false } })
    );
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'audio/mp3' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(false);
  });

  it('refuse un FICHIER générique (document, mimeType inconnu) fermé via canSendFiles', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ permissions: { canSendFiles: false } })
    );
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'application/pdf' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(false);
  });

  // Non-régression : `canSendFiles` ouvert ne doit PAS servir de laissez-passer
  // implicite pour une image — chaque type reste gouverné par son propre droit.
  it('un canSendFiles OUVERT ne contourne pas un canSendImages FERMÉ', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ permissions: { canSendFiles: true, canSendImages: false } })
    );
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'image/png' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(false);
  });

  it('laisse envoyer une image quand canSendImages est ouvert', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(participantWithRights({}));
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'image/jpeg' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
  });

  it("refuse quand UNE SEULE des plusieurs pièces jointes porte un type fermé", async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ permissions: { canSendAudios: false } })
    );
    mockPrisma.messageAttachment.findMany.mockResolvedValue([
      { mimeType: 'image/jpeg' },
      { mimeType: 'audio/mp3' }
    ]);

    const response = await service.handleMessage(
      requestWithAttachments([testAttachmentId, 'other-att-id']),
      testParticipantId
    );

    expect(response.success).toBe(false);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  // Non-régression : sans `attachmentIds`, la garde ne doit ni lever, ni
  // interroger `messageAttachment.findMany`.
  it("n'interroge pas les pièces jointes quand la requête n'en porte aucune", async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ permissions: { canSendImages: false } })
    );

    const response = await service.handleMessage(
      { conversationId: testConversationId, content: 'Bonjour' },
      testParticipantId
    );

    expect(response.success).toBe(true);
    expect(mockPrisma.messageAttachment.findMany).not.toHaveBeenCalled();
  });

  // Un participant chargé SANS `permissions` (auto-création legacy) n'est pas
  // refusé par une simple absence — la garde n'a même pas de base pour décider,
  // et la loi générale de ce module est « seul un refus EXPLICITE bloque ».
  it('n’est jamais refusé quand `permissions` est absent de la ligne chargée', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      isActive: true
    });

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(true);
  });
});
