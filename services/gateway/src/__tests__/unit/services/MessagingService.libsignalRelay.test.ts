/**
 * `MessagingService.handleMessage` — un envoi libsignal (#3706) traverse le
 * VRAI service jusqu'à la base : le message est persisté avec le seul littéral
 * `[Encrypted]`, ses enveloppes vont dans `MessageEnvelope` (une par appareil),
 * jamais dans `encryptionMetadata`, et un écart Sesame refuse l'envoi SANS
 * rien écrire.
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



import { E2EE_ERROR_CODES, LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import { createFakeE2EEStore } from '../../../services/e2ee/__tests__/fake-e2ee-store';

describe('MessagingService.handleMessage — envoi libsignal par appareil (#3706)', () => {
  let service: MessagingService;
  let mockPrisma: any;
  let store: ReturnType<typeof createFakeE2EEStore>;

  const conversationId = '507f1f77bcf86cd799439012';
  const messageId = '507f1f77bcf86cd799439013';
  const senderParticipantId = '507f1f77bcf86cd799439014';
  const senderUserId = '507f1f77bcf86cd799439018';
  const bobUserId = '507f1f77bcf86cd799439019';
  const senderSession = '507f1f77bcf86cd799439020';
  const SENTINEL = 'Y2lwaGVydGV4dC1ib2I=';

  const created = (overrides: Partial<Message> = {}): any => ({
    id: messageId, conversationId, senderId: senderParticipantId, content: '', originalLanguage: 'fr',
    messageType: 'text', replyToId: null, deletedAt: null, isEdited: false, validatedMentions: [],
    createdAt: new Date(), updatedAt: new Date(),
    sender: { id: senderParticipantId, displayName: 'Expéditeur', avatar: null, role: 'member', isOnline: true, type: 'user', userId: senderUserId, language: 'fr' },
    attachments: [], replyTo: null, ...overrides,
  });

  const E2EE = { encryptionMode: 'e2ee', encryptionEnabledAt: new Date('2026-01-01T00:00:00Z') };
  const CLEAR = { encryptionMode: null, encryptionEnabledAt: null };
  const conversationIn = (regime: { encryptionMode: string | null; encryptionEnabledAt: Date | null }) =>
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: conversationId, type: 'direct', ...regime });

  const relaySend = (envelopes = [{ userId: bobUserId, deviceId: 1, registrationId: 201, type: 3 as const, body: SENTINEL }], content = '', regimeEpoch: number | null = 0) =>
    ({
      conversationId, content, originalLanguage: 'fr',
      encryptedPayload: {
        ciphertext: LIBSIGNAL_PROTOCOL, mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1,
        ...(regimeEpoch === null ? {} : { regimeEpoch }),
        relay: { protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, sessionId: senderSession, unapprovedOwnDevices: [], envelopes },
      },
    }) as unknown as MessageRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ language: 'fr' }) }) as any;
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockUpdateOnNewMessage.mockResolvedValue({ messageCount: 10, participantCount: 2 });

    store = createFakeE2EEStore();
    store.collections.E2EEDevice.insert({ userId: senderUserId, deviceId: 1, registrationId: 101, sessionId: senderSession, identityKey: 'ik', platform: 'ios' });
    store.collections.E2EEDevice.insert({ userId: bobUserId, deviceId: 1, registrationId: 201, sessionId: 'bb'.repeat(12), identityKey: 'ik', platform: 'ios' });
    store.collections.Participant.insert({ id: senderParticipantId, conversationId, userId: senderUserId });
    store.collections.Participant.insert({ conversationId, userId: bobUserId });

    mockPrisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: conversationId, type: 'direct', ...CLEAR }),
        findFirst: jest.fn().mockResolvedValue({ id: conversationId, identifier: 'dm', type: 'direct' }),
        update: jest.fn().mockResolvedValue({ id: conversationId, lastMessageAt: new Date() }),
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({ id: senderParticipantId, conversationId, isActive: true, userId: senderUserId }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: store.prisma.participant.findMany,
      },
      e2EEDevice: store.prisma.e2EEDevice,
      messageEnvelope: store.prisma.messageEnvelope,
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      postMention: { findUnique: jest.fn().mockResolvedValue(null) },
      post: { findUnique: jest.fn().mockResolvedValue(null) },
      message: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => created(data as Partial<Message>)),
        update: jest.fn(), findMany: jest.fn(), delete: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      trackingLink: { updateMany: jest.fn() },
      messageAttachment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };

    service = new MessagingService(
      mockPrisma as unknown as PrismaClient,
      { handleNewMessage: mockHandleNewMessage } as any,
      { createMentionNotification: jest.fn().mockResolvedValue({ id: 'n' }), createMentionNotificationsBatch: jest.fn().mockResolvedValue(0) } as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persiste le littéral [Encrypted] et une enveloppe par appareil, jamais les enveloppes dans le message', async () => {
    conversationIn(E2EE);

    const response = await service.handleMessage(relaySend(), senderParticipantId);

    expect(response.success).toBe(true);
    const written = mockPrisma.message.create.mock.calls[0][0].data;
    expect(written.content).toBe('[Encrypted]');
    expect(written.isEncrypted).toBe(true);
    expect(written.encryptionMode).toBe('e2ee');
    expect(JSON.stringify(written)).not.toContain(SENTINEL);
    expect(JSON.stringify(written.encryptionMetadata)).not.toContain('relay');
    expect(store.collections.MessageEnvelope.rows).toEqual([
      expect.objectContaining({ messageId, recipientUserId: bobUserId, recipientDeviceId: 1, senderUserId, senderDeviceId: 1, body: SENTINEL }),
    ]);
    expect(mockHandleNewMessage).not.toHaveBeenCalled();
  });

  it('ne confond jamais deux messages chiffrés par leur littéral commun (déduplication par contenu)', async () => {
    conversationIn(E2EE);
    mockPrisma.message.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.content === '[Encrypted]' ? created({ id: 'aa'.repeat(12), content: '[Encrypted]' } as Partial<Message>) : null);

    const response = await service.handleMessage(relaySend(), senderParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('refuse un écart Sesame avec son détail, sans écrire de message ni d’enveloppe', async () => {
    conversationIn(E2EE);

    const response = await service.handleMessage(relaySend([{ userId: bobUserId, deviceId: 1, registrationId: 999, type: 3, body: SENTINEL }]), senderParticipantId);

    expect(response.success).toBe(false);
    expect(response.code).toBe(E2EE_ERROR_CODES.DEVICES_MISMATCH);
    expect(response.e2eeMismatch).toEqual({ missing: [], extra: [], stale: [{ userId: bobUserId, deviceId: 1 }] });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
  });

  it('refuse un texte en clair glissé à côté des enveloppes', async () => {
    conversationIn(E2EE);

    const response = await service.handleMessage(relaySend(undefined, 'Rendez-vous à 18h'), senderParticipantId);

    expect(response.code).toBe('E2EE_PLAINTEXT_REFUSED');
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse des enveloppes vers une conversation qui n’est plus chiffrée (E2EE_REGIME_CHANGED)', async () => {
    conversationIn(CLEAR);

    const response = await service.handleMessage(relaySend(), senderParticipantId);

    expect(response.code).toBe(E2EE_ERROR_CODES.REGIME_CHANGED);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  describe("l'époque du régime (#12522)", () => {
    const ENVELOPE = [{ userId: bobUserId, deviceId: 1, registrationId: 201, type: 3 as const, body: SENTINEL }];

    it("refuse 409 E2EE_REGIME_CHANGED un chiffré scellé sous une époque périmée, sans rien écrire", async () => {
      conversationIn({ ...E2EE, encryptionEpoch: 3 } as never);

      const response = await service.handleMessage(relaySend(ENVELOPE, '', 1), senderParticipantId);

      expect(response.success).toBe(false);
      expect(response.code).toBe(E2EE_ERROR_CODES.REGIME_CHANGED);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
    });

    it("admet un chiffré scellé sous l'époque courante", async () => {
      conversationIn({ ...E2EE, encryptionEpoch: 3 } as never);

      const response = await service.handleMessage(relaySend(ENVELOPE, '', 3), senderParticipantId);

      expect(response.success).toBe(true);
    });

    it("lit l'époque d'une conversation jamais basculée comme 0", async () => {
      conversationIn(E2EE);

      const response = await service.handleMessage(relaySend(ENVELOPE, '', 0), senderParticipantId);

      expect(response.success).toBe(true);
    });

    it("admet un envoi qui ne déclare aucune époque (client antérieur à #12522)", async () => {
      conversationIn({ ...E2EE, encryptionEpoch: 3 } as never);

      const response = await service.handleMessage(relaySend(ENVELOPE, '', null), senderParticipantId);

      expect(response.success).toBe(true);
    });
  });

  describe('un chiffré dans une conversation en clair est refusé, jamais rangé en bulle vide (#12562)', () => {
    const legacyCiphertext = () =>
      ({
        conversationId, content: '[Encrypted]', originalLanguage: 'fr',
        encryptedPayload: { ciphertext: 'Y2hpZmZyZS1oZXJpdGU=', mode: 'e2ee', v: 1 },
      }) as unknown as MessageRequest;

    it('refuse 409 E2EE_REGIME_CHANGED un chiffré sans enveloppes, et rien n’est rangé', async () => {
      conversationIn(CLEAR);

      const response = await service.handleMessage(legacyCiphertext(), senderParticipantId);

      expect(response.success).toBe(false);
      expect(response.code).toBe(E2EE_ERROR_CODES.REGIME_CHANGED);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('un texte en clair dans une conversation en clair garde son chemin', async () => {
      conversationIn(CLEAR);

      const response = await service.handleMessage({ conversationId, content: 'Bonjour', originalLanguage: 'fr' } as unknown as MessageRequest, senderParticipantId);

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create.mock.calls[0][0].data).toMatchObject({ content: 'Bonjour', isEncrypted: false });
    });
  });

  it('défait le message si ses enveloppes ne peuvent pas être rangées', async () => {
    conversationIn(E2EE);
    mockPrisma.messageEnvelope = { ...store.prisma.messageEnvelope, createMany: jest.fn().mockRejectedValue(new Error('panne')) };
    service = new MessagingService(mockPrisma as unknown as PrismaClient, { handleNewMessage: mockHandleNewMessage } as any, {} as any);

    const response = await service.handleMessage(relaySend(), senderParticipantId);

    expect(response.success).toBe(false);
    expect(mockPrisma.message.delete).toHaveBeenCalledWith({ where: { id: messageId } });
  });
});
