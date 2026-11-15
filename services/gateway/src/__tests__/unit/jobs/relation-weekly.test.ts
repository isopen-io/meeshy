/**
 * Le job des cercles (#13932) : il passe le rattrapage sous `startAll`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { RelationWeeklyJob, RELATION_WEEKLY_CHECK_MS } from '../../../jobs/relation-weekly';
import { pairInteractionStore } from '../../helpers/pair-interaction-store';

const A = '5f0000000000000000000001';
const B = '5f0000000000000000000002';
const NOW = new Date('2026-10-31T10:00:00Z');

const store = () =>
  pairInteractionStore({
    days: [{
      id: 'dd0000000000000000000001', userLowId: A, userHighId: B, day: new Date('2026-10-31T00:00:00Z'),
      byLowMessage: 4, byLowReaction: 2, byLowPostView: 2, byLowAudio: 2,
      byHighMessage: 4, byHighReaction: 2, byHighPostView: 2, byHighAudio: 2,
    }],
    users: [A, B].map((id) => ({ id, birthDate: new Date('1990-01-01T00:00:00Z'), blockedUserIds: [] })),
  });

describe('RelationWeeklyJob', () => {
  it('runNow passe le rattrapage et rend son rapport', async () => {
    const s = store();
    const job = new RelationWeeklyJob(s.prisma as never);

    const report = await job.runNow(NOW);

    expect(report).toMatchObject({ pairs: 1, created: 1 });
    expect(s.relations()).toHaveLength(1);
  });

  it('runNow ne rejette jamais : un échec est journalisé, le job survit', async () => {
    const s = store();
    const broken = { ...s.prisma, pairInteractionDay: { ...s.prisma.pairInteractionDay, findMany: () => Promise.reject(new Error('down')) } };
    const job = new RelationWeeklyJob(broken as never);

    await expect(job.runNow(NOW)).resolves.toBeNull();
  });

  it('start arme un minuteur gardé et unref ; stop le désarme ; start deux fois n’en arme qu’un', () => {
    jest.useFakeTimers();
    try {
      const job = new RelationWeeklyJob(store().prisma as never);
      job.start();
      job.start();
      expect(jest.getTimerCount()).toBe(1);
      job.stop();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
    expect(RELATION_WEEKLY_CHECK_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
