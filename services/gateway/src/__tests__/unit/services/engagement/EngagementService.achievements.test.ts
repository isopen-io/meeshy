/**
 * EngagementService achievements (#5546) unit tests — split out of EngagementService.test.ts (#10319) to stay under the 1000-line budget
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CONTENT_ENGAGEMENT_AXES, CONVERSATION_ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { routeCounterWrites } from '../../../../services/engagement/__tests__/mongoLikeCounters';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

const mockGetSharedNotificationService = getSharedNotificationService as jest.MockedFunction<
  typeof getSharedNotificationService
>;

/**
 * Le crédit de score passe par `$runCommandRaw` depuis #5742 : `increment` nu
 * échouait sur un `engagementScore` valant `null` en base. Ces fabriques
 * rendent donc la forme d'une réponse `findAndModify` — `{ value: { … } }` —
 * et `scoreAfter` est le score APRÈS l'incrément, celui dont le service déduit
 * les paliers franchis.
 */
function makeRawScore(scoreAfter = 0) {
  return jest.fn().mockResolvedValue({ ok: 1, value: { engagementScore: scoreAfter } });
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

function makePrisma(overrides: Partial<{
  counterWrite: jest.Mock;
  create: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  conversationCreditCreate: jest.Mock;
  userUpdate: jest.Mock;
}> = {}) {
  return {
    engagementCounter: {
      // `findMany` sert désormais DEUX questions, et un mock qui ignore son
      // `where` répondrait la même chose aux deux :
      //  - `hasAllAxes` (succès composés) filtre sur `axisKey` + `count > 0` ;
      //  - `loadElanInputs` (#5749) filtre sur `updatedAt >= fenêtre`.
      // Servir les axes d'un succès à la résolution d'élan ferait croire à
      // plusieurs familles actives et multiplierait les points d'un test qui
      // ne parle pas d'élan. Le mock DISCRIMINE donc, comme la base.
      findMany: jest.fn(async (args: unknown) => {
        const where = (args as { where?: { updatedAt?: unknown } } | undefined)?.where;
        if (where?.updatedAt !== undefined) return [];
        const surcharge = overrides.findMany;
        return surcharge ? await surcharge(args as never) : [];
      }),
    },
    engagementMilestone: {
      create: overrides.create ?? jest.fn(),
      // Lu par la résolution d'élan (#5749) : aucun palier gravé ⇒ pas
      // d'assise, donc facteur porté par les seules familles actives.
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementConversationCredit: {
      create: overrides.conversationCreditCreate ?? jest.fn().mockResolvedValue({}),
    },
    engagementSignatureCredit: { create: jest.fn().mockResolvedValue({}) },
    engagementScaleConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    engagementQuota: { upsert: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    conversationEngagement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    user: {
      // Same mock answers both `recordActivity`'s language lookups (badge/streak
      // notifications) and `updateStreak`'s state read — none of the existing
      // (non-streak) tests assert on its shape, so the default below (no streak
      // fields) exercises `updateStreak`'s "brand new streak" branch harmlessly.
      findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue({ systemLanguage: 'fr' }),
      update: overrides.userUpdate ?? jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $runCommandRaw: routeCounterWrites(overrides.counterWrite ?? jest.fn(), makeRawScore()),
  } as unknown as PrismaClient;
}

beforeEach(() => {
  mockGetSharedNotificationService.mockReset();
});

describe('EngagementService achievements (#5546)', () => {
  it('awards achievement.first_content on the first content-family axis reached, querying only the content axes', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 }); // 0 -> 1
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([{ axisKey: 'content.text_message' }]); // only this one so far
    const prisma = makePrisma({ counterWrite, create, findMany });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.first_content' },
    });
    expect(notificationService.createNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'achievement_unlocked',
      priority: 'normal',
      content: '🏆 Haut fait accompli : Premier pas',
      context: {},
      metadata: { action: 'view_details', route: 'progression', achievementKey: 'achievement.first_content' },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', axisKey: { in: [...CONTENT_ENGAGEMENT_AXES] }, count: { gt: 0 } },
      select: { axisKey: true },
    });
    // Only 1 of the 5 content axes has been reached: the composed condition must not fire yet.
    expect(create).not.toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.all_content_types' },
    });
  });

  it('replays achievement.first_content with zero notifications (anti-replay via unique constraint)', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockRejectedValue(p2002Error());
    const prisma = makePrisma({ counterWrite, create });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('awards achievement.all_content_types once every content axis has been reached', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 }); // 0 -> 1, last of the five
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue(CONTENT_ENGAGEMENT_AXES.map((axisKey) => ({ axisKey })));
    const prisma = makePrisma({ counterWrite, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.reel');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.all_content_types' },
    });
  });

  it('does not award achievement.all_content_types while a content axis is still untouched', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([
      { axisKey: 'content.text_message' },
      { axisKey: 'content.post' },
    ]); // only 2 of 5
    const prisma = makePrisma({ counterWrite, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.story');

    expect(create).not.toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.all_content_types' },
    });
  });

  it.each(['content.audio_message', 'comment.audio'] as const)(
    'awards achievement.first_voice on the first %s',
    async (axisKey) => {
      const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
      const create = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({ counterWrite, create });
      mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
      const svc = new EngagementService(prisma);

      await svc.recordActivity('user-1', axisKey);

      expect(create).toHaveBeenCalledWith({
        data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.first_voice' },
      });
    },
  );

  it('does not award achievement.first_voice for a non-audio axis', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ counterWrite, create });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(create).not.toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.first_voice' },
    });
  });

  it('awards achievement.editor on the first in-app edit', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ counterWrite, create });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'tool.in_app_edit');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.editor' },
    });
  });

  it('awards achievement.three_conversation_kinds once every conversation axis has been reached', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 }); // 0 -> 1, last of the three
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue(CONVERSATION_ENGAGEMENT_AXES.map((axisKey) => ({ axisKey })));
    const prisma = makePrisma({ counterWrite, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'conversation.community');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.three_conversation_kinds' },
    });
  });

  it('does not award achievement.three_conversation_kinds while a conversation axis is still untouched', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([{ axisKey: 'conversation.private' }]); // only 1 of 3
    const prisma = makePrisma({ counterWrite, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'conversation.private');

    expect(create).not.toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.three_conversation_kinds' },
    });
  });

  it('does not re-evaluate any achievement condition on a non-first increment of the axis', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 2 }); // 1 -> 2, not a first touch
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn();
    const prisma = makePrisma({ counterWrite, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ milestoneType: 'achievement' }) }),
    );
  });

  it('does not evaluate any achievement condition for an axis outside all five conditions', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn();
    const prisma = makePrisma({ counterWrite, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'tool.direct_publish');

    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ milestoneType: 'achievement' }) }),
    );
  });
});
