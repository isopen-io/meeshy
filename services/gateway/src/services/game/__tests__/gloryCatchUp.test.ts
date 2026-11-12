/**
 * LE RATTRAPAGE DE GLOIRE (#17779) — les exploits déjà prouvés, payés au barème actuel, en ajout seul.
 *
 * Le calcul se confronte aux barèmes PARTAGÉS (`@meeshy/shared/utils/game/glory`) : aucun montant n'est recopié dans
 * ces témoins sans passer par eux. L'exécution passe par le VRAI `GloryService` sur la base de jeu factice.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { FLAME_RECORD_GLORY, GLORY_POINTS, MISSION_GLORY, gloryForLevel } from '@meeshy/shared/utils/game/glory';
import { GloryService, type LevelReached } from '../GloryService';
import {
  GLORY_CATCH_UP_VERSION,
  gloryCatchUpLines,
  gloryCatchUpRequestId,
  runGloryCatchUp,
  type GloryCatchUpFacts,
  type GloryLedgerFact,
} from '../gloryCatchUp';
import { fakeGameDb, seedUser, OTHER, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const repeat = <T>(count: number, make: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i));

const mintLines = (count: number, delta: number, offset = 0): GloryLedgerFact[] =>
  repeat(count, (i) => ({ reason: 'mint', requestId: `mint:req-${offset + i}`, delta }));

const missions = (difficulty: string, count: number, prefix: string) =>
  repeat(count, (i) => ({ id: `${prefix}-${i}`, difficulty }));

/** Le compte jcnm tel que mesuré en production (lecture seule, #17779). */
const jcnmFacts = (): GloryCatchUpFacts => ({
  mintsProven: 117,
  longestStreakDays: 66,
  ledger: [
    ...mintLines(29, 100),
    ...mintLines(66, 1000, 29),
    ...repeat(99, (i) => ({ reason: 'level', requestId: `level:${i + 2}`, delta: 20 })),
    { reason: 'flame-record', requestId: 'flame-record:7', delta: 150 },
  ],
  completedMissions: [...missions('hard', 6, 'h'), ...missions('easy', 4, 'e'), ...missions('medium', 3, 'm')],
});

const deltaOf = (facts: GloryCatchUpFacts, source: string) =>
  gloryCatchUpLines(facts).lines.find((line) => line.source === source)?.delta ?? 0;

