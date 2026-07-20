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

// Mock TrackingLinkService
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: mockFindExistingTrackingLink,
    createTrackingLink: mockCreateTrackingLink,
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

    it('should include metadata in successful response', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.metadata).toBeDefined();
      expect(response.metadata.debug).toBeDefined();
      expect(response.metadata.debug?.requestId).toMatch(/^msg_/);
      expect(response.metadata.performance).toBeDefined();
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

    it('should reject more than 10 attachments', async () => {
      const attachments = Array.from({ length: 11 }, (_, i) => ({
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
      expect(response.error).toContain('10');
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

    it('should include translation status in response metadata', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.metadata.translationStatus).toBeDefined();
      expect(response.metadata.translationStatus?.status).toBe('pending');
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
      expect(response.metadata.translationStatus?.status).toBe('pending');
    });

    it('should include requestId in error responses', async () => {
      mockPrisma.conversation.findFirst.mockRejectedValue(new Error('Database error'));

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.metadata.debug?.requestId).toBeDefined();
      expect(response.metadata.debug?.requestId).toMatch(/^msg_/);
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

    it('should include delivery status in metadata', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.metadata.deliveryStatus).toBeDefined();
      expect(response.metadata.deliveryStatus?.status).toBe('sent');
    });

    it('should include context metadata', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.metadata.context).toBeDefined();
      expect(response.metadata.context?.containsLinks).toBe(true);
      expect(response.metadata.context?.triggerNotifications).toBe(true);
    });

    it('should calculate performance metrics', async () => {
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.metadata.performance).toBeDefined();
      expect(response.metadata.performance?.processingTime).toBeGreaterThanOrEqual(0);
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
    // The tracking link service should have been called to find/create
    expect(mockFindExistingTrackingLink).toHaveBeenCalled();
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
    expect(mockFindExistingTrackingLink).toHaveBeenCalled();
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
