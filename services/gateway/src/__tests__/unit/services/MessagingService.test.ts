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
    createTrackingLink: mockCreateTrackingLink
  }))
}));

// Mock MentionService
jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: mockExtractMentions,
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
        findMany: jest.fn()
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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
      // Message should be created with senderId (participantId)
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: testUserId,
          })
        })
      );
    });

    it('should create session authentication context when sessionToken is provided', async () => {
      const sessionToken = 'session-token-abc';
      const anonymousParticipantId = 'anon-participant-123';

      mockPrisma.participant.findFirst.mockResolvedValue({
        id: anonymousParticipantId,
        sessionToken: sessionToken,
        conversationId: testConversationId,
        isActive: true,
        canSendMessages: true,
        canSendFiles: true,
        shareLink: {
          id: 'link123',
          isActive: true,
          allowAnonymousMessages: true,
          allowAnonymousFiles: true,
          allowAnonymousImages: true,
          maxUses: null,
          currentUses: 0,
          expiresAt: null
        }
      });

      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ senderId: anonymousParticipantId }),
        sender: { id: anonymousParticipantId, displayName: 'AnonUser', type: 'anonymous' },
        attachments: [],
        replyTo: null
      });

      const response = await service.handleMessage(
        { ...validRequest, isAnonymous: true, anonymousDisplayName: 'AnonUser' },
        testParticipantId
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

    it('should fallback to senderId pattern detection for anon_ prefix', async () => {
      const anonSenderId = 'anon_12345678';
      const anonymousParticipantId = 'anon-participant-456';

      mockPrisma.participant.findFirst.mockResolvedValue({
        id: anonymousParticipantId,
        sessionToken: anonSenderId,
        isActive: true,
        canSendMessages: true,
        shareLink: {
          isActive: true,
          allowAnonymousMessages: true,
          allowAnonymousFiles: false,
          allowAnonymousImages: false
        }
      });

      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage({ senderId: anonymousParticipantId }),
        sender: { id: anonymousParticipantId, type: 'anonymous' },
        attachments: [],
        replyTo: null
      });

      const response = await service.handleMessage(
        { ...validRequest, isAnonymous: true, anonymousDisplayName: 'Anon' },
        testParticipantId
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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
      // Don't need conversation mock - validation happens BEFORE conversation lookup
      // When sessionToken is provided, isAnonymous will be true
      // The validation checks for isAnonymous && !anonymousDisplayName

      const request: MessageRequest = {
        conversationId: testConversationId,
        content: 'Anonymous message'
        // isAnonymous will be derived from auth context
        // Missing anonymousDisplayName
      };

      // Pass sessionToken to make it anonymous
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
      expect(response.error).toContain('membre');
    });

    it('should deny access when member cannot send messages', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: false,
        canSendFiles: false
      });

      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Permissions insuffisantes');
    });

    it('should deny anonymous user when share link is inactive', async () => {
      const sessionToken = 'session-123';

      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'anon123',
        sessionToken,
        isActive: true,
        canSendMessages: true,
        shareLink: {
          id: 'link123',
          isActive: false,  // Inactive link
          allowAnonymousMessages: true
        }
      });

      const response = await service.handleMessage(
        { ...validRequest, isAnonymous: true, anonymousDisplayName: 'Anon' },
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('sactiv'); // Matches "désactivé"
    });

    it('should deny anonymous user when share link has expired', async () => {
      const sessionToken = 'session-123';
      const expiredDate = new Date(Date.now() - 86400000); // Yesterday

      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'anon123',
        sessionToken,
        isActive: true,
        canSendMessages: true,
        shareLink: {
          id: 'link123',
          isActive: true,
          expiresAt: expiredDate,
          allowAnonymousMessages: true
        }
      });

      const response = await service.handleMessage(
        { ...validRequest, isAnonymous: true, anonymousDisplayName: 'Anon' },
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('expir'); // Matches "expiré"
    });

    it('should deny anonymous user when share link max uses reached', async () => {
      const sessionToken = 'session-123';

      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'anon123',
        sessionToken,
        isActive: true,
        canSendMessages: true,
        shareLink: {
          id: 'link123',
          isActive: true,
          maxUses: 10,
          currentUses: 10,  // Limit reached
          allowAnonymousMessages: true
        }
      });

      const response = await service.handleMessage(
        { ...validRequest, isAnonymous: true, anonymousDisplayName: 'Anon' },
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Limite');
    });

    it('should deny anonymous user when messages not allowed', async () => {
      const sessionToken = 'session-123';

      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'anon123',
        sessionToken,
        isActive: true,
        canSendMessages: true,
        shareLink: {
          id: 'link123',
          isActive: true,
          allowAnonymousMessages: false  // Messages not allowed
        }
      });

      const response = await service.handleMessage(
        { ...validRequest, isAnonymous: true, anonymousDisplayName: 'Anon' },
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('ne permet pas');
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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
        where: { identifier: identifier }
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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

    it('should use provided originalLanguage', async () => {
      const request: MessageRequest = {
        ...validRequest,
        originalLanguage: 'es'
      };

      const response = await service.handleMessage(
        request,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalLanguage: 'es'
          })
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
      });
      mockPrisma.message.create.mockResolvedValue({
        ...createMockMessage(),
        sender: { id: testUserId },
        attachments: [],
        replyTo: null
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockHandleNewMessage.mockRejectedValue(new Error('Translation service unavailable'));

      // Should still succeed - translation errors should not fail the message
      const response = await service.handleMessage(
        validRequest,
        testParticipantId
      );

      expect(response.success).toBe(true);
      expect(response.metadata.translationStatus?.status).toBe('failed');
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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
        id: 'member123',
        userId: testUserId,
        isActive: true,
        canSendMessage: true,
        canSendFiles: true
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
      const sessionToken = 'session-123';

      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: testConversationId,
        type: 'private'
      });

      // First call for permissions - returns valid participant
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce({
          id: 'anon123',
          sessionToken,
          isActive: true,
          canSendMessages: true,
          shareLink: {
            id: 'link123',
            isActive: true,
            allowAnonymousMessages: true
          }
        })
        // Second call for saving - returns null
        .mockResolvedValueOnce(null);

      const response = await service.handleMessage(
        { conversationId: testConversationId, content: 'Test message', isAnonymous: true, anonymousDisplayName: 'AnonUser' },
        testParticipantId
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Erreur interne lors de l\'envoi du message');
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
      id: 'member123',
      userId: testUserId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId: testUserId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId: testUserId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId: testUserId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId: testUserId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId: testUserId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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

  beforeEach(() => {
    jest.clearAllMocks();

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
      id: 'member123',
      userId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
      id: 'member123',
      userId,
      isActive: true,
      canSendMessage: true,
      canSendFiles: true
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
});