describe('gloryCatchUpLines — le calcul pur, contre les barèmes partagés', () => {
  it('jcnm : +48 100 de frappes, +7 920 de niveaux, +1 850 de records de série, et ses missions jamais payées', () => {
    const facts = jcnmFacts();
    const expectedMint = 117 * GLORY_POINTS.mint - (29 * 100 + 66 * 1000);
    const expectedMissions = 6 * MISSION_GLORY.hard + 4 * MISSION_GLORY.easy + 3 * MISSION_GLORY.medium;

    expect(expectedMint).toBe(48_100);
    expect(deltaOf(facts, 'mint')).toBe(48_100);
    expect(deltaOf(facts, 'level')).toBe(7_920);
    expect(deltaOf(facts, 'flame-record')).toBe(1_850);
    expect(deltaOf(facts, 'mission')).toBe(expectedMissions);
    expect(deltaOf(facts, 'mission')).toBe(1_960);
    expect(deltaOf(facts, 'mission-gold')).toBe(0);
  });

  it('chaque ligne dit la source, la reason, la clé versionnée du rattrapage, le déjà-payé et la cible', () => {
    const mint = gloryCatchUpLines(jcnmFacts()).lines.find((line) => line.source === 'mint');

    expect(mint).toEqual({
      source: 'mint',
      reason: 'mint',
      requestId: `${GLORY_CATCH_UP_VERSION}:mint`,
      delta: 48_100,
      paid: 68_900,
      target: 117_000,
    });
    expect(gloryCatchUpRequestId('flame-record')).toBe(`${GLORY_CATCH_UP_VERSION}:flame-record`);
  });

  it('une mission d\'or accomplie et jamais payée reçoit la Gloire d\'or, sous la reason mission-gold', () => {
    const lines = gloryCatchUpLines({ mintsProven: 0, longestStreakDays: 0, ledger: [], completedMissions: missions('gold', 2, 'g') }).lines;

    expect(lines).toEqual([
      expect.objectContaining({ source: 'mission-gold', reason: 'mission-gold', delta: 2 * MISSION_GLORY.gold, paid: 0 }),
    ]);
  });

  it('une mission déjà payée sous sa clé `mission:<id>` ne reçoit rien, même payée sous l\'ancien barème', () => {
    const facts: GloryCatchUpFacts = {
      mintsProven: 0,
      longestStreakDays: 0,
      ledger: [{ reason: 'mission', requestId: 'mission:h-0', delta: 25 }],
      completedMissions: missions('hard', 1, 'h'),
    };

    const result = gloryCatchUpLines(facts);

    expect(result.lines).toEqual([]);
    expect(result.apparentGaps.missionsBelowScale).toBe(1);
  });

  it('un compte déjà au barème ne reçoit rien', () => {
    const facts: GloryCatchUpFacts = {
      mintsProven: 3,
      longestStreakDays: 40,
      ledger: [
        ...mintLines(3, GLORY_POINTS.mint),
        ...repeat(9, (i) => ({ reason: 'level', requestId: `level:${i + 2}`, delta: gloryForLevel(i + 2) })),
        ...FLAME_RECORD_GLORY.filter((r) => r.days <= 40).map((r) => ({ reason: 'flame-record', requestId: `flame-record:${r.days}`, delta: r.glory })),
        { reason: 'mission', requestId: 'mission:e-0', delta: MISSION_GLORY.easy },
      ],
      completedMissions: missions('easy', 1, 'e'),
    };

    expect(gloryCatchUpLines(facts).lines).toEqual([]);
  });

  it('un compte sans aucune ligne ne reçoit que ce que ses faits prouvent — aucun niveau inventé', () => {
    const facts: GloryCatchUpFacts = { mintsProven: 2, longestStreakDays: 8, ledger: [], completedMissions: missions('medium', 1, 'm') };

    expect(gloryCatchUpLines(facts).lines.map(({ source, delta }) => ({ source, delta }))).toEqual([
      { source: 'mint', delta: 2 * GLORY_POINTS.mint },
      { source: 'flame-record', delta: 500 },
      { source: 'mission', delta: MISSION_GLORY.medium },
    ]);
  });

  it('les niveaux au-delà de 100 suivent gloryForLevel : une dizaine paie, un niveau entre deux ne paie rien', () => {
    const facts: GloryCatchUpFacts = {
      mintsProven: 0,
      longestStreakDays: 0,
      ledger: [
        { reason: 'level', requestId: 'level:110', delta: 20 },
        { reason: 'level', requestId: 'level:111', delta: 20 },
      ],
      completedMissions: [],
    };

    expect(deltaOf(facts, 'level')).toBe(gloryForLevel(110) + gloryForLevel(111) - 40);
  });

  it('la ligne de rattrapage entre dans le déjà-payé : rejouer le calcul sur le registre complété ne rend rien', () => {
    const facts = jcnmFacts();
    const first = gloryCatchUpLines(facts).lines;
    const replayed: GloryCatchUpFacts = {
      ...facts,
      ledger: [...facts.ledger, ...first.map(({ reason, requestId, delta }) => ({ reason, requestId, delta }))],
    };

    expect(gloryCatchUpLines(replayed).lines).toEqual([]);
  });

  it('jamais une ligne négative : un registre qui a payé plus que la cible ne reçoit rien', () => {
    const facts: GloryCatchUpFacts = { mintsProven: 1, longestStreakDays: 0, ledger: mintLines(2, GLORY_POINTS.mint), completedMissions: [] };

    expect(gloryCatchUpLines(facts).lines).toEqual([]);
  });

  it('compte, sans rien payer, les sources hors périmètre sous le barème actuel (succès, ligues, saisons, prestige)', () => {
    const facts: GloryCatchUpFacts = {
      mintsProven: 0,
      longestStreakDays: 0,
      ledger: [
        { reason: 'achievement', requestId: 'achievement:a', delta: 10 },
        { reason: 'achievement', requestId: 'achievement:b', delta: 100 },
        { reason: 'league', requestId: 'league:w1', delta: 30 },
        { reason: 'season', requestId: 'season:s1', delta: 500 },
        { reason: 'prestige', requestId: 'prestige:1', delta: 1000 },
      ],
      completedMissions: [],
    };

    const result = gloryCatchUpLines(facts);

    expect(result.lines).toEqual([]);
    expect(result.apparentGaps).toEqual({ achievement: 1, league: 1, season: 1, prestige: 1, missionsBelowScale: 0 });
  });
});

