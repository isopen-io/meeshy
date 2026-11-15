/**
 * TÉMOINS ROUGES de l'audit adversarial « frappe, étincelles, cohérence totale » (porteur 2026-10-17).
 *
 * Chaque cas énonce une loi déjà écrite dans le dépôt et montre un chemin qui la viole. Aucun correctif ici :
 * ces témoins doivent ROUGIR sur le code actuel et verdir avec le correctif proposé dans le rapport d'audit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { effectiveMeeshPrice } from '@meeshy/shared/utils/game/sparks';
import { EngagementService } from '../../engagement/EngagementService';
import { MeeshService } from '../../meesh/MeeshService';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const service = (db: FakeGameDb) =>
  new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

const user = (db: FakeGameDb) => db.user.rows.find((r) => r.id === USER)!;
const counterPoints = (db: FakeGameDb) => db.engagementCounter.rows.filter((r) => r.userId === USER).reduce((s, r) => s + Number(r.points ?? 0), 0);
const weekPoints = (db: FakeGameDb) => db.gameWeekPoints.rows.filter((r) => r.userId === USER).reduce((s, r) => s + Number(r.points ?? 0), 0);

describe('AUDIT — un crédit à moitié écrit', () => {
  it('une panne transitoire à la gravure du badge ne retient pas les étincelles d\'un compteur déjà crédité', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, sparksSincePrestige: 0, sparksEarnedLifetime: 0 });
    seedUser(db, {}, OTHER);
    const create = db.engagementMilestone.create.bind(db.engagementMilestone);
    let failed = false;
    (db.engagementMilestone as unknown as { create: typeof create }).create = (async (args: Parameters<typeof create>[0]) => {
      if (!failed) {
        failed = true;
        throw new Error('connection reset');
      }
      return create(args);
    }) as typeof create;

    await service(db)
      .recordActivity(USER, 'tool.reaction', { receipt: 'reaction-row-1', postId: 'post-1', targetOwnerId: OTHER })
      .catch(() => undefined);

    const credited = counterPoints(db);
    expect(credited).toBeGreaterThan(0);
    expect(Number(user(db).engagementScore ?? 0)).toBe(credited);
    expect(Number(user(db).sparksEarnedLifetime ?? 0)).toBe(credited);
  });
});

describe('AUDIT — la reprise d\'un contenu retiré laisse ses points dans la ligue', () => {
  it('réagir puis retirer la réaction : la poche revient à zéro, la semaine classée aussi', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, sparksSincePrestige: 0, sparksEarnedLifetime: 0 });
    seedUser(db, {}, OTHER);
    const engagement = service(db);

    const credited = await engagement.recordActivity(USER, 'tool.reaction', { receipt: 'reaction-row-1', postId: 'post-1', targetOwnerId: OTHER });
    expect(credited).toBe(true);
    expect(weekPoints(db)).toBeGreaterThan(0);

    const taken = await engagement.reclaimSource(USER, 'reaction-row-1');
    expect(taken).toBeGreaterThan(0);
    expect(Number(user(db).engagementScore)).toBe(0);

    expect(weekPoints(db)).toBe(0);
  });
});

describe('AUDIT — le prix de la frappe est jugé sur une lecture d\'avant la transaction', () => {
  it('une poche qui monte de niveau entre l\'aperçu et la transaction paie le facteur du niveau AU DÉBIT', async () => {
    const db = fakeGameDb();
    seedUser(db, {
      engagementScore: 2500,
      sparksSincePrestige: 2500,
      sparksEarnedLifetime: 2500,
      levelRecord: 5,
      levelMaxLifetime: 5,
      meeshBalance: 0,
      meeshMintedLifetime: 0,
    });
    const open = db.prisma.$transaction.bind(db.prisma) as unknown as (work: unknown) => Promise<unknown>;
    (db.prisma as unknown as { $transaction: unknown }).$transaction = async (work: unknown) => {
      Object.assign(user(db), { engagementScore: 8100, sparksSincePrestige: 8100, sparksEarnedLifetime: 8100 });
      return open(work);
    };

    const outcome = await new MeeshService(db.prisma).mint(USER, 'mint-stale-price');

    expect(outcome.status).toBe('minted');
    const receipt = outcome.status === 'minted' ? outcome.receipt : null;
    expect(receipt?.levelBefore).toBe(9);
    expect(receipt?.price).toBe(effectiveMeeshPrice(1, 9));
    expect(Number(user(db).engagementScore)).toBe(8100 - effectiveMeeshPrice(1, 9));
  });
});
