/**
 * `MessagingService.handleMessage` — le mode lent des NOUVEAUX COMPTES dans
 * Meeshy Global (#7740), CÂBLÉ au point de convergence.
 *
 * REST (`POST /conversations/:id/messages`), `message:send` et
 * `message:send-with-attachments` convergent tous trois sur `handleMessage` :
 * c'est là que le refus doit naître, avec son CODE dédié et son décompte, pour
 * que chaque transport le rende sans le recalculer. La règle elle-même est
 * prouvée dans `messaging/globalNewcomerSlowMode.test.ts` ; ces cas prouvent
 * le câblage et la forme de la réponse.
 *
 * Fichier séparé pour la même raison que `MessagingService.writePermission.test.ts`
 * (`MessagingService.test.ts` est hors budget).
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
import { cacheSendReservations } from '../../../services/messaging/newcomerSendReservations';

/** Le cache partagé des réservations, `setnx` atomique comme Redis `SET NX` — neuf à chaque témoin. */
const freshReservations = () => {
  const entries = new Map<string, string>();
  return cacheSendReservations(() => ({
    setnx: async (key: string, value: string) => (entries.has(key) ? false : (entries.set(key, value), true)),
    get: async (key: string) => entries.get(key) ?? null,
    del: async (key: string) => { entries.delete(key); }
  }));
};

describe('MessagingService.handleMessage — mode lent des nouveaux comptes dans Meeshy Global (#7740)', () => {
  let service: MessagingService;
  let mockPrisma: any;
  let mockTranslationService: any;
  let mockNotificationService: any;

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

  const validRequest: MessageRequest = {
    conversationId: testConversationId,
    content: 'Hello, this is a test message!'
  };

  // L'horloge est FIGÉE : un décompte calculé contre `Date.now()` qui avance
  // entre la fabrication du témoin et la décision tomberait de 20 à 21 s sous
  // charge — un témoin qui lit l'horloge murale est un témoin instable.
  const FROZEN_NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
  const NEWCOMER_CREATED_AT = () => new Date(FROZEN_NOW - 2 * 3600 * 1000);
  const ESTABLISHED_CREATED_AT = () => new Date(FROZEN_NOW - 30 * 24 * 3600 * 1000);

  const lastUserSendSecondsAgo = (seconds: number) => async (args: any) =>
    args?.where?.messageSource === 'user' && args?.where?.createdAt?.gt
      ? { createdAt: new Date(FROZEN_NOW - seconds * 1000) }
      : null;

  const globalMember = (accountCreatedAt: Date) => ({
    id: testParticipantId,
    conversationId: testConversationId,
    isActive: true,
    type: 'user',
    role: 'member',
    permissions: { canSendMessages: true },
    user: { role: 'USER', createdAt: accountCreatedAt }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(FROZEN_NOW);
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
      messageAttachment: { findMany: jest.fn().mockResolvedValue([]) },
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
      mockNotificationService,
      undefined,
      freshReservations()
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refuse le second message rapproché d’un compte de 2 h, avec le code dédié et le décompte', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: testConversationId, type: 'global', isActive: true });
    mockPrisma.participant.findUnique.mockResolvedValue(globalMember(NEWCOMER_CREATED_AT()));
    mockPrisma.message.findFirst.mockImplementation(lastUserSendSecondsAgo(10));

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(false);
    expect(response.code).toBe('NEWCOMER_SLOW_MODE');
    expect(response.retryAfter).toBe(20);
    expect(response.error).toContain('20 s');
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('laisse passer le même envoi d’un compte établi', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: testConversationId, type: 'global', isActive: true });
    mockPrisma.participant.findUnique.mockResolvedValue(globalMember(ESTABLISHED_CREATED_AT()));
    mockPrisma.message.findFirst.mockImplementation(lastUserSendSecondsAgo(10));

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('laisse passer le premier message d’un compte neuf', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: testConversationId, type: 'global', isActive: true });
    mockPrisma.participant.findUnique.mockResolvedValue(globalMember(NEWCOMER_CREATED_AT()));
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(true);
  });

  // La règle se lisait AVANT l'écriture sans rien réserver : dix envois dans le
  // même tick lisaient tous « aucun message » et passaient tous.
  it('n’écrit qu’UN des deux envois simultanés d’un compte de 2 h, et refuse l’autre en mode lent', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: testConversationId, type: 'global', isActive: true });
    mockPrisma.participant.findUnique.mockResolvedValue(globalMember(NEWCOMER_CREATED_AT()));
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const responses = await Promise.all([
      service.handleMessage({ ...validRequest, clientMessageId: 'cmid-a' }, testParticipantId),
      service.handleMessage({ ...validRequest, clientMessageId: 'cmid-b' }, testParticipantId)
    ]);

    expect(responses.filter((r) => r.success)).toHaveLength(1);
    const refused = responses.filter((r) => !r.success);
    expect(refused).toHaveLength(1);
    expect(refused[0].code).toBe('NEWCOMER_SLOW_MODE');
    expect(refused[0].retryAfter).toBe(30);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('rend la fenêtre quand l’écriture de l’envoi admis échoue : le réessai immédiat passe', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: testConversationId, type: 'global', isActive: true });
    mockPrisma.participant.findUnique.mockResolvedValue(globalMember(NEWCOMER_CREATED_AT()));
    mockPrisma.message.findFirst.mockResolvedValue(null);
    mockPrisma.message.create.mockRejectedValueOnce(new Error('mongo indisponible'));

    const failed = await service.handleMessage({ ...validRequest, clientMessageId: 'cmid-a' }, testParticipantId);
    const retried = await service.handleMessage({ ...validRequest, clientMessageId: 'cmid-a' }, testParticipantId);

    expect(failed.success).toBe(false);
    expect(failed.code).toBeUndefined();
    expect(retried.success).toBe(true);
  });

  it('garde la fenêtre après un envoi écrit : le suivant, encore en vol, attend', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: testConversationId, type: 'global', isActive: true });
    mockPrisma.participant.findUnique.mockResolvedValue(globalMember(NEWCOMER_CREATED_AT()));
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const first = await service.handleMessage({ ...validRequest, clientMessageId: 'cmid-a' }, testParticipantId);
    const second = await service.handleMessage({ ...validRequest, clientMessageId: 'cmid-b' }, testParticipantId);

    expect(first.success).toBe(true);
    expect(second.code).toBe('NEWCOMER_SLOW_MODE');
  });

  it('ne porte ni code ni décompte sur un refus définitif', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: testConversationId, type: 'global', isActive: false });
    mockPrisma.participant.findUnique.mockResolvedValue(globalMember(NEWCOMER_CREATED_AT()));

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(false);
    expect(response.code).toBeUndefined();
    expect(response.retryAfter).toBeUndefined();
  });
});
