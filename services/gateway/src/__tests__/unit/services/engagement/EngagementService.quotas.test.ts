/**
 * Le barème complet (#8959) : plafonds par jour, par cible et par compte,
 * variantes, gros poids, règle progressive des liens, reprise d'un contenu
 * supprimé, bonus de constance.
 * @jest-environment node
 *
 * Les quotas tournent sur un magasin EN MÉMOIRE qui applique la contrainte
 * unique `(userId, operationKey, bucket)` comme la base : un plafond se prouve
 * en rejouant le geste, pas en lisant l'argument d'un double.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScale } from '@meeshy/shared/types/engagement-scale';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

(getSharedNotificationService as jest.MockedFunction<typeof getSharedNotificationService>).mockReturnValue(
  undefined as never,
);

type QuotaRow = { count: number; points: number; createdAt: Date; updatedAt: Date };

function quotaStore() {
  const rows = new Map<string, QuotaRow>();
  const keyOf = (w: { userId: string; operationKey: string; bucket: string }) =>
    `${w.userId}|${w.operationKey}|${w.bucket}`;
  const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });
  const store = {
    rows,
    upsert: jest.fn(async (args: { where: { userId_operationKey_bucket: { userId: string; operationKey: string; bucket: string } } }) => {
      const key = keyOf(args.where.userId_operationKey_bucket);
      const now = new Date();
      const row = rows.get(key);
      const next = row ? { ...row, count: row.count + 1, updatedAt: now } : { count: 1, points: 0, createdAt: now, updatedAt: now };
      rows.set(key, next);
      return { count: next.count };
    }),
    update: jest.fn(async () => ({ count: 1 })),
    create: jest.fn(async (args: { data: { userId: string; operationKey: string; bucket: string } }) => {
      const key = keyOf(args.data);
      if (rows.has(key)) throw p2002();
      const now = new Date();
      rows.set(key, { count: 1, points: 0, createdAt: now, updatedAt: now });
      return {};
    }),
    updateMany: jest.fn(async (args: {
      where: { userId: string; operationKey: string; bucket: string; updatedAt?: { lt: Date }; points?: number };
      data: { points?: number; updatedAt?: Date; count?: { increment: number } };
    }) => {
      const key = keyOf(args.where);
      const row = rows.get(key);
      if (!row) return { count: 0 };
      if (args.where.updatedAt && !(row.updatedAt < args.where.updatedAt.lt)) return { count: 0 };
      if (args.where.points !== undefined && row.points !== args.where.points) return { count: 0 };
      rows.set(key, {
        ...row,
        points: args.data.points ?? row.points,
        updatedAt: args.data.updatedAt ?? row.updatedAt,
        count: row.count + (args.data.count?.increment ?? 0),
      });
      return { count: 1 };
    }),
    findUnique: jest.fn(async (args: { where: { userId_operationKey_bucket: { userId: string; operationKey: string; bucket: string } } }) => {
      const row = rows.get(keyOf(args.where.userId_operationKey_bucket));
      return row ? { points: row.points, createdAt: row.createdAt } : null;
    }),
  };
  return store;
}

function makePrisma(options: { verified?: boolean; streak?: { current: number; lastDay: Date | null } } = {}) {
  const quotas = quotaStore();
  const counterUpsert = jest.fn().mockResolvedValue({ count: 1 });
  const counterUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const runCommandRaw = jest.fn().mockResolvedValue({ ok: 1, value: { engagementScore: 0 } });
  const prisma = {
    engagementCounter: { upsert: counterUpsert, updateMany: counterUpdateMany, findMany: jest.fn().mockResolvedValue([]) },
    engagementMilestone: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    engagementConversationCredit: { create: jest.fn().mockResolvedValue({}) },
    engagementQuota: quotas,
    conversationEngagement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    user: {
      findUnique: jest.fn(async () => ({
        engagementScore: 0,
        timezone: null,
        emailVerifiedAt: options.verified ? new Date('2026-01-01') : null,
        phoneVerifiedAt: null,
        currentStreakDays: options.streak?.current ?? 0,
        longestStreakDays: options.streak?.current ?? 0,
        lastStreakDate: options.streak?.lastDay ?? null,
      })),
      update: jest.fn().mockResolvedValue({}),
    },
    $runCommandRaw: runCommandRaw,
  } as unknown as PrismaClient;
  return { prisma, quotas, counterUpsert, counterUpdateMany, runCommandRaw };
}

const scaled = (scale: EngagementScale = DEFAULT_ENGAGEMENT_SCALE) => ({ scale: { current: async () => scale } });

/** Les points crédités par chaque appel au compteur, dans l'ordre. */
const credits = (counterUpsert: jest.Mock): Array<{ key: string; points: number }> =>
  counterUpsert.mock.calls.map((call) => {
    const args = call[0] as { create: { axisKey: string; points: number } };
    return { key: args.create.axisKey, points: args.create.points };
  });

