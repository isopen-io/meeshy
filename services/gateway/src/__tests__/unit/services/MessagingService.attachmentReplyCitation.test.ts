/**
 * #9909 — UNE RÉPONSE À UNE PIÈCE ENVOYÉE PAR SOCKET GARDE LA PIÈCE CITÉE.
 *
 * Les trois transports d'envoi (REST, `message:send`,
 * `message:send-with-attachments`) convergent sur
 * `MessagingService.handleMessage`. La route REST admettait la pièce nommée
 * elle-même ; les deux chemins socket la perdaient (schéma qui strippe, puis
 * admission qui ne lisait que `replyToId`). La garde se lit désormais ICI, au
 * point de convergence, avec la pièce : ce que le transport a reçu du client
 * n'est jamais ce qui s'écrit — seul l'instantané ADMIS (nature dérivée du
 * MIME relu) atteint `metadata.attachmentReplyTo`.
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

describe('#9909 — handleMessage admet la pièce citée, quel que soit le transport', () => {
  const USER = '507f1f77bcf86cd799439011';
  const CONV = '507f1f77bcf86cd799439012';
  const PARTICIPANT = '507f1f77bcf86cd799439014';
  const CITED = '507f1f77bcf86cd799439020';
  const OTHER_MESSAGE = '507f1f77bcf86cd799439021';
  const OWN_PIECE = '507f1f77bcf86cd799439030';
  const FOREIGN_PIECE = '507f1f77bcf86cd799439031';

  const makeService = () => {
    const prisma: any = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: CONV, type: 'private' }),
        findFirst: jest.fn().mockResolvedValue({ id: CONV, identifier: 'c', type: 'private' }),
        update: jest.fn().mockResolvedValue({ id: CONV }),
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({ id: PARTICIPANT, conversationId: CONV, isActive: true, type: 'user', userId: USER }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: '507f1f77bcf86cd799439099', ...data, createdAt: new Date(), updatedAt: new Date(),
          validatedMentions: [], deletedAt: null, isEdited: false,
          sender: { id: PARTICIPANT, displayName: 'A', avatar: null, type: 'user', userId: USER },
          attachments: [], replyTo: null,
        })),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) =>
          where?.id === CITED
            ? { id: CITED, conversationId: CONV, deletedAt: null, messageType: 'audio', metadata: null }
            : null
        ),
      },
      messageAttachment: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where?.id === OWN_PIECE) return { id: OWN_PIECE, messageId: CITED, mimeType: 'audio/mp4' };
          if (where?.id === FOREIGN_PIECE) return { id: FOREIGN_PIECE, messageId: OTHER_MESSAGE, mimeType: 'image/jpeg' };
          return null;
        }),
      },
      trackingLink: { updateMany: jest.fn() },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MessagingService(
      prisma as unknown as PrismaClient,
      { handleNewMessage: mockHandleNewMessage } as any,
      { createMentionNotification: jest.fn(), createMentionNotificationsBatch: jest.fn().mockResolvedValue(0) } as any
    );
    return { service, prisma };
  };

  const send = (over: Partial<MessageRequest>): MessageRequest => ({
    conversationId: CONV,
    content: 'celle-là',
    originalLanguage: 'fr',
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockUpdateOnNewMessage.mockResolvedValue({ messageCount: 1, participantCount: 2 });
    mockExtractMentions.mockReturnValue([]);
    mockGetUnreadCount.mockResolvedValue(0);
    mockMarkMessagesAsRead.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('admet la pièce du message cité et grave l’instantané ADMIS — nature relue du MIME, jamais celle que le client déclare', async () => {
    const { service, prisma } = makeService();

    const response = await service.handleMessage(
      send({ replyToId: CITED, attachmentReplyTo: { attachmentId: OWN_PIECE, kind: 'file' } }),
      PARTICIPANT
    );

    expect(response.success).toBe(true);
    const written = prisma.message.create.mock.calls[0][0].data;
    expect(written.metadata.attachmentReplyTo).toEqual({ attachmentId: OWN_PIECE, kind: 'audio' });
  });

  it('admet la forme que le socket reçoit — { attachmentId } seul, sans nature', async () => {
    const { service, prisma } = makeService();

    const response = await service.handleMessage(
      send({ replyToId: CITED, attachmentReplyTo: { attachmentId: OWN_PIECE } }),
      PARTICIPANT
    );

    expect(response.success).toBe(true);
    expect(prisma.message.create.mock.calls[0][0].data.metadata.attachmentReplyTo)
      .toEqual({ attachmentId: OWN_PIECE, kind: 'audio' });
  });

  it('refuse une pièce ÉTRANGÈRE au message cité — et n’écrit aucune ligne', async () => {
    const { service, prisma } = makeService();

    const response = await service.handleMessage(
      send({ replyToId: CITED, attachmentReplyTo: { attachmentId: FOREIGN_PIECE } }),
      PARTICIPANT
    );

    expect(response.success).toBe(false);
    expect(response.error).toBe('La pièce jointe citée n’appartient pas au message cité');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse une pièce nommée SANS replyToId — et n’écrit aucune ligne', async () => {
    const { service, prisma } = makeService();

    const response = await service.handleMessage(
      send({ attachmentReplyTo: { attachmentId: OWN_PIECE } }),
      PARTICIPANT
    );

    expect(response.success).toBe(false);
    expect(response.error).toBe('Citer une pièce jointe exige de citer le message qui la porte');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('un ancien client qui ne nomme aucune pièce répond toujours — sans instantané gravé, sans lecture de pièce', async () => {
    const { service, prisma } = makeService();

    const response = await service.handleMessage(send({ replyToId: CITED }), PARTICIPANT);

    expect(response.success).toBe(true);
    const written = prisma.message.create.mock.calls[0][0].data;
    expect(written.metadata?.attachmentReplyTo).toBeUndefined();
    expect(prisma.messageAttachment.findUnique).not.toHaveBeenCalled();
  });
});
