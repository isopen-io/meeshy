/**
 * Unit tests for new NotificationService methods:
 * - createAddedToConversationNotification
 * - createRemovedFromConversationNotification
 * - createMemberRemovedNotification
 * - createMemberRoleChangedNotification
 * - createMemberLeftNotification
 * - createPasswordChangedNotification
 * - createTwoFactorNotification
 * - createLoginNewDeviceNotification
 * - isTypeEnabled for new types
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '',
  },
}));

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
      const sanitize = (obj: any): any => {
        if (typeof obj === 'string') return obj.replace(/<[^>]*>/g, '');
        if (Array.isArray(obj)) return obj.map(sanitize);
        if (typeof obj === 'object' && obj !== null) {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            if (!key.startsWith('$') && !key.startsWith('__')) {
              result[key] = sanitize(value);
            }
          }
          return result;
        }
        return obj;
      };
      return sanitize(input);
    }),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

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
      createMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    userPreferences: {
      findUnique: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn(), logAttempt: jest.fn(), logSuccess: jest.fn() },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

describe('NotificationService — New Methods', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    prisma = new PrismaClient();
    service = new NotificationService(prisma);

    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    service.setSocketIO(mockIO as any, new Map());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockActor = {
    username: 'admin_user',
    displayName: 'Admin User',
    avatar: 'https://cdn.example.com/avatar.png',
  };

  const mockConversation = {
    title: 'Team Chat',
    type: 'GROUP',
  };

  const mockNotification = (type: string) => ({
    id: `notif-${type}`,
    type,
    isRead: false,
    createdAt: new Date(),
  });

  // ==============================================
  // createAddedToConversationNotification
  // ==============================================

  describe('createAddedToConversationNotification', () => {
    const params = {
      recipientUserId: '507f1f77bcf86cd799439011',
      addedByUserId: '507f1f77bcf86cd799439022',
      conversationId: 'conv-123',
    };

    it('should create notification with actor and conversation context', async () => {
      prisma.user.findUnique.mockResolvedValue(mockActor);
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('added_to_conversation'));

      const result = await service.createAddedToConversationNotification(params);

      expect(result).toBeDefined();
      expect(result?.type).toBe('added_to_conversation');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: params.addedByUserId },
        select: { username: true, displayName: true, avatar: true },
      });
      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: params.conversationId },
        select: { title: true, type: true },
      });
    });

    it('should return null when actor not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createAddedToConversationNotification(params);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should create notification even when conversation not found', async () => {
      prisma.user.findUnique.mockResolvedValue(mockActor);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('added_to_conversation'));

      const result = await service.createAddedToConversationNotification(params);

      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // createRemovedFromConversationNotification
  // ==============================================

  describe('createRemovedFromConversationNotification', () => {
    const params = {
      recipientUserId: '507f1f77bcf86cd799439011',
      removedByUserId: '507f1f77bcf86cd799439022',
      conversationId: 'conv-123',
    };

    it('should create removed_from_conversation notification', async () => {
      prisma.user.findUnique.mockResolvedValue(mockActor);
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('removed_from_conversation'));

      const result = await service.createRemovedFromConversationNotification(params);

      expect(result).toBeDefined();
      expect(result?.type).toBe('removed_from_conversation');
    });

    it('should return null when actor not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createRemovedFromConversationNotification(params);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // createMemberRemovedNotification
  // ==============================================

  describe('createMemberRemovedNotification', () => {
    const params = {
      recipientUserId: '507f1f77bcf86cd799439011',
      removedByUserId: '507f1f77bcf86cd799439022',
      conversationId: 'conv-123',
    };

    it('should create member_removed notification', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'mod', displayName: 'Mod', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('member_removed'));

      const result = await service.createMemberRemovedNotification(params);

      expect(result).toBeDefined();
      expect(result?.type).toBe('member_removed');
    });

    it('should return null when actor not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createMemberRemovedNotification(params);

      expect(result).toBeNull();
    });
  });

  // ==============================================
  // createMemberRoleChangedNotification
  // ==============================================

  describe('createMemberRoleChangedNotification', () => {
    const baseParams = {
      recipientUserId: '507f1f77bcf86cd799439011',
      changedByUserId: '507f1f77bcf86cd799439022',
      conversationId: 'conv-123',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(mockActor);
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.userPreferences.findUnique.mockResolvedValue(null);
    });

    it('should create member_promoted when MEMBER → ADMIN', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification('member_promoted'));

      const result = await service.createMemberRoleChangedNotification({
        ...baseParams,
        newRole: 'ADMIN',
        previousRole: 'MEMBER',
      });

      expect(result?.type).toBe('member_promoted');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'member_promoted' }),
        })
      );
    });

    it('should create member_demoted when ADMIN → MEMBER', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification('member_demoted'));

      const result = await service.createMemberRoleChangedNotification({
        ...baseParams,
        newRole: 'MEMBER',
        previousRole: 'ADMIN',
      });

      expect(result?.type).toBe('member_demoted');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'member_demoted' }),
        })
      );
    });

    it('should create member_promoted for MEMBER → MODERATOR', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification('member_promoted'));

      const result = await service.createMemberRoleChangedNotification({
        ...baseParams,
        newRole: 'MODERATOR',
        previousRole: 'MEMBER',
      });

      expect(result?.type).toBe('member_promoted');
    });

    it('should create member_demoted for MODERATOR → MEMBER', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification('member_demoted'));

      const result = await service.createMemberRoleChangedNotification({
        ...baseParams,
        newRole: 'MEMBER',
        previousRole: 'MODERATOR',
      });

      expect(result?.type).toBe('member_demoted');
    });

    it('should include newRole and previousRole in metadata', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification('member_promoted'));

      await service.createMemberRoleChangedNotification({
        ...baseParams,
        newRole: 'ADMIN',
        previousRole: 'MEMBER',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              newRole: 'ADMIN',
              previousRole: 'MEMBER',
            }),
          }),
        })
      );
    });

    it('should return null when actor not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createMemberRoleChangedNotification({
        ...baseParams,
        newRole: 'ADMIN',
        previousRole: 'MEMBER',
      });

      expect(result).toBeNull();
    });
  });

  // ==============================================
  // createMemberLeftNotification
  // ==============================================

  describe('createMemberLeftNotification', () => {
    const params = {
      recipientUserId: '507f1f77bcf86cd799439011',
      memberUserId: '507f1f77bcf86cd799439033',
      conversationId: 'conv-123',
    };

    it('should create member_left notification with low priority', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'leaver', displayName: 'Leaver', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('member_left'));

      const result = await service.createMemberLeftNotification(params);

      expect(result).toBeDefined();
      expect(result?.type).toBe('member_left');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 'low' }),
        })
      );
    });

    it('should fetch memberUserId as actor (not recipientUserId)', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'leaver', displayName: 'L', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('member_left'));

      await service.createMemberLeftNotification(params);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: params.memberUserId },
        select: { username: true, displayName: true, avatar: true },
      });
    });

    it('should return null when member user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createMemberLeftNotification(params);

      expect(result).toBeNull();
    });
  });

  // ==============================================
  // createPasswordChangedNotification
  // ==============================================

  describe('createPasswordChangedNotification', () => {
    it('should create password_changed with high priority and empty content', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('password_changed'));

      const result = await service.createPasswordChangedNotification({
        recipientUserId: '507f1f77bcf86cd799439011',
      });

      expect(result).toBeDefined();
      expect(result?.type).toBe('password_changed');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 'high',
            content: '',
          }),
        })
      );
    });

    it('should not fetch any user (self-action, no actor)', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('password_changed'));

      await service.createPasswordChangedNotification({
        recipientUserId: '507f1f77bcf86cd799439011',
      });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // createTwoFactorNotification
  // ==============================================

  describe('createTwoFactorNotification', () => {
    it('should create two_factor_enabled when enabled=true', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('two_factor_enabled'));

      const result = await service.createTwoFactorNotification({
        recipientUserId: '507f1f77bcf86cd799439011',
        enabled: true,
      });

      expect(result?.type).toBe('two_factor_enabled');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'two_factor_enabled',
            priority: 'high',
          }),
        })
      );
    });

    it('should create two_factor_disabled when enabled=false', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('two_factor_disabled'));

      const result = await service.createTwoFactorNotification({
        recipientUserId: '507f1f77bcf86cd799439011',
        enabled: false,
      });

      expect(result?.type).toBe('two_factor_disabled');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'two_factor_disabled' }),
        })
      );
    });
  });

  // ==============================================
  // createLoginNewDeviceNotification
  // ==============================================

  describe('createLoginNewDeviceNotification', () => {
    it('should create login_new_device with high priority', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('login_new_device'));

      const result = await service.createLoginNewDeviceNotification({
        recipientUserId: '507f1f77bcf86cd799439011',
        deviceInfo: 'iPhone 16 Pro / iOS 18.0',
        ipAddress: '192.168.1.42',
      });

      expect(result).toBeDefined();
      expect(result?.type).toBe('login_new_device');
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 'high' }),
        })
      );
    });

    it('should include deviceInfo and ipAddress in metadata when provided', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('login_new_device'));

      await service.createLoginNewDeviceNotification({
        recipientUserId: '507f1f77bcf86cd799439011',
        deviceInfo: 'Chrome on macOS',
        ipAddress: '10.0.0.1',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              deviceInfo: 'Chrome on macOS',
              ipAddress: '10.0.0.1',
            }),
          }),
        })
      );
    });

    it('should omit deviceInfo/ipAddress from metadata when not provided', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification('login_new_device'));

      await service.createLoginNewDeviceNotification({
        recipientUserId: '507f1f77bcf86cd799439011',
      });

      const createCall = prisma.notification.create.mock.calls[0][0];
      const metadata = createCall.data.metadata;

      expect(metadata).toBeDefined();
      expect(metadata).not.toHaveProperty('deviceInfo');
      expect(metadata).not.toHaveProperty('ipAddress');
      expect(metadata).toHaveProperty('action', 'view_details');
    });
  });

  // ==============================================
  // isTypeEnabled — Preference checks for new types
  // ==============================================

  describe('isTypeEnabled for new notification types', () => {
    const createUserPrefs = (overrides: Record<string, any> = {}) => ({
      userId: 'user-123',
      notification: {
        newMessageEnabled: true,
        missedCallEnabled: true,
        systemEnabled: true,
        mentionEnabled: true,
        reactionEnabled: true,
        contactRequestEnabled: true,
        memberJoinedEnabled: true,
        replyEnabled: true,
        postLikeEnabled: true,
        postCommentEnabled: true,
        postRepostEnabled: true,
        storyReactionEnabled: true,
        commentLikeEnabled: false,
        commentReplyEnabled: true,
        dndEnabled: false,
        ...overrides,
      },
    });

    it('should block member_left when memberJoinedEnabled=false', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(
        createUserPrefs({ memberJoinedEnabled: false })
      );
      prisma.user.findUnique.mockResolvedValue(mockActor);
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.createMemberLeftNotification({
        recipientUserId: 'user-123',
        memberUserId: '507f1f77bcf86cd799439022',
        conversationId: 'conv-123',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should block added_to_conversation when memberJoinedEnabled=false', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(
        createUserPrefs({ memberJoinedEnabled: false })
      );
      prisma.user.findUnique.mockResolvedValue(mockActor);
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.createAddedToConversationNotification({
        recipientUserId: 'user-123',
        addedByUserId: '507f1f77bcf86cd799439022',
        conversationId: 'conv-123',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should block role change when memberJoinedEnabled=false', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(
        createUserPrefs({ memberJoinedEnabled: false })
      );
      prisma.user.findUnique.mockResolvedValue(mockActor);
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.createMemberRoleChangedNotification({
        recipientUserId: 'user-123',
        changedByUserId: '507f1f77bcf86cd799439022',
        conversationId: 'conv-123',
        newRole: 'ADMIN',
        previousRole: 'MEMBER',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should allow member types when memberJoinedEnabled=true', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(
        createUserPrefs({ memberJoinedEnabled: true })
      );
      prisma.user.findUnique.mockResolvedValue(mockActor);
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.notification.create.mockResolvedValue(mockNotification('member_left'));

      const result = await service.createMemberLeftNotification({
        recipientUserId: 'user-123',
        memberUserId: '507f1f77bcf86cd799439022',
        conversationId: 'conv-123',
      });

      expect(result).toBeDefined();
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('should always allow security types even when all prefs disabled', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(
        createUserPrefs({
          systemEnabled: false,
          memberJoinedEnabled: false,
          newMessageEnabled: false,
        })
      );

      // password_changed
      prisma.notification.create.mockResolvedValue(mockNotification('password_changed'));
      const pwResult = await service.createPasswordChangedNotification({
        recipientUserId: 'user-123',
      });
      expect(pwResult).toBeDefined();
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);

      // two_factor_enabled
      prisma.notification.create.mockClear();
      prisma.notification.create.mockResolvedValue(mockNotification('two_factor_enabled'));
      const tfResult = await service.createTwoFactorNotification({
        recipientUserId: 'user-123',
        enabled: true,
      });
      expect(tfResult).toBeDefined();
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);

      // login_new_device
      prisma.notification.create.mockClear();
      prisma.notification.create.mockResolvedValue(mockNotification('login_new_device'));
      const loginResult = await service.createLoginNewDeviceNotification({
        recipientUserId: 'user-123',
      });
      expect(loginResult).toBeDefined();
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });
});
