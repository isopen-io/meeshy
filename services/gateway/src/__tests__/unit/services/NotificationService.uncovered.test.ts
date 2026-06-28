/**
 * NotificationService — uncovered branches (iter coverage)
 *
 * Covers:
 *  - createFriendAcceptedNotification (found / not found)
 *  - createMemberJoinedNotification (found / not found)
 *  - createTranslationReadyNotification
 *  - createReplyNotification (found / not found)
 *  - createMentionNotificationsBatch (self-skip, non-member-skip, rate-limited, count)
 *  - createMessageNotification sender-not-found path
 *  - createMentionNotification rate-limited path
 *  - createConversationInviteNotification without inviterUsername
 *  - markAsRead / markAllAsRead error paths
 *  - markNotificationsByTypesAsRead (empty, success, error)
 *  - deleteNotification error path
 *  - getUserNotifications with unreadOnly:true
 *  - setEmailService
 *  - cleanupOldMentions / cleanupOldReactions private helpers
 *  - shouldCreateMentionNotification / shouldCreateReactionNotification map eviction
 *  - sanitizeDate with invalid Date object
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn<any>((input: string) => input?.replace(/<[^>]*>/g, '') ?? ''),
    sanitizeUsername: jest.fn<any>((input: string) =>
      input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) ?? ''),
    sanitizeURL: jest.fn<any>((input: string) => {
      if (!input) return null;
      try {
        const url = new URL(input);
        return ['http:', 'https:'].includes(url.protocol) ? input : null;
      } catch { return null; }
    }),
    sanitizeJSON: jest.fn<any>((input: any) => {
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
    isValidNotificationType: jest.fn<any>(() => true),
    isValidPriority: jest.fn<any>(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create:     jest.fn<any>(),
      findMany:   jest.fn<any>(),
      findUnique: jest.fn<any>(),
      update:     jest.fn<any>(),
      updateMany: jest.fn<any>(),
      delete:     jest.fn<any>(),
      count:      jest.fn<any>(),
    },
    user:              { findUnique: jest.fn<any>(), findMany: jest.fn<any>() },
    conversation:      { findUnique: jest.fn<any>() },
    participant:       { count: jest.fn<any>() },
    userPreferences:   { findUnique: jest.fn<any>() },
    message:           { findUnique: jest.fn<any>() },
    $runCommandRaw:    jest.fn<any>(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: jest.fn(() => ({ send: jest.fn() })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn<any>(), debug: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn<any>(), debug: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>() },
  securityLogger: { logViolation: jest.fn<any>(), logAttempt: jest.fn<any>(), logSuccess: jest.fn<any>() },
  enhancedLogger: {
    child: jest.fn<any>(() => ({
      info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>(),
    })),
  },
}));

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  NotificationService,
  contentTypeIcon,
  formatEphemeralDuration,
  protectedPreview,
} from '../../../services/notifications/NotificationService';

// ── constants ──────────────────────────────────────────────────────────────────

const USER_ALICE = '64a000000000000000000001';
const USER_BOB   = '64a000000000000000000002';
const CONV_ID    = '64b000000000000000000001';
const MSG_ID     = '64c000000000000000000001';

// ── helpers ────────────────────────────────────────────────────────────────────

const makeRawNotif = (type = 'system') => ({
  id: `notif-${type}`,
  userId: USER_ALICE,
  type,
  isRead: false,
  priority: 'normal',
  title: null,
  subtitle: null,
  content: 'test',
  actor: null,
  context: {},
  metadata: {},
  delivery: { emailSent: false, pushSent: false },
  createdAt: new Date('2025-01-01T00:00:00Z'),
  readAt: null,
  expiresAt: null,
});

const ACTOR = { username: 'bob', displayName: 'Bob', avatar: null };
const CONV  = { title: 'Chat', type: 'direct' };

// ── shared test context ────────────────────────────────────────────────────────

let service: NotificationService;
let prisma: any;
let mockIO: any;

beforeEach(() => {
  jest.clearAllMocks();
  prisma  = new PrismaClient();
  service = new NotificationService(prisma);

  mockIO = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
  service.setSocketIO(mockIO as any, new Map());

  // Default mocks — override in individual tests as needed
  prisma.notification.count.mockResolvedValue(0);
  prisma.userPreferences.findUnique.mockResolvedValue(null); // shouldCreateNotification: allowed
  prisma.user.findUnique.mockResolvedValue(ACTOR);
  prisma.user.findMany.mockResolvedValue([]);
  prisma.conversation.findUnique.mockResolvedValue(CONV);
  prisma.message.findUnique.mockResolvedValue({
    deletedAt: null, expiresAt: null, isViewOnce: false, viewOnceCount: 0,
  });
});

// ── createFriendAcceptedNotification ──────────────────────────────────────────

describe('createFriendAcceptedNotification', () => {
  it('creates notification when accepter exists', async () => {
    prisma.notification.create.mockResolvedValue(makeRawNotif('friend_accepted'));

    const result = await service.createFriendAcceptedNotification({
      recipientUserId: USER_ALICE,
      accepterUserId:  USER_BOB,
    });

    expect(result).not.toBeNull();
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('returns null when accepter not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createFriendAcceptedNotification({
      recipientUserId: USER_ALICE,
      accepterUserId:  USER_BOB,
    });

    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createMemberJoinedNotification ────────────────────────────────────────────

describe('createMemberJoinedNotification', () => {
  it('creates notification when newMember exists', async () => {
    prisma.participant.count.mockResolvedValue(5);
    prisma.notification.create.mockResolvedValue(makeRawNotif('member_joined'));

    const result = await service.createMemberJoinedNotification({
      recipientUserId:  USER_ALICE,
      newMemberUserId:  USER_BOB,
      conversationId:   CONV_ID,
      joinMethod: 'invited',
    });

    expect(result).not.toBeNull();
    expect(prisma.participant.count).toHaveBeenCalledWith({
      where: { conversationId: CONV_ID },
    });
  });

  it('returns null when newMember not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.participant.count.mockResolvedValue(0);

    const result = await service.createMemberJoinedNotification({
      recipientUserId: USER_ALICE,
      newMemberUserId: USER_BOB,
      conversationId:  CONV_ID,
    });

    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createTranslationReadyNotification ────────────────────────────────────────

describe('createTranslationReadyNotification', () => {
  it('creates notification with conversation context', async () => {
    prisma.notification.create.mockResolvedValue(makeRawNotif('translation_ready'));

    const result = await service.createTranslationReadyNotification({
      recipientUserId: USER_ALICE,
      messageId:       MSG_ID,
      conversationId:  CONV_ID,
    });

    expect(result).not.toBeNull();
    const callArgs = prisma.notification.create.mock.calls[0][0] as any;
    expect(callArgs.data.type).toBe('translation_ready');
  });
});

// ── createReplyNotification ───────────────────────────────────────────────────

describe('createReplyNotification', () => {
  it('creates notification when replier exists', async () => {
    prisma.notification.create.mockResolvedValue(makeRawNotif('message_reply'));

    const result = await service.createReplyNotification({
      recipientUserId: USER_ALICE,
      replierUserId:   USER_BOB,
      messageId:       MSG_ID,
      conversationId:  CONV_ID,
      messagePreview:  'Hey!',
    });

    expect(result).not.toBeNull();
  });

  it('returns null when replier not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createReplyNotification({
      recipientUserId: USER_ALICE,
      replierUserId:   USER_BOB,
      messageId:       MSG_ID,
      conversationId:  CONV_ID,
      messagePreview:  'Hey!',
    });

    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createMentionNotification — rate-limited ──────────────────────────────────

describe('createMentionNotification — rate-limited path', () => {
  it('returns null when the pair is rate-limited', async () => {
    prisma.notification.create.mockResolvedValue(makeRawNotif('user_mentioned'));

    // Exhaust rate limit (MAX_MENTIONS_PER_MINUTE = 5)
    for (let i = 0; i < 5; i++) {
      await service.createMentionNotification({
        mentionedUserId:  USER_ALICE,
        mentionerUserId:  USER_BOB,
        messageId:        `msg-${i}`,
        conversationId:   CONV_ID,
        messagePreview:   'hello',
      });
    }

    jest.clearAllMocks();
    prisma.notification.create.mockResolvedValue(makeRawNotif('user_mentioned'));

    // 6th call — should be blocked
    const result = await service.createMentionNotification({
      mentionedUserId: USER_ALICE,
      mentionerUserId: USER_BOB,
      messageId:       'msg-6',
      conversationId:  CONV_ID,
      messagePreview:  'hello',
    });

    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createMentionNotificationsBatch ──────────────────────────────────────────

describe('createMentionNotificationsBatch', () => {
  const commonData = {
    senderId:        USER_BOB,
    senderUsername:  'bob',
    messageContent:  'Hello @alice',
    conversationId:  CONV_ID,
    messageId:       MSG_ID,
  };

  it('skips the sender from the batch', async () => {
    const result = await service.createMentionNotificationsBatch(
      [USER_BOB],              // only the sender mentioned
      commonData,
      [USER_ALICE, USER_BOB],  // memberIds
    );
    expect(result).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('skips users not in memberIds', async () => {
    const OUTSIDER = '64a000000000000000000099';
    const result = await service.createMentionNotificationsBatch(
      [OUTSIDER],
      commonData,
      [USER_ALICE, USER_BOB],
    );
    expect(result).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('returns count of successful mention notifications', async () => {
    prisma.notification.create.mockResolvedValue(makeRawNotif('user_mentioned'));

    const result = await service.createMentionNotificationsBatch(
      [USER_ALICE],
      commonData,
      [USER_ALICE, USER_BOB],
    );
    expect(result).toBe(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('skips rate-limited mentions within the batch', async () => {
    // Pre-exhaust the rate limit for BOB→ALICE
    prisma.notification.create.mockResolvedValue(makeRawNotif('user_mentioned'));
    for (let i = 0; i < 5; i++) {
      await service.createMentionNotification({
        mentionedUserId:  USER_ALICE,
        mentionerUserId:  USER_BOB,
        messageId:        `pre-${i}`,
        conversationId:   CONV_ID,
        messagePreview:   'pre',
      });
    }
    jest.clearAllMocks();
    prisma.notification.create.mockResolvedValue(makeRawNotif('user_mentioned'));

    const result = await service.createMentionNotificationsBatch(
      [USER_ALICE],
      commonData,
      [USER_ALICE, USER_BOB],
    );

    expect(result).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createMessageNotification — sender not found ──────────────────────────────

describe('createMessageNotification — sender not found', () => {
  it('returns null when sender is not found', async () => {
    // message must exist and be valid to get past the liveness check
    prisma.message.findUnique.mockResolvedValue({
      deletedAt: null, expiresAt: null, isViewOnce: false, viewOnceCount: 0,
    });
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createMessageNotification({
      recipientUserId: USER_ALICE,
      senderId:        USER_BOB,
      messageId:       MSG_ID,
      conversationId:  CONV_ID,
      messagePreview:  'Hi',
    });

    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createConversationInviteNotification — no inviterUsername ─────────────────

describe('createConversationInviteNotification — inviterUsername missing', () => {
  it('fetches inviter from DB when inviterUsername is not provided', async () => {
    prisma.notification.create.mockResolvedValue(makeRawNotif('new_conversation_direct'));

    const result = await service.createConversationInviteNotification({
      invitedUserId:      USER_ALICE,
      inviterId:          USER_BOB,
      // inviterUsername intentionally omitted
      conversationId:     CONV_ID,
      conversationTitle:  'Direct',
      conversationType:   'direct',
    });

    expect(result).not.toBeNull();
    // user.findUnique should have been called for the inviter lookup
    const calls = (prisma.user.findUnique.mock.calls as any[][]);
    const inviterLookup = calls.some(
      (args: any[]) => args[0]?.where?.id === USER_BOB && args[0]?.select?.username !== undefined,
    );
    expect(inviterLookup).toBe(true);
  });

  it('uses provided inviterUsername without fetching from DB (fast path)', async () => {
    prisma.notification.create.mockResolvedValue(makeRawNotif('new_conversation_group'));

    await service.createConversationInviteNotification({
      invitedUserId:     USER_ALICE,
      inviterId:         USER_BOB,
      inviterUsername:   'bob', // provided → no inviter DB fetch
      conversationId:    CONV_ID,
      conversationTitle: 'Group Chat',
      conversationType:  'group',
    });

    // user.findUnique is only called by resolveRecipientLang — NOT with select.username
    const calls = (prisma.user.findUnique.mock.calls as any[][]);
    const inviterLookup = calls.some(
      (args: any[]) => args[0]?.where?.id === USER_BOB && args[0]?.select?.username !== undefined,
    );
    expect(inviterLookup).toBe(false);
  });
});

// ── markAsRead — error path ───────────────────────────────────────────────────

describe('markAsRead', () => {
  it('returns null when update throws', async () => {
    prisma.notification.update.mockRejectedValue(new Error('DB error'));

    const result = await service.markAsRead('notif-999');

    expect(result).toBeNull();
  });
});

// ── markAllAsRead — error path ────────────────────────────────────────────────

describe('markAllAsRead', () => {
  it('returns 0 when updateMany throws', async () => {
    prisma.notification.updateMany.mockRejectedValue(new Error('DB error'));

    const result = await service.markAllAsRead(USER_ALICE);

    expect(result).toBe(0);
  });
});

// ── markNotificationsByTypesAsRead ────────────────────────────────────────────

describe('markNotificationsByTypesAsRead', () => {
  it('returns 0 immediately for empty types array', async () => {
    const result = await service.markNotificationsByTypesAsRead(USER_ALICE, []);

    expect(result).toBe(0);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('updates matching notifications and emits counts', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.markNotificationsByTypesAsRead(
      USER_ALICE,
      ['friend_request', 'contact_request'],
    );

    expect(result).toBe(3);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ALICE, isRead: false, type: { in: ['friend_request', 'contact_request'] } },
      data:  { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('returns 0 on error', async () => {
    prisma.notification.updateMany.mockRejectedValue(new Error('DB error'));

    const result = await service.markNotificationsByTypesAsRead(USER_ALICE, ['friend_request']);

    expect(result).toBe(0);
  });

  it('does NOT emit counts when 0 notifications were updated', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await service.markNotificationsByTypesAsRead(USER_ALICE, ['friend_request']);
    await new Promise(r => setImmediate(r));

    expect(mockIO.emit).not.toHaveBeenCalled();
  });
});

// ── deleteNotification — error path ──────────────────────────────────────────

describe('deleteNotification', () => {
  it('returns false on error', async () => {
    prisma.notification.findUnique.mockRejectedValue(new Error('DB error'));

    const result = await service.deleteNotification('notif-999');

    expect(result).toBe(false);
  });
});

// ── getUserNotifications — unreadOnly ─────────────────────────────────────────

describe('getUserNotifications', () => {
  it('applies isRead=false filter when unreadOnly is true', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);

    await service.getUserNotifications({ userId: USER_ALICE, unreadOnly: true });

    const calledWith = (prisma.notification.findMany.mock.calls[0] as any[])[0] as any;
    expect(calledWith.where.isRead).toBe(false);
  });

  it('does not add isRead filter when unreadOnly is false', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);

    await service.getUserNotifications({ userId: USER_ALICE, unreadOnly: false });

    const calledWith = (prisma.notification.findMany.mock.calls[0] as any[])[0] as any;
    expect(calledWith.where.isRead).toBeUndefined();
  });
});

// ── setEmailService ───────────────────────────────────────────────────────────

describe('setEmailService', () => {
  it('stores the email service without throwing', () => {
    const fakeEmailSvc = { sendSecurityAlertEmail: jest.fn<any>() } as any;
    expect(() => service.setEmailService(fakeEmailSvc)).not.toThrow();
  });
});

// ── cleanupOldMentions (private) ──────────────────────────────────────────────

describe('cleanupOldMentions (private)', () => {
  it('removes entries with only expired timestamps', () => {
    const svc = service as any;
    const expired = Date.now() - (svc.MENTION_WINDOW_MS as number) - 1;
    svc.recentMentions.set('s1:r1', [expired]);

    svc.cleanupOldMentions();

    expect(svc.recentMentions.has('s1:r1')).toBe(false);
  });

  it('keeps entries with at least one fresh timestamp', () => {
    const svc = service as any;
    svc.recentMentions.set('s2:r2', [Date.now()]);

    svc.cleanupOldMentions();

    expect(svc.recentMentions.has('s2:r2')).toBe(true);
  });

  it('trims expired timestamps from entries that have a mix', () => {
    const svc = service as any;
    const expired = Date.now() - (svc.MENTION_WINDOW_MS as number) - 1;
    svc.recentMentions.set('s3:r3', [expired, Date.now()]);

    svc.cleanupOldMentions();

    expect(svc.recentMentions.get('s3:r3')).toHaveLength(1);
  });
});

// ── cleanupOldReactions (private) ─────────────────────────────────────────────

describe('cleanupOldReactions (private)', () => {
  it('removes entries with only expired timestamps', () => {
    const svc = service as any;
    const expired = Date.now() - (svc.REACTION_WINDOW_MS as number) - 1;
    svc.recentReactions.set('s1:r1', [expired]);

    svc.cleanupOldReactions();

    expect(svc.recentReactions.has('s1:r1')).toBe(false);
  });

  it('keeps entries with at least one fresh timestamp', () => {
    const svc = service as any;
    svc.recentReactions.set('s2:r2', [Date.now()]);

    svc.cleanupOldReactions();

    expect(svc.recentReactions.has('s2:r2')).toBe(true);
  });
});

// ── shouldCreateMentionNotification — map eviction ────────────────────────────

describe('shouldCreateMentionNotification — map size eviction (private)', () => {
  it('evicts the oldest map entry when size exceeds MAX_MENTION_MAP_ENTRIES', () => {
    const svc = service as any;
    // Use a tiny cap so the test runs fast
    (svc as any).MAX_MENTION_MAP_ENTRIES = 3;

    svc.recentMentions.set('a:b', [Date.now()]);
    svc.recentMentions.set('c:d', [Date.now()]);
    svc.recentMentions.set('e:f', [Date.now()]);
    expect(svc.recentMentions.size).toBe(3);

    const firstKey = svc.recentMentions.keys().next().value;
    svc.shouldCreateMentionNotification('new-s', 'new-r');

    // Map size stays at 3: one added, one evicted
    expect(svc.recentMentions.size).toBe(3);
    expect(svc.recentMentions.has(firstKey)).toBe(false);
    expect(svc.recentMentions.has('new-s:new-r')).toBe(true);
  });
});

// ── shouldCreateReactionNotification — map eviction ───────────────────────────

describe('shouldCreateReactionNotification — map size eviction (private)', () => {
  it('evicts the oldest map entry when size exceeds MAX_REACTION_MAP_ENTRIES', () => {
    const svc = service as any;
    (svc as any).MAX_REACTION_MAP_ENTRIES = 3;

    svc.recentReactions.set('a:b', [Date.now()]);
    svc.recentReactions.set('c:d', [Date.now()]);
    svc.recentReactions.set('e:f', [Date.now()]);

    const firstKey = svc.recentReactions.keys().next().value;
    svc.shouldCreateReactionNotification('new-s', 'new-r');

    expect(svc.recentReactions.size).toBe(3);
    expect(svc.recentReactions.has(firstKey)).toBe(false);
    expect(svc.recentReactions.has('new-s:new-r')).toBe(true);
  });
});

// ── sanitizeDate — invalid Date object ────────────────────────────────────────

describe('sanitizeDate (private) — invalid Date object', () => {
  it('returns defaultValue for an invalid Date (NaN getTime)', () => {
    const svc = service as any;
    const badDate = new Date('not-a-date'); // invalid Date → getTime() === NaN
    const result = svc.sanitizeDate(badDate, null);
    expect(result).toBeNull();
  });

  it('returns the date unchanged for a valid Date object', () => {
    const svc = service as any;
    const good = new Date('2025-01-01T00:00:00Z');
    expect(svc.sanitizeDate(good, null)).toBe(good);
  });
});

// ── contentTypeIcon ───────────────────────────────────────────────────────────

describe('contentTypeIcon', () => {
  it('returns the text icon when messageType is null', () => {
    expect(contentTypeIcon(null)).toBe('💬');
  });

  it('returns the text icon when messageType is undefined', () => {
    expect(contentTypeIcon(undefined)).toBe('💬');
  });

  it('returns the audio icon for "audio"', () => {
    expect(contentTypeIcon('audio')).toBe('🎵');
  });

  it('is case-insensitive (AUDIO → audio icon)', () => {
    expect(contentTypeIcon('AUDIO')).toBe('🎵');
  });

  it('returns the text icon for an unknown messageType (fallback)', () => {
    expect(contentTypeIcon('unknown-type')).toBe('💬');
  });

  it('returns the video icon for "video"', () => {
    expect(contentTypeIcon('video')).toBe('🎬');
  });

  it('returns the image icon for "image"', () => {
    expect(contentTypeIcon('image')).toBe('🖼️');
  });

  it('returns the file icon for "file"', () => {
    expect(contentTypeIcon('file')).toBe('📎');
  });
});

// ── formatEphemeralDuration ───────────────────────────────────────────────────

describe('formatEphemeralDuration', () => {
  it('returns undefined when expiresAt is null', () => {
    expect(formatEphemeralDuration(null, new Date())).toBeUndefined();
  });

  it('returns undefined when createdAt is null', () => {
    expect(formatEphemeralDuration(new Date(), null)).toBeUndefined();
  });

  it('returns undefined when duration is 0 (non-positive)', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    expect(formatEphemeralDuration(t, t)).toBeUndefined();
  });

  it('returns undefined for negative duration (expires before created)', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const before = new Date(base.getTime() - 5000);
    expect(formatEphemeralDuration(before, base)).toBeUndefined();
  });

  it('returns "Ns" format for duration under 60 seconds', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const expires = new Date(created.getTime() + 30_000); // 30s
    expect(formatEphemeralDuration(expires, created)).toBe('30s');
  });

  it('returns "Nmin" format for duration under 60 minutes', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const expires = new Date(created.getTime() + 5 * 60_000); // 5min
    expect(formatEphemeralDuration(expires, created)).toBe('5min');
  });

  it('returns "Nh" format for duration under 24 hours', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const expires = new Date(created.getTime() + 2 * 3600_000); // 2h
    expect(formatEphemeralDuration(expires, created)).toBe('2h');
  });

  it('returns "Nj" format for duration of 3 days', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const expires = new Date(created.getTime() + 3 * 24 * 3600_000); // 3 days
    expect(formatEphemeralDuration(expires, created)).toBe('3j');
  });
});

// ── protectedPreview ──────────────────────────────────────────────────────────

describe('protectedPreview', () => {
  it('returns null for a non-protected message (no flags)', () => {
    const result = protectedPreview({
      messageType: 'text',
      isEncrypted: false,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
    });
    expect(result).toBeNull();
  });

  it('returns ephemeral preview with duration when expiresAt is set', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const expires = new Date(created.getTime() + 30_000);
    const result = protectedPreview({
      messageType: 'text',
      expiresAt: expires,
      createdAt: created,
    });
    expect(result).not.toBeNull();
    expect(result!.locKey).toBe('notification.ephemeral_message');
    expect(result!.preview).toContain('🔥');
    expect(result!.preview).toContain('30s');
  });

  it('returns ephemeral preview without duration when no createdAt', () => {
    const result = protectedPreview({
      messageType: 'audio',
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      createdAt: null,
    });
    expect(result!.locKey).toBe('notification.ephemeral_message');
    expect(result!.preview).toContain('🔥');
    expect(result!.preview).toContain('🎵');
    expect(result!.preview).not.toContain('s');
  });

  it('returns view-once preview when isViewOnce is true', () => {
    const result = protectedPreview({
      messageType: 'image',
      isViewOnce: true,
    });
    expect(result!.locKey).toBe('notification.view_once_message');
    expect(result!.preview).toContain('👁️');
    expect(result!.preview).toContain('🖼️');
  });

  it('returns blurred preview when isBlurred is true', () => {
    const result = protectedPreview({
      messageType: 'text',
      isBlurred: true,
    });
    expect(result!.locKey).toBe('notification.hidden_message');
    expect(result!.preview).toContain('🌫️');
  });

  it('returns encrypted preview when isEncrypted is true', () => {
    const result = protectedPreview({
      messageType: 'text',
      isEncrypted: true,
    });
    expect(result!.locKey).toBe('notification.encrypted_message');
    expect(result!.preview).toContain('🔒');
  });

  it('prioritises ephemeral over other protections (effectFlags EPHEMERAL bit)', () => {
    const result = protectedPreview({
      messageType: 'text',
      isViewOnce: true,
      isBlurred: true,
      effectFlags: 0x1, // EPHEMERAL flag bit
    });
    expect(result!.locKey).toBe('notification.ephemeral_message');
  });

  it('prioritises view-once over blurred', () => {
    const result = protectedPreview({
      messageType: 'text',
      isViewOnce: true,
      isBlurred: true,
    });
    expect(result!.locKey).toBe('notification.view_once_message');
  });
});

// ── toISOStringOrNull (private) ───────────────────────────────────────────────

describe('toISOStringOrNull (private)', () => {
  it('returns null for null date', () => {
    expect((service as any).toISOStringOrNull(null)).toBeNull();
  });

  it('returns ISO string for a valid date', () => {
    const d = new Date('2026-06-28T12:00:00.000Z');
    expect((service as any).toISOStringOrNull(d)).toBe('2026-06-28T12:00:00.000Z');
  });
});
