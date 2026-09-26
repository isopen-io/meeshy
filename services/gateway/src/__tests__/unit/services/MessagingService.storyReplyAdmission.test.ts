/**
 * `MessagingService.handleMessage` — admission de `storyReplyToId` (#7882).
 *
 * FICHIER SÉPARÉ, délibérément — `MessagingService.test.ts` est une suite
 * héritée hors budget (§ `gateway-test-file-size-budget.test.ts`, #4531).
 *
 * Les trois transports d'envoi (REST, socket texte, socket pièces jointes)
 * convergent sur `handleMessage`, qui transmet `storyReplyToId` à
 * `MessageProcessor.saveMessage` : c'est là que l'instantané du post est gelé
 * dans `metadata.postReplyTo` puis diffusé aux membres. Ces témoins passent par
 * le VRAI service — un refus doit empêcher l'écriture, pas seulement la
 * fonction pure de rendre `ok: false`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';

const mockHandleNewMessage = jest.fn();
const mockUpdateOnNewMessage = jest.fn();
const mockProcessExplicitLinksInContent = jest.fn(
  async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })
);

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
    findExistingTrackingLink: jest.fn(async () => null),
    createTrackingLink: jest.fn(async () => ({ token: 'abc123' })),
    processExplicitLinksInContent: mockProcessExplicitLinksInContent,
    collectContentTrackingLinks: jest.fn(async () => [])
  }))
}));

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn().mockReturnValue([]),
    extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
    resolveUsernames: jest.fn(async () => new Map()),
    validateMentionPermissions: jest.fn(async () => ({
      isValid: true, validUserIds: [], invalidUsernames: [], errors: []
    })),
    createMentions: jest.fn(async () => undefined)
  }))
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: jest.fn(async () => undefined),
    getUnreadCount: jest.fn(async () => 0)
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

describe('MessagingService.handleMessage — admission de storyReplyToId (#7882)', () => {
  let service: MessagingService;
  let mockPrisma: any;

  const conversationId = '507f1f77bcf86cd799439012';
  const messageId = '507f1f77bcf86cd799439013';
  const senderParticipantId = '507f1f77bcf86cd799439014';
  const storyId = '507f1f77bcf86cd799439015';
  const authorUserId = '507f1f77bcf86cd799439016';
  const senderUserId = '507f1f77bcf86cd799439018';

  const createdMessage = (overrides: Partial<Message> = {}): any => ({
    id: messageId,
    conversationId,
    senderId: senderParticipantId,
    content: 'Jolie story !',
    originalLanguage: 'fr',
    messageType: 'text',
    replyToId: null,
    deletedAt: null,
    isEdited: false,
    validatedMentions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  const storyReply: MessageRequest = {
    conversationId,
    content: 'Jolie story !',
    originalLanguage: 'fr',
    storyReplyToId: storyId
  };

  const story = {
    id: storyId, authorId: authorUserId, deletedAt: null,
    visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null
  };

  const authorMembership = (row: { id: string; bannedAt: Date | null } | null) =>
    mockPrisma.participant.findFirst.mockImplementation(async (args: { where: { userId?: string } }) =>
      args.where.userId === authorUserId ? row : null
    );

  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ language: 'fr' })
    }) as any;

    mockHandleNewMessage.mockResolvedValue(undefined);
    mockUpdateOnNewMessage.mockResolvedValue({ messageCount: 10, participantCount: 2 });

    mockPrisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: conversationId, type: 'direct' }),
        findFirst: jest.fn().mockResolvedValue({ id: conversationId, identifier: 'dm', type: 'direct' }),
        update: jest.fn().mockResolvedValue({ id: conversationId, lastMessageAt: new Date() })
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({
          id: senderParticipantId,
          conversationId,
          isActive: true,
          userId: senderUserId
        }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([])
      },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      postMention: { findUnique: jest.fn().mockResolvedValue(null) },
      post: {
        findUnique: jest.fn().mockResolvedValue(story)
      },
      message: {
        create: jest.fn().mockResolvedValue({
          ...createdMessage(),
          sender: {
            id: senderParticipantId, displayName: 'Lecteur', avatar: null, role: 'member',
            isOnline: true, type: 'user', userId: undefined, language: 'fr'
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
      messageAttachment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) }
    };

    service = new MessagingService(
      mockPrisma as unknown as PrismaClient,
      { handleNewMessage: mockHandleNewMessage } as any,
      {
        createMentionNotification: jest.fn().mockResolvedValue({ id: 'notif123' }),
        createMentionNotificationsBatch: jest.fn().mockResolvedValue(0)
      } as any
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refuse la citation de la story d’un tiers dans une conversation où il n’est pas, sans rien écrire', async () => {
    authorMembership(null);

    const response = await service.handleMessage(storyReply, senderParticipantId);

    expect(response.success).toBe(false);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('#7951 — refuse, sans rien écrire, une réponse dans un GROUPE dont l’auteur est membre actif', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: conversationId, type: 'group' });
    authorMembership({ id: '507f1f77bcf86cd799439017', bannedAt: null });

    const response = await service.handleMessage(storyReply, senderParticipantId);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Une réponse à une story ne vit que dans la conversation directe de son auteur');
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse la citation d’une story supprimée, sans rien écrire', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ ...story, deletedAt: new Date() });
    authorMembership({ id: '507f1f77bcf86cd799439017', bannedAt: null });

    const response = await service.handleMessage(storyReply, senderParticipantId);

    expect(response.success).toBe(false);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('écrit la réponse quand l’auteur de la story est membre actif de la conversation', async () => {
    authorMembership({ id: '507f1f77bcf86cd799439017', bannedAt: null });

    const response = await service.handleMessage(storyReply, senderParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    const written = mockPrisma.message.create.mock.calls[0][0].data;
    expect(written.storyReplyToId).toBe(storyId);
  });

  it('refuse, sans rien écrire, la citation d’une story FRIENDS par un non-ami de l’auteur', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ ...story, visibility: 'FRIENDS' });
    authorMembership({ id: '507f1f77bcf86cd799439017', bannedAt: null });

    const response = await service.handleMessage(storyReply, senderParticipantId);

    expect(response.success).toBe(false);
    expect(response.error).toBe('La story citée n’est pas visible par l’expéditeur');
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('écrit la réponse d’un ami de l’auteur à sa story FRIENDS', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ ...story, visibility: 'FRIENDS' });
    mockPrisma.friendRequest.findFirst.mockResolvedValue({ id: '507f1f77bcf86cd799439019' });
    authorMembership({ id: '507f1f77bcf86cd799439017', bannedAt: null });

    const response = await service.handleMessage(storyReply, senderParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('refuse, sans rien écrire, un expéditeur ANONYME qui cite une story', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: senderParticipantId, conversationId, isActive: true, userId: null
    });
    authorMembership({ id: '507f1f77bcf86cd799439017', bannedAt: null });

    const response = await service.handleMessage(storyReply, senderParticipantId);

    expect(response.success).toBe(false);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('un envoi sans storyReplyToId ne relit aucun post', async () => {
    const response = await service.handleMessage(
      { conversationId, content: 'Bonjour', originalLanguage: 'fr' },
      senderParticipantId
    );

    expect(response.success).toBe(true);
    expect(mockPrisma.post.findUnique).not.toHaveBeenCalled();
  });
});
