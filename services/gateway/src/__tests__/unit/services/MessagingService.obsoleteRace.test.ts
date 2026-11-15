/**
 * #14643 — la course entre l'obsolescence d'une conversation et un envoi.
 *
 * Un message ADMIS (la conversation était ouverte) puis écrit pendant la
 * transaction d'obsolescence échappe à son effacement. Le point de
 * convergence des envois relit `Conversation.deletedAt` APRÈS l'écriture : si
 * la conversation est devenue obsolète, le message naît effacé, l'envoi est
 * refusé, et rien ne part (ni diffusion, ni traduction, ni push).
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


describe('MessagingService.handleMessage — une conversation devenue obsolète pendant l’écriture (#14643)', () => {
  let service: MessagingService;
  let mockPrisma: any;

  const conversationId = '507f1f77bcf86cd799439012';
  const messageId = '507f1f77bcf86cd799439013';
  const senderParticipantId = '507f1f77bcf86cd799439014';
  const senderUserId = '507f1f77bcf86cd799439018';
  const OBSOLETED_AT = new Date('2026-11-02T10:00:00.000Z');

  const created = (overrides: Partial<Message> = {}): any => ({
    id: messageId,
    conversationId,
    senderId: senderParticipantId,
    content: '',
    originalLanguage: 'fr',
    messageType: 'text',
    replyToId: null,
    deletedAt: null,
    isEdited: false,
    validatedMentions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    sender: {
      id: senderParticipantId, displayName: 'Expéditeur', avatar: null, role: 'member',
      isOnline: true, type: 'user', userId: senderUserId, language: 'fr'
    },
    attachments: [],
    replyTo: null,
    ...overrides
  });

  const CLEAR = { encryptionMode: null, encryptionEnabledAt: null };
  const request: MessageRequest = { conversationId, content: 'Rendez-vous à 18h', originalLanguage: 'fr' };

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
        findUnique: jest.fn().mockResolvedValue({ id: conversationId, type: 'direct', ...CLEAR }),
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
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([])
      },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      postMention: { findUnique: jest.fn().mockResolvedValue(null) },
      post: { findUnique: jest.fn().mockResolvedValue(null) },
      message: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => created(data as Partial<Message>)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  const obsoletedOnceWritten = () =>
    mockPrisma.conversation.findUnique.mockImplementation(async () => ({
      id: conversationId,
      type: 'group',
      ...CLEAR,
      deletedAt: mockPrisma.message.create.mock.calls.length > 0 ? OBSOLETED_AT : null
    }));

  it('le message écrit après l’obsolescence naît effacé, et l’envoi est refusé', async () => {
    obsoletedOnceWritten();

    const response = await service.handleMessage(request, senderParticipantId);

    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: messageId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      data: { deletedAt: OBSOLETED_AT }
    });
    expect(response.success).toBe(false);
    expect(response.error).toMatch(/fermée/);
  });

  it('rien ne part : ni traduction, ni effets d’après-envoi', async () => {
    obsoletedOnceWritten();

    await service.handleMessage(request, senderParticipantId);
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockHandleNewMessage).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it('une conversation vivante n’est pas touchée', async () => {
    const response = await service.handleMessage(request, senderParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
  });
});
