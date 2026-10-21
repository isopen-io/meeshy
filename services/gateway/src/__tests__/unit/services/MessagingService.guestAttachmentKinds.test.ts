/**
 * `MessagingService.handleMessage` — à l'ENVOI, sur la route REST canonique
 * comme sur `message:send-with-attachments` (les deux convergent ici), un
 * invité d'un lien à familles (#10001, World Wide) ne rattache que les
 * familles du lien. La décision ne lit ni `allowAnonymousFiles` ni
 * l'instantané du join (#10029) : un invité entré quand le lien fermait la
 * porte des fichiers joint quand même son `.txt`. Seul un refus EXPLICITE de
 * l'hôte (`anonymousSession.rights`) reste souverain. Un compte n'est jamais
 * concerné. Un TRANSFERT ou une DIFFUSION porte les pièces de sa source : elles
 * passent la même garde que les pièces rattachées (#10051).
 *
 * Même harnais que `MessagingService.attachmentRights.test.ts`.
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

jest.mock('../../../services/messaging/messageReadAccess', () => ({
  ...(jest.requireActual('../../../services/messaging/messageReadAccess') as object),
  loadMessageReadableByParticipant: jest.fn(async () => ({
    id: '507f1f77bcf86cd799439099', conversationId: '507f1f77bcf86cd799439012', createdAt: new Date(), deletedAt: null,
    replyToId: null, senderId: '507f1f77bcf86cd799439098', ephemeralDuration: null, effectFlags: 0,
    expiresAt: null, isViewOnce: false, viewOnceBurnedAt: null
  }))
}));

import { MessagingService } from '../../../services/MessagingService';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';

describe('MessagingService.handleMessage — familles des pièces jointes d’un invité (#10001)', () => {
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

  /** Un invité entré dans World Wide : l'instantané du join ferme `canSendFiles` (lien semé `allowAnonymousFiles: false`). */
  const worldGuest = (rights: Record<string, boolean> | null = null) => ({
    id: testParticipantId,
    conversationId: testConversationId,
    isActive: true,
    permissions: {
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: false,
      canSendVideos: false,
      canSendAudios: true
    },
    anonymousSession: { shareLinkId: 'sharelink-world', rights }
  });

  const account = () => ({
    id: testParticipantId,
    conversationId: testConversationId,
    isActive: true,
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true
    },
    anonymousSession: null
  });

  const WORLD_LINK = { allowedAttachmentKinds: ['text', 'audio'], conversation: { identifier: 'world' } };

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
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      conversationShareLink: { findUnique: jest.fn().mockResolvedValue(WORLD_LINK) }
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

  it('rattache un .txt d’un invité de World Wide, que l’instantané du join fermait', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'text/plain' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.conversationShareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sharelink-world' },
        select: expect.objectContaining({ allowedAttachmentKinds: true, conversation: { select: { identifier: true } } })
      })
    );
  });

  it('rattache un vocal d’un invité de World Wide', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'audio/webm' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(true);
  });

  it.each([['image/jpeg'], ['application/pdf'], ['video/mp4'], ['image/svg+xml']])(
    'refuse une pièce %s d’un invité de World Wide, avec un code stable, sans créer le message',
    async (mimeType) => {
      mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());
      mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'audio/webm' }, { mimeType }]);

      const response = await service.handleMessage(requestWithAttachments([testAttachmentId, 'other-att']), testParticipantId);

      expect(response.success).toBe(false);
      expect((response as unknown as { code?: string }).code).toBe('GUEST_ATTACHMENT_KIND_NOT_ALLOWED');
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    }
  );

  it('un refus EXPLICITE de l’hôte reste souverain sur une famille ouverte', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(worldGuest({ canSendAudios: false }));
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'audio/webm' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(false);
    expect((response as unknown as { code?: string }).code).toBe('ATTACHMENT_RIGHT_NOT_PERMITTED');
  });

  it('un compte dans World Wide rattache une image : la liste ne vise que les invités', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(account());
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'image/jpeg' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
  });

  it('un invité d’un lien SANS familles garde la règle d’avant : l’instantané décide', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());
    mockPrisma.conversationShareLink.findUnique.mockResolvedValue({ allowedAttachmentKinds: [], conversation: { identifier: 'team' } });
    mockPrisma.messageAttachment.findMany.mockResolvedValue([{ mimeType: 'text/plain' }]);

    const response = await service.handleMessage(requestWithAttachments(), testParticipantId);

    expect(response.success).toBe(false);
    expect((response as unknown as { code?: string }).code).toBe('ATTACHMENT_RIGHT_NOT_PERMITTED');
  });

  it('demande l’identifiant du lien avec la participation, pour ne rien relire de plus quand il n’y a pas de pièce', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());

    await service.handleMessage({ conversationId: testConversationId, content: 'Bonjour' }, testParticipantId);

    expect(mockPrisma.participant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ anonymousSession: { select: { rights: true, shareLinkId: true } } })
      })
    );
    expect(mockPrisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
  });

  describe('le TRANSFERT et la DIFFUSION portent les pièces de leur source (#10051)', () => {
    const SOURCE_ID = '507f1f77bcf86cd799439099';

    type StoredAttachment = { id: string; messageId: string; mimeType: string };

    const sourceAttachment = (mimeType: string): StoredAttachment => ({ id: `src-${mimeType}`, messageId: SOURCE_ID, mimeType });

    const matches = (row: StoredAttachment, where: any): boolean => {
      if (!where) return true;
      if (Array.isArray(where.OR)) return where.OR.some((clause: any) => matches(row, clause));
      const fieldMatches = (value: string, condition: any) =>
        condition === undefined || (typeof condition === 'string' ? value === condition : condition.in.includes(value));
      return fieldMatches(row.id, where.id) && fieldMatches(row.messageId, where.messageId);
    };

    const storeAttachments = (rows: readonly StoredAttachment[]) => {
      mockPrisma.messageAttachment.findMany.mockImplementation(async (args: any) =>
        rows.filter((row) => matches(row, args?.where)).map((row) => ({
          ...row, fileName: 'f', originalName: 'f', fileUrl: 'u', filePath: 'p', fileSize: 10
        })));
      mockPrisma.messageAttachment.create = jest.fn(async ({ data }: any) => ({ id: 'copy', ...data }));
    };

    const readableSource = () =>
      mockPrisma.message.findUnique.mockResolvedValue({
        isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null,
        attachments: [{ isViewOnce: false, isBlurred: false, effectFlags: 0 }], _count: { attachments: 1 },
        messageType: 'image', metadata: null, sender: { id: testParticipantId, userId: null },
        isEncrypted: false, encryptionMode: null, conversation: { encryptionEnabledAt: null, encryptionMode: null },
      });

    const copiedMimeTypes = () =>
      (mockPrisma.messageAttachment.create?.mock?.calls ?? []).map((call: any) => call[0].data.mimeType);

    it.each([['image/jpeg'], ['application/pdf'], ['video/mp4']])(
      'refuse à un invité de World Wide le transfert d’un message portant une pièce %s, sans rien créer ni recopier',
      async (mimeType) => {
        mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());
        storeAttachments([sourceAttachment(mimeType)]);
        readableSource();

        const response = await service.handleMessage(
          { conversationId: testConversationId, content: '', forwardedFromId: SOURCE_ID },
          testParticipantId
        );

        expect(response.success).toBe(false);
        expect((response as unknown as { code?: string }).code).toBe('GUEST_ATTACHMENT_KIND_NOT_ALLOWED');
        expect(mockPrisma.message.create).not.toHaveBeenCalled();
        expect(copiedMimeTypes()).toEqual([]);
      }
    );

    it('refuse à un invité de World Wide la diffusion d’un message portant une image', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());
      storeAttachments([sourceAttachment('image/png')]);
      readableSource();

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: '', copyAttachmentsFromMessageId: SOURCE_ID },
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect((response as unknown as { code?: string }).code).toBe('GUEST_ATTACHMENT_KIND_NOT_ALLOWED');
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it.each([['audio/mpeg'], ['text/plain']])('laisse un invité de World Wide transférer une pièce %s, famille ouverte', async (mimeType) => {
      mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());
      storeAttachments([sourceAttachment(mimeType)]);
      readableSource();

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: '', forwardedFromId: SOURCE_ID },
        testParticipantId
      );

      expect(response.success).toBe(true);
    });

    it('laisse un invité de World Wide transférer un message de texte seul', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue(worldGuest());
      storeAttachments([]);
      readableSource();

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Bonjour', forwardedFromId: SOURCE_ID },
        testParticipantId
      );

      expect(response.success).toBe(true);
    });

    it('un compte de World Wide transfère une image, et la copie la porte', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue(account());
      storeAttachments([sourceAttachment('image/jpeg')]);
      readableSource();

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: '', forwardedFromId: SOURCE_ID },
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(copiedMimeTypes()).toEqual(['image/jpeg']);
      expect(mockPrisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
    });
  });
});
