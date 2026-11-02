/**
 * `MessagingService.handleMessage` — une conversation chiffrée de bout en bout
 * ne reçoit JAMAIS de clair (directive #9224, #11216).
 *
 * Fail-closed : sans `encryptedContent`, un texte destiné à une conversation
 * `encryptionMode: 'e2ee'` est REFUSÉ avec un code stable
 * (`E2EE_PLAINTEXT_REFUSED`) au lieu d'être écrit en clair. Les témoins passent
 * par le VRAI service, jusqu'à `prisma.message.create` : un refus doit empêcher
 * l'écriture, pas seulement rendre `success: false`.
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

import { E2EE_PLAINTEXT_REFUSED } from '../../../services/messaging/e2eePlaintextAdmission';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';

describe('MessagingService.handleMessage — aucun clair dans une conversation e2ee (#11216)', () => {
  let service: MessagingService;
  let mockPrisma: any;

  const conversationId = '507f1f77bcf86cd799439012';
  const messageId = '507f1f77bcf86cd799439013';
  const senderParticipantId = '507f1f77bcf86cd799439014';
  const senderUserId = '507f1f77bcf86cd799439018';

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

  const conversationIn = (regime: { encryptionMode: string | null; encryptionEnabledAt: Date | null }) =>
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: conversationId, type: 'direct', ...regime });

  const E2EE = { encryptionMode: 'e2ee', encryptionEnabledAt: new Date('2026-01-01T00:00:00Z') };
  const CLEAR = { encryptionMode: null, encryptionEnabledAt: null };

  const plaintext: MessageRequest = { conversationId, content: 'Rendez-vous à 18h', originalLanguage: 'fr' };

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

  it('refuse un texte en clair dans une conversation e2ee, avec un code stable, sans rien écrire', async () => {
    conversationIn(E2EE);

    const response = await service.handleMessage(plaintext, senderParticipantId);

    expect(response.success).toBe(false);
    expect(response.code).toBe(E2EE_PLAINTEXT_REFUSED);
    expect(response.error).toMatch(/chiffrée de bout en bout/);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('un type « system » déclaré par le client n’ouvre pas la porte du clair', async () => {
    conversationIn(E2EE);

    const response = await service.handleMessage({ ...plaintext, messageType: 'system' } as MessageRequest, senderParticipantId);

    expect(response.code).toBe(E2EE_PLAINTEXT_REFUSED);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('ne fabrique aucun lien suivi pour un clair refusé — rien du texte ne quitte la garde', async () => {
    conversationIn(E2EE);

    await service.handleMessage({ ...plaintext, content: 'voir <https://exemple.org/secret>' }, senderParticipantId);

    expect(mockProcessExplicitLinksInContent).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse un chiffré à l’ancienne (sans enveloppes libsignal) avec E2EE_CLIENT_OUTDATED lisible, sans rien écrire (#3706)', async () => {
    conversationIn(E2EE);

    const response = await service.handleMessage(
      { ...plaintext, content: '[Encrypted]', encryptedPayload: { ciphertext: 'c2lnbmFs', mode: 'e2ee' } as never },
      senderParticipantId
    );

    expect(response.success).toBe(false);
    expect(response.code).toBe(E2EE_ERROR_CODES.CLIENT_OUTDATED);
    expect(response.error).toMatch(/mettez à jour Meeshy/);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse un vocal sans texte — REST et socket convergent ici (#12518)', async () => {
    conversationIn(E2EE);

    const response = await service.handleMessage(
      { conversationId, content: '', originalLanguage: 'fr', attachmentIds: ['507f1f77bcf86cd799439099'] } as MessageRequest,
      senderParticipantId
    );

    expect(response.success).toBe(false);
    expect(response.code).toBe(E2EE_PLAINTEXT_REFUSED);
    expect(response.error).toMatch(/pièce jointe/);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(mockHandleNewMessage).not.toHaveBeenCalled();
  });

  it('laisse une conversation en clair inchangée', async () => {
    conversationIn(CLEAR);

    const response = await service.handleMessage(plaintext, senderParticipantId);

    expect(response.success).toBe(true);
    const written = mockPrisma.message.create.mock.calls[0][0].data;
    expect(written.content).toBe('Rendez-vous à 18h');
    expect(written.isEncrypted).toBe(false);
  });
});