describe('le plafond par jour', () => {
  it('crédite les demandes de traduction jusqu’à 20 par jour, puis plus rien', async () => {
    const { prisma, counterUpsert } = makePrisma();
    const service = new EngagementService(prisma, scaled());

    for (let i = 0; i < 22; i += 1) {
      await service.recordActivity('u1', 'tool.translation_request');
    }

    expect(counterUpsert).toHaveBeenCalledTimes(20);
  });
});

describe('une fois par cible, une fois par compte', () => {
  it('ne crédite qu’une adhésion par communauté', async () => {
    const { prisma, counterUpsert } = makePrisma();
    const service = new EngagementService(prisma, scaled());

    await service.recordActivity('u1', 'social.community_joined', { targetId: 'c1' });
    await service.recordActivity('u1', 'social.community_joined', { targetId: 'c1' });
    await service.recordActivity('u1', 'social.community_joined', { targetId: 'c2' });

    expect(credits(counterUpsert)).toEqual([
      { key: 'social.community_joined', points: 2 },
      { key: 'social.community_joined', points: 2 },
    ]);
  });

  it('ne crédite la photo de profil qu’une fois dans la vie du compte, jamais multipliée', async () => {
    const { prisma, counterUpsert } = makePrisma();
    const service = new EngagementService(prisma, scaled());

    await service.recordActivity('u1', 'profile.avatar');
    await service.recordActivity('u1', 'profile.avatar');

    expect(credits(counterUpsert)).toEqual([{ key: 'profile.avatar', points: 10 }]);
  });
});

