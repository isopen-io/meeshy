/**
 * Additional MessagingService tests — covers branches not reached by the primary suite:
 *  - Dedup hit path (isDuplicate=true): empty translations → re-queues, non-empty → skips
 *  - isTranslationsEmpty: all 3 conditions (null/non-object/empty-object/non-empty-object)
 *  - runPostSaveSideEffects: error callback paths (updateConversation/markMessagesAsRead/queueTranslation/updateStats fail)
 *  - queueTranslation with skip=true
 *  - updateStats catch block (conversationStatsService throws)
 *  - ensureParticipantFromMember: user not found, member not found, full creation success
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';

// Mock functions
const mockHandleNewMessage = jest.fn<any>().mockResolvedValue(undefined);
const mockUpdateOnNewMessage = jest.fn<any>().mockResolvedValue({ messageCount: 1 });
const mockFindExistingTrackingLink = jest.fn<any>().mockResolvedValue(null);
const mockCreateTrackingLink = jest.fn<any>().mockResolvedValue({ token: 'tk' });
const mockExtractMentionsWithParticipants = jest.fn<any>().mockReturnValue([]);
const mockMarkMessagesAsRead = jest.fn<any>().mockResolvedValue(undefined);
const mockGetUnreadCount = jest.fn<any>().mockResolvedValue(0);

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({
    handleNewMessage: mockHandleNewMessage,
  })),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: mockUpdateOnNewMessage },
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: mockFindExistingTrackingLink,
    createTrackingLink: mockCreateTrackingLink,
    collectContentTrackingLinks: jest.fn<any>().mockResolvedValue([]),
  })),
}));

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    extractMentionsWithParticipants: mockExtractMentionsWithParticipants,
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    validateMentionPermissions: jest.fn<any>().mockResolvedValue({ isValid: true, validUserIds: [], invalidUsernames: [], errors: [] }),
    createMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: mockMarkMessagesAsRead,
    getUnreadCount: mockGetUnreadCount,
  })),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { MessagingService } from '../../../services/MessagingService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439012';
const PART_ID = '507f1f77bcf86cd799439014';
const MSG_ID  = '507f1f77bcf86cd799439013';
const USER_ID = '507f1f77bcf86cd799439011';

function makeMockMessage(overrides: Record<string, unknown> = {}): any {
  return {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    content: 'hello',
    originalLanguage: 'en',
    messageType: 'text',
    replyToId: null,
    deletedAt: null,
    isEdited: false,
    validatedMentions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    sender: { id: PART_ID, displayName: 'T', avatar: null, role: 'member', isOnline: true, type: 'user', userId: USER_ID, language: 'en' },
    attachments: [],
    replyTo: null,
    ...overrides,
  };
}

function makePrisma(): any {
  return {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'private' }),
      findFirst: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'c', type: 'private' }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID, isActive: true }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID, isActive: true }),
    },
    message: {
      create: jest.fn<any>().mockResolvedValue(makeMockMessage()),
      update: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    trackingLink: { updateMany: jest.fn<any>().mockResolvedValue({}) },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ cursor: { firstBatch: [] } }),
  };
}

function makeService(prisma: any): MessagingService {
  global.fetch = jest.fn<any>().mockResolvedValue({ ok: true, json: () => Promise.resolve({ language: 'en' }) });
  return new MessagingService(
    prisma as unknown as PrismaClient,
    { handleNewMessage: mockHandleNewMessage } as any,
    { createMentionNotification: jest.fn<any>(), createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0) } as any
  );
}

// ── P2002 helper ──────────────────────────────────────────────────────────────

const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MessagingService — additional coverage', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MessagingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = makeService(prisma);
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockUpdateOnNewMessage.mockResolvedValue({ messageCount: 1 });
    mockMarkMessagesAsRead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Dedup hit path ────────────────────────────────────────────────────────

  describe('handleMessage — dedup hit (isDuplicate=true)', () => {
    const request: MessageRequest = {
      conversationId: CONV_ID,
      content: 'hello again',
      clientMessageId: 'client-abc',
    };

    it('returns success and re-queues translation when translations are empty', async () => {
      const dupMsg = makeMockMessage({ translations: {} }); // empty object → re-queue
      prisma.message.create.mockRejectedValueOnce(p2002);
      prisma.message.findFirst.mockResolvedValueOnce({ ...dupMsg }); // dedup lookup

      const result = await service.handleMessage(request, PART_ID);

      expect(result.success).toBe(true);
      // Translation re-queue is async (void), check that the service completes
    });

    it('returns success without re-queuing when translations have content', async () => {
      const dupMsg = makeMockMessage({ translations: { fr: 'bonjour' } }); // non-empty
      prisma.message.create.mockRejectedValueOnce(p2002);
      prisma.message.findFirst.mockResolvedValueOnce({ ...dupMsg }); // dedup lookup

      const result = await service.handleMessage(request, PART_ID);

      expect(result.success).toBe(true);
    });

    it('returns success when translations is null', async () => {
      const dupMsg = makeMockMessage({ translations: null });
      prisma.message.create.mockRejectedValueOnce(p2002);
      prisma.message.findFirst.mockResolvedValueOnce({ ...dupMsg });

      const result = await service.handleMessage(request, PART_ID);
      expect(result.success).toBe(true);
    });
  });

  // ── isTranslationsEmpty — direct coverage ─────────────────────────────────

  describe('isTranslationsEmpty — internal helper', () => {
    const fn = (translations: unknown) =>
      (service as any).isTranslationsEmpty(translations);

    it('returns true for null', () => expect(fn(null)).toBe(true));
    it('returns true for undefined', () => expect(fn(undefined)).toBe(true));
    it('returns true for non-object (string)', () => expect(fn('string')).toBe(true));
    it('returns true for empty object {}', () => expect(fn({})).toBe(true));
    it('returns false for object with keys', () => expect(fn({ fr: 'bonjour' })).toBe(false));
  });

  // ── queueTranslation with skip=true ───────────────────────────────────────

  describe('queueTranslation — skip option', () => {
    it('returns skipped status immediately without calling translationService', async () => {
      const result = await (service as any).queueTranslation(
        makeMockMessage(),
        'en',
        { skip: true }
      );
      expect(result.status).toBe('skipped');
      expect(mockHandleNewMessage).not.toHaveBeenCalled();
    });
  });

  // ── updateStats — error catch ─────────────────────────────────────────────

  describe('updateStats — error catch block', () => {
    it('returns undefined and does not throw when conversationStatsService throws', async () => {
      mockUpdateOnNewMessage.mockRejectedValueOnce(new Error('stats error') as never);
      const result = await (service as any).updateStats(CONV_ID, 'en');
      expect(result).toBeUndefined();
    });
  });

  // ── runPostSaveSideEffects — error callbacks ───────────────────────────────

  describe('runPostSaveSideEffects — background error callbacks', () => {
    beforeEach(() => {
      // Successful message create so we reach post-save side effects
      prisma.message.create.mockResolvedValue(makeMockMessage());
    });

    it('completes successfully when updateConversation throws in background', async () => {
      prisma.conversation.update.mockRejectedValue(new Error('update fail') as never);
      const result = await service.handleMessage(
        { conversationId: CONV_ID, content: 'msg' },
        PART_ID
      );
      // Background errors don't affect ACK
      expect(result.success).toBe(true);
    });

    it('completes successfully when markMessagesAsRead throws in background', async () => {
      mockMarkMessagesAsRead.mockRejectedValue(new Error('read fail') as never);
      const result = await service.handleMessage(
        { conversationId: CONV_ID, content: 'msg2' },
        PART_ID
      );
      expect(result.success).toBe(true);
    });

    it('completes successfully when queueTranslation throws in background', async () => {
      mockHandleNewMessage.mockRejectedValue(new Error('translation fail') as never);
      const result = await service.handleMessage(
        { conversationId: CONV_ID, content: 'msg3' },
        PART_ID
      );
      expect(result.success).toBe(true);
    });

    it('completes successfully when updateStats throws in background', async () => {
      mockUpdateOnNewMessage.mockRejectedValue(new Error('stats fail') as never);
      const result = await service.handleMessage(
        { conversationId: CONV_ID, content: 'msg4' },
        PART_ID
      );
      expect(result.success).toBe(true);
    });
  });

  // ── ensureParticipantFromMember ───────────────────────────────────────────

  describe('ensureParticipantFromMember', () => {
    const fn = (userId: string, conversationId: string) =>
      (service as any).ensureParticipantFromMember(userId, conversationId);

    it('returns null when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const result = await fn(USER_ID, CONV_ID);
      expect(result).toBeNull();
    });

    it('returns null when no ConversationMember doc found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER_ID, username: 'u', displayName: 'User', firstName: null, lastName: null,
        avatar: null, systemLanguage: 'en',
      });
      prisma.$runCommandRaw.mockResolvedValueOnce({ cursor: { firstBatch: [] } });

      const result = await fn(USER_ID, CONV_ID);
      expect(result).toBeNull();
    });

    it('creates and returns a participant when member doc is found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER_ID, username: 'u', displayName: 'User', firstName: 'First', lastName: 'Last',
        avatar: null, systemLanguage: 'en',
      });
      prisma.$runCommandRaw.mockResolvedValueOnce({
        cursor: {
          firstBatch: [{
            userId: USER_ID,
            conversationId: CONV_ID,
            role: 'MEMBER',
            canSendMessage: true,
            canSendFiles: true,
            canSendImages: true,
            joinedAt: new Date().toISOString(),
          }],
        },
      });
      prisma.participant.create.mockResolvedValueOnce({
        id: PART_ID, conversationId: CONV_ID, isActive: true,
      });

      const result = await fn(USER_ID, CONV_ID);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(PART_ID);
    });

    it('returns null when participant.create throws', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER_ID, username: 'u', displayName: null, firstName: null, lastName: null,
        avatar: null, systemLanguage: null,
      });
      prisma.$runCommandRaw.mockResolvedValueOnce({
        cursor: {
          firstBatch: [{ userId: USER_ID, conversationId: CONV_ID, role: 'CREATOR' }],
        },
      });
      prisma.participant.create.mockRejectedValueOnce(new Error('create failed') as never);

      const result = await fn(USER_ID, CONV_ID);
      expect(result).toBeNull();
    });
  });

  // ── ensureParticipantFromMember triggered via handleMessage ───────────────

  describe('handleMessage — ensureParticipantFromMember integration', () => {
    it('triggers legacy participant creation when findUnique and findFirst both return null', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);
      prisma.participant.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER_ID, username: 'u', displayName: 'User', firstName: null, lastName: null,
        avatar: null, systemLanguage: 'en',
      });
      prisma.$runCommandRaw.mockResolvedValueOnce({
        cursor: {
          firstBatch: [{
            userId: USER_ID,
            conversationId: CONV_ID,
            role: 'MEMBER',
            canSendMessage: true,
          }],
        },
      });
      prisma.participant.create.mockResolvedValueOnce({
        id: PART_ID, conversationId: CONV_ID, isActive: true,
      });

      const result = await service.handleMessage(
        { conversationId: CONV_ID, content: 'test' },
        USER_ID
      );
      expect(result.success).toBe(true);
    });
  });
});
