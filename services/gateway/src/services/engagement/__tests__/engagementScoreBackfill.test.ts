/**
 * engagementScoreBackfill unit tests (#5742)
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { backfillEngagementScores } from '../engagementScoreBackfill';

type Counter = { userId: string; axisKey: string; count: number };

function makePrisma(options: {
  counters: Counter[];
  scoresByUserId: Record<string, unknown>;
  create?: jest.Mock;
  userUpdate?: jest.Mock;
}) {
  const findMany = jest.fn().mockResolvedValue(options.counters);
  const findUnique = jest.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve({ engagementScore: options.scoresByUserId[where.id] }),
  );
  const create = options.create ?? jest.fn().mockResolvedValue({});
  const update = options.userUpdate ?? jest.fn().mockResolvedValue({});
  return {
    prisma: {
      engagementCounter: { findMany },
      engagementMilestone: { create },
      user: { findUnique, update },
    } as unknown as PrismaClient,
    findMany,
    findUnique,
    create,
    update,
  };
}

function p2002Error() {
  return Object.assign(new Error('duplicate key'), { code: 'P2002' });
}

describe('backfillEngagementScores', () => {
  it('recomputes the score of an account whose field is null, from its counters', async () => {
    const { prisma, update } = makePrisma({
      counters: [
        { userId: 'user-1', axisKey: 'content.text_message', count: 10 }, // weight 3 -> 30
        { userId: 'user-1', axisKey: 'tool.sticker', count: 2 }, // weight 1 -> 2
      ],
      scoresByUserId: { 'user-1': null },
    });

    const report = await backfillEngagementScores(prisma, { apply: true });

    expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { engagementScore: 32 } });
    expect(report).toEqual({ scanned: 1, corrected: 1, alreadyValid: 0 });
  });

  it('leaves an account with an already-valid numeric score untouched, even if it disagrees with the sum', async () => {
    const { prisma, update } = makePrisma({
      counters: [{ userId: 'user-1', axisKey: 'content.text_message', count: 10 }], // would sum to 30
      scoresByUserId: { 'user-1': 7 }, // valid number, different value — out of this backfill's scope
    });

    const report = await backfillEngagementScores(prisma, { apply: true });

    expect(update).not.toHaveBeenCalled();
    expect(report).toEqual({ scanned: 1, corrected: 0, alreadyValid: 1 });
  });

  it('does not write anything unless apply is true', async () => {
    const onCorrect = jest.fn();
    const { prisma, update, create } = makePrisma({
      counters: [{ userId: 'user-1', axisKey: 'tool.sticker', count: 5 }],
      scoresByUserId: { 'user-1': null },
    });

    const report = await backfillEngagementScores(prisma, { apply: false, onCorrect });

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(onCorrect).toHaveBeenCalledWith({ userId: 'user-1', from: null, to: 5 });
    expect(report).toEqual({ scanned: 1, corrected: 1, alreadyValid: 0 });
  });

  it('grave silencieusement chaque palier LEVEL_THRESHOLDS déjà franchi par le score corrigé', async () => {
    const create = jest.fn().mockResolvedValue({});
    const { prisma } = makePrisma({
      // conversation.private weight 5 × 30 = 150 -> crosses 10, 50 and 150
      counters: [{ userId: 'user-1', axisKey: 'conversation.private', count: 30 }],
      scoresByUserId: { 'user-1': null },
      create,
    });

    await backfillEngagementScores(prisma, { apply: true });

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'level', milestoneKey: 'level:10' },
    });
    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'level', milestoneKey: 'level:50' },
    });
    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'level', milestoneKey: 'level:150' },
    });
    expect(create).not.toHaveBeenCalledWith({
      data: { userId: 'user-1', milestoneType: 'level', milestoneKey: 'level:400' },
    });
  });

  it('treats an already-recorded level milestone as a no-op, never throwing (anti-replay)', async () => {
    const create = jest.fn().mockRejectedValue(p2002Error());
    const { prisma } = makePrisma({
      counters: [{ userId: 'user-1', axisKey: 'tool.sticker', count: 10 }],
      scoresByUserId: { 'user-1': null },
      create,
    });

    await expect(backfillEngagementScores(prisma, { apply: true })).resolves.toEqual(
      expect.objectContaining({ corrected: 1 }),
    );
  });

  it('never notifies — the milestone create is called directly, bypassing any notification service', async () => {
    // No notification service is constructed or imported by this module at
    // all: a level crossed months ago pushing "Level up!" today means
    // nothing (#5742). Proven by absence: the module has no dependency on
    // NotificationService, so there is nothing to assert a mock against —
    // this test documents that the milestone write is the ONLY side effect.
    const create = jest.fn().mockResolvedValue({});
    const { prisma, update } = makePrisma({
      counters: [{ userId: 'user-1', axisKey: 'conversation.private', count: 2 }], // -> 10
      scoresByUserId: { 'user-1': undefined },
      create,
    });

    await backfillEngagementScores(prisma, { apply: true });

    expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { engagementScore: 10 } });
    expect(create).toHaveBeenCalledTimes(1); // only level:10 — no notification call exists to make
  });

  it('sums counters across axes of different weights for the same user', async () => {
    const { prisma, update } = makePrisma({
      counters: [
        { userId: 'user-1', axisKey: 'content.post', count: 1 }, // weight 3
        { userId: 'user-1', axisKey: 'comment.text', count: 1 }, // weight 2
        { userId: 'user-1', axisKey: 'conversation.public', count: 1 }, // weight 5
        { userId: 'user-1', axisKey: 'tool.direct_publish', count: 1 }, // weight 1
      ],
      scoresByUserId: { 'user-1': NaN },
    });

    await backfillEngagementScores(prisma, { apply: true });

    expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { engagementScore: 11 } });
  });

  it('keeps each account independent when several are corrected in the same run', async () => {
    const { prisma, update } = makePrisma({
      counters: [
        { userId: 'user-1', axisKey: 'tool.sticker', count: 4 }, // -> 4
        { userId: 'user-2', axisKey: 'content.text_message', count: 2 }, // -> 6
      ],
      scoresByUserId: { 'user-1': null, 'user-2': null },
    });

    const report = await backfillEngagementScores(prisma, { apply: true });

    expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { engagementScore: 4 } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { engagementScore: 6 } });
    expect(report).toEqual({ scanned: 2, corrected: 2, alreadyValid: 0 });
  });
});
