/**
 * LE RECORD SERVI EST LE RECORD GRAVÉ (#10905).
 *
 * Le bloc servait `ladder.record = max(niveau lu sur la poche, User.levelRecord)` sans jamais l'écrire : un compte au
 * `levelRecord` en RETARD (champ absent d'avant le jeu, crédit dont l'écriture du record a manqué) voyait un record de
 * 20 que la base ne portait pas — puis, après une frappe, un record PLUS BAS. Le Vent arrière, jugé sur ce record, changeait
 * entre l'aperçu optimiste et la relecture. Le record servi ne baisse plus jamais d'une lecture à la suivante : la lecture
 * grave ce qu'elle sert, la frappe grave le niveau d'avant son débit — par une écriture CONDITIONNELLE, sans annonce.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { sparksTailwindFactor } from '@meeshy/shared/utils/game/boosts';
import { GameBlockService } from '../GameBlockService';
import { MissionService } from '../MissionService';
import { MeeshService } from '../../meesh/MeeshService';
import { raiseLevelRecords } from '../LevelRecordWrite';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-05T10:00:00Z');
const LEVEL_20_AND_A_HALF_STEP = 100 * 20 * 20 + 500;

const build = async (db: FakeGameDb) => {
  const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
  const block = await new GameBlockService(db.prisma, { missions }).build({ userId: USER, now: NOW });
  if (block === null) throw new Error('le bloc ne tient pas le contrat partagé');
  return block;
};

/** Un compte au niveau 20 sur sa poche, ses étapes faites jusqu'à 39 (une Meesh, une mission, Écho), le record gravé à 11. */
const laggingAccount = (fields: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20_AND_A_HALF_STEP, levelRecord: 11, levelMaxLifetime: 11, ...fields });
  db.meeshLedger.rows.push(
    { id: 'g1', userId: USER, delta: 6, reason: 'grant', requestId: 'octroi-0001' },
    { id: 'm1', userId: USER, delta: 1, reason: 'mint', requestId: 'frappe-0001' },
  );
  db.dailyMission.rows.push({ id: 'old', userId: USER, dayKey: '2026-09-30', slot: 0, completedAt: new Date('2026-09-30T12:00:00Z') });
  db.gloryLedger.rows.push({ id: 'l1', userId: USER, delta: 2800, reason: 'level', requestId: 'level:2' });
  return db;
};

const stored = (db: FakeGameDb) => db.user.rows[0]!;
const servedRecord = (block: Awaited<ReturnType<typeof build>>) => block.level.ladder?.record;

describe('le record servi est celui que la base porte (#10905)', () => {
  it('la lecture grave le record qu’elle sert quand le record gravé est en retard', async () => {
    const db = laggingAccount();

    const block = await build(db);

    expect(servedRecord(block)).toBe(20);
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
  });

  it('un compte d’avant le jeu (record ABSENT) voit son record gravé à sa première lecture', async () => {
    const db = laggingAccount();
    delete stored(db).levelRecord;
    delete stored(db).levelMaxLifetime;

    const block = await build(db);

    expect(servedRecord(block)).toBe(20);
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
  });

  it('le record servi ne redescend pas après une frappe : la relecture sert le record d’avant le geste', async () => {
    const db = laggingAccount();
    const before = await build(db);

    const minted = await new MeeshService(db.prisma).mint(USER, 'frappe-0002');
    const after = await build(db);

    expect(minted.status).toBe('minted');
    expect(after.level.ladder?.level).toBe(19);
    expect(servedRecord(before)).toBe(20);
    expect(servedRecord(after)).toBe(20);
    expect(after.boosts.tailwind).toBe(sparksTailwindFactor({ level: 19, levelRecord: 20 }));
  });

  it('une frappe sans lecture préalable grave le niveau d’avant son débit', async () => {
    const db = laggingAccount();

    const minted = await new MeeshService(db.prisma).mint(USER, 'frappe-0002');

    expect(minted.status).toBe('minted');
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
    expect(servedRecord(await build(db))).toBe(20);
  });

  it('des lectures et une frappe concurrentes laissent un record gravé unique, jamais servi plus bas', async () => {
    const db = laggingAccount();

    const [first, second, minted] = await Promise.all([build(db), build(db), new MeeshService(db.prisma).mint(USER, 'frappe-0002')]);
    const after = await build(db);

    expect(minted.status).toBe('minted');
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
    expect([servedRecord(first), servedRecord(second), servedRecord(after)]).toEqual([20, 20, 20]);
  });

  it('un record déjà au-dessus du niveau n’est jamais réécrit', async () => {
    const db = laggingAccount({ levelRecord: 25, levelMaxLifetime: 31 });

    const block = await build(db);

    expect(servedRecord(block)).toBe(25);
    expect(stored(db)).toMatchObject({ levelRecord: 25, levelMaxLifetime: 31 });
  });
});

describe('raiseLevelRecords — une montée conditionnelle, jamais une baisse', () => {
  it('ne monte que vers le haut, et rejouer ne change rien', async () => {
    const db = laggingAccount();

    const first = await raiseLevelRecords(db.prisma, { userId: USER, record: 20, maxLifetime: 20, prestige: 0 });
    const replay = await raiseLevelRecords(db.prisma, { userId: USER, record: 20, maxLifetime: 20, prestige: 0 });
    const lower = await raiseLevelRecords(db.prisma, { userId: USER, record: 14, maxLifetime: 14, prestige: 0 });

    expect([first.recordRaised, replay.recordRaised, lower.recordRaised]).toEqual([true, false, false]);
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
  });

  it('un niveau lu avant un Prestige ne relève pas le record du cycle neuf, mais le max à vie reste le plus haut', async () => {
    const db = laggingAccount({ prestige: 1, levelRecord: 1, levelMaxLifetime: 100 });

    const stale = await raiseLevelRecords(db.prisma, { userId: USER, record: 20, maxLifetime: 20, prestige: 0 });

    expect(stale.recordRaised).toBe(false);
    expect(stored(db)).toMatchObject({ levelRecord: 1, levelMaxLifetime: 100 });
  });

  it('des montées concurrentes n’en gagnent qu’une', async () => {
    const db = laggingAccount();

    const results = await Promise.all([18, 20, 19, 20].map((record) => raiseLevelRecords(db.prisma, { userId: USER, record, maxLifetime: record, prestige: 0 })));

    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
    expect([results[1]!, results[3]!].filter((result) => result.recordRaised)).toHaveLength(1);
  });
});
