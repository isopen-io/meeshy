/**
 * Les séries par acte, la série globale sans plafond à 1000 et la fidélité
 * (#10388, #10389, #10390).
 * @jest-environment node
 *
 * Quotas et séries tournent sur des magasins EN MÉMOIRE qui appliquent les
 * contraintes uniques comme la base : « payé une fois » se prouve en rejouant
 * le geste, pas en lisant l'argument d'un double.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScale } from '@meeshy/shared/types/engagement-scale';
import { emptyActTiers, type EngagementStreakAct, type EngagementStreakTier } from '@meeshy/shared/types/engagement-act-streaks';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { routeCounterWrites, type CounterWrite } from '../../../../services/engagement/__tests__/mongoLikeCounters';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

(getSharedNotificationService as jest.MockedFunction<typeof getSharedNotificationService>).mockReturnValue(
  undefined as never,
);

const DAY_MS = 86_400_000;
const todayKey = (offsetDays = 0): string => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const utcMidnight = (offsetDays = 0): Date => new Date(`${todayKey(offsetDays)}T00:00:00Z`);

type QuotaKey = { userId: string; operationKey: string; bucket: string };

function quotaStore() {
  const rows = new Map<string, number>();
  const keyOf = (w: QuotaKey) => `${w.userId}|${w.operationKey}|${w.bucket}`;
  return {
    rows,
    upsert: jest.fn(async (args: { where: { userId_operationKey_bucket: QuotaKey } }) => {
      const key = keyOf(args.where.userId_operationKey_bucket);
      const count = (rows.get(key) ?? 0) + 1;
      rows.set(key, count);
      return { count };
    }),
    update: jest.fn(async () => ({ count: 1 })),
    updateMany: jest.fn(async () => ({ count: 0 })),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
  };
}

type ActRow = { userId: string; act: string; currentDays: number; longestDays: number; lastDay: string };

function actStreakStore(seed: readonly ActRow[] = []) {
  const rows = new Map<string, ActRow>(seed.map((row) => [`${row.userId}|${row.act}`, row]));
  const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });
  return {
    rows,
    findUnique: jest.fn(async (args: { where: { userId_act: { userId: string; act: string } } }) => {
      const row = rows.get(`${args.where.userId_act.userId}|${args.where.userId_act.act}`);
      return row ? { ...row } : null;
    }),
    findMany: jest.fn(async (args: { where: { userId: string } }) =>
      [...rows.values()].filter((row) => row.userId === args.where.userId),
    ),
    create: jest.fn(async (args: { data: ActRow }) => {
      const key = `${args.data.userId}|${args.data.act}`;
      if (rows.has(key)) throw p2002();
      rows.set(key, { ...args.data });
      return {};
    }),
    updateMany: jest.fn(async (args: {
      where: { userId: string; act: string; lastDay: string; currentDays: number };
      data: { currentDays: number; longestDays: number; lastDay: string };
    }) => {
      const key = `${args.where.userId}|${args.where.act}`;
      const row = rows.get(key);
      if (!row || row.lastDay !== args.where.lastDay || row.currentDays !== args.where.currentDays) return { count: 0 };
      rows.set(key, { ...row, ...args.data });
      return { count: 1 };
    }),
  };
}

function makePrisma(options: {
  readonly globalStreak?: { readonly current: number; readonly lastDay: Date | null };
  readonly createdAt?: Date;
  readonly actRows?: readonly ActRow[];
} = {}) {
  const quotas = quotaStore();
  const actStreaks = actStreakStore(options.actRows);
  const counterWrite = jest.fn().mockResolvedValue({ count: 1 });
  const runCommandRaw = jest.fn().mockResolvedValue({ ok: 1, value: { engagementScore: 0 } });
  const prisma = {
    engagementCounter: { findMany: jest.fn().mockResolvedValue([]) },
    engagementMilestone: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    engagementQuota: quotas,
    engagementActStreak: actStreaks,
    engagementPostPoints: { upsert: jest.fn().mockResolvedValue({ totalPoints: 0 }), findUnique: jest.fn().mockResolvedValue(null) },
    conversationEngagement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    user: {
      findUnique: jest.fn(async () => ({
        engagementScore: 0,
        timezone: null,
        emailVerifiedAt: new Date('2026-01-01'),
        phoneVerifiedAt: null,
        createdAt: options.createdAt ?? new Date(),
        currentStreakDays: options.globalStreak?.current ?? 0,
        longestStreakDays: options.globalStreak?.current ?? 0,
        lastStreakDate: options.globalStreak?.lastDay ?? null,
      })),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $runCommandRaw: routeCounterWrites(counterWrite, runCommandRaw),
  } as unknown as PrismaClient;
  return { prisma, quotas, actStreaks, counterWrite };
}

const scaleWith = (patch: {
  readonly global?: readonly EngagementStreakTier[];
  readonly acts?: Partial<Record<EngagementStreakAct, readonly EngagementStreakTier[]>>;
  readonly loyalty?: readonly EngagementStreakTier[];
}): { scale: { current: () => Promise<EngagementScale> } } => {
  const scale: EngagementScale = {
    ...DEFAULT_ENGAGEMENT_SCALE,
    streaks: {
      global: patch.global ?? [],
      acts: { ...emptyActTiers(), ...patch.acts },
    },
    loyalty: patch.loyalty ?? [],
  };
  return { scale: { current: async () => scale } };
};

const bonuses = (counterWrite: jest.Mock): number[] =>
  counterWrite.mock.calls
    .map((call) => call[0] as CounterWrite)
    .filter((write) => write.axisKey === 'streak.bonus')
    .map((write) => write.points);

const row = (act: EngagementStreakAct, currentDays: number, lastDay: string): ActRow => ({
  userId: 'u1',
  act,
  currentDays,
  longestDays: currentDays,
  lastDay,
});

describe('la série globale', () => {
  it('paie un palier de 100 000 points, sans le ramener à 1000', async () => {
    const { prisma, counterWrite } = makePrisma({ globalStreak: { current: 364, lastDay: utcMidnight(-1) } });
    const service = new EngagementService(prisma, scaleWith({ global: [{ days: 365, points: 100_000 }] }));

    await service.recordActivity('u1', 'tool.sticker');

    expect(bonuses(counterWrite)).toEqual([100_000]);
  });
});

describe('la série d’un acte', () => {
  it('démarre à un jour au premier crédit de l’acte', async () => {
    const { prisma, actStreaks } = makePrisma();
    const service = new EngagementService(prisma, scaleWith({}));

    await service.recordActivity('u1', 'content.story', { targetId: 's1' });

    expect(actStreaks.rows.get('u1|story')).toMatchObject({ currentDays: 1, longestDays: 1, lastDay: todayKey() });
  });

  it('avance le lendemain et paie le palier de l’acte, une seule fois', async () => {
    const { prisma, actStreaks, counterWrite, quotas } = makePrisma({ actRows: [row('story', 6, todayKey(-1))] });
    const service = new EngagementService(prisma, scaleWith({ acts: { story: [{ days: 7, points: 50 }] } }));

    await service.recordActivity('u1', 'content.story', { targetId: 's1' });
    await service.recordActivity('u1', 'content.story', { targetId: 's2' });

    expect(actStreaks.rows.get('u1|story')).toMatchObject({ currentDays: 7, lastDay: todayKey() });
    expect(bonuses(counterWrite)).toEqual([50]);
    expect(quotas.rows.get('u1|streak.bonus|streak:story:7')).toBe(1);
  });

  it('ne paie jamais deux fois le même palier, même après une série reprise', async () => {
    const { prisma, counterWrite, quotas } = makePrisma({ actRows: [row('reel', 6, todayKey(-1))] });
    quotas.rows.set('u1|streak.bonus|streak:reel:7', 1);
    const service = new EngagementService(prisma, scaleWith({ acts: { reel: [{ days: 7, points: 50 }] } }));

    await service.recordActivity('u1', 'content.reel', { targetId: 'r1' });

    expect(bonuses(counterWrite)).toEqual([]);
  });

  it('range une réaction sur un réel sous reaction_reel, jamais sous reaction_post', async () => {
    const { prisma, actStreaks } = makePrisma();
    const service = new EngagementService(prisma, scaleWith({}));

    await service.recordActivity('u1', 'tool.post_reaction', { postId: 'p1', targetId: 'p1', targetOwnerId: 'u2', postType: 'REEL' });

    expect(actStreaks.rows.has('u1|reaction_reel')).toBe(true);
    expect(actStreaks.rows.has('u1|reaction_post')).toBe(false);
  });

  it('range un message sous « conversation » et laisse un geste sans acte hors des séries', async () => {
    const { prisma, actStreaks } = makePrisma();
    const service = new EngagementService(prisma, scaleWith({}));

    await service.recordActivity('u1', 'content.text_message', { conversationId: 'c1' });
    await service.recordActivity('u1', 'tool.sticker');

    expect([...actStreaks.rows.keys()]).toEqual(['u1|conversation']);
  });

  it('ne fait pas échouer le crédit quand la série ne peut pas s’écrire', async () => {
    const { prisma, actStreaks, counterWrite } = makePrisma();
    actStreaks.findUnique.mockRejectedValueOnce(new Error('panne'));
    const service = new EngagementService(prisma, scaleWith({}));

    await expect(service.recordActivity('u1', 'content.story', { targetId: 's1' })).resolves.toBe(true);
    expect(counterWrite).toHaveBeenCalled();
  });
});

describe('la fidélité', () => {
  it('paie chaque palier que l’ancienneté atteint, une fois', async () => {
    const { prisma, counterWrite, quotas } = makePrisma({
      globalStreak: { current: 1, lastDay: utcMidnight(-1) },
      createdAt: utcMidnight(-400),
    });
    const service = new EngagementService(prisma, scaleWith({ loyalty: [{ days: 30, points: 7 }, { days: 365, points: 100_000 }, { days: 730, points: 1 }] }));

    await service.recordActivity('u1', 'tool.sticker');
    await service.recordActivity('u1', 'tool.sticker');

    expect(bonuses(counterWrite)).toEqual([7, 100_000]);
    expect(quotas.rows.get('u1|streak.bonus|loyalty:365')).toBe(2);
  });
});

describe('les séries servies', () => {
  it('rend la série de chaque acte du compte', async () => {
    const { prisma } = makePrisma({ actRows: [row('story', 3, todayKey())] });
    const service = new EngagementService(prisma, scaleWith({}));

    await expect(service.actStreaks('u1')).resolves.toEqual([
      { act: 'story', currentDays: 3, longestDays: 3, lastDay: todayKey() },
    ]);
  });
});
