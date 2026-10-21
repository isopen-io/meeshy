/**
 * LE NIVEAU DU JEU QUI SE RECORD — Mythe compris (#10903) et annoncé comme le bloc le sert (#10901).
 *
 *  - le plafond du niveau servi par `creditLevelProgress` lit le Mythe, comme le bloc `game` et la frappe ;
 *  - « Niveau N atteint » ne part que quand N DÉPASSE le record du cycle : le niveau baisse à la frappe puis remonte,
 *    et cette remontée n'est pas une montée ; une montée concurrente n'annonce qu'une fois.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { GloryService, type LevelReached } from '../GloryService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const thresholdOf = (level: number) => 100 * level * level;

const seedMissionsDone = (db: FakeGameDb, count: number) =>
  Array.from({ length: count }, (_, i) =>
    db.dailyMission.rows.push({ id: `m-${i}`, userId: USER, dayKey: `2026-09-${String(i + 1).padStart(2, '0')}`, slot: 0, completedAt: new Date('2026-09-30T00:00:00Z') }),
  );

const service = (db: FakeGameDb) => {
  const reached: LevelReached[] = [];
  const glory = new GloryService(db.prisma, { onLevelReached: async (event) => void reached.push(event) });
  return { glory, reached };
};

describe('GloryService.creditLevelProgress — le Mythe ouvre les niveaux comme dans le bloc (#10903)', () => {
  it('une place du Mythe passe l\'étape de RANG du niveau 30 même sous la Gloire d\'Écho', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 1, engagementScore: thresholdOf(35), meeshMintedLifetime: 1 });
    seedMissionsDone(db, 1);
    db.mythicSeat.rows.push({ id: '6d7974686500000000000007', number: 7, edition: 7, userId: USER, glory: 1_000_000, grantedAt: new Date() });

    // Le max à vie (100) déjà payé : aucune Gloire de niveau ne se grave, le rang ne bouge pas pendant le témoin.
    await service(db).glory.creditLevelProgress({ userId: USER, score: thresholdOf(35), previousRecord: 1, previousMax: 100 });

    expect(db.user.rows[0]?.levelRecord).toBe(35);
  });

  it('sans le Mythe, la même Gloire attend sous l\'étape du rang (29)', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 1, engagementScore: thresholdOf(35), meeshMintedLifetime: 1 });
    seedMissionsDone(db, 1);

    // Le max à vie (100) déjà payé : aucune Gloire de niveau ne se grave, le rang ne bouge pas pendant le témoin.
    await service(db).glory.creditLevelProgress({ userId: USER, score: thresholdOf(35), previousRecord: 1, previousMax: 100 });

    expect(db.user.rows[0]?.levelRecord).toBe(29);
  });
});

describe('GloryService.creditLevelProgress — « Niveau N atteint » suit le record du cycle (#10901)', () => {
  it('annonce le niveau du JEU atteint et la poche qui l\'a porté, une fois, au plus haut niveau atteint', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 3, engagementScore: thresholdOf(6) });
    const { glory, reached } = service(db);

    await glory.creditLevelProgress({ userId: USER, score: thresholdOf(6), previousRecord: 3 });

    expect(reached).toEqual([{ userId: USER, level: 6, sparks: thresholdOf(6) }]);
  });

  it('une REMONTÉE après une frappe (sous le record du cycle) n\'annonce rien', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 8, engagementScore: thresholdOf(7) });
    const { glory, reached } = service(db);

    await glory.creditLevelProgress({ userId: USER, score: thresholdOf(7), previousRecord: 8 });

    expect(reached).toEqual([]);
  });

  it('une montée bloquée par une étape (le niveau attend à 9) annonce 9, jamais le niveau que le score porterait', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 4, engagementScore: thresholdOf(15) });
    const { glory, reached } = service(db);

    await glory.creditLevelProgress({ userId: USER, score: thresholdOf(15), previousRecord: 4 });

    expect(reached).toEqual([{ userId: USER, level: 9, sparks: thresholdOf(15) }]);
  });

  it('course (Promise.all) : deux crédits qui lisent le même record n\'annoncent la montée qu\'UNE fois', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 3, engagementScore: thresholdOf(6) });
    const { glory, reached } = service(db);

    await Promise.all([
      glory.creditLevelProgress({ userId: USER, score: thresholdOf(6), previousRecord: 3 }),
      glory.creditLevelProgress({ userId: USER, score: thresholdOf(6), previousRecord: 3 }),
    ]);

    expect(reached).toEqual([{ userId: USER, level: 6, sparks: thresholdOf(6) }]);
  });

  it('un score lu sous une autre étoile (le record du cycle n\'est pas écrit) n\'annonce rien', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 1, prestige: 1, engagementScore: 0 });
    const { glory, reached } = service(db);

    await glory.creditLevelProgress({ userId: USER, score: thresholdOf(6), previousRecord: 3, previousMax: 100, prestige: 0 });

    expect(reached).toEqual([]);
  });

  it('après un Prestige, la remontée du cycle neuf se RÉANNONCE à chaque record du cycle, sans repayer la Gloire (#10911)', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 1, levelMaxLifetime: 100, prestige: 1, engagementScore: thresholdOf(6) });
    const { glory, reached } = service(db);

    const first = await glory.creditLevelProgress({ userId: USER, score: thresholdOf(6), previousRecord: 1, previousMax: 100, prestige: 1 });
    const second = await glory.creditLevelProgress({ userId: USER, score: thresholdOf(8), previousRecord: 6, previousMax: 100, prestige: 1 });

    expect(reached).toEqual([
      { userId: USER, level: 6, sparks: thresholdOf(6) },
      { userId: USER, level: 8, sparks: thresholdOf(8) },
    ]);
    expect([first, second]).toEqual([0, 0]);
  });

  it('un RATTRAPAGE (`announce: false`) grave le record et paie la Gloire sans rien annoncer (#10905)', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 3, engagementScore: thresholdOf(6) });
    const { glory, reached } = service(db);

    const gained = await glory.creditLevelProgress({ userId: USER, score: thresholdOf(6), previousRecord: 3, announce: false });

    expect(reached).toEqual([]);
    expect(gained).toBe(3 * 100);
    expect(db.user.rows[0]?.levelRecord).toBe(6);
  });

  it('une annonce qui TOMBE ne retient ni le record ni la Gloire', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 3, engagementScore: thresholdOf(6) });
    const glory = new GloryService(db.prisma, { onLevelReached: async () => Promise.reject(new Error('push down')) });

    const gained = await glory.creditLevelProgress({ userId: USER, score: thresholdOf(6), previousRecord: 3 });

    expect(gained).toBe(3 * 100);
    expect(db.user.rows[0]?.levelRecord).toBe(6);
  });
});
