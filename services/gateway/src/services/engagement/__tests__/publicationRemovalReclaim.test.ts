/**
 * #11467 — retirer un contenu reprend CE QU'IL a rapporté, et rien d'autre ;
 * une publication supprimée rend ses points si elle a moins de trente jours,
 * les garde au-delà (décision porteur 2026-10-21).
 *
 * Le faux client reproduit la sémantique de Prisma sur MongoDB : `startsWith`
 * y est une regex NON échappée (mesuré), d'où le seau `content:<id>` qui
 * remontait comme identifiant de post.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { EngagementService } from '../EngagementService';
import { reclaimRemovedContent, PUBLICATION_RECLAIM_WINDOW_DAYS } from '../../posts/postEngagementCredits';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../game/__tests__/fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const FROZEN_NOW = new Date('2026-10-10T12:00:00.000Z');
const DAY_MS = 86_400_000;
beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN_NOW,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => {
  jest.useRealTimers();
});

const POST_A = '68b0000000000000000000a1';
const POST_B = '68b0000000000000000000b2';
const PUBLISHED = '68b0000000000000000000c3';

const service = (db: FakeGameDb) =>
  new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

const quota = (db: FakeGameDb, bucket: string) => db.engagementQuota.rows.find((row) => row.bucket === bucket);
const postPoints = (db: FakeGameDb, postId: string) =>
  db.engagementPostPoints.rows.find((row) => row.userId === USER && row.postId === postId)?.totalPoints;

async function creditedAccount() {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 0 });
  const engagement = service(db);
  await engagement.recordActivity(USER, 'tool.post_reaction', { postId: POST_A, targetId: POST_A, targetOwnerId: OTHER, receipt: 'post-reaction:r-a' });
  await engagement.recordActivity(USER, 'tool.post_reaction', { postId: POST_B, targetId: POST_B, targetOwnerId: OTHER, receipt: 'post-reaction:r-b' });
  await engagement.recordActivity(USER, 'content.post', { postId: PUBLISHED, targetId: PUBLISHED, receipt: `post:${PUBLISHED}` });
  return { db, engagement };
}

describe('reprendre un contenu ne touche que ses propres reçus (#11467)', () => {
  it('retirer une réaction reprend SON reçu — ni celui d’une autre réaction, ni la mémoire d’une publication', async () => {
    const { db, engagement } = await creditedAccount();
    const ownReceipt = quota(db, `receipt:post-reaction:r-a|${POST_A}`)!.points as number;
    const otherReceipt = quota(db, `receipt:post-reaction:r-b|${POST_B}`)!.points as number;
    const publicationMemory = quota(db, `content:${PUBLISHED}`)!.points as number;
    expect(otherReceipt).toBeGreaterThan(0);
    expect(publicationMemory).toBeGreaterThan(0);
    const pointsOnB = postPoints(db, POST_B);

    const taken = await engagement.reclaimSource(USER, 'post-reaction:r-a');

    expect(taken).toBe(ownReceipt);
    expect(quota(db, `receipt:post-reaction:r-a|${POST_A}`)!.points).toBe(0);
    expect(quota(db, `receipt:post-reaction:r-b|${POST_B}`)!.points).toBe(otherReceipt);
    expect(quota(db, `content:${PUBLISHED}`)!.points).toBe(publicationMemory);
    expect(postPoints(db, POST_A)).toBe(0);
    expect(postPoints(db, POST_B)).toBe(pointsOnB);
  });

  it('la reprise du cumul d’un post ne vise jamais un identifiant qui n’est pas un post', async () => {
    const { db, engagement } = await creditedAccount();
    const updateMany = db.prisma.engagementPostPoints.updateMany as unknown as (...args: unknown[]) => unknown;
    const targeted: string[] = [];
    (db.prisma.engagementPostPoints as unknown as { updateMany: unknown }).updateMany = (args: { where: { postId: string } }) => {
      targeted.push(args.where.postId);
      return updateMany(args);
    };

    await engagement.reclaimSource(USER, `post:${PUBLISHED}`);

    expect(targeted.every((postId) => /^[0-9a-f]{24}$/.test(postId))).toBe(true);
  });
});

describe('une publication supprimée rend ses points sous trente jours, les garde au-delà (porteur 2026-10-21)', () => {
  const recorder = () => ({
    recordActivity: jest.fn<any>().mockResolvedValue(undefined),
    reclaimContent: jest.fn<any>().mockResolvedValue(0),
    reclaimSource: jest.fn<any>().mockResolvedValue(0),
  });
  const postPublished = (daysAgo: number) => ({
    id: PUBLISHED,
    authorId: USER,
    type: 'POST',
    createdAt: new Date(Date.now() - daysAgo * DAY_MS),
  });

  it('la fenêtre est d’un mois', () => {
    expect(PUBLICATION_RECLAIM_WINDOW_DAYS).toBe(30);
  });

  it('publiée il y a 29 jours : le crédit de publication ET les points du post sont repris', () => {
    const engagement = recorder();

    reclaimRemovedContent({} as never, postPublished(29), engagement);

    expect(engagement.reclaimSource).toHaveBeenCalledWith(USER, `post:${PUBLISHED}`);
    expect(engagement.reclaimContent).toHaveBeenCalledWith(USER, 'content.post', PUBLISHED);
  });

  it('publiée il y a 31 jours : les étincelles restent acquises, rien n’est repris', () => {
    const engagement = recorder();

    reclaimRemovedContent({} as never, postPublished(31), engagement);

    expect(engagement.reclaimSource).not.toHaveBeenCalled();
    expect(engagement.reclaimContent).not.toHaveBeenCalled();
  });

  it('la mémoire de publication se reprend encore trois jours après — la fenêtre n’est plus les 24 h du barème', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    const engagement = service(db);
    await engagement.recordActivity(USER, 'content.post', { postId: PUBLISHED, targetId: PUBLISHED, receipt: `post:${PUBLISHED}` });
    const remembered = quota(db, `content:${PUBLISHED}`)!.points as number;
    jest.setSystemTime(new Date(FROZEN_NOW.getTime() + 3 * DAY_MS));
    try {
      const taken = await engagement.reclaimContent(USER, 'content.post', PUBLISHED);

      expect(taken).toBe(remembered);
      expect(quota(db, `content:${PUBLISHED}`)!.points).toBe(0);
    } finally {
      jest.setSystemTime(FROZEN_NOW);
    }
  });
});
