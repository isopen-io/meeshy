/**
 * EngagementService unit tests (#5530)
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CONTENT_ENGAGEMENT_AXES, CONVERSATION_ENGAGEMENT_AXES, ENGAGEMENT_AXIS_WEIGHTS, SOCIAL_ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { EngagementService } from '../../../../services/engagement/EngagementService';
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

function makePrisma(overrides: Partial<{
  upsert: jest.Mock;
  create: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  conversationCreditCreate: jest.Mock;
  userUpdate: jest.Mock;
}> = {}) {
  return {
    engagementCounter: {
      upsert: overrides.upsert ?? jest.fn(),
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
    user: {
      // Same mock answers both `recordActivity`'s language lookups (badge/streak
      // notifications) and `updateStreak`'s state read — none of the existing
      // (non-streak) tests assert on its shape, so the default below (no streak
      // fields) exercises `updateStreak`'s "brand new streak" branch harmlessly.
      findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue({ systemLanguage: 'fr' }),
      update: overrides.userUpdate ?? jest.fn().mockResolvedValue({}),
    },
    $runCommandRaw: makeRawScore(),
  } as unknown as PrismaClient;
}

/** Fixture dédiée `updateStreak` : contrôle `currentStreakDays`/`longestStreakDays`/`lastStreakDate` sans mélanger le mock de langue. */
function makeStreakPrisma(streakState: {
  currentStreakDays: number;
  longestStreakDays: number;
  lastStreakDate: Date | null;
  timezone?: string | null;
}, overrides: Partial<{ create: jest.Mock; userUpdate: jest.Mock }> = {}) {
  // Same answer for every call: the streak-state read AND the (fallback-to-'fr')
  // language lookup a crossed threshold triggers — `recipientLanguage` degrades
  // gracefully when the object it's handed carries no language fields.
  const findUnique = jest.fn().mockResolvedValue(streakState);
  return {
    engagementCounter: {
      upsert: jest.fn().mockResolvedValue({ count: 2 }), // 1 -> 2, crosses no badge threshold (isolates the streak logic under test)
      // Lu par la résolution d'élan (#5749) : aucune activité récente ⇒ seule
      // la famille du geste courant compte, donc facteur neutre — ce qui laisse
      // les assertions de série et de niveau lire des poids non multipliés.
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementMilestone: {
      create: overrides.create ?? jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementConversationCredit: {
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique,
      update: overrides.userUpdate ?? jest.fn().mockResolvedValue({}),
    },
    $runCommandRaw: makeRawScore(),
  } as unknown as PrismaClient;
}

/**
 * Fixture dédiée au score de niveau : `findUnique` rend `null` pour que
 * `updateStreak` prenne sa branche « aucun utilisateur » et ne pose pas son
 * propre appel à `user.update` — ce qui isole l'unique appel qui reste sur ce
 * mock à celui d'`updateEngagementScore`. Le compteur d'axe est fixé à un
 * niveau qui ne franchit aucun palier de badge, pour ne pas mélanger les deux
 * notifications dans les assertions.
 */
function makeLevelPrisma(overrides: Partial<{
  create: jest.Mock;
  userUpdate: jest.Mock;
  upsert: jest.Mock;
  runCommandRaw: jest.Mock;
}> = {}) {
  return {
    engagementCounter: {
      upsert: overrides.upsert ?? jest.fn().mockResolvedValue({ count: 2 }), // 1 -> 2, no badge threshold crossed
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementMilestone: {
      create: overrides.create ?? jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementConversationCredit: {
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: overrides.userUpdate ?? jest.fn().mockResolvedValue({ engagementScore: 0 }),
    },
    $runCommandRaw: overrides.runCommandRaw ?? makeRawScore(),
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
      // `points` à côté de `count` depuis #5742 : deux colonnes, deux questions —
      // `count` compte des ACTIONS et pilote les badges, `points` porte ce que
      // l'axe crédite au score et pilote le niveau puis la frappe des Meeshes.
      //
      // Le poids se LIT au barème, jamais recopié : écrit en dur (3), ce témoin
      // est tombé au réordonnancement de #5766 qui a porté le contenu à 9 —
      // il mesurait alors la mémoire de l'auteur, pas le comportement.
      create: {
        userId: 'user-1',
        axisKey: 'content.text_message',
        count: 1,
        points: ENGAGEMENT_AXIS_WEIGHTS['content.text_message'],
      },
      update: {
        count: { increment: 1 },
        points: { increment: ENGAGEMENT_AXIS_WEIGHTS['content.text_message'] },
      },
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
      // Le MOT du lecteur, jamais la clé stable : « conversation.private ·
      // palier 10 » a été servi en production (2026-09-08). `route` dit où le
      // tap mène — l'écran « Progression ».
      content: '🏅 Badge débloqué : Publications · palier 10',
      context: {},
      metadata: { action: 'view_details', route: 'progression', axisKey: 'content.post', threshold: 10 },
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
      create: { userId: 'user-1', axisKey: 'conversation.public', count: 1, points: 5 },
      update: { count: { increment: 1 }, points: { increment: 5 } },
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
    // `userUpdate` is still called by `updateEngagementScore` (an orthogonal
    // concern, exercised in its own describe block below) — this test asserts
    // only that none of those calls carry STREAK fields.
    const userUpdate = jest.fn().mockResolvedValue({ engagementScore: 0 });
    const prisma = makeStreakPrisma(
      { currentStreakDays: 3, longestStreakDays: 3, lastStreakDate: TODAY_UTC_MIDNIGHT },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.post');
    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentStreakDays: expect.anything() }) }),
    );
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
      content: '🔥 Série de 3 jours !',
      context: {},
      metadata: { action: 'view_details', route: 'progression', threshold: 3 },
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

describe('EngagementService streak tracking honors User.timezone (#5734)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not double-count two activities on the same LOCAL day that straddle the UTC day boundary', async () => {
    // Both activities happen on the SAME America/Los_Angeles calendar day
    // (Sept 7): a morning one (already recorded, `lastStreakDate` holds its
    // civil-day marker) and a late-night one at 22:00 local. Los Angeles is
    // UTC-7, so 22:00 local on Sept 7 is 05:00 UTC on Sept 8 — a UTC day
    // later. Comparing by UTC civil day (the pre-#5734 behavior) would read
    // this as a NEW day and increment the streak a second time for a single
    // local day; comparing by the user's timezone must not.
    const LAST_STREAK_MARKER = new Date('2026-09-07T00:00:00.000Z'); // civil-day marker for LA Sept 7
    const NOW_UTC = new Date('2026-09-08T05:00:00.000Z'); // 2026-09-07T22:00 America/Los_Angeles
    jest.useFakeTimers().setSystemTime(NOW_UTC);

    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 4,
        longestStreakDays: 6,
        lastStreakDate: LAST_STREAK_MARKER,
        timezone: 'America/Los_Angeles',
      },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentStreakDays: expect.anything() }) }),
    );
  });

  it('increments the streak once the user has genuinely reached the next LOCAL day', async () => {
    const LAST_STREAK_MARKER = new Date('2026-09-07T00:00:00.000Z'); // civil-day marker for LA Sept 7
    const NOW_UTC = new Date('2026-09-08T17:00:00.000Z'); // 2026-09-08T10:00 America/Los_Angeles
    jest.useFakeTimers().setSystemTime(NOW_UTC);

    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 4,
        longestStreakDays: 6,
        lastStreakDate: LAST_STREAK_MARKER,
        timezone: 'America/Los_Angeles',
      },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        currentStreakDays: 5,
        longestStreakDays: 6,
        lastStreakDate: new Date('2026-09-08T00:00:00.000Z'), // civil-day marker for LA Sept 8
      },
    });
  });

  it('counts two evenings 24h apart at the same local hour as a two-day streak (the #5734 acceptance example)', async () => {
    const EVENING_ONE = new Date('2026-09-06T00:00:00.000Z'); // civil-day marker for LA Sept 6
    const EVENING_TWO_NOW = new Date('2026-09-08T02:00:00.000Z'); // 2026-09-07T19:00 America/Los_Angeles
    jest.useFakeTimers().setSystemTime(EVENING_TWO_NOW);

    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 1,
        longestStreakDays: 1,
        lastStreakDate: EVENING_ONE,
        timezone: 'America/Los_Angeles',
      },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        currentStreakDays: 2,
        longestStreakDays: 2,
        lastStreakDate: new Date('2026-09-07T00:00:00.000Z'), // civil-day marker for LA Sept 7
      },
    });
  });

  it('does not regress a user with no timezone on record: the UTC repli is unchanged', async () => {
    const TODAY = new Date('2026-09-08T14:00:00.000Z');
    jest.useFakeTimers().setSystemTime(TODAY);

    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 4,
        longestStreakDays: 6,
        lastStreakDate: new Date('2026-09-07T00:00:00.000Z'),
        timezone: null,
      },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        currentStreakDays: 5,
        longestStreakDays: 6,
        lastStreakDate: new Date('2026-09-08T00:00:00.000Z'),
      },
    });
  });

  it('falls back to UTC when the stored timezone is not a valid IANA identifier', async () => {
    const TODAY = new Date('2026-09-08T14:00:00.000Z');
    jest.useFakeTimers().setSystemTime(TODAY);

    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 4,
        longestStreakDays: 6,
        lastStreakDate: new Date('2026-09-07T00:00:00.000Z'),
        timezone: 'Not/A_Zone',
      },
      { userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        currentStreakDays: 5,
        longestStreakDays: 6,
        lastStreakDate: new Date('2026-09-08T00:00:00.000Z'),
      },
    });
  });
});
describe('EngagementService level tracking (#5545)', () => {
  /**
   * Le poids lu est celui du CATALOGUE, jamais un nombre recopié ici.
   *
   * La version précédente épinglait `3` en dur, et le porteur a réglé les
   * poids trois fois le 2026-09-09 (contenu 3→9, commentaire 2→3, plus la
   * famille sociale à 7). Un témoin qui casse à chaque réglage d'un paramètre
   * TUNABLE ne protège rien : il ne dit plus si le service ajoute le BON
   * poids, il dit seulement que le barème n'a pas bougé.
   *
   * Ce qui est sous test ici est la MÉCANIQUE — le pipeline `$ifNull` de
   * #5742 : l'`increment` nu échouait sur un `engagementScore` à `null`, et
   * c'est ce qui a tué le score en production pendant trois mois. Le poids,
   * lui, se lit à la source de vérité.
   */
  it('adds the axis family weight to the engagement score, null-safely (#5742)', async () => {
    const attendu = ENGAGEMENT_AXIS_WEIGHTS['content.text_message'];
    const runCommandRaw = makeRawScore(attendu);
    const prisma = makeLevelPrisma({ runCommandRaw });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(runCommandRaw).toHaveBeenCalledWith({
      findAndModify: 'User',
      query: { _id: { $oid: 'user-1' } },
      update: [{ $set: { engagementScore: { $add: [{ $ifNull: ['$engagementScore', 0] }, attendu] } } }],
      new: true,
      fields: { engagementScore: 1 },
    });
  });

  /**
   * **Le poids DISTINGUE les familles, ou il ne sert à rien.** Le témoin
   * ci-dessus passerait au vert si tous les axes valaient la même chose : il
   * lit la constante des deux côtés. Celui-ci mesure l'ÉCART voulu par le
   * porteur — contenu 9 > social 7 > conversation 5 > commentaire 3 > outil 1.
   */
  it('le barème ORDONNE les familles — le lien vaut plus que la conversation', () => {
    const poids = (axe: keyof typeof ENGAGEMENT_AXIS_WEIGHTS) => ENGAGEMENT_AXIS_WEIGHTS[axe];
    expect(poids('content.text_message')).toBeGreaterThan(poids(SOCIAL_ENGAGEMENT_AXES[0]!));
    expect(poids(SOCIAL_ENGAGEMENT_AXES[0]!)).toBeGreaterThan(poids('conversation.private'));
    expect(poids('conversation.private')).toBeGreaterThan(poids('comment.text'));
    expect(poids('comment.text')).toBeGreaterThan(poids('tool.sticker'));
    // Les quatre axes sociaux partagent UN poids : la famille est l'unité.
    expect(new Set(SOCIAL_ENGAGEMENT_AXES.map(poids)).size).toBe(1);
  });

  it('weighs a tool axis at 1, distinct from a content axis at 3', async () => {
    const runCommandRaw = makeRawScore(1);
    const prisma = makeLevelPrisma({ runCommandRaw });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'tool.sticker');

    const command = runCommandRaw.mock.calls[0][0] as {
      update: Array<{ $set: { engagementScore: { $add: [unknown, number] } } }>;
    };
    expect(command.update[0].$set.engagementScore.$add[1]).toBe(1);
  });

  it('does not create a level milestone or notify when the increment crosses no level threshold', async () => {
    const create = jest.fn();
    const runCommandRaw = makeRawScore(20); // 17 -> 20, no threshold in ]17,20]
    const prisma = makeLevelPrisma({ create, runCommandRaw });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message'); // weight 9

    expect(create).not.toHaveBeenCalled();
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('awards LEVEL_UP and notifies exactly once when the increment lands on a threshold', async () => {
    const create = jest.fn().mockResolvedValue({});
    const runCommandRaw = makeRawScore(10); // 5 -> 10, crosses threshold 10
    const prisma = makeLevelPrisma({ create, runCommandRaw });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'conversation.private'); // weight 5

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'level', milestoneKey: 'level:10' },
    });
    expect(notificationService.createNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'level_up',
      priority: 'normal',
      // Le RANG du palier (niveau 1), jamais le seuil de score (10 points) :
      // « Niveau 150 atteint » se lisait comme un cent-cinquantième niveau.
      content: '⭐ Niveau 1 atteint !',
      context: {},
      metadata: { action: 'view_details', route: 'progression', threshold: 10, level: 1 },
    });
  });

  it('replays the same level threshold with zero notifications (anti-replay via unique constraint)', async () => {
    const create = jest.fn().mockRejectedValue(p2002Error());
    const prisma = makeLevelPrisma({ create, runCommandRaw: makeRawScore(10) });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'conversation.private');

    expect(create).toHaveBeenCalledTimes(1);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('lands exactly on a threshold boundary and still crosses it (inclusive upper bound)', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = makeLevelPrisma({ create, runCommandRaw: makeRawScore(50) }); // 45 -> 50, crosses 50
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'conversation.private'); // weight 5

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'level', milestoneKey: 'level:50' },
    });
  });
});

