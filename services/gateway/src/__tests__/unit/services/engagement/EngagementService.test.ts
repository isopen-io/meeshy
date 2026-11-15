/**
 * EngagementService unit tests (#5530)
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SOCIAL_ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { routeCounterWrites } from '../../../../services/engagement/__tests__/mongoLikeCounters';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import type { EngagementAxisKey } from '@meeshy/shared/types/engagement';

const poidsParDefaut = (axisKey: EngagementAxisKey): number => DEFAULT_ENGAGEMENT_SCALE.operations[axisKey].points;

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
/**
 * Le compteur passe lui aussi par `$runCommandRaw` depuis #10541 : chaque
 * fabrique ROUTE la commande — celle du compteur vers `counterWrite`, qui rend
 * l'état de la ligne (`{ count }`), toute autre vers le double du score.
 */
function makeRawScore(scoreAfter = 0) {
  return jest.fn().mockResolvedValue({ ok: 1, value: { engagementScore: scoreAfter } });
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

/** Fixture dédiée `updateStreak` : contrôle `currentStreakDays`/`longestStreakDays`/`lastStreakDate` sans mélanger le mock de langue. */
function makeStreakPrisma(streakState: {
  currentStreakDays: number;
  longestStreakDays: number;
  lastStreakDate: Date | null;
  timezone?: string | null;
}, overrides: Partial<{ create: jest.Mock; userUpdate: jest.Mock; userUpdateMany: jest.Mock }> = {}) {
  // Same answer for every call: the streak-state read AND the (fallback-to-'fr')
  // language lookup a crossed threshold triggers — `recipientLanguage` degrades
  // gracefully when the object it's handed carries no language fields.
  const findUnique = jest.fn().mockResolvedValue(streakState);
  return {
    engagementCounter: {
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
    engagementScaleConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    engagementQuota: { upsert: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    conversationEngagement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    user: {
      findUnique,
      update: overrides.userUpdate ?? jest.fn().mockResolvedValue({}),
      updateMany: overrides.userUpdateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
    },
    // 1 -> 2, crosses no badge threshold (isolates the streak logic under test)
    $runCommandRaw: routeCounterWrites(jest.fn().mockResolvedValue({ count: 2 }), makeRawScore()),
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
  counterWrite: jest.Mock;
  runCommandRaw: jest.Mock;
}> = {}) {
  return {
    engagementCounter: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementMilestone: {
      create: overrides.create ?? jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementConversationCredit: {
      create: jest.fn().mockResolvedValue({}),
    },
    engagementScaleConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    engagementQuota: { upsert: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    conversationEngagement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: overrides.userUpdate ?? jest.fn().mockResolvedValue({ engagementScore: 0 }),
    },
    $runCommandRaw: routeCounterWrites(
      overrides.counterWrite ?? jest.fn().mockResolvedValue({ count: 2 }), // 1 -> 2, no badge threshold crossed
      overrides.runCommandRaw ?? makeRawScore(),
    ),
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
  it('credits the counter in one atomic write keyed on (userId, axisKey)', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 6 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ counterWrite, create });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    // Le compteur s'écrit par `EngagementCounterWrites` (#10541) : une action de
    // plus, et les points de l'axe — deux colonnes, deux questions (#5742).
    //
    // Le poids se LIT au barème, jamais recopié : écrit en dur (3), ce témoin
    // est tombé au réordonnancement de #5766 qui a porté le contenu à 9 —
    // il mesurait alors la mémoire de l'auteur, pas le comportement.
    expect(counterWrite).toHaveBeenCalledWith({
      kind: 'credit',
      userId: 'user-1',
      axisKey: 'content.text_message',
      count: 1,
      points: poidsParDefaut('content.text_message'),
    });
  });

  it('does not create a milestone or notify when the increment crosses no threshold', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 6 }); // 5 -> 6, no threshold in ]5,6]
    const create = jest.fn();
    const prisma = makePrisma({ counterWrite, create });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(create).not.toHaveBeenCalled();
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('awards a badge and notifies exactly once when the increment lands on a threshold', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 10 }); // 9 -> 10, crosses threshold 10
    const create = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({ systemLanguage: 'fr' });
    const prisma = makePrisma({ counterWrite, create, findUnique });
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
      title: '🏆 Palier 2 atteint',
      content: 'Publications : 10 — bravo, tu atteins le palier 2 !',
      context: {},
      metadata: { action: 'view_details', route: 'progression', axisKey: 'content.post', threshold: 10, tierRank: 2, value: 10 },
    });
  });

  it('names the invitee on an invite_joined badge so the row can offer to write to them (#8724)', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn(async ({ where }: { where: { id: string } }) =>
      where.id === 'newcomer'
        ? { id: 'newcomer', username: 'awa', displayName: 'Awa', avatar: null }
        : { systemLanguage: 'fr' });
    const prisma = makePrisma({ counterWrite, create, findUnique });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);

    await new EngagementService(prisma).recordActivity('inviter', 'social.invite_joined', { actorId: 'newcomer' });

    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'inviter',
      type: 'badge_earned',
      actor: { id: 'newcomer', username: 'awa', displayName: 'Awa', avatar: null },
      metadata: expect.objectContaining({ axisKey: 'social.invite_joined', threshold: 1 }),
    }));
  });

  it('replays the same threshold with zero notifications (anti-replay via unique constraint)', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 }); // 0 -> 1, crosses threshold 1
    const create = jest.fn().mockRejectedValue(p2002Error());
    const prisma = makePrisma({ counterWrite, create });
    const notificationService = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'tool.sticker');

    expect(create).toHaveBeenCalledTimes(1);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('a milestone create error that is not a unique-constraint conflict never takes back the credit already written (#10895)', async () => {
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockRejectedValue(new Error('connection lost'));
    const prisma = makePrisma({ counterWrite, create });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await expect(svc.recordActivity('user-1', 'tool.sticker')).resolves.toBe(true);
    expect(counterWrite).toHaveBeenCalledTimes(1);
  });

  it('resolves two concurrent calls on the same threshold with a single milestone and notification', async () => {
    const counterWrite = jest.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const create = jest.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(p2002Error());
    const prisma = makePrisma({ counterWrite, create });
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
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ counterWrite, create });
    const notificationService = makeSharedNotificationService({
      createNotification: jest.fn().mockRejectedValue(new Error('push down')),
    });
    mockGetSharedNotificationService.mockReturnValue(notificationService);
    const svc = new EngagementService(prisma);

    await expect(svc.recordActivity('user-1', 'tool.sticker')).resolves.toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('EngagementService.recordConversationActivity', () => {
  it('credits a first message in a distinct conversation and increments the axis counter', async () => {
    const conversationCreditCreate = jest.fn().mockResolvedValue({});
    const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({ conversationCreditCreate, counterWrite });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordConversationActivity('user-1', 'conversation.public', 'conv-1');

    expect(conversationCreditCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', axisKey: 'conversation.public', conversationId: 'conv-1' },
    });
    expect(counterWrite).toHaveBeenCalledWith({ kind: 'credit', userId: 'user-1', axisKey: 'conversation.public', count: 1, points: 5 });
  });

  it('does not increment the counter again for a second message in an already-credited conversation', async () => {
    const conversationCreditCreate = jest.fn().mockRejectedValue(p2002Error());
    const counterWrite = jest.fn();
    const prisma = makePrisma({ conversationCreditCreate, counterWrite });
    const svc = new EngagementService(prisma);

    await svc.recordConversationActivity('user-1', 'conversation.public', 'conv-1');

    expect(conversationCreditCreate).toHaveBeenCalledTimes(1);
    expect(counterWrite).not.toHaveBeenCalled();
  });

  it('propagates a conversation-credit error that is not a unique-constraint conflict', async () => {
    const conversationCreditCreate = jest.fn().mockRejectedValue(new Error('connection lost'));
    const counterWrite = jest.fn();
    const prisma = makePrisma({ conversationCreditCreate, counterWrite });
    const svc = new EngagementService(prisma);

    await expect(
      svc.recordConversationActivity('user-1', 'conversation.public', 'conv-1')
    ).rejects.toThrow('connection lost');
    expect(counterWrite).not.toHaveBeenCalled();
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
    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      { currentStreakDays: 0, longestStreakDays: 0, lastStreakDate: null },
      { userUpdateMany: userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
      data: { currentStreakDays: 1, longestStreakDays: 1, lastStreakDate: TODAY_UTC_MIDNIGHT },
    });
  });

  it('increments the streak the day right after the last qualifying activity', async () => {
    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      { currentStreakDays: 4, longestStreakDays: 6, lastStreakDate: YESTERDAY_UTC_MIDNIGHT },
      { userUpdateMany: userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
      data: { currentStreakDays: 5, longestStreakDays: 6, lastStreakDate: TODAY_UTC_MIDNIGHT },
    });
  });

  it('does not increment the streak twice for two activities on the same day', async () => {
    // The streak is written by a CONDITIONAL `updateMany` (#9376) — this test
    // asserts only that none of those calls carry STREAK fields.
    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      { currentStreakDays: 3, longestStreakDays: 3, lastStreakDate: TODAY_UTC_MIDNIGHT },
      { userUpdateMany: userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.post');
    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentStreakDays: expect.anything() }) }),
    );
  });

  it('resets a skipped-day streak to 1 without lowering the recorded longest streak, keeping the lost streak for a relight (#9376)', async () => {
    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      { currentStreakDays: 10, longestStreakDays: 20, lastStreakDate: THREE_DAYS_AGO_UTC_MIDNIGHT },
      { userUpdateMany: userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
      data: {
        currentStreakDays: 1,
        longestStreakDays: 20,
        lastStreakDate: TODAY_UTC_MIDNIGHT,
        brokenStreakDays: 10,
        brokenStreakLastDay: THREE_DAYS_AGO_UTC_MIDNIGHT.toISOString().slice(0, 10),
      },
    });
  });

  it('treats a legacy user with absent streak fields as a brand new streak, never NaN', async () => {
    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    // Pre-migration `User` document: the fields are ABSENT, not defaulted to 0
    // (Mongo does not backfill `@default` on existing rows — see the
    // `updateStreak` doc-comment and `packages/shared/CLAUDE.md`).
    const prisma = makeStreakPrisma({} as any, { userUpdateMany: userUpdate });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
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
      content: '🔥 Ta Flamme brûle depuis 3 jours !',
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

    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 4,
        longestStreakDays: 6,
        lastStreakDate: LAST_STREAK_MARKER,
        timezone: 'America/Los_Angeles',
      },
      { userUpdateMany: userUpdate },
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

    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 4,
        longestStreakDays: 6,
        lastStreakDate: LAST_STREAK_MARKER,
        timezone: 'America/Los_Angeles',
      },
      { userUpdateMany: userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
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

    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 1,
        longestStreakDays: 1,
        lastStreakDate: EVENING_ONE,
        timezone: 'America/Los_Angeles',
      },
      { userUpdateMany: userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
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

    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 4,
        longestStreakDays: 6,
        lastStreakDate: new Date('2026-09-07T00:00:00.000Z'),
        timezone: null,
      },
      { userUpdateMany: userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
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

    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makeStreakPrisma(
      {
        currentStreakDays: 4,
        longestStreakDays: 6,
        lastStreakDate: new Date('2026-09-07T00:00:00.000Z'),
        timezone: 'Not/A_Zone',
      },
      { userUpdateMany: userUpdate },
    );
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(userUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
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
    const attendu = poidsParDefaut('content.text_message');
    const runCommandRaw = makeRawScore(attendu);
    const prisma = makeLevelPrisma({ runCommandRaw });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'content.text_message');

    expect(runCommandRaw).toHaveBeenCalledWith({
      findAndModify: 'User',
      query: { _id: { $oid: 'user-1' } },
      // Poche, cycle et total à vie montent du même montant, null-safely (#10846).
      update: [
        {
          $set: {
            sparksEarnedLifetime: {
              $add: [
                { $max: [{ $ifNull: ['$sparksEarnedLifetime', 0] }, { $ifNull: ['$sparksSincePrestige', 0] }, { $ifNull: ['$engagementScore', 0] }] },
                attendu,
              ],
            },
            sparksSincePrestige: {
              $add: [{ $max: [{ $ifNull: ['$sparksSincePrestige', 0] }, { $ifNull: ['$engagementScore', 0] }] }, attendu],
            },
            // La dette se déduit d'abord du gain : seul le reste va en poche (porteur, 2026-10-16).
            engagementScore: {
              $add: [{ $ifNull: ['$engagementScore', 0] }, { $subtract: [attendu, { $min: [{ $ifNull: ['$sparksDebt', 0] }, attendu] }] }],
            },
            sparksDebt: { $subtract: [{ $ifNull: ['$sparksDebt', 0] }, { $min: [{ $ifNull: ['$sparksDebt', 0] }, attendu] }] },
            // La révision de l'état du jeu monte dans la MÊME écriture, sans jamais reculer (#10912).
            gameRevision: { $max: [{ $toLong: expect.any(Number) }, { $add: [{ $toLong: { $ifNull: ['$gameRevision', 0] } }, 1] }] },
          },
        },
      ],
      new: true,
      fields: { engagementScore: 1, levelRecord: 1, levelMaxLifetime: 1, prestige: 1 },
    });
  });

  /**
   * **Le poids DISTINGUE les gestes, ou il ne sert à rien.** Le témoin
   * ci-dessus passerait au vert si tous les axes valaient la même chose. Celui-ci
   * mesure l'ÉCART voulu par le porteur (liste du 2026-09-30) — publier un reel
   * 199 > se lier 7 > une conversation, un vocal 5 > un texte, un commentaire 3
   * > un sticker 1.
   */
  it('le barème ORDONNE les gestes — publier passe devant se lier, se lier devant écrire', () => {
    const poids = (axe: EngagementAxisKey) => poidsParDefaut(axe);
    expect(poids('content.reel')).toBeGreaterThan(poids(SOCIAL_ENGAGEMENT_AXES[3]!));
    expect(poids(SOCIAL_ENGAGEMENT_AXES[3]!)).toBeGreaterThan(poids('conversation.private'));
    expect(poids('conversation.private')).toBeGreaterThan(poids('content.text_message'));
    expect(poids('content.text_message')).toBeGreaterThan(poids('tool.sticker'));
    expect(poids('content.audio_message')).toBeGreaterThan(poids('content.text_message'));
    expect(poids('comment.text')).toBeGreaterThan(poids('tool.sticker'));
  });

  it('weighs a tool axis at 1, distinct from a content axis at 3', async () => {
    const runCommandRaw = makeRawScore(1);
    const prisma = makeLevelPrisma({ runCommandRaw });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'tool.sticker');

    const command = runCommandRaw.mock.calls[0][0] as {
      update: Array<{ $set: { sparksSincePrestige: { $add: [unknown, number] } } }>;
    };
    expect(command.update[0].$set.sparksSincePrestige.$add[1]).toBe(1);
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

  it('records the score milestone but never pushes a score-tier « level » (the game level is announced by GloryService, #10901)', async () => {
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
    expect(notificationService.createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'level_up', metadata: expect.objectContaining({ threshold: 10 }) }));
  });

  it.each([
    ['{ $numberLong }', { $numberLong: '10' }],
    ['{ $numberInt }', { $numberInt: '10' }],
    ['{ $numberDouble }', { $numberDouble: '10' }],
  ])('awards LEVEL_UP when the raw command returns the new score as %s (#10541)', async (_form, engagementScore) => {
    const create = jest.fn().mockResolvedValue({});
    const runCommandRaw = jest.fn().mockResolvedValue({ ok: 1, value: { engagementScore, levelRecord: { $numberLong: '0' } } });
    const prisma = makeLevelPrisma({ create, runCommandRaw });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordActivity('user-1', 'conversation.private');

    expect(create).toHaveBeenCalledWith({ data: { userId: 'user-1', milestoneType: 'level', milestoneKey: 'level:10' } });
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
