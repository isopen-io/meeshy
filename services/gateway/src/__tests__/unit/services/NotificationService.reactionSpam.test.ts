/**
 * NotificationService.reactionSpam.test.ts
 *
 * Phase 4B — B5: Per-pair rate limit on reaction notifications.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s ?? ''),
    sanitizeUsername: jest.fn((s: string) => s ?? ''),
    sanitizeURL: jest.fn((s: string) => s ?? null),
    sanitizeJSON: jest.fn((x: unknown) => x),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    conversation: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../services/notifications/NotificationService';

// ===== TESTS =====

describe('NotificationService — B5 reaction anti-spam', () => {
  let service: NotificationService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();

    // Default mock returns
    prisma.notification.create.mockImplementation((data: any) => ({
      id: `n-${Math.random()}`,
      ...data.data,
    }));
    prisma.user.findUnique.mockResolvedValue({ username: 'u', displayName: 'U', avatar: null });
    prisma.conversation.findUnique.mockResolvedValue({ title: 'c', type: 'direct' });
    prisma.message.findUnique.mockResolvedValue({ content: 'msg' });
    prisma.userPreferences.findUnique.mockResolvedValue(null); // fail-open: allow all

    // Fresh instance = fresh rate-limit Maps
    service = new NotificationService(prisma);
  });

  // ==============================================
  // createPostLikeNotification
  // ==============================================

  describe('createPostLikeNotification', () => {
    it('should create the first 5 notifications within the window', async () => {
      const params = { actorId: 'A', postId: 'p1', postAuthorId: 'X', emoji: '❤️', postType: 'POST' as const };
      for (let i = 0; i < 5; i++) await service.createPostLikeNotification(params);
      expect(prisma.notification.create).toHaveBeenCalledTimes(5);
    });

    it('should suppress the 6th notification from the same sender within 60s', async () => {
      const params = { actorId: 'A', postId: 'p1', postAuthorId: 'X', emoji: '❤️', postType: 'POST' as const };
      for (let i = 0; i < 6; i++) await service.createPostLikeNotification(params);
      expect(prisma.notification.create).toHaveBeenCalledTimes(5);
    });

    it('should allow a different sender to the same author independently', async () => {
      const pA = { actorId: 'A', postId: 'p1', postAuthorId: 'X', emoji: '❤️', postType: 'POST' as const };
      const pB = { actorId: 'B', postId: 'p1', postAuthorId: 'X', emoji: '❤️', postType: 'POST' as const };
      for (let i = 0; i < 5; i++) {
        await service.createPostLikeNotification(pA);
        await service.createPostLikeNotification(pB);
      }
      expect(prisma.notification.create).toHaveBeenCalledTimes(10);
    });

    it('should NOT create a notification for self-likes (actor === author)', async () => {
      const result = await service.createPostLikeNotification({ actorId: 'self', postId: 'p1', postAuthorId: 'self', emoji: '❤️' });
      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // createCommentReactionNotification
  // ==============================================

  describe('createCommentReactionNotification', () => {
    it('should create the first 5 notifications within the window', async () => {
      const params = { commentAuthorId: 'CA', reactorUserId: 'R', commentId: 'c1', postId: 'p1', reactionEmoji: '😂' };
      for (let i = 0; i < 5; i++) await service.createCommentReactionNotification(params);
      expect(prisma.notification.create).toHaveBeenCalledTimes(5);
    });

    it('should suppress the 6th comment reaction notification within 60s', async () => {
      const params = { commentAuthorId: 'CA', reactorUserId: 'R', commentId: 'c1', postId: 'p1', reactionEmoji: '😂' };
      for (let i = 0; i < 6; i++) await service.createCommentReactionNotification(params);
      expect(prisma.notification.create).toHaveBeenCalledTimes(5);
    });

    it('should NOT create a notification for self-reactions', async () => {
      await service.createCommentReactionNotification({ commentAuthorId: 'self', reactorUserId: 'self', commentId: 'c1', postId: 'p1', reactionEmoji: '❤️' });
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // createReactionNotification (message reactions)
  // ==============================================

  describe('createReactionNotification (message reactions)', () => {
    it('should create the first 5 notifications within the window', async () => {
      const params = { messageAuthorId: 'MA', reactorUserId: 'R', messageId: 'm1', conversationId: 'cv1', reactionEmoji: '👍' };
      for (let i = 0; i < 5; i++) await service.createReactionNotification(params);
      expect(prisma.notification.create).toHaveBeenCalledTimes(5);
    });

    it('should suppress the 6th message reaction notification within 60s', async () => {
      const params = { messageAuthorId: 'MA', reactorUserId: 'R', messageId: 'm1', conversationId: 'cv1', reactionEmoji: '👍' };
      for (let i = 0; i < 6; i++) await service.createReactionNotification(params);
      expect(prisma.notification.create).toHaveBeenCalledTimes(5);
    });
  });

  // ==============================================
  // Shared window across reaction types
  // ==============================================

  describe('shared rate-limit window per pair', () => {
    it('post-like and comment-reaction share the same window for a sender→recipient pair', async () => {
      const actor = 'actor-1';
      const target = 'target-1';

      // 3 via post likes
      for (let i = 0; i < 3; i++) {
        await service.createPostLikeNotification({ actorId: actor, postId: `p${i}`, postAuthorId: target, emoji: '❤️', postType: 'POST' });
      }
      // 2 via comment reactions (fills window to 5)
      for (let i = 0; i < 2; i++) {
        await service.createCommentReactionNotification({ commentAuthorId: target, reactorUserId: actor, commentId: `c${i}`, postId: 'p', reactionEmoji: '😂' });
      }
      // 6th — should be suppressed
      await service.createCommentReactionNotification({ commentAuthorId: target, reactorUserId: actor, commentId: 'c99', postId: 'p', reactionEmoji: '😂' });

      expect(prisma.notification.create).toHaveBeenCalledTimes(5);
    });
  });
});
