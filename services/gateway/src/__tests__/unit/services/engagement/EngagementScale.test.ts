/**
 * Le barème réglable et l'état « N (M) 🔥 » par conversation (#8906).
 * @jest-environment node
 *
 * La loi du barème elle-même est éprouvée dans
 * `packages/shared/__tests__/engagement-scale.test.ts`. Ici : sa LECTURE (défauts,
 * repli, cache), son APPLICATION au crédit, le plafond journalier par
 * conversation, l'état de la conversation et son émission.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  DEFAULT_ENGAGEMENT_SCALE,
  type EngagementScale,
} from '@meeshy/shared/types/engagement-scale';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { EngagementScaleService } from '../../../../services/engagement/EngagementScaleService';
import {
  nextConversationEngagement,
  viewerSnapshot,
} from '../../../../services/engagement/ConversationEngagementRecorder';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

(getSharedNotificationService as jest.MockedFunction<typeof getSharedNotificationService>).mockReturnValue(
  undefined as never,
);

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const utcToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const ONE_DAY = 24 * 60 * 60 * 1000;

function scaleWith(overrides: {
  operations?: Partial<EngagementScale['operations']>;
  multiplier?: Partial<EngagementScale['multiplier']>;
}): EngagementScale {
  return {
    operations: { ...DEFAULT_ENGAGEMENT_SCALE.operations, ...overrides.operations },
    multiplier: { ...DEFAULT_ENGAGEMENT_SCALE.multiplier, ...overrides.multiplier },
  };
}

function makeScalePrisma(findUnique: jest.Mock) {
  return {
    engagementScaleConfig: {
      findUnique,
      upsert: jest.fn(async (args: unknown) => ({
        config: (args as { update: { config: unknown } }).update.config,
        updatedAt: new Date('2026-09-30T10:00:00.000Z'),
        updatedById: 'admin-1',
      })),
    },
  } as unknown as PrismaClient;
}

function makeCreditPrisma(options: {
  recentAxes?: string[];
  conversationRow?: Record<string, unknown> | null;
  engagementScore?: number;
} = {}) {
  const counterUpsert = jest.fn().mockResolvedValue({ count: 2 });
  const runCommandRaw = jest.fn().mockResolvedValue({ ok: 1, value: { engagementScore: 50 } });
  const userUpdate = jest.fn().mockResolvedValue({});
  const conversationUpsert = jest.fn().mockResolvedValue({});
  const prisma = {
    engagementCounter: {
      upsert: counterUpsert,
      findMany: jest.fn().mockResolvedValue((options.recentAxes ?? []).map((axisKey) => ({ axisKey }))),
    },
    engagementMilestone: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementConversationCredit: { create: jest.fn().mockResolvedValue({}) },
    conversationEngagement: {
      findUnique: jest.fn().mockResolvedValue(options.conversationRow ?? null),
      upsert: conversationUpsert,
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ engagementScore: options.engagementScore ?? 0, timezone: null }),
      update: userUpdate,
    },
    $runCommandRaw: runCommandRaw,
  } as unknown as PrismaClient;
  return { prisma, counterUpsert, runCommandRaw, userUpdate, conversationUpsert };
}

function fixedScale(scale: EngagementScale) {
  return { current: jest.fn(async () => scale) };
}

function fakeIO() {
  const emitted: Array<{ room: string | string[]; event: string; payload: unknown }> = [];
  const io = {
    to: (room: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
        return true;
      },
    }),
  };
  return { io, emitted };
}

function creditedPoints(counterUpsert: jest.Mock): number {
  return (counterUpsert.mock.calls[0][0] as { create: { points: number } }).create.points;
}

describe('EngagementScaleService — le barème effectif', () => {
  it('sert les défauts quand aucune ligne n\'a jamais été écrite', async () => {
    const service = new EngagementScaleService(makeScalePrisma(jest.fn().mockResolvedValue(null)));

    expect(await service.document()).toEqual({ scale: DEFAULT_ENGAGEMENT_SCALE, updatedAt: null, updatedBy: null });
  });

  it('retombe sur les défauts quand la ligne est illisible', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      config: { operations: { 'tool.reaction': { points: -5 } } },
      updatedAt: new Date(),
      updatedById: 'admin-1',
    });
    const service = new EngagementScaleService(makeScalePrisma(findUnique));

    expect(await service.current()).toEqual(DEFAULT_ENGAGEMENT_SCALE);
  });

  it('retombe sur les défauts quand la lecture lève', async () => {
    const service = new EngagementScaleService(makeScalePrisma(jest.fn().mockRejectedValue(new Error('db down'))));

    expect(await service.current()).toEqual(DEFAULT_ENGAGEMENT_SCALE);
  });

  it('sert la ligne stockée, avec qui l\'a réglée et quand', async () => {
    const stored = scaleWith({ multiplier: { maxFactor: 3 } });
    const findUnique = jest.fn().mockResolvedValue({
      config: stored,
      updatedAt: new Date('2026-09-29T08:00:00.000Z'),
      updatedById: 'admin-9',
    });
    const service = new EngagementScaleService(makeScalePrisma(findUnique));

    expect(await service.document()).toEqual({
      scale: stored,
      updatedAt: '2026-09-29T08:00:00.000Z',
      updatedBy: 'admin-9',
    });
  });

  it('garde le barème en mémoire pendant le TTL, puis le relit', async () => {
    let now = 1_000;
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = new EngagementScaleService(makeScalePrisma(findUnique), { ttlMs: 30_000, now: () => now });

    await service.current();
    await service.current();
    expect(findUnique).toHaveBeenCalledTimes(1);

    now += 30_001;
    await service.current();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('une écriture invalide le cache : la lecture suivante voit le nouveau barème', async () => {
    const written = scaleWith({ multiplier: { maxFactor: 2 } });
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ config: written, updatedAt: new Date(), updatedById: 'admin-1' });
    const service = new EngagementScaleService(makeScalePrisma(findUnique), { now: () => 0 });

    expect(await service.current()).toEqual(DEFAULT_ENGAGEMENT_SCALE);
    const document = await service.write(written, 'admin-1');

    expect(document.scale).toEqual(written);
    expect(document.updatedBy).toBe('admin-1');
    expect(await service.current()).toEqual(written);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('le crédit applique le barème', () => {
  it('une opération NON multipliée crédite ses points tels quels, quel que soit l\'élan', async () => {
    const scale = scaleWith({
      operations: { 'tool.sticker': { points: 7, multiplied: false, dailyCapPerConversation: null } },
    });
    const { prisma, counterUpsert, runCommandRaw } = makeCreditPrisma({
      recentAxes: ['content.post', 'comment.text', 'conversation.private'],
    });

    await new EngagementService(prisma, { scale: fixedScale(scale) }).recordActivity('u-1', 'tool.sticker');

    expect(creditedPoints(counterUpsert)).toBe(7);
    const cmd = runCommandRaw.mock.calls[0][0] as { update: Array<{ $set: { engagementScore: { $add: [unknown, number] } } }> };
    expect(cmd.update[0].$set.engagementScore.$add[1]).toBe(7);
  });

  it('le plafond de facteur du NIVEAU borne l\'élan', async () => {
    const scale = scaleWith({
      operations: { 'tool.sticker': { points: 10, multiplied: true, dailyCapPerConversation: null } },
      multiplier: { levelCaps: [{ minLevel: 0, maxFactor: 2 }] },
    });
    const { prisma, counterUpsert } = makeCreditPrisma({
      recentAxes: ['content.post', 'comment.text', 'conversation.private'],
      engagementScore: 0,
    });

    await new EngagementService(prisma, { scale: fixedScale(scale) }).recordActivity('u-2', 'tool.sticker');

    expect(creditedPoints(counterUpsert)).toBe(20);
  });

  it('aux défauts, le crédit reste celui d\'avant le barème', async () => {
    const { prisma, counterUpsert } = makeCreditPrisma({ recentAxes: ['content.post'] });

    await new EngagementService(prisma, { scale: fixedScale(DEFAULT_ENGAGEMENT_SCALE) }).recordActivity(
      'u-3',
      'tool.sticker',
    );

    // contenu + outil actifs : ×2
    expect(creditedPoints(counterUpsert)).toBe(DEFAULT_ENGAGEMENT_SCALE.operations['tool.sticker'].points * 2);
  });
});

describe('le plafond journalier par conversation', () => {
  const capped = scaleWith({
    operations: { 'tool.reaction': { points: 1, multiplied: false, dailyCapPerConversation: 2 } },
  });

  it('plafond atteint aujourd\'hui ⇒ le geste ne crédite RIEN', async () => {
    const { prisma, counterUpsert, runCommandRaw, userUpdate, conversationUpsert } = makeCreditPrisma({
      conversationRow: {
        totalPoints: 2,
        dayPoints: 2,
        day: utcToday(),
        dayCounts: { 'tool.reaction': 2 },
        streakDays: 1,
        longestStreakDays: 1,
      },
    });

    await new EngagementService(prisma, { scale: fixedScale(capped) }).recordActivity('u-1', 'tool.reaction', {
      conversationId: 'c-1',
    });

    expect(counterUpsert).not.toHaveBeenCalled();
    expect(runCommandRaw).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it('le plafond d\'hier ne compte plus aujourd\'hui', async () => {
    const { prisma, counterUpsert, conversationUpsert } = makeCreditPrisma({
      conversationRow: {
        totalPoints: 2,
        dayPoints: 2,
        day: new Date(utcToday().getTime() - ONE_DAY),
        dayCounts: { 'tool.reaction': 2 },
        streakDays: 3,
        longestStreakDays: 3,
      },
    });

    await new EngagementService(prisma, { scale: fixedScale(capped), emitIO: () => undefined }).recordActivity(
      'u-1',
      'tool.reaction',
      { conversationId: 'c-1' },
    );

    expect(counterUpsert).toHaveBeenCalledTimes(1);
    const write = conversationUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(write.update).toMatchObject({
      totalPoints: 3,
      dayPoints: 1,
      dayCounts: { 'tool.reaction': 1 },
      streakDays: 4,
      longestStreakDays: 4,
    });
  });

  it('sans conversation, aucun plafond ni état de conversation', async () => {
    const { prisma, counterUpsert, conversationUpsert } = makeCreditPrisma();

    await new EngagementService(prisma, { scale: fixedScale(capped) }).recordActivity('u-1', 'tool.reaction');

    expect(counterUpsert).toHaveBeenCalledTimes(1);
    expect(conversationUpsert).not.toHaveBeenCalled();
  });
});

describe('l\'état d\'une conversation après un geste', () => {
  const row = (iso: string, overrides: Record<string, unknown> = {}) => ({
    totalPoints: 40,
    dayPoints: 12,
    day: day(iso),
    dayCounts: { 'tool.reaction': 3 },
    streakDays: 5,
    longestStreakDays: 9,
    ...overrides,
  });

  it('même jour : cumule les points du jour, garde la série', () => {
    const next = nextConversationEngagement(row('2026-09-30'), {
      today: day('2026-09-30'),
      axisKey: 'tool.reaction',
      points: 4,
    });
    expect(next).toMatchObject({ totalPoints: 44, dayPoints: 16, streakDays: 5, longestStreakDays: 9 });
    expect(next.dayCounts).toEqual({ 'tool.reaction': 4 });
  });

  it('jour suivant : remet le jour à zéro, prolonge la série', () => {
    const next = nextConversationEngagement(row('2026-09-29'), {
      today: day('2026-09-30'),
      axisKey: 'content.text_message',
      points: 4,
    });
    expect(next).toMatchObject({ totalPoints: 44, dayPoints: 4, streakDays: 6, longestStreakDays: 9 });
    expect(next.dayCounts).toEqual({ 'content.text_message': 1 });
  });

  it('après un trou : la série repart à 1, la plus longue est gardée', () => {
    const next = nextConversationEngagement(row('2026-09-20'), {
      today: day('2026-09-30'),
      axisKey: 'tool.reaction',
      points: 2,
    });
    expect(next).toMatchObject({ dayPoints: 2, streakDays: 1, longestStreakDays: 9 });
  });

  it('premier geste : série 1', () => {
    const next = nextConversationEngagement(null, { today: day('2026-09-30'), axisKey: 'tool.reaction', points: 2 });
    expect(next).toMatchObject({ totalPoints: 2, dayPoints: 2, streakDays: 1, longestStreakDays: 1 });
  });

  it('le lecteur voit 0 point aujourd\'hui et sa série encore vivante le lendemain, éteinte après', () => {
    const stored = row('2026-09-29');
    expect(viewerSnapshot('c-1', stored, day('2026-09-29'))).toEqual({
      conversationId: 'c-1', totalPoints: 40, todayPoints: 12, streakDays: 5, day: '2026-09-29',
    });
    expect(viewerSnapshot('c-1', stored, day('2026-09-30'))).toMatchObject({ todayPoints: 0, streakDays: 5 });
    expect(viewerSnapshot('c-1', stored, day('2026-10-01'))).toMatchObject({ todayPoints: 0, streakDays: 0 });
  });
});

describe('l\'annonce de l\'état au crédité', () => {
  it('émet engagement:conversation-updated vers la SEULE room personnelle du crédité', async () => {
    const { io, emitted } = fakeIO();
    const scale = scaleWith({
      operations: { 'tool.reaction': { points: 3, multiplied: false, dailyCapPerConversation: 30 } },
    });
    const { prisma } = makeCreditPrisma();

    await new EngagementService(prisma, { scale: fixedScale(scale), emitIO: () => io }).recordActivity(
      'u-7',
      'tool.reaction',
      { conversationId: 'c-9' },
    );

    expect(emitted).toEqual([
      {
        room: 'user:u-7',
        event: SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED,
        payload: {
          conversationId: 'c-9',
          totalPoints: 3,
          todayPoints: 3,
          streakDays: 1,
          day: utcToday().toISOString().slice(0, 10),
        },
      },
    ]);
  });

  it('une émission qui lève ne fait pas échouer le crédit', async () => {
    const { prisma, conversationUpsert } = makeCreditPrisma();
    const io = { to: () => ({ emit: () => { throw new Error('socket down'); } }) };

    await expect(
      new EngagementService(prisma, { scale: fixedScale(DEFAULT_ENGAGEMENT_SCALE), emitIO: () => io }).recordActivity(
        'u-7',
        'tool.reaction',
        { conversationId: 'c-9' },
      ),
    ).resolves.toBeUndefined();
    expect(conversationUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('le barème écrit par l\'administration gouverne le crédit suivant', () => {
  it('un poids modifié s\'applique au geste suivant, sans redémarrage', async () => {
    let row: { config: unknown; updatedAt: Date; updatedById: string } | null = null;
    const { prisma, counterUpsert } = makeCreditPrisma();
    const withStore = Object.assign(prisma, {
      engagementScaleConfig: {
        findUnique: jest.fn(async () => row),
        upsert: jest.fn(async (args: unknown) => {
          const { update } = args as { update: { config: unknown; updatedById: string } };
          row = { config: update.config, updatedAt: new Date(), updatedById: update.updatedById };
          return row;
        }),
      },
    }) as unknown as PrismaClient;
    const { engagementScaleServiceFor } = await import('../../../../services/engagement/EngagementScaleService');
    const service = new EngagementService(withStore, { emitIO: () => undefined });

    await service.recordActivity('u1', 'content.text_message');
    expect(creditedPoints(counterUpsert)).toBe(DEFAULT_ENGAGEMENT_SCALE.operations['content.text_message'].points);

    await engagementScaleServiceFor(withStore).write(
      scaleWith({ operations: { 'content.text_message': { points: 42, multiplied: false, dailyCapPerConversation: null } } }),
      'admin-1',
    );
    counterUpsert.mockClear();
    await service.recordActivity('u1', 'content.text_message');
    expect(creditedPoints(counterUpsert)).toBe(42);
  });
});