describe('interagir avec son propre contenu', () => {
  it('ne rapporte rien', async () => {
    const { prisma, counterUpsert } = makePrisma();
    const service = new EngagementService(prisma, scaled());

    await service.recordActivity('u1', 'tool.post_reaction', { targetId: 'p1', targetOwnerId: 'u1' });
    await service.recordActivity('u1', 'tool.post_reaction', { targetId: 'p2', targetOwnerId: 'u2' });

    expect(counterUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('les gros poids', () => {
  it('créditent un post public à 99 pour un compte vérifié, selon sa visibilité', async () => {
    const { prisma, counterUpsert } = makePrisma({ verified: true });
    const service = new EngagementService(prisma, scaled());

    await service.recordActivity('u1', 'content.post', { targetId: 'p1', variant: 'public' });
    await service.recordActivity('u1', 'content.post', { targetId: 'p2', variant: 'friends' });
    await service.recordActivity('u1', 'content.post', { targetId: 'p3', variant: 'other' });

    expect(credits(counterUpsert).map((c) => c.points)).toEqual([99, 49, 0]);
  });

  it('bornent un compte sans contact vérifié à la valeur plafond des non-vérifiés', async () => {
    const { prisma, counterUpsert } = makePrisma({ verified: false });
    const service = new EngagementService(prisma, scaled());

    await service.recordActivity('u1', 'content.reel', { targetId: 'r1' });

    expect(credits(counterUpsert)).toEqual([{ key: 'content.reel', points: 10 }]);
  });

  it('ne créditent un même contenu qu’une fois', async () => {
    const { prisma, counterUpsert } = makePrisma({ verified: true });
    const service = new EngagementService(prisma, scaled());

    await service.recordActivity('u1', 'content.reel', { targetId: 'r1' });
    await service.recordActivity('u1', 'content.reel', { targetId: 'r1' });

    expect(counterUpsert).toHaveBeenCalledTimes(1);
  });

  it('rendent leurs points quand le contenu est supprimé dans la fenêtre, une seule fois', async () => {
    const { prisma, counterUpdateMany, runCommandRaw } = makePrisma({ verified: true });
    const service = new EngagementService(prisma, scaled());
    await service.recordActivity('u1', 'content.reel', { targetId: 'r1' });

    const first = await service.reclaimContent('u1', 'content.reel', 'r1');
    const second = await service.reclaimContent('u1', 'content.reel', 'r1');

    expect([first, second]).toEqual([199, 0]);
    expect(counterUpdateMany).toHaveBeenCalledTimes(1);
    const last = runCommandRaw.mock.calls.at(-1)?.[0] as { update: Array<{ $set: { engagementScore: unknown } }> };
    expect(JSON.stringify(last.update)).toContain('199');
  });

  it('ne reprennent rien après la fenêtre', async () => {
    const { prisma, quotas } = makePrisma({ verified: true });
    const service = new EngagementService(prisma, scaled());
    await service.recordActivity('u1', 'content.reel', { targetId: 'r1' });
    for (const [key, row] of quotas.rows) {
      quotas.rows.set(key, { ...row, createdAt: new Date(Date.now() - 48 * 3_600_000) });
    }

    expect(await service.reclaimContent('u1', 'content.reel', 'r1')).toBe(0);
  });
});

describe('les visites de lien', () => {
  const visit = (visitorKey: string, extra: { visitorUserId?: string } = {}) => ({
    creatorId: 'creator',
    linkKey: 'tracked:abc',
    visitorKey,
    ...extra,
  });

  it('paient 2 par visite unique jusqu’à 10, puis 4', async () => {
    const { prisma, counterUpsert } = makePrisma();
    const service = new EngagementService(prisma, scaled());

    for (let i = 1; i <= 11; i += 1) {
      await service.recordLinkVisit(visit(`v${i}`));
    }

    const points = credits(counterUpsert).map((c) => c.points);
    expect(points.slice(0, 10)).toEqual(Array(10).fill(2));
    expect(points[10]).toBe(4);
  });

  it('ne comptent qu’une visite par visiteur sur la fenêtre, et jamais celle du créateur', async () => {
    const { prisma, counterUpsert } = makePrisma();
    const service = new EngagementService(prisma, scaled());

    await service.recordLinkVisit(visit('v1'));
    await service.recordLinkVisit(visit('v1'));
    await service.recordLinkVisit(visit('creator', { visitorUserId: 'creator' }));

    expect(counterUpsert).toHaveBeenCalledTimes(1);
  });

  it('comptent de nouveau un visiteur revenu après la fenêtre', async () => {
    const { prisma, quotas, counterUpsert } = makePrisma();
    const service = new EngagementService(prisma, scaled());
    await service.recordLinkVisit(visit('v1'));
    for (const [key, row] of quotas.rows) {
      if (key.includes('visit:')) quotas.rows.set(key, { ...row, updatedAt: new Date(Date.now() - 25 * 3_600_000) });
    }

    await service.recordLinkVisit(visit('v1'));

    expect(counterUpsert).toHaveBeenCalledTimes(2);
  });
});

describe('la constance', () => {
  it('paie le bonus de 7 jours quand la série l’atteint, une fois', async () => {
    const yesterday = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 86_400_000);
    const { prisma, counterUpsert } = makePrisma({ streak: { current: 6, lastDay: yesterday } });
    const service = new EngagementService(prisma, scaled());

    await service.recordActivity('u1', 'tool.sticker');

    expect(credits(counterUpsert)).toContainEqual({ key: 'streak.bonus', points: 10 });
  });
});