const seedJcnm = (db: FakeGameDb): void => {
  seedUser(db, { username: 'jcnm', longestStreakDays: 66 });
  repeat(117, (i) => db.meeshLedger.rows.push({ id: `meesh-${i}`, userId: USER, delta: 1, reason: 'mint', requestId: `req-${i}` }));
  jcnmFacts().ledger.forEach((line, i) => db.gloryLedger.rows.push({ id: `gl-${i}`, userId: USER, ...line }));
  jcnmFacts().completedMissions.forEach((mission, i) =>
    db.dailyMission.rows.push({ id: mission.id, userId: USER, dayKey: `2026-10-${String(i + 1).padStart(2, '0')}`, slot: 0, difficulty: mission.difficulty, glory: 0, completedAt: new Date('2026-10-20T00:00:00Z') }),
  );
};

const run = async (db: FakeGameDb, dryRun: boolean) => {
  const out: string[] = [];
  const reached: LevelReached[] = [];
  const glory = new GloryService(db.prisma, { onLevelReached: async (event) => void reached.push(event) });
  const report = await runGloryCatchUp({ prisma: db.prisma, glory, dryRun, batchSize: 1, out: (line) => out.push(line) });
  return { report, out, reached };
};

const ledgerTotal = (db: FakeGameDb, userId = USER) =>
  db.gloryLedger.rows.filter((row) => row.userId === userId).reduce((sum, row) => sum + (row.delta as number), 0);

describe('runGloryCatchUp — l\'exécutable, par le vrai GloryService', () => {
  it('DRY_RUN n\'écrit rien et imprime le compte touché, sa Gloire avant/après et son rang avant/après', async () => {
    const db = fakeGameDb();
    seedJcnm(db);
    const before = db.gloryLedger.snapshot();

    const { report, out } = await run(db, true);

    expect(db.gloryLedger.rows).toEqual(before);
    expect(report.accounts).toBe(1);
    expect(report.gloryAdded).toBe(48_100 + 7_920 + 1_850 + 1_960);
    expect(out.join('\n')).toContain('jcnm');
    expect(out.join('\n')).toContain('polyglotte');
  });

  it('le passage réel grave une ligne par source, sans toucher aux lignes existantes', async () => {
    const db = fakeGameDb();
    seedJcnm(db);
    const before = db.gloryLedger.snapshot();

    await run(db, false);

    const catchUp = db.gloryLedger.rows.filter((row) => String(row.requestId).startsWith(`${GLORY_CATCH_UP_VERSION}:`));
    expect(catchUp.map((row) => [row.reason, row.delta])).toEqual([
      ['mint', 48_100],
      ['level', 7_920],
      ['flame-record', 1_850],
      ['mission', 1_960],
    ]);
    expect(catchUp[0]?.meta).toEqual({ rattrapage: 17779, avant: 68_900, cible: 117_000 });
    before.forEach((row) => expect(db.gloryLedger.rows).toContainEqual(row));
  });

  it('un second passage ne paie rien de plus', async () => {
    const db = fakeGameDb();
    seedJcnm(db);
    await run(db, false);
    const afterFirst = ledgerTotal(db);

    const { report } = await run(db, false);

    expect(report.accounts).toBe(0);
    expect(report.gloryAdded).toBe(0);
    expect(ledgerTotal(db)).toBe(afterFirst);
  });

  it('n\'annonce rien, même quand le rang monté ouvre des niveaux', async () => {
    const db = fakeGameDb();
    seedJcnm(db);

    const { reached } = await run(db, false);

    expect(reached).toEqual([]);
  });

  it('un compte déjà au barème n\'est ni touché ni imprimé', async () => {
    const db = fakeGameDb();
    seedUser(db, { username: 'alaplace', longestStreakDays: 3 }, OTHER);
    db.meeshLedger.rows.push({ id: 'm1', userId: OTHER, delta: 1, reason: 'mint', requestId: 'r1' });
    db.gloryLedger.rows.push({ id: 'g1', userId: OTHER, reason: 'mint', requestId: 'mint:r1', delta: GLORY_POINTS.mint });

    const { report, out } = await run(db, false);

    expect(report.accounts).toBe(0);
    expect(out.join('\n')).not.toContain('alaplace');
    expect(db.gloryLedger.rows).toHaveLength(1);
  });

  it('une ligne de MeeshLedger qui n\'est pas une frappe (don, octroi) ne prouve aucune frappe', async () => {
    const db = fakeGameDb();
    seedUser(db, { username: 'donne', longestStreakDays: 0 }, OTHER);
    db.meeshLedger.rows.push({ id: 'm1', userId: OTHER, delta: 1, reason: 'gift', requestId: 'r1' });

    const { report } = await run(db, false);

    expect(report.accounts).toBe(0);
  });
});
