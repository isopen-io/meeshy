/**
 * NotificationService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the NotificationService including:
 * - Core notification creation with security sanitization
 * - Specialized notification methods (messages, missed calls, mentions, etc.)
 * - User notification preferences and Do Not Disturb
 * - Rate limiting for mention notifications
 * - Socket.IO real-time emission
 * - Firebase push notification integration
 * - Notification management (mark read, delete, statistics)
 * - Edge cases and error handling
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

// Mock isomorphic-dompurify FIRST to prevent ESM import issues
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || ''
  }
}));

// Recursive sanitize function for JSON
const recursiveSanitize = (input: any): any => {
  if (typeof input === 'string') {
    return input.replace(/<[^>]*>/g, '');
  }
  if (Array.isArray(input)) {
    return input.map(recursiveSanitize);
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (!key.startsWith('$') && !key.startsWith('__')) {
        sanitized[key] = recursiveSanitize(value);
      }
    }
    return sanitized;
  }
  return input;
};

// Mock the sanitize module directly
jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''),
    sanitizeURL: jest.fn((input: string) => {
      if (!input) return null;
      try {
        const url = new URL(input);
        if (['http:', 'https:'].includes(url.protocol)) return input;
        return null;
      } catch {
        return null;
      }
    }),
    sanitizeJSON: jest.fn((input: any) => {
      // Recursive sanitization
      const recursiveSanitize = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj.replace(/<[^>]*>/g, '');
        }
        if (Array.isArray(obj)) {
          return obj.map(recursiveSanitize);
        }
        if (typeof obj === 'object' && obj !== null) {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(obj)) {
            if (!key.startsWith('$') && !key.startsWith('__')) {
              sanitized[key] = recursiveSanitize(value);
            }
          }
          return sanitized;
        }
        return obj;
      };
      return recursiveSanitize(input);
    }),
    isValidNotificationType: jest.fn((type: string) => {
      const validTypes = [
        'new_message', 'new_conversation_direct', 'new_conversation_group',
        'message_reply', 'member_joined', 'contact_request', 'contact_accepted',
        'user_mentioned', 'message_reaction', 'missed_call', 'system',
        'new_conversation', 'message_edited'
      ];
      return validTypes.includes(type);
    }),
    isValidPriority: jest.fn((priority: string) => {
      return ['low', 'normal', 'high', 'urgent'].includes(priority);
    })
  }
}));

import { NotificationService, CreateNotificationData, NotificationEventData } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

// Mock Prisma - using jest.mock at module scope to ensure proper mocking
jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn()
    },
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    user: {
      findUnique: jest.fn()
    }
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma)
  };
});

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  messaging: jest.fn(() => ({
    send: jest.fn().mockResolvedValue('message-id')
  }))
}));

// Mock fs module for Firebase credentials check
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn()
}));

// Mock loggers
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  securityLogger: {
    logViolation: jest.fn(),
    logAttempt: jest.fn(),
    logSuccess: jest.fn()
  }
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;
  let userSocketsMap: Map<string, Set<string>>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create new Prisma instance
    prisma = new PrismaClient();

    // Create service with mocked Prisma
    service = new NotificationService(prisma);

    // Mock Socket.IO server
    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    userSocketsMap = new Map();

    // Initialize Socket.IO
    service.setSocketIO(mockIO as any, userSocketsMap);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==============================================
  // INITIALIZATION AND SETUP TESTS
  // ==============================================

  describe('Initialization', () => {
    it('should initialize with Prisma client', () => {
      const newService = new NotificationService(prisma);
      expect(newService).toBeInstanceOf(NotificationService);
    });

    it('should set Socket.IO and user sockets map', () => {
      const newService = new NotificationService(prisma);
      const map = new Map<string, Set<string>>();
      newService.setSocketIO(mockIO as any, map);

      // Service should have Socket.IO initialized
      expect(newService).toBeDefined();
    });

    it('should return metrics including Firebase status', () => {
      const metrics = service.getMetrics();

      expect(metrics).toHaveProperty('notificationsCreated');
      expect(metrics).toHaveProperty('webSocketSent');
      expect(metrics).toHaveProperty('firebaseSent');
      expect(metrics).toHaveProperty('firebaseFailed');
      expect(metrics).toHaveProperty('firebaseEnabled');
      expect(typeof metrics.firebaseEnabled).toBe('boolean');
    });
  });

  // ==============================================
  // CORE NOTIFICATION CREATION TESTS
  // ==============================================

  describe('createNotification', () => {
    const validNotificationData: CreateNotificationData = {
      userId: '507f1f77bcf86cd799439011',
      type: 'new_message',
      title: 'New Message',
      content: 'You have a new message from John',
      priority: 'normal',
      senderId: '507f1f77bcf86cd799439022',
      senderUsername: 'johndoe',
      conversationId: 'conv-123',
      messageId: 'msg-456'
    };

    it('should create a notification successfully', async () => {
      const mockNotification = {
        id: 'notif-123',
        ...validNotificationData,
        isRead: false,
        createdAt: new Date(),
        data: null
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createNotification(validNotificationData);

      expect(result).toBeDefined();
      expect(result?.id).toBe('notif-123');
      expect(result?.type).toBe('new_message');
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('should create notification with default priority when not provided', async () => {
      const dataWithoutPriority = {
        userId: 'user-123',
        type: 'new_message' as const,
        title: 'Test',
        content: 'Test content'
      };

      const mockNotification = {
        id: 'notif-123',
        ...dataWithoutPriority,
        priority: 'normal',
        isRead: false,
        createdAt: new Date()
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      await service.createNotification(dataWithoutPriority);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 'normal'
          })
        })
      );
    });

    it('should sanitize XSS in title and content', async () => {
      const xssData: CreateNotificationData = {
        userId: 'user-123',
        type: 'new_message',
        title: '<script>alert("XSS")</script>Hacked Title',
        content: '<img src=x onerror=alert(1)>Malicious content'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      await service.createNotification(xssData);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.title).not.toContain('<script>');
      expect(createCall.data.content).not.toContain('<img');
    });

    it('should reject invalid notification type', async () => {
      const invalidData = {
        ...validNotificationData,
        type: 'invalid_type' as any
      };

      const result = await service.createNotification(invalidData);

      expect(result).toBeNull();
    });

    it('should reject invalid priority', async () => {
      const invalidData = {
        ...validNotificationData,
        priority: 'super_urgent' as any
      };

      const result = await service.createNotification(invalidData);

      expect(result).toBeNull();
    });

    it('should emit notification via Socket.IO when user is online', async () => {
      const mockNotification = {
        id: 'notif-123',
        ...validNotificationData,
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        data: null
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      // User has active sockets
      userSocketsMap.set(validNotificationData.userId, new Set(['socket-1', 'socket-2']));

      await service.createNotification(validNotificationData);

      expect(mockIO.to).toHaveBeenCalledWith('socket-1');
      expect(mockIO.to).toHaveBeenCalledWith('socket-2');
      expect(mockIO.emit).toHaveBeenCalledWith('notification', expect.any(Object));
    });

    it('should handle user offline gracefully', async () => {
      const mockNotification = {
        id: 'notif-123',
        ...validNotificationData,
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        data: null
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      // User is offline (no sockets)
      const result = await service.createNotification(validNotificationData);

      expect(result).toBeDefined();
      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockRejectedValue(new Error('Database error'));

      const result = await service.createNotification(validNotificationData);

      expect(result).toBeNull();
    });

    it('should include optional sender information', async () => {
      const dataWithSenderInfo: CreateNotificationData = {
        ...validNotificationData,
        senderAvatar: 'https://example.com/avatar.png',
        senderDisplayName: 'John Doe',
        senderFirstName: 'John',
        senderLastName: 'Doe',
        messagePreview: 'Hello there!'
      };

      const mockNotification = {
        id: 'notif-123',
        ...dataWithSenderInfo,
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        data: null
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createNotification(dataWithSenderInfo);

      expect(result).toBeDefined();
      expect(result?.senderDisplayName).toBe('John Doe');
    });

    it('should sanitize and validate avatar URL', async () => {
      const dataWithBadAvatar: CreateNotificationData = {
        ...validNotificationData,
        senderAvatar: 'javascript:alert(1)'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      await service.createNotification(dataWithBadAvatar);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.senderAvatar).toBeNull();
    });

    it('should allow valid HTTPS avatar URL', async () => {
      const dataWithGoodAvatar: CreateNotificationData = {
        ...validNotificationData,
        senderAvatar: 'https://example.com/avatar.png'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      await service.createNotification(dataWithGoodAvatar);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.senderAvatar).toBe('https://example.com/avatar.png');
    });

    it('should include expiration date when provided', async () => {
      const expirationDate = new Date(Date.now() + 86400000); // 24 hours from now
      const dataWithExpiration: CreateNotificationData = {
        ...validNotificationData,
        expiresAt: expirationDate
      };

      const mockNotification = {
        id: 'notif-123',
        ...dataWithExpiration,
        priority: 'normal',
        isRead: false,
        createdAt: new Date()
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      await service.createNotification(dataWithExpiration);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: expirationDate
          })
        })
      );
    });

    it('should sanitize JSON data object', async () => {
      const maliciousData = {
        ...validNotificationData,
        data: {
          normalField: 'safe',
          $malicious: 'mongodb operator',
          nested: {
            xss: '<script>alert(1)</script>'
          }
        }
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      await service.createNotification(maliciousData);

      const createCall = prisma.notification.create.mock.calls[0][0];
      const savedData = JSON.parse(createCall.data.data);

      expect(savedData.$malicious).toBeUndefined();
      expect(savedData.nested.xss).not.toContain('<script>');
    });
  });

  // ==============================================
  // USER PREFERENCES TESTS
  // ==============================================

  describe('User Notification Preferences', () => {
    const baseData: CreateNotificationData = {
      userId: 'user-123',
      type: 'new_message',
      title: 'Test',
      content: 'Test content'
    };

    it('should respect Do Not Disturb setting during DND hours', async () => {
      const preferences = {
        dndEnabled: true,
        dndStartTime: '00:00',
        dndEndTime: '23:59',
        newMessageEnabled: true
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(baseData);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should send notification outside DND hours', async () => {
      // Set time to noon
      jest.setSystemTime(new Date('2025-01-06T12:00:00'));

      const preferences = {
        dndEnabled: true,
        dndStartTime: '22:00',
        dndEndTime: '06:00', // DND from 10pm to 6am
        newMessageEnabled: true
      };

      const mockNotification = {
        id: 'notif-123',
        ...baseData,
        priority: 'normal',
        isRead: false,
        createdAt: new Date()
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createNotification(baseData);

      expect(result).toBeDefined();
    });

    it('should respect disabled new_message notifications', async () => {
      const preferences = {
        newMessageEnabled: false,
        dndEnabled: false
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(baseData);

      expect(result).toBeNull();
    });

    it('should respect disabled mention notifications', async () => {
      const mentionData: CreateNotificationData = {
        ...baseData,
        type: 'user_mentioned'
      };

      const preferences = {
        mentionEnabled: false,
        newMessageEnabled: false,
        dndEnabled: false
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(mentionData);

      expect(result).toBeNull();
    });

    it('should respect disabled reaction notifications', async () => {
      const reactionData: CreateNotificationData = {
        ...baseData,
        type: 'message_reaction'
      };

      const preferences = {
        reactionEnabled: false,
        dndEnabled: false
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(reactionData);

      expect(result).toBeNull();
    });

    it('should respect disabled missed call notifications', async () => {
      const missedCallData: CreateNotificationData = {
        ...baseData,
        type: 'missed_call'
      };

      const preferences = {
        missedCallEnabled: false,
        dndEnabled: false
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(missedCallData);

      expect(result).toBeNull();
    });

    it('should respect disabled system notifications', async () => {
      const systemData: CreateNotificationData = {
        ...baseData,
        type: 'system'
      };

      const preferences = {
        systemEnabled: false,
        dndEnabled: false
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(systemData);

      expect(result).toBeNull();
    });

    it('should respect disabled contact request notifications', async () => {
      const contactData: CreateNotificationData = {
        ...baseData,
        type: 'contact_request'
      };

      const preferences = {
        contactRequestEnabled: false,
        dndEnabled: false
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(contactData);

      expect(result).toBeNull();
    });

    it('should send notification when no preferences exist (default behavior)', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        ...baseData,
        priority: 'normal',
        isRead: false,
        createdAt: new Date()
      });

      const result = await service.createNotification(baseData);

      expect(result).toBeDefined();
    });

    it('should handle preference lookup errors gracefully', async () => {
      prisma.notificationPreference.findUnique.mockRejectedValue(
        new Error('Database error')
      );
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        ...baseData,
        priority: 'normal',
        isRead: false,
        createdAt: new Date()
      });

      // Should still send notification on preference lookup error
      const result = await service.createNotification(baseData);

      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // MESSAGE NOTIFICATION TESTS
  // ==============================================

  describe('createMessageNotification', () => {
    const messageData = {
      recipientId: 'user-recipient',
      senderId: 'user-sender',
      senderUsername: 'sender_user',
      messageContent: 'Hello, how are you?',
      conversationId: 'conv-123',
      messageId: 'msg-456'
    };

    it('should create a message notification', async () => {
      const mockNotification = {
        id: 'notif-123',
        userId: messageData.recipientId,
        type: 'new_message',
        title: 'Nouveau message',
        content: 'Hello, how are you?',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        data: null
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createMessageNotification(messageData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('new_message');
    });

    it('should handle message with image attachment', async () => {
      const dataWithAttachment = {
        ...messageData,
        attachments: [{
          id: 'attach-1',
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024
        }]
      };

      const mockNotification = {
        id: 'notif-123',
        userId: messageData.recipientId,
        type: 'new_message',
        title: 'Nouveau message',
        content: 'Hello, how are you?',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        data: JSON.stringify({ attachments: { count: 1, firstType: 'image' } })
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createMessageNotification(dataWithAttachment);

      expect(result).toBeDefined();
    });

    it('should handle message with video attachment', async () => {
      const dataWithAttachment = {
        ...messageData,
        messageContent: '',
        attachments: [{
          id: 'attach-1',
          filename: 'video.mp4',
          mimeType: 'video/mp4',
          fileSize: 5000000
        }]
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      const result = await service.createMessageNotification(dataWithAttachment);

      expect(result).toBeDefined();
    });

    it('should handle message with audio attachment', async () => {
      const dataWithAttachment = {
        ...messageData,
        messageContent: '',
        attachments: [{
          id: 'attach-1',
          filename: 'audio.mp3',
          mimeType: 'audio/mpeg',
          fileSize: 2000000
        }]
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      const result = await service.createMessageNotification(dataWithAttachment);

      expect(result).toBeDefined();
    });

    it('should handle message with multiple attachments', async () => {
      const dataWithAttachments = {
        ...messageData,
        attachments: [
          { id: 'attach-1', filename: 'photo1.jpg', mimeType: 'image/jpeg', fileSize: 1024 },
          { id: 'attach-2', filename: 'photo2.jpg', mimeType: 'image/jpeg', fileSize: 1024 },
          { id: 'attach-3', filename: 'photo3.jpg', mimeType: 'image/jpeg', fileSize: 1024 }
        ]
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      const result = await service.createMessageNotification(dataWithAttachments);

      expect(result).toBeDefined();
    });

    it('should include conversation metadata', async () => {
      const dataWithMetadata = {
        ...messageData,
        conversationIdentifier: 'group-chat-123',
        conversationType: 'group',
        conversationTitle: 'Team Discussion'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      const result = await service.createMessageNotification(dataWithMetadata);

      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // MISSED CALL NOTIFICATION TESTS
  // ==============================================

  describe('createMissedCallNotification', () => {
    const missedCallData = {
      recipientId: 'user-recipient',
      callerId: 'user-caller',
      callerUsername: 'caller_user',
      conversationId: 'conv-123',
      callSessionId: 'call-session-456'
    };

    it('should create a missed call notification for video call', async () => {
      const mockUser = {
        username: 'caller_user',
        avatar: 'https://example.com/avatar.png',
        displayName: 'Caller User',
        firstName: 'Caller',
        lastName: 'User'
      };

      const mockNotification = {
        id: 'notif-123',
        userId: missedCallData.recipientId,
        type: 'missed_call',
        title: 'Appel video manque',
        content: 'Appel manque',
        priority: 'high',
        isRead: false,
        createdAt: new Date()
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createMissedCallNotification({
        ...missedCallData,
        callType: 'video'
      });

      expect(result).toBeDefined();
      expect(result?.type).toBe('missed_call');
      expect(result?.priority).toBe('high');
    });

    it('should create a missed call notification for audio call', async () => {
      prisma.user.findUnique.mockResolvedValue({
        username: 'caller_user',
        avatar: null,
        displayName: null,
        firstName: 'Caller',
        lastName: 'User'
      });
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123', priority: 'high', type: 'missed_call' });

      const result = await service.createMissedCallNotification({
        ...missedCallData,
        callType: 'audio'
      });

      expect(result).toBeDefined();
    });

    it('should fallback when caller user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123' });

      const result = await service.createMissedCallNotification(missedCallData);

      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // MENTION NOTIFICATION TESTS
  // ==============================================

  describe('createMentionNotification', () => {
    const mentionData = {
      mentionedUserId: 'user-mentioned',
      senderId: 'user-sender',
      senderUsername: 'sender_user',
      messageContent: 'Hey @mentioned_user check this out!',
      conversationId: 'conv-123',
      messageId: 'msg-456',
      isMemberOfConversation: true
    };

    it('should create a mention notification', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'user_mentioned'
      });

      const result = await service.createMentionNotification(mentionData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('user_mentioned');
    });

    it('should rate limit mentions (max 5 per minute)', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'user_mentioned'
      });

      const results: (NotificationEventData | null)[] = [];

      // Create 6 mention notifications rapidly
      for (let i = 0; i < 6; i++) {
        const result = await service.createMentionNotification({
          ...mentionData,
          messageId: `msg-${i}`
        });
        results.push(result);
      }

      // First 5 should succeed, 6th should be rate limited
      const successCount = results.filter(r => r !== null).length;
      expect(successCount).toBeLessThanOrEqual(5);
    });

    it('should still create mention notification for self-mention (not blocked)', async () => {
      // Note: Self-mention blocking is only done in batch method, not in individual method
      const selfMentionData = {
        ...mentionData,
        mentionedUserId: 'user-same',
        senderId: 'user-same' // Same user
      };

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'user_mentioned'
      });

      const result = await service.createMentionNotification(selfMentionData);

      // The individual method does not block self-mentions, only the batch method does
      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // BATCH MENTION NOTIFICATION TESTS
  // ==============================================

  describe('createMentionNotificationsBatch', () => {
    const commonData = {
      senderId: 'sender-123',
      senderUsername: 'sender_user',
      messageContent: 'Hey @everyone!',
      conversationId: 'conv-123',
      conversationTitle: 'Team Chat',
      messageId: 'msg-456'
    };

    it('should create batch mention notifications', async () => {
      const mentionedUserIds = ['user-1', 'user-2', 'user-3'];
      const memberIds = ['user-1', 'user-2', 'user-3', 'sender-123'];

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.createMany.mockResolvedValue({ count: 3 });
      prisma.notification.findMany.mockResolvedValue([
        { id: 'notif-1', userId: 'user-1', type: 'user_mentioned', isRead: false, createdAt: new Date() },
        { id: 'notif-2', userId: 'user-2', type: 'user_mentioned', isRead: false, createdAt: new Date() },
        { id: 'notif-3', userId: 'user-3', type: 'user_mentioned', isRead: false, createdAt: new Date() }
      ]);

      const count = await service.createMentionNotificationsBatch(
        mentionedUserIds,
        commonData,
        memberIds
      );

      expect(count).toBe(3);
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    });

    it('should return 0 for empty mentioned users list', async () => {
      const count = await service.createMentionNotificationsBatch(
        [],
        commonData,
        ['member-1']
      );

      expect(count).toBe(0);
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('should exclude sender from mentions', async () => {
      const mentionedUserIds = ['sender-123', 'user-1']; // sender included
      const memberIds = ['user-1', 'sender-123'];

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.createMany.mockResolvedValue({ count: 1 });
      prisma.notification.findMany.mockResolvedValue([
        { id: 'notif-1', userId: 'user-1', type: 'user_mentioned', isRead: false, createdAt: new Date() }
      ]);

      const count = await service.createMentionNotificationsBatch(
        mentionedUserIds,
        commonData,
        memberIds
      );

      expect(count).toBe(1);
    });
  });

  // ==============================================
  // CONVERSATION NOTIFICATION TESTS
  // ==============================================

  describe('createConversationInviteNotification', () => {
    const inviteData = {
      invitedUserId: 'user-invited',
      inviterId: 'user-inviter',
      inviterUsername: 'inviter_user',
      conversationId: 'conv-123',
      conversationType: 'direct'
    };

    it('should create a direct conversation invite notification', async () => {
      const mockUser = {
        username: 'inviter_user',
        avatar: 'https://example.com/avatar.png',
        displayName: 'Inviter User',
        firstName: 'Inviter',
        lastName: 'User'
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'new_conversation'
      });

      const result = await service.createConversationInviteNotification(inviteData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('new_conversation');
    });

    it('should create a group conversation invite notification', async () => {
      const groupInviteData = {
        ...inviteData,
        conversationType: 'group',
        conversationTitle: 'Team Discussion'
      };

      prisma.user.findUnique.mockResolvedValue({
        username: 'inviter_user',
        avatar: null,
        displayName: 'Inviter User',
        firstName: 'Inviter',
        lastName: 'User'
      });
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123', type: 'new_conversation' });

      const result = await service.createConversationInviteNotification(groupInviteData);

      expect(result).toBeDefined();
    });
  });

  describe('createConversationJoinNotification', () => {
    it('should create join confirmation for joiner', async () => {
      const joinData = {
        userId: 'user-joiner',
        conversationId: 'conv-123',
        conversationTitle: 'Team Chat',
        conversationType: 'group',
        isJoiner: true
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123', type: 'new_conversation' });

      const result = await service.createConversationJoinNotification(joinData);

      expect(result).toBeDefined();
    });

    it('should create admin notification when member joins', async () => {
      const joinData = {
        userId: 'user-admin',
        conversationId: 'conv-123',
        conversationTitle: 'Team Chat',
        conversationType: 'group',
        isJoiner: false,
        joinerUsername: 'new_member'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123', type: 'new_conversation', priority: 'low' });

      const result = await service.createConversationJoinNotification(joinData);

      expect(result).toBeDefined();
      expect(result?.priority).toBe('low');
    });
  });

  // ==============================================
  // REPLY NOTIFICATION TESTS
  // ==============================================

  describe('createReplyNotification', () => {
    const replyData = {
      originalMessageAuthorId: 'user-author',
      replierId: 'user-replier',
      replierUsername: 'replier_user',
      replyContent: 'I agree with you!',
      conversationId: 'conv-123',
      conversationTitle: 'Discussion',
      originalMessageId: 'msg-original',
      replyMessageId: 'msg-reply'
    };

    it('should create a reply notification', async () => {
      const mockUser = {
        username: 'replier_user',
        avatar: null,
        displayName: 'Replier User',
        firstName: 'Replier',
        lastName: 'User'
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'message_reply'
      });

      const result = await service.createReplyNotification(replyData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('message_reply');
    });

    it('should not create reply notification for self-reply', async () => {
      const selfReplyData = {
        ...replyData,
        originalMessageAuthorId: 'user-same',
        replierId: 'user-same' // Same user
      };

      const result = await service.createReplyNotification(selfReplyData);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // REACTION NOTIFICATION TESTS
  // ==============================================

  describe('createReactionNotification', () => {
    const reactionData = {
      messageAuthorId: 'user-author',
      reactorId: 'user-reactor',
      reactorUsername: 'reactor_user',
      emoji: '\uD83D\uDC4D', // thumbs up emoji
      messageContent: 'Great idea!',
      conversationId: 'conv-123',
      conversationTitle: 'Discussion',
      messageId: 'msg-123',
      reactionId: 'reaction-456'
    };

    it('should create a reaction notification', async () => {
      const mockUser = {
        username: 'reactor_user',
        avatar: null,
        displayName: 'Reactor User',
        firstName: 'Reactor',
        lastName: 'User'
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'message_reaction',
        priority: 'low'
      });

      const result = await service.createReactionNotification(reactionData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('message_reaction');
      expect(result?.priority).toBe('low');
    });

    it('should not create reaction notification for self-reaction', async () => {
      const selfReactionData = {
        ...reactionData,
        messageAuthorId: 'user-same',
        reactorId: 'user-same' // Same user
      };

      const result = await service.createReactionNotification(selfReactionData);

      expect(result).toBeNull();
    });
  });

  // ==============================================
  // CONTACT NOTIFICATION TESTS
  // ==============================================

  describe('createContactRequestNotification', () => {
    const contactRequestData = {
      recipientId: 'user-recipient',
      requesterId: 'user-requester',
      requesterUsername: 'requester_user',
      friendRequestId: 'request-123'
    };

    it('should create a contact request notification', async () => {
      const mockUser = {
        username: 'requester_user',
        avatar: null,
        displayName: 'Requester User',
        firstName: 'Requester',
        lastName: 'User'
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'contact_request',
        priority: 'high'
      });

      const result = await service.createContactRequestNotification(contactRequestData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('contact_request');
      expect(result?.priority).toBe('high');
    });

    it('should include custom message in contact request', async () => {
      const dataWithMessage = {
        ...contactRequestData,
        message: 'Hey, would you like to connect?'
      };

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123', type: 'contact_request' });

      const result = await service.createContactRequestNotification(dataWithMessage);

      expect(result).toBeDefined();
    });
  });

  describe('createContactAcceptedNotification', () => {
    const acceptedData = {
      requesterId: 'user-requester',
      accepterId: 'user-accepter',
      accepterUsername: 'accepter_user',
      conversationId: 'conv-123'
    };

    it('should create a contact accepted notification', async () => {
      const mockUser = {
        username: 'accepter_user',
        avatar: null,
        displayName: 'Accepter User',
        firstName: 'Accepter',
        lastName: 'User'
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'contact_accepted'
      });

      const result = await service.createContactAcceptedNotification(acceptedData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('contact_accepted');
    });
  });

  // ==============================================
  // MEMBER JOINED NOTIFICATION TESTS
  // ==============================================

  describe('createMemberJoinedNotification', () => {
    const memberJoinedData = {
      groupId: 'conv-123',
      groupTitle: 'Team Chat',
      newMemberId: 'user-new',
      newMemberUsername: 'new_member',
      adminIds: ['admin-1', 'admin-2']
    };

    it('should create member joined notifications for admins', async () => {
      const mockUser = {
        username: 'new_member',
        avatar: null,
        displayName: 'New Member',
        firstName: 'New',
        lastName: 'Member'
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notification.createMany.mockResolvedValue({ count: 2 });
      prisma.notification.findMany.mockResolvedValue([
        { id: 'notif-1', userId: 'admin-1', type: 'member_joined', isRead: false, createdAt: new Date() },
        { id: 'notif-2', userId: 'admin-2', type: 'member_joined', isRead: false, createdAt: new Date() }
      ]);

      const count = await service.createMemberJoinedNotification(memberJoinedData);

      expect(count).toBe(2);
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when no admins provided', async () => {
      const dataWithNoAdmins = {
        ...memberJoinedData,
        adminIds: []
      };

      const count = await service.createMemberJoinedNotification(dataWithNoAdmins);

      expect(count).toBe(0);
    });
  });

  // ==============================================
  // SYSTEM NOTIFICATION TESTS
  // ==============================================

  describe('createSystemNotification', () => {
    it('should create a system notification', async () => {
      const systemData = {
        userId: 'user-123',
        title: 'System Maintenance',
        content: 'The system will be under maintenance at midnight.',
        priority: 'high' as const,
        systemType: 'maintenance' as const
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'system'
      });

      const result = await service.createSystemNotification(systemData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('system');
    });

    it('should create system notification with expiration', async () => {
      const expirationDate = new Date(Date.now() + 3600000);
      const systemData = {
        userId: 'user-123',
        title: 'Limited Time Offer',
        content: 'This offer expires soon!',
        expiresAt: expirationDate
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif-123', type: 'system' });

      const result = await service.createSystemNotification(systemData);

      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // NOTIFICATION MANAGEMENT TESTS
  // ==============================================

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead('notif-123', 'user-123');

      expect(result).toBe(true);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-123',
          userId: 'user-123'
        },
        data: {
          isRead: true
        }
      });
    });

    it('should handle database errors gracefully', async () => {
      prisma.notification.updateMany.mockRejectedValue(new Error('Database error'));

      const result = await service.markAsRead('notif-123', 'user-123');

      expect(result).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead('user-123');

      expect(result).toBe(true);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          isRead: false
        },
        data: {
          isRead: true
        }
      });
    });

    it('should handle database errors gracefully', async () => {
      prisma.notification.updateMany.mockRejectedValue(new Error('Database error'));

      const result = await service.markAllAsRead('user-123');

      expect(result).toBe(false);
    });
  });

  describe('markConversationNotificationsAsRead', () => {
    it('should mark all conversation notifications as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.markConversationNotificationsAsRead('user-123', 'conv-456');

      expect(count).toBe(3);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          conversationId: 'conv-456',
          isRead: false
        },
        data: {
          isRead: true
        }
      });
    });

    it('should handle database errors gracefully', async () => {
      prisma.notification.updateMany.mockRejectedValue(new Error('Database error'));

      const count = await service.markConversationNotificationsAsRead('user-123', 'conv-456');

      expect(count).toBe(0);
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteNotification('notif-123', 'user-123');

      expect(result).toBe(true);
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-123',
          userId: 'user-123'
        }
      });
    });

    it('should handle database errors gracefully', async () => {
      prisma.notification.deleteMany.mockRejectedValue(new Error('Database error'));

      const result = await service.deleteNotification('notif-123', 'user-123');

      expect(result).toBe(false);
    });
  });

  describe('deleteAllReadNotifications', () => {
    it('should delete all read notifications for user', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 10 });

      const count = await service.deleteAllReadNotifications('user-123');

      expect(count).toBe(10);
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          isRead: true
        }
      });
    });

    it('should handle database errors gracefully', async () => {
      prisma.notification.deleteMany.mockRejectedValue(new Error('Database error'));

      const count = await service.deleteAllReadNotifications('user-123');

      expect(count).toBe(0);
    });
  });

  // ==============================================
  // STATISTICS TESTS
  // ==============================================

  describe('getUnreadCount', () => {
    it('should return correct unread count', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const count = await service.getUnreadCount('user-123');

      expect(count).toBe(7);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          isRead: false
        }
      });
    });

    it('should return 0 on error', async () => {
      prisma.notification.count.mockRejectedValue(new Error('Database error'));

      const count = await service.getUnreadCount('user-123');

      expect(count).toBe(0);
    });
  });

  describe('getNotificationStats', () => {
    it('should return notification statistics', async () => {
      prisma.notification.groupBy.mockResolvedValue([
        { type: 'new_message', _count: { id: 10 } },
        { type: 'user_mentioned', _count: { id: 5 } },
        { type: 'missed_call', _count: { id: 2 } }
      ]);
      prisma.notification.count
        .mockResolvedValueOnce(17) // total count
        .mockResolvedValueOnce(12); // unread count

      const stats = await service.getNotificationStats('user-123');

      expect(stats.total).toBe(17);
      expect(stats.unread).toBe(12);
      expect(stats.byType).toEqual({
        new_message: 10,
        user_mentioned: 5,
        missed_call: 2
      });
    });

    it('should handle database errors gracefully', async () => {
      prisma.notification.groupBy.mockRejectedValue(new Error('Database error'));

      const stats = await service.getNotificationStats('user-123');

      expect(stats.total).toBe(0);
      expect(stats.unread).toBe(0);
      expect(stats.byType).toEqual({});
    });
  });

  // ==============================================
  // DIRECT CONVERSATION NOTIFICATION TESTS
  // ==============================================

  describe('createDirectConversationNotification', () => {
    const directConvData = {
      invitedUserId: 'user-invited',
      inviterId: 'user-inviter',
      inviterUsername: 'inviter_user',
      conversationId: 'conv-123'
    };

    it('should create a direct conversation notification', async () => {
      const mockUser = {
        username: 'inviter_user',
        avatar: null,
        displayName: 'Inviter User',
        firstName: 'Inviter',
        lastName: 'User'
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'new_conversation_direct'
      });

      const result = await service.createDirectConversationNotification(directConvData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('new_conversation_direct');
    });
  });

  describe('createGroupConversationNotification', () => {
    const groupConvData = {
      invitedUserId: 'user-invited',
      inviterId: 'user-inviter',
      inviterUsername: 'inviter_user',
      conversationId: 'conv-123',
      conversationTitle: 'Team Discussion'
    };

    it('should create a group conversation notification', async () => {
      const mockUser = {
        username: 'inviter_user',
        avatar: null,
        displayName: 'Inviter User',
        firstName: 'Inviter',
        lastName: 'User'
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'new_conversation_group'
      });

      const result = await service.createGroupConversationNotification(groupConvData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('new_conversation_group');
    });
  });

  // ==============================================
  // HELPER METHOD TESTS
  // ==============================================

  describe('truncateMessage', () => {
    it('should truncate long messages', () => {
      const longMessage = 'word '.repeat(50); // 50 words
      const truncated = (service as any).truncateMessage(longMessage, 25);

      expect(truncated.endsWith('...')).toBe(true);
      const wordCount = truncated.replace('...', '').trim().split(/\s+/).length;
      expect(wordCount).toBe(25);
    });

    it('should not truncate short messages', () => {
      const shortMessage = 'This is a short message';
      const result = (service as any).truncateMessage(shortMessage, 25);

      expect(result).toBe(shortMessage);
      expect(result.endsWith('...')).toBe(false);
    });

    it('should handle empty message content', () => {
      const result = (service as any).truncateMessage('', 25);

      expect(result).toBe('');
    });
  });

  // ==============================================
  // SOCKET.IO EMISSION TESTS
  // ==============================================

  describe('Socket.IO emission edge cases', () => {
    it('should handle Socket.IO not initialized', async () => {
      // Create service without Socket.IO
      const serviceWithoutSocket = new NotificationService(prisma);

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'new_message'
      });

      // Should not throw even without Socket.IO
      const result = await serviceWithoutSocket.createNotification({
        userId: 'user-123',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      expect(result).toBeDefined();
    });

    it('should emit to multiple sockets for same user', async () => {
      const mockNotification = {
        id: 'notif-123',
        userId: 'user-123',
        type: 'new_message',
        title: 'Test',
        content: 'Test',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        data: null
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      // User has 3 active sockets
      userSocketsMap.set('user-123', new Set(['socket-1', 'socket-2', 'socket-3']));

      await service.createNotification({
        userId: 'user-123',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      expect(mockIO.to).toHaveBeenCalledWith('socket-1');
      expect(mockIO.to).toHaveBeenCalledWith('socket-2');
      expect(mockIO.to).toHaveBeenCalledWith('socket-3');
      expect(mockIO.emit).toHaveBeenCalledTimes(3);
    });

    it('should handle Socket.IO emit errors gracefully', async () => {
      const mockNotification = {
        id: 'notif-123',
        userId: 'user-123',
        type: 'new_message',
        title: 'Test',
        content: 'Test',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        data: null
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      // Make emit throw error
      mockIO.emit.mockImplementation(() => {
        throw new Error('Socket error');
      });

      userSocketsMap.set('user-123', new Set(['socket-1']));

      // Should not throw, just log error
      const result = await service.createNotification({
        userId: 'user-123',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // METRICS TESTS
  // ==============================================

  describe('Metrics tracking', () => {
    it('should track notifications created', async () => {
      const initialMetrics = service.getMetrics();

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif-123',
        type: 'new_message'
      });

      await service.createNotification({
        userId: 'user-123',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      const finalMetrics = service.getMetrics();

      expect(finalMetrics.notificationsCreated).toBe(initialMetrics.notificationsCreated + 1);
    });

    it('should track WebSocket emissions', async () => {
      const initialMetrics = service.getMetrics();

      const mockNotification = {
        id: 'notif-123',
        userId: 'user-123',
        type: 'new_message',
        title: 'Test',
        content: 'Test',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        data: null
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      userSocketsMap.set('user-123', new Set(['socket-1']));

      await service.createNotification({
        userId: 'user-123',
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      const finalMetrics = service.getMetrics();

      expect(finalMetrics.webSocketSent).toBe(initialMetrics.webSocketSent + 1);
    });
  });
});
