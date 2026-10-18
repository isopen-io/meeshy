/**
 * LE RECORD SERVI EST LE RECORD GRAVÉ, ET SA GLOIRE EST PAYÉE (#10905).
 *
 * Le bloc servait `ladder.record = max(niveau lu sur la poche, User.levelRecord)` sans jamais l'écrire : un compte au
 * `levelRecord` en RETARD (champ absent d'avant le jeu, crédit dont l'écriture du record a manqué) voyait un record de
 * 20 que la base ne portait pas — puis, après une frappe, un record PLUS BAS. Le Vent arrière, jugé sur ce record, changeait
 * entre l'aperçu optimiste et la relecture.
 *
 * Le rattrapage passe par `GloryService.creditLevelProgress`, la seule écriture du record : la Gloire du premier passage
 * se calcule depuis le record, donc un record relevé à côté d'elle sauterait À JAMAIS la Gloire des niveaux franchis. Un
 * rattrapage n'ANNONCE rien : « Niveau N atteint » appartient au crédit qui monte le record.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { sparksTailwindFactor } from '@meeshy/shared/utils/game/boosts';
import { GameBlockService } from '../GameBlockService';
import { GloryService, type LevelReached } from '../GloryService';
import { MissionService } from '../MissionService';
import { MeeshService } from '../../meesh/MeeshService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const announcedByDefault: LevelReached[] = [];
jest.mock('../GameLevelUpNotifier', () => ({
  gameLevelUpNotifier: () => async (event: LevelReached) => void announcedByDefault.push(event),
}));

const NOW = new Date('2026-10-05T10:00:00Z');
const LEVEL_20_AND_A_HALF_STEP = 100 * 20 * 20 + 500;

const build = async (db: FakeGameDb, announced: LevelReached[] = []) => {
  const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
  const glory = new GloryService(db.prisma, { onLevelReached: async (event) => void announced.push(event) });
  const block = await new GameBlockService(db.prisma, { missions, levelRecords: glory }).build({ userId: USER, now: NOW });
  if (block === null) throw new Error('le bloc ne tient pas le contrat partagé');
  return block;
};

/** Un compte au niveau 20 sur sa poche, ses étapes faites jusqu'à 39 (une Meesh, une mission, Écho), le record gravé à 11. */
const laggingAccount = (fields: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20_AND_A_HALF_STEP, levelRecord: 11, levelMaxLifetime: 11, meeshMintedLifetime: 1, ...fields });
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
const levelKeys = (db: FakeGameDb) => db.gloryLedger.rows.filter((row) => row.reason === 'level').map((row) => String(row.requestId));
const gloryTotal = (db: FakeGameDb) => db.gloryLedger.rows.reduce((sum, row) => sum + Number(row.delta), 0);
const LEVELS_12_TO_20 = Array.from({ length: 9 }, (_, index) => `level:${12 + index}`);

describe('le record servi est celui que la base porte, Gloire payée (#10905)', () => {
  it('la lecture grave le record qu’elle sert et paie la Gloire des niveaux franchis, sans rien annoncer', async () => {
    const db = laggingAccount();
    const announced: LevelReached[] = [];

    const block = await build(db, announced);

    expect(servedRecord(block)).toBe(20);
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
    expect(levelKeys(db)).toEqual(expect.arrayContaining(LEVELS_12_TO_20));
    expect(announced).toEqual([]);
  });

  it('le bloc servi après un rattrapage dit la Gloire que le registre porte', async () => {
    const db = laggingAccount();

    const block = await build(db);

    expect(block.glory.glory).toBe(gloryTotal(db));
  });

  it('un compte d’avant le jeu (record ABSENT) voit son record gravé et sa Gloire payée à sa première lecture', async () => {
    const db = laggingAccount();
    delete stored(db).levelRecord;
    delete stored(db).levelMaxLifetime;

    const block = await build(db);

    expect(servedRecord(block)).toBe(20);
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
    expect(levelKeys(db)).toEqual(expect.arrayContaining(Array.from({ length: 18 }, (_, index) => `level:${3 + index}`)));
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

  it('une frappe sans lecture préalable grave le niveau d’avant son débit et paie sa Gloire, sans l’annoncer', async () => {
    const db = laggingAccount();
    announcedByDefault.length = 0;

    const minted = await new MeeshService(db.prisma).mint(USER, 'frappe-0002');

    expect(minted.status).toBe('minted');
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
    expect(levelKeys(db)).toEqual(expect.arrayContaining(LEVELS_12_TO_20));
    expect(announcedByDefault).toEqual([]);
    expect(servedRecord(await build(db))).toBe(20);
  });

  it('des lectures et une frappe concurrentes laissent un record unique et ne paient chaque niveau qu’une fois', async () => {
    const db = laggingAccount();

    const [first, second, minted] = await Promise.all([build(db), build(db), new MeeshService(db.prisma).mint(USER, 'frappe-0002')]);
    const after = await build(db);

    expect(minted.status).toBe('minted');
    expect(stored(db)).toMatchObject({ levelRecord: 20, levelMaxLifetime: 20 });
    expect([servedRecord(first), servedRecord(second), servedRecord(after)]).toEqual([20, 20, 20]);
    expect(new Set(levelKeys(db)).size).toBe(levelKeys(db).length);
  });

  it('un record déjà au-dessus du niveau n’est jamais réécrit, et rien ne se paie', async () => {
    const db = laggingAccount({ levelRecord: 25, levelMaxLifetime: 31 });

    const block = await build(db);

    expect(servedRecord(block)).toBe(25);
    expect(stored(db)).toMatchObject({ levelRecord: 25, levelMaxLifetime: 31 });
    expect(levelKeys(db)).toEqual(['level:2']);
  });

  it('une lecture qui ne rattrape rien (`levelRecords: null`) laisse la base intacte', async () => {
    const db = laggingAccount();
    const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });

    const block = await new GameBlockService(db.prisma, { missions, levelRecords: null }).build({ userId: USER, now: NOW });

    expect(block?.level.ladder?.record).toBe(20);
    expect(stored(db)).toMatchObject({ levelRecord: 11, levelMaxLifetime: 11 });
  });
});
