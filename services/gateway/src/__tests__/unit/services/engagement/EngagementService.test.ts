/**
 * EngagementService unit tests (#5530)
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

const mockGetSharedNotificationService = getSharedNotificationService as jest.MockedFunction<
  typeof getSharedNotificationService
>;

function makePrisma(overrides: Partial<{
  upsert: jest.Mock;
  create: jest.Mock;
  findUnique: jest.Mock;
  conversationCreditCreate: jest.Mock;
  userUpdate: jest.Mock;
}> = {}) {
  return {
    engagementCounter: {
      upsert: overrides.upsert ?? jest.fn(),
    },
    engagementMilestone: {
      create: overrides.create ?? jest.fn(),
    },
    engagementConversationCredit: {
      create: overrides.conversationCreditCreate ?? jest.fn().mockResolvedValue({}),
    },
    user: {
      // Same mock answers both `recordActivity`'s language lookups (badge/streak
      // notifications) and `updateStreak`'s state read — none of the existing
      // (non-streak) tests assert on its shape, so the default below (no streak
      // fields) exercises `updateStreak`'s "brand new streak" branch harmlessly.
      findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue({ systemLanguage: 'fr' }),
      update: overrides.userUpdate ?? jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

/** Fixture dédiée `updateStreak` : contrôle `currentStreakDays`/`longestStreakDays`/`lastStreakDate` sans mélanger le mock de langue. */
function makeStreakPrisma(streakState: {
  currentStreakDays: number;
  longestStreakDays: number;
  lastStreakDate: Date | null;
}, overrides: Partial<{ create: jest.Mock; userUpdate: jest.Mock }> = {}) {
  // Same answer for every call: the streak-state read AND the (fallback-to-'fr')
  // language lookup a crossed threshold triggers — `recipientLanguage` degrades
  // gracefully when the object it's handed carries no language fields.
  const findUnique = jest.fn().mockResolvedValue(streakState);
  return {
    engagementCounter: {
      upsert: jest.fn().mockResolvedValue({ count: 2 }), // 1 -> 2, crosses no badge threshold (isolates the streak logic under test)
    },
    engagementMilestone: {
      create: overrides.create ?? jest.fn().mockResolvedValue({}),
    },
    engagementConversationCredit: {
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique,
      update: overrides.userUpdate ?? jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

function makeSharedNotificationService(overrides: Partial<{
  createNotification: jest.Mock;
}> = {}) {
  return {
    createNotification: overrides.createNotification ?? jest.fn().mockResolvedValue(null),
  } as any;
}

function p2002Error() {
  return Object.assign(new Error('duplicate key'), { code: 'P2002' });
}

beforeEach(() => {
  mockGetSharedNotificationService.mockReset();
});

describe('EngagementService.recordActivity', () => {
  it('increments the counter via an atomic upsert keyed on (userId, axisKey)', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 6 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ upsert, create });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(upsert).toHaveBeenCalledWith({
      where: { userId_axisKey: { userId: 'user-1', axisKey: 'content.text_message' } },
      create: { userId: 'user-1', axisKey: 'content.text_message', count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
  });

  it('does not create a milestone or notify when the increment crosses no threshold', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 6 }); // 5 -> 6, no threshold in ]5,6]
    const create = jest.fn();
    const prisma = makePrisma({ upsert, create });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(create).not.toHaveBeenCalled();
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('awards a badge and notifies exactly once when the increment lands on a threshold', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 10 }); // 9 -> 10, crosses threshold 10
    const create = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({ systemLanguage: 'fr' });
    const prisma = makePrisma({ upsert, create, findUnique });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.post');

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'badge', milestoneKey: 'content.post:10' },
    });
    expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
    expect(notificationService.createNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'badge_earned',
      priority: 'normal',
      content: expect.any(String),
      context: {},
      metadata: { action: 'view_details', axisKey: 'content.post', threshold: 10 },
    });
  });

  it('replays the same threshold with zero notifications (anti-replay via unique constraint)', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 }); // 0 -> 1, crosses threshold 1
    const create = jest.fn().mockRejectedValue(p2002Error());
    const prisma = makePrisma({ upsert, create });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'tool.sticker');

    expect(create).toHaveBeenCalledTimes(1);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('propagates a milestone create error that is not a unique-constraint conflict', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockRejectedValue(new Error('connection lost'));
    const prisma = makePrisma({ upsert, create });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await expect(svc.recordActivity('user-1', 'tool.sticker')).rejects.toThrow('connection lost');
  });

  it('resolves two concurrent calls on the same threshold with a single milestone and notification', async () => {
    const upsert = jest.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const create = jest.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(p2002Error());
    const prisma = makePrisma({ upsert, create });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await Promise.all([
      svc.recordActivity('user-1', 'tool.sticker'),
      svc.recordActivity('user-1', 'tool.sticker'),
    ]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
  });

  it('does not let a notification failure roll back an already-recorded milestone', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ upsert, create });
    const notificationService = makeSharedNotificationService({
      createNotification: jest.fn().mockRejectedValue(new Error('push down')),
    });
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await expect(svc.recordActivity('user-1', 'tool.sticker')).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('EngagementService.recordConversationActivity', () => {
  it('credits a first message in a distinct conversation and increments the axis counter', async () => {
    const conversationCreditCreate = jest.fn().mockResolvedValue({});
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({ conversationCreditCreate, upsert });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordConversationActivity('user-1', 'conversation.public', 'conv-1');

    expect(conversationCreditCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', axisKey: 'conversation.public', conversationId: 'conv-1' },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_axisKey: { userId: 'user-1', axisKey: 'conversation.public' } },
      create: { userId: 'user-1', axisKey: 'conversation.public', count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
  });

  it('does not increment the counter again for a second message in an already-credited conversation', async () => {
    const conversationCreditCreate = jest.fn().mockRejectedValue(p2002Error());
    const upsert = jest.fn();
    const prisma = makePrisma({ conversationCreditCreate, upsert });
    const svc = new EngagementService(prisma);

    await svc.recordConversationActivity('user-1', 'conversation.public', 'conv-1');

    expect(conversationCreditCreate).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('propagates a conversation-credit error that is not a unique-constraint conflict', async () => {
    const conversationCreditCreate = jest.fn().mockRejectedValue(new Error('connection lost'));
    const upsert = jest.fn();
    const prisma = makePrisma({ conversationCreditCreate, upsert });
    const svc = new EngagementService(prisma);

    await expect(
      svc.recordConversationActivity('user-1', 'conversation.public', 'conv-1')
    ).rejects.toThrow('connection lost');
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('EngagementService streak tracking (#5544)', () => {
  const TODAY = new Date('2026-09-08T14:00:00.000Z');
  const TODAY_UTC_MIDNIGHT = new Date('2026-09-08T00:00:00.000Z');
  const YESTERDAY_UTC_MIDNIGHT = new Date('2026-09-07T00:00:00.000Z');
  const THREE_DAYS_AGO_UTC_MIDNIGHT = new Date('2026-09-05T00:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts a fresh streak at 1 for a user who has never had one', async () => {
    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      { currentStreakDays: 0, longestStreakDays: 0, lastStreakDate: null },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentStreakDays: 1, longestStreakDays: 1, lastStreakDate: TODAY_UTC_MIDNIGHT },
    });
  });

  it('increments the streak the day right after the last qualifying activity', async () => {
    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      { currentStreakDays: 4, longestStreakDays: 6, lastStreakDate: YESTERDAY_UTC_MIDNIGHT },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentStreakDays: 5, longestStreakDays: 6, lastStreakDate: TODAY_UTC_MIDNIGHT },
    });
  });

  it('does not increment the streak twice for two activities on the same day', async () => {
    const userUpdate = jest.fn();
    const prisma = makeStreakPrisma(
      { currentStreakDays: 3, longestStreakDays: 3, lastStreakDate: TODAY_UTC_MIDNIGHT },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.post');
    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('resets a skipped-day streak to 1 without lowering the recorded longest streak', async () => {
    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      { currentStreakDays: 10, longestStreakDays: 20, lastStreakDate: THREE_DAYS_AGO_UTC_MIDNIGHT },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentStreakDays: 1, longestStreakDays: 20, lastStreakDate: TODAY_UTC_MIDNIGHT },
    });
  });

  it('treats a legacy user with absent streak fields as a brand new streak, never NaN', async () => {
    const userUpdate = jest.fn().mockResolvedValue({});
    // Pre-migration `User` document: the fields are ABSENT, not defaulted to 0
    // (Mongo does not backfill `@default` on existing rows — see the
    // `updateStreak` doc-comment and `packages/shared/CLAUDE.md`).
    const prisma = makeStreakPrisma({} as any, { userUpdate });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentStreakDays: 1, longestStreakDays: 1, lastStreakDate: TODAY_UTC_MIDNIGHT },
    });
  });

  it('emits STREAK_MILESTONE exactly once when the increment lands on a threshold', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      { currentStreakDays: 2, longestStreakDays: 2, lastStreakDate: YESTERDAY_UTC_MIDNIGHT },
      { create },
    );
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'streak', milestoneKey: 'streak:3' },
    });
    expect(notificationService.createNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'streak_milestone',
      priority: 'normal',
      content: expect.any(String),
      context: {},
      metadata: { action: 'view_details', threshold: 3 },
    });
  });

  it('replays the same streak threshold with zero notifications (anti-replay via unique constraint)', async () => {
    const create = jest.fn().mockRejectedValue(p2002Error());
    const prisma = makeStreakPrisma(
      { currentStreakDays: 2, longestStreakDays: 2, lastStreakDate: YESTERDAY_UTC_MIDNIGHT },
      { create },
    );
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(create).toHaveBeenCalledTimes(1);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });
});
