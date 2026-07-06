/**
 * Tests for uncovered paths in NotificationService:
 * - createFriendAcceptedNotification
 * - createMemberJoinedNotification
 * - createTranslationReadyNotification
 * - createReplyNotification
 * - createConversationInviteNotification (missing inviterUsername path)
 * - markNotificationsByTypesAsRead
 * - deleteNotification error path
 * - isDNDActive + DND branch in shouldCreateNotification
 * - isTypeEnabled uncovered cases
 * - invalid type/priority security checks
 * - sanitizeDate edge cases
 * - private utility methods (truncateMessage, cleanupOldMentions, cleanupOldReactions)
 * - markAsRead / markAllAsRead error paths
 * - emitCountsUpdate error path
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '' },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''),
    sanitizeURL: jest.fn((input: string) => {
      if (!input) return null;
      try {
        const url = new URL(input);
        return ['http:', 'https:'].includes(url.protocol) ? input : null;
      } catch { return null; }
    }),
    sanitizeJSON: jest.fn((input: unknown) => input),
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
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
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
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    participant: {
      count: jest.fn().mockResolvedValue(5),
    },
    userPreferences: {
      findUnique: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
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

const mockChildLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() };
jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: {
    logViolation: jest.fn(),
    logAttempt: jest.fn(),
    logSuccess: jest.fn(),
  },
  enhancedLogger: { child: jest.fn(() => mockChildLogger) },
}));

const mockSetnx = jest.fn().mockResolvedValue(false);
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ setnx: mockSetnx }),
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import * as notificationsIndex from '../../../services/notifications/index';
import { PrismaClient } from '@meeshy/shared/prisma/client';

describe('notifications/index — exports', () => {
  it('should re-export NotificationService', () => {
    expect(notificationsIndex.NotificationService).toBeDefined();
  });
  it('should re-export NotificationFormatter', () => {
    expect(notificationsIndex.NotificationFormatter).toBeDefined();
  });
});

describe('NotificationService — Uncovered Paths', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;

  const mockNotif = (type: string) => ({
    id: `notif-${type}`,
    type,
    userId: 'user-1',
    isRead: false,
    createdAt: new Date(),
    actor: null,
    context: {},
    metadata: {},
    title: null,
    subtitle: null,
    priority: 'normal',
    readAt: null,
    expiresAt: null,
    collapseId: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    mockIO = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    service.setSocketIO(mockIO as any, new Map());
  });

  // ==============================================
  // createFriendAcceptedNotification
  // ==============================================

  describe('createFriendAcceptedNotification', () => {
    it('should create notification when accepter exists', async () => {
      prisma.user.findUnique.mockResolvedValue({
        username: 'alice', displayName: 'Alice', avatar: null,
      });
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotif('friend_accepted'));

      const result = await service.createFriendAcceptedNotification({
        recipientUserId: 'user-1',
        accepterUserId: 'user-2',
        conversationId: 'conv-1',
      });

      expect(result).toBeDefined();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        select: { username: true, displayName: true, avatar: true },
      });
    });

    it('should return null when accepter not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.createFriendAcceptedNotification({
        recipientUserId: 'user-1',
        accepterUserId: 'user-2',
      });
      expect(result).toBeNull();
    });
  });

  // ==============================================
  // createMemberJoinedNotification
  // ==============================================

  describe('createMemberJoinedNotification', () => {
    it('should create notification when new member exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'bob', displayName: 'Bob', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({ title: 'Team Chat', type: 'GROUP' });
      prisma.participant.count.mockResolvedValue(10);
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotif('member_joined'));

      const result = await service.createMemberJoinedNotification({
        recipientUserId: 'user-1',
        newMemberUserId: 'user-2',
        conversationId: 'conv-1',
        joinMethod: 'invited',
      });

      expect(result).toBeDefined();
    });

    it('should return null when new member not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue({ title: 'Team Chat', type: 'GROUP' });
      prisma.participant.count.mockResolvedValue(3);

      const result = await service.createMemberJoinedNotification({
        recipientUserId: 'user-1',
        newMemberUserId: 'user-2',
        conversationId: 'conv-1',
      });

      expect(result).toBeNull();
    });
  });

  // ==============================================
  // createTranslationReadyNotification
  // ==============================================

  describe('createTranslationReadyNotification', () => {
    it('should create notification', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ title: 'Conv', type: 'direct' });
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotif('translation_ready'));

      const result = await service.createTranslationReadyNotification({
        recipientUserId: 'user-1',
        messageId: 'msg-1',
        conversationId: 'conv-1',
      });

      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // createReplyNotification
  // ==============================================

  describe('createReplyNotification', () => {
    it('should create notification when replier exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'bob', displayName: 'Bob', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({ title: 'Chat', type: 'direct' });
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotif('message_reply'));

      const result = await service.createReplyNotification({
        recipientUserId: 'user-1',
        replierUserId: 'user-2',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        messagePreview: 'Reply text',
        originalMessageId: 'msg-0',
      });

      expect(result).toBeDefined();
    });

    it('should return null when replier not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue(null);

      const result = await service.createReplyNotification({
        recipientUserId: 'user-1',
        replierUserId: 'user-2',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        messagePreview: 'Reply text',
      });

      expect(result).toBeNull();
    });
  });

  // ==============================================
  // createConversationInviteNotification — no inviterUsername
  // ==============================================

  describe('createConversationInviteNotification — fetch inviter from DB', () => {
    it('should fetch inviter info when inviterUsername not provided', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'charlie', displayName: 'Charlie', avatar: null });
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotif('new_conversation_group'));

      const result = await service.createConversationInviteNotification({
        invitedUserId: 'user-1',
        inviterId: 'user-2',
        conversationId: 'conv-1',
        conversationTitle: 'My Group',
        conversationType: 'group',
      });

      expect(result).toBeDefined();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        select: { username: true, displayName: true, avatar: true },
      });
    });

    it('should create direct-type notification when conversationType is direct', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'charlie', displayName: 'Charlie', avatar: null });
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotif('new_conversation_direct'));

      const result = await service.createConversationInviteNotification({
        invitedUserId: 'user-1',
        inviterId: 'user-2',
        inviterUsername: 'charlie',
        conversationId: 'conv-direct',
        conversationType: 'direct',
      });

      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // markNotificationsByTypesAsRead
  // ==============================================

  describe('markNotificationsByTypesAsRead', () => {
    it('should update and return count when types matched', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.markNotificationsByTypesAsRead('user-1', ['friend_request', 'friend_accepted']);

      expect(count).toBe(3);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false, type: { in: ['friend_request', 'friend_accepted'] } },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });

    it('should return 0 for empty types array', async () => {
      const count = await service.markNotificationsByTypesAsRead('user-1', []);
      expect(count).toBe(0);
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it('should return 0 for non-array input', async () => {
      const count = await service.markNotificationsByTypesAsRead('user-1', null as any);
      expect(count).toBe(0);
    });

    it('should return 0 when updateMany throws', async () => {
      prisma.notification.updateMany.mockRejectedValue(new Error('DB error'));
      const count = await service.markNotificationsByTypesAsRead('user-1', ['friend_request']);
      expect(count).toBe(0);
    });

    it('should not emit counts when no notifications updated', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      await service.markNotificationsByTypesAsRead('user-1', ['friend_request']);
      expect(mockIO.emit).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // deleteNotification error path
  // ==============================================

  describe('deleteNotification — error path', () => {
    it('should return false when delete throws', async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: 'user-1' });
      prisma.notification.delete.mockRejectedValue(new Error('Delete failed'));

      const result = await service.deleteNotification('notif-id');
      expect(result).toBe(false);
    });
  });

  // ==============================================
  // isDNDActive & DND branch in shouldCreateNotification
  // ==============================================

  describe('shouldCreateNotification — DND active', () => {
    it('should return false when DND is active (no time restriction)', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        notification: {
          newMessageEnabled: true,
          dndEnabled: true,
          dndStartTime: '00:00',
          dndEndTime: '23:59',
          dndDays: null,
        },
      });

      const allowed = await (service as any).shouldCreateNotification('user-1', 'new_message');
      expect(allowed).toBe(false);
    });

    it('should block DND when current day is in dndDays', async () => {
      const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      const today = dayMap[new Date().getUTCDay()];
      prisma.userPreferences.findUnique.mockResolvedValue({
        notification: {
          newMessageEnabled: true,
          dndEnabled: true,
          dndStartTime: '00:00',
          dndEndTime: '23:59',
          dndDays: [today],
        },
      });

      const allowed = await (service as any).shouldCreateNotification('user-1', 'new_message');
      expect(allowed).toBe(false);
    });

    it('should allow when current day is NOT in dndDays', async () => {
      const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      const todayIdx = new Date().getUTCDay();
      const otherDay = dayMap[(todayIdx + 1) % 7];
      prisma.userPreferences.findUnique.mockResolvedValue({
        notification: {
          newMessageEnabled: true,
          dndEnabled: true,
          dndStartTime: '00:00',
          dndEndTime: '23:59',
          dndDays: [otherDay],
        },
      });
      prisma.notification.create.mockResolvedValue(mockNotif('new_message'));

      const allowed = await (service as any).shouldCreateNotification('user-1', 'new_message');
      expect(allowed).toBe(true);
    });

    it('should fail-open when preferences query throws', async () => {
      prisma.userPreferences.findUnique.mockRejectedValue(new Error('DB error'));
      const allowed = await (service as any).shouldCreateNotification('user-1', 'new_message');
      expect(allowed).toBe(true);
    });
  });

  // ==============================================
  // isTypeEnabled — uncovered switch cases
  // ==============================================

  describe('isTypeEnabled — uncovered cases', () => {
    const basePrefs = {
      newMessageEnabled: true,
      missedCallEnabled: false,
      systemEnabled: true,
      mentionEnabled: true,
      reactionEnabled: true,
      contactRequestEnabled: true,
      memberJoinedEnabled: false,
      replyEnabled: false,
      conversationEnabled: false,
      postLikeEnabled: true,
      postCommentEnabled: true,
      postRepostEnabled: true,
      storyReactionEnabled: false,
      commentLikeEnabled: true,
      commentReplyEnabled: true,
    };

    it('missed_call uses missedCallEnabled', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'missed_call');
      expect(result).toBe(false);
    });

    it('member_joined uses memberJoinedEnabled', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'member_joined');
      expect(result).toBe(false);
    });

    it('message_reply uses replyEnabled', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'message_reply');
      expect(result).toBe(false);
    });

    it('reply uses replyEnabled', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'reply');
      expect(result).toBe(false);
    });

    it('translation_ready always returns true', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'translation_ready');
      expect(result).toBe(true);
    });

    it('status_reaction uses storyReactionEnabled', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'status_reaction');
      expect(result).toBe(false);
    });

    it('new_conversation uses conversationEnabled', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'new_conversation');
      expect(result).toBe(false);
    });

    it('new_conversation_direct uses conversationEnabled', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'new_conversation_direct');
      expect(result).toBe(false);
    });

    it('new_conversation_group uses conversationEnabled', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'new_conversation_group');
      expect(result).toBe(false);
    });

    it('default unknown type returns true', () => {
      const result = (service as any).isTypeEnabled(basePrefs, 'unknown_type_xyz');
      expect(result).toBe(true);
    });
  });

  // ==============================================
  // isDNDActive — nocturne vs diurne
  // ==============================================

  describe('isDNDActive', () => {
    it('should return false when dndEnabled is false', () => {
      const result = (service as any).isDNDActive({ dndEnabled: false, dndStartTime: '22:00', dndEndTime: '08:00' });
      expect(result).toBe(false);
    });

    it('should handle nocturne DND (start > end) — during night', () => {
      const prefs = { dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00', dndDays: null };
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T23:00:00Z'));
      const result = (service as any).isDNDActive(prefs);
      jest.useRealTimers();
      expect(result).toBe(true);
    });

    it('should handle nocturne DND — outside window', () => {
      const prefs = { dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00', dndDays: null };
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T12:00:00Z'));
      const result = (service as any).isDNDActive(prefs);
      jest.useRealTimers();
      expect(result).toBe(false);
    });

    it('should handle diurne DND (start < end) — during window', () => {
      const prefs = { dndEnabled: true, dndStartTime: '14:00', dndEndTime: '16:00', dndDays: null };
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T15:00:00Z'));
      const result = (service as any).isDNDActive(prefs);
      jest.useRealTimers();
      expect(result).toBe(true);
    });

    it('should handle diurne DND — outside window', () => {
      const prefs = { dndEnabled: true, dndStartTime: '14:00', dndEndTime: '16:00', dndDays: null };
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T17:00:00Z'));
      const result = (service as any).isDNDActive(prefs);
      jest.useRealTimers();
      expect(result).toBe(false);
    });
  });

  // ==============================================
  // Security: invalid notification type / priority
  // ==============================================

  describe('createNotification — security checks', () => {
    const { SecuritySanitizer } = require('../../../utils/sanitize');

    it('should return null when notification type is invalid', async () => {
      SecuritySanitizer.isValidNotificationType.mockReturnValueOnce(false);

      const result = await (service as any).createNotification({
        userId: 'user-1',
        type: 'invalid_type',
        priority: 'normal',
        content: 'test',
        context: {},
        metadata: { action: 'view_details' },
      });

      expect(result).toBeNull();
    });

    it('should return null when priority is invalid', async () => {
      SecuritySanitizer.isValidNotificationType.mockReturnValueOnce(true);
      SecuritySanitizer.isValidPriority.mockReturnValueOnce(false);

      const result = await (service as any).createNotification({
        userId: 'user-1',
        type: 'new_message',
        priority: 'invalid_priority',
        content: 'test',
        context: {},
        metadata: { action: 'view_details' },
      });

      expect(result).toBeNull();
    });
  });

  // ==============================================
  // sanitizeDate — edge cases
  // ==============================================

  describe('sanitizeDate', () => {
    it('should return defaultValue for null input', () => {
      const result = (service as any).sanitizeDate(null);
      expect(result).toBeNull();
    });

    it('should return valid Date as-is', () => {
      const date = new Date('2024-01-15');
      const result = (service as any).sanitizeDate(date);
      expect(result).toBe(date);
    });

    it('should return defaultValue for invalid Date object', () => {
      const invalidDate = new Date('invalid');
      const result = (service as any).sanitizeDate(invalidDate, null);
      expect(result).toBeNull();
    });

    it('should convert valid date string', () => {
      const result = (service as any).sanitizeDate('2024-01-15T10:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(isNaN((result as Date).getTime())).toBe(false);
    });

    it('should return defaultValue for invalid date string', () => {
      const result = (service as any).sanitizeDate('not-a-date', null);
      expect(result).toBeNull();
    });
  });

  // ==============================================
  // truncateMessage
  // ==============================================

  describe('truncateMessage', () => {
    it('should return empty string for falsy input', () => {
      expect((service as any).truncateMessage('')).toBe('');
    });

    it('should return unchanged message when <= 25 words', () => {
      const msg = 'This is a short message';
      expect((service as any).truncateMessage(msg)).toBe(msg);
    });

    it('should truncate message to 25 words with ellipsis', () => {
      const words = Array.from({ length: 30 }, (_, i) => `word${i}`);
      const msg = words.join(' ');
      const result = (service as any).truncateMessage(msg);
      expect(result.endsWith('...')).toBe(true);
      expect(result.split(' ').length).toBe(25);
    });
  });

  // ==============================================
  // cleanupOldMentions / cleanupOldReactions
  // ==============================================

  describe('cleanupOldMentions', () => {
    it('should remove stale mention timestamps', () => {
      const recentMentions = (service as any).recentMentions as Map<string, number[]>;
      const now = Date.now();
      const WINDOW_MS = (service as any).MENTION_WINDOW_MS;
      recentMentions.set('stale-pair', [now - WINDOW_MS - 1000]);
      recentMentions.set('fresh-pair', [now - 1000]);
      recentMentions.set('mixed-pair', [now - WINDOW_MS - 1000, now - 1000]);

      (service as any).cleanupOldMentions();

      expect(recentMentions.has('stale-pair')).toBe(false);
      expect(recentMentions.has('fresh-pair')).toBe(true);
      expect(recentMentions.get('mixed-pair')).toHaveLength(1);
    });
  });

  describe('cleanupOldReactions', () => {
    it('should remove stale reaction timestamps', () => {
      const recentReactions = (service as any).recentReactions as Map<string, number[]>;
      const now = Date.now();
      const WINDOW_MS = (service as any).REACTION_WINDOW_MS;
      recentReactions.set('stale-pair', [now - WINDOW_MS - 1000]);
      recentReactions.set('fresh-pair', [now]);

      (service as any).cleanupOldReactions();

      expect(recentReactions.has('stale-pair')).toBe(false);
      expect(recentReactions.has('fresh-pair')).toBe(true);
    });
  });

  // ==============================================
  // shouldCreateMentionNotification — map overflow
  // ==============================================

  describe('shouldCreateMentionNotification — map overflow eviction', () => {
    it('should evict oldest entry when MAX_MENTION_MAP_ENTRIES exceeded', () => {
      const recentMentions = (service as any).recentMentions as Map<string, number[]>;
      const MAX_ENTRIES = (service as any).MAX_MENTION_MAP_ENTRIES as number;

      for (let i = 0; i < MAX_ENTRIES; i++) {
        recentMentions.set(`pair-${i}`, [Date.now()]);
      }
      expect(recentMentions.size).toBe(MAX_ENTRIES);

      const firstKey = recentMentions.keys().next().value;
      (service as any).shouldCreateMentionNotification('new-sender', 'new-recipient');

      expect(recentMentions.size).toBe(MAX_ENTRIES);
      expect(recentMentions.has(firstKey)).toBe(false);
    });
  });

  // ==============================================
  // markAsRead — error path
  // ==============================================

  describe('markAsRead — error path', () => {
    it('should return null when update throws', async () => {
      prisma.notification.update.mockRejectedValue(new Error('Update failed'));
      const result = await service.markAsRead('notif-id');
      expect(result).toBeNull();
    });
  });

  // ==============================================
  // markAllAsRead — error path
  // ==============================================

  describe('markAllAsRead — error path', () => {
    it('should return 0 when updateMany throws', async () => {
      prisma.notification.updateMany.mockRejectedValue(new Error('Update all failed'));
      const result = await service.markAllAsRead('user-1');
      expect(result).toBe(0);
    });
  });

  // ==============================================
  // emitCountsUpdate — error path
  // ==============================================

  describe('emitCountsUpdate — error path', () => {
    it('should log error when count query fails', async () => {
      prisma.notification.count.mockRejectedValue(new Error('Count failed'));
      const { notificationLogger } = require('../../../utils/logger-enhanced');

      await (service as any).emitCountsUpdate('user-1');

      expect(notificationLogger.error).toHaveBeenCalledWith(
        'Failed to emit notification counts',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });
});
