/**
 * LE RATTRAPAGE DU TOTAL À VIE, DU CYCLE ET DU NIVEAU MAX (#10846) — à blanc par défaut, `apply` pour écrire,
 * idempotent, chaque écriture GARDÉE par la valeur lue. BORNE BASSE, jamais une invention :
 *
 *   total à vie ≥ poche + Σ prix des frappes (`MeeshLedger.meta.price`)
 *   cycle       ≥ poche + Σ prix des frappes DEPUIS le dernier prestige
 *   niveau max à vie ≥ record du cycle
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { backfillEngagementSparks, planSparksBackfill } from '../engagementSparksBackfill';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../game/__tests__/fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('planSparksBackfill — la loi pure', () => {
  const base = { pocket: 500, cycle: null, lifetime: null, levelRecord: 12, levelMaxLifetime: null, mintPrices: [617, 623], mintPricesSincePrestige: 1240 } as const;

  it('total à vie = poche + Σ prix des frappes ; cycle = poche + frappes du cycle ; max à vie = record', () => {
    expect(planSparksBackfill(base)).toEqual({
      lifetime: { from: null, to: 500 + 617 + 623 },
      cycle: { from: null, to: 500 + 1240 },
      levelMax: { from: null, to: 12 },
    });
  });

  it('ne BAISSE rien : une valeur déjà plus haute est gardée', () => {
    const plan = planSparksBackfill({ ...base, cycle: 9000, lifetime: 20_000, levelMaxLifetime: 40 });
    expect(plan).toEqual({ lifetime: null, cycle: null, levelMax: null });
  });

  it('le total à vie n\'est jamais sous le cycle', () => {
    const plan = planSparksBackfill({ ...base, cycle: 30_000, lifetime: null });
    expect(plan.lifetime?.to).toBe(30_000);
  });

  it('un compte sans frappe : la poche seule', () => {
    expect(planSparksBackfill({ ...base, mintPrices: [], mintPricesSincePrestige: 0 })).toMatchObject({
      lifetime: { to: 500 },
      cycle: { to: 500 },
    });
  });

  it('est idempotente', () => {
    const first = planSparksBackfill(base);
    const second = planSparksBackfill({
      ...base,
      cycle: first.cycle?.to ?? null,
      lifetime: first.lifetime?.to ?? null,
      levelMaxLifetime: first.levelMax?.to ?? null,
    });
    expect(second).toEqual({ lifetime: null, cycle: null, levelMax: null });
  });
});

const mintRow = (n: number, price: number, createdAt: string, userId = USER) => ({
  id: `mint${n}-${userId}`, userId, delta: 1, reason: 'mint', requestId: `r${n}`, createdAt: new Date(createdAt), meta: { price, cost: price },
});

const world = (): FakeGameDb => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 500, levelRecord: 12 });
  seedUser(db, { engagementScore: 40, prestige: 1, levelRecord: 3 }, OTHER);
  db.meeshLedger.rows.push(mintRow(1, 1221, '2026-09-20'), mintRow(2, 1221, '2026-09-21'));
  // OTHER : une frappe AVANT son prestige, une APRÈS.
  db.meeshLedger.rows.push(mintRow(1, 1221, '2026-09-20', OTHER), mintRow(2, 1587, '2026-10-12', OTHER));
  db.gloryLedger.rows.push({ id: 'pg', userId: OTHER, delta: 10_000, reason: 'prestige', requestId: 'prestige:1', createdAt: new Date('2026-10-01') });
  return db;
};

const user = (db: FakeGameDb, id = USER) => db.user.rows.find((r) => r.id === id)!;

describe('backfillEngagementSparks', () => {
  it('À BLANC par défaut : rien n\'est écrit', async () => {
    const db = world();

    const report = await backfillEngagementSparks(db.prisma, { apply: false });

    expect(user(db).sparksEarnedLifetime).toBeUndefined();
    expect(user(db).sparksSincePrestige).toBeUndefined();
    expect(report.totals).toMatchObject({ accounts: 2, accountsToWrite: 2, applied: 0 });
    expect(report.accounts.every((a) => a.status === 'simulated')).toBe(true);
  });

  it('--apply pose la borne basse : score + Σ prix des frappes', async () => {
    const db = world();

    await backfillEngagementSparks(db.prisma, { apply: true });

    expect(user(db)).toMatchObject({ sparksEarnedLifetime: 500 + 2442, sparksSincePrestige: 500 + 2442, levelMaxLifetime: 12 });
  });

  it('un compte déjà passé en Prestige : le cycle ne compte que les frappes DEPUIS le dernier prestige', async () => {
    const db = world();

    await backfillEngagementSparks(db.prisma, { apply: true });

    expect(user(db, OTHER)).toMatchObject({ sparksEarnedLifetime: 40 + 1221 + 1587, sparksSincePrestige: 40 + 1587, levelMaxLifetime: 3 });
  });

  it('est IDEMPOTENT', async () => {
    const db = world();
    await backfillEngagementSparks(db.prisma, { apply: true });

    const second = await backfillEngagementSparks(db.prisma, { apply: true });

    expect(second.totals).toMatchObject({ accountsToWrite: 0, applied: 0 });
  });

  it('ne baisse JAMAIS un total déjà plus haut que la borne basse', async () => {
    const db = world();
    Object.assign(user(db), { sparksEarnedLifetime: 99_000, sparksSincePrestige: 50_000, levelMaxLifetime: 77 });

    await backfillEngagementSparks(db.prisma, { apply: true });

    expect(user(db)).toMatchObject({ sparksEarnedLifetime: 99_000, sparksSincePrestige: 50_000, levelMaxLifetime: 77 });
  });

  it('écriture GARDÉE : un crédit arrivé entre la lecture et l\'écriture n\'est pas écrasé — le compte est laissé', async () => {
    const db = world();
    const updateMany = db.user.updateMany.bind(db.user);
    let bumped = false;
    db.user.updateMany = (async (args: Parameters<typeof updateMany>[0]) => {
      if (!bumped) {
        bumped = true;
        user(db).engagementScore = 999;
      }
      return updateMany(args);
    }) as typeof db.user.updateMany;

    const report = await backfillEngagementSparks(db.prisma, { apply: true });

    expect(user(db).sparksEarnedLifetime).toBeUndefined();
    expect(report.totals.moved).toBe(1);
  });

  it('le rapport ne porte AUCUN identifiant de compte', async () => {
    const report = await backfillEngagementSparks(world().prisma, { apply: false });
    expect(JSON.stringify(report)).not.toContain(USER);
  });
});