describe('EngagementService achievements (#5546)', () => {
  it('awards achievement.first_content on the first content-family axis reached, querying only the content axes', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 }); // 0 -> 1
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([{ axisKey: 'content.text_message' }]); // only this one so far
    const prisma = makePrisma({ upsert, create, findMany });
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
      content: '🏆 Succès débloqué : Premier pas',
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
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockRejectedValue(p2002Error());
    const prisma = makePrisma({ upsert, create });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('awards achievement.all_content_types once every content axis has been reached', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 }); // 0 -> 1, last of the five
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue(CONTENT_ENGAGEMENT_AXES.map((axisKey) => ({ axisKey })));
    const prisma = makePrisma({ upsert, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.reel');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.all_content_types' },
    });
  });

  it('does not award achievement.all_content_types while a content axis is still untouched', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([
      { axisKey: 'content.text_message' },
      { axisKey: 'content.post' },
    ]); // only 2 of 5
    const prisma = makePrisma({ upsert, create, findMany });
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
      const upsert = jest.fn().mockResolvedValue({ count: 1 });
      const create = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({ upsert, create });
      mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
      const svc = new EngagementService(prisma);

      await svc.recordActivity('user-1', axisKey);

      expect(create).toHaveBeenCalledWith({
        data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.first_voice' },
      });
    },
  );

  it('does not award achievement.first_voice for a non-audio axis', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ upsert, create });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(create).not.toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.first_voice' },
    });
  });

  it('awards achievement.editor on the first in-app edit', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ upsert, create });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'tool.in_app_edit');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.editor' },
    });
  });

  it('awards achievement.three_conversation_kinds once every conversation axis has been reached', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 }); // 0 -> 1, last of the three
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue(CONVERSATION_ENGAGEMENT_AXES.map((axisKey) => ({ axisKey })));
    const prisma = makePrisma({ upsert, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'conversation.community');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.three_conversation_kinds' },
    });
  });

  it('does not award achievement.three_conversation_kinds while a conversation axis is still untouched', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([{ axisKey: 'conversation.private' }]); // only 1 of 3
    const prisma = makePrisma({ upsert, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'conversation.private');

    expect(create).not.toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'achievement', milestoneKey: 'achievement.three_conversation_kinds' },
    });
  });

  it('does not re-evaluate any achievement condition on a non-first increment of the axis', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 2 }); // 1 -> 2, not a first touch
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn();
    const prisma = makePrisma({ upsert, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ milestoneType: 'achievement' }) }),
    );
  });

  it('does not evaluate any achievement condition for an axis outside all five conditions', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn();
    const prisma = makePrisma({ upsert, create, findMany });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'tool.direct_publish');

    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ milestoneType: 'achievement' }) }),
    );
  });
});
