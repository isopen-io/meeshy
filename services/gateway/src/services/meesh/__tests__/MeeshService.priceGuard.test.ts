/**
 * LA FRAPPE NE DÉBITE JAMAIS UN PRIX QUE L'ÉCRAN N'A PAS MONTRÉ (#10903).
 *
 * `maxPrice` est OPTIONNEL : un client d'avant ne l'envoie pas et frappe comme hier. Quand il est là, le prix rejugé
 * DANS la transaction ne peut pas le dépasser : au-delà, refus typé `price-changed` avec le prix servi courant, et rien
 * n'est débité ni gravé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MeeshService } from '../MeeshService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from '../../game/__tests__/fakeGameDb';
import { effectiveMeeshPrice } from '@meeshy/shared/utils/game/sparks';
import { levelThreshold } from '@meeshy/shared/utils/game/levels';
import { writeEngagementScore } from '../../engagement/EngagementScoreWrite';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const userRow = (db: FakeGameDb) => db.user.rows[0]!;

/** Poche au niveau 7, sous le record 30 : le prix effectif est celui du niveau 7. */
const atLevelSeven = () => {
  const db = fakeGameDb();
  const pocket = levelThreshold(7) + 50;
  seedUser(db, { engagementScore: pocket, sparksSincePrestige: pocket, sparksEarnedLifetime: pocket, levelRecord: 7 });
  return { db, pocket, price: effectiveMeeshPrice(1, 7) };
};

describe('MeeshService.mint — la garde de prix `maxPrice` (#10903)', () => {
  it('sans garde, frappe comme hier (rétrocompatible)', async () => {
    const { db, pocket, price } = atLevelSeven();

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-sans-garde');

    expect(issue).toMatchObject({ status: 'minted', receipt: { price } });
    expect(userRow(db).engagementScore).toBe(pocket - price);
  });

  it('une garde au prix servi (ou au-dessus) laisse frapper', async () => {
    const { db, price } = atLevelSeven();

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-garde-juste', { maxPrice: price });

    expect(issue).toMatchObject({ status: 'minted', receipt: { price } });
  });

  it('une garde SOUS le prix courant refuse, sert le prix courant, et ne débite ni ne grave rien', async () => {
    const { db, pocket, price } = atLevelSeven();

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-garde-basse', { maxPrice: price - 1 });

    expect(issue).toMatchObject({ status: 'price-changed', price, basePrice: 1221, number: 1 });
    expect(userRow(db).engagementScore).toBe(pocket);
    expect(db.meeshLedger.rows).toHaveLength(0);
    expect(db.gloryLedger.rows).toHaveLength(0);
  });

  it('le prix se rejuge DANS la transaction : un crédit tombé entre l\'aperçu et l\'écriture qui fait monter le prix au-delà de la garde refuse', async () => {
    const { db, price } = atLevelSeven();
    // Sans étape des dizaines faite, le niveau attend sous 10 : le crédit le porte au 9.
    const climbed = levelThreshold(9) + 10;
    const original = db.prisma.$transaction.bind(db.prisma);
    // Le crédit concurrent atterrit juste avant que la transaction relise la poche.
    (db.prisma as unknown as { $transaction: typeof original }).$transaction = (async (work: Parameters<typeof original>[0]) => {
      Object.assign(userRow(db), { engagementScore: climbed, sparksSincePrestige: climbed, sparksEarnedLifetime: climbed });
      return original(work);
    }) as typeof original;

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-prix-monte', { maxPrice: price });

    expect(issue).toMatchObject({ status: 'price-changed', price: effectiveMeeshPrice(1, 9) });
    expect(userRow(db).engagementScore).toBe(climbed);
    expect(db.meeshLedger.rows).toHaveLength(0);
  });

  it('course réelle (Promise.all) : frappe gardée et crédit concurrent — jamais un débit au-dessus de la garde', async () => {
    const { db, price } = atLevelSeven();

    const [issue] = await Promise.all([
      new MeeshService(db.prisma).mint(USER, 'frappe-course', { maxPrice: price }),
      writeEngagementScore(db.prisma as never, USER, levelThreshold(20)),
    ]);

    if (issue.status === 'minted') expect(issue.receipt.price).toBeLessThanOrEqual(price);
    else expect(issue.status).toBe('price-changed');
    const debited = db.meeshLedger.rows.map((r) => (r.meta as { price: number }).price);
    expect(debited.every((p) => p <= price)).toBe(true);
  });

  it('un rejeu du même requestId rend la pièce déjà frappée, quelle que soit la garde', async () => {
    const { db, price } = atLevelSeven();
    const service = new MeeshService(db.prisma);
    await service.mint(USER, 'frappe-rejeu', { maxPrice: price });

    const replay = await service.mint(USER, 'frappe-rejeu', { maxPrice: 1 });

    expect(replay).toMatchObject({ status: 'already-minted', receipt: { price } });
  });
});
