/**
 * EngagementService unit tests (#5530)
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
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
}> = {}) {
  return {
    engagementCounter: {
      upsert: overrides.upsert ?? jest.fn(),
    },
    engagementMilestone: {
      create: overrides.create ?? jest.fn(),
    },
    user: {
      findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue({ systemLanguage: 'fr' }),
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
