/**
 * LA FRAPPE DEPUIS LES ÉTINCELLES (#10846, #10847, #10848) — décision du porteur du 2026-10-16.
 *
 *  - la frappe dépense la POCHE (`User.engagementScore`), TOUT est convertible : elle ne lit ni ne débite aucun
 *    compteur d'axe, ne retire aucune action (`count`) et n'éteint aucun badge ni aucun palier de niveau ;
 *  - le niveau se lit sur le CYCLE (`sparksSincePrestige`) que la frappe ne touche pas : il ne baisse plus ;
 *  - le total à vie ne bouge pas ;
 *  - le prix est celui de la pièce × le facteur du niveau ACTUEL ;
 *  - une pièce qui ferait entrer dans une réserve fermée par le rang est refusée, avec le rang requis.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MeeshService } from '../MeeshService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from '../../game/__tests__/fakeGameDb';
import { effectiveMeeshPrice } from '@meeshy/shared/utils/game/sparks';
import { levelFromScore, levelThreshold } from '@meeshy/shared/utils/game/levels';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const withMints = (db: FakeGameDb, count: number) => {
  for (let n = 0; n < count; n += 1) {
    db.meeshLedger.rows.push({ id: `m${n}`, userId: USER, delta: 1, reason: 'mint', requestId: `old-mint-${n}` });
  }
};

const withGlory = (db: FakeGameDb, glory: number) => {
  db.gloryLedger.rows.push({ id: 'g0', userId: USER, delta: glory, reason: 'correction', requestId: 'seed-glory' });
};

const userRow = (db: FakeGameDb) => db.user.rows[0]!;

describe('MeeshService.mint — la frappe dépense la poche, rien d\'autre', () => {
  it('débite UNIQUEMENT le score en poche, au prix effectif du niveau actuel', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000, sparksSincePrestige: 5000, sparksEarnedLifetime: 5000, levelRecord: 1 });

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-0001');

    // 5 000 étincelles de cycle : le niveau 7 (100 × 7² = 4 900), donc le facteur 0,535.
    const price = effectiveMeeshPrice(1, 7);
    expect(price).toBe(653);
    expect(issue).toMatchObject({ status: 'minted', receipt: { number: 1, price, basePrice: 1221, costFactor: 0.535 } });
    expect(userRow(db).engagementScore).toBe(5000 - price);
  });

  it('TOUT est convertible : aucun compteur d\'axe n\'est lu — une poche sans la moindre ligne de compteur paie', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000 });

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-sans-compteur');

    expect(issue.status).toBe('minted');
  });

  it('ne débite NI les points NI les actions des compteurs, et n\'éteint AUCUN palier', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000 });
    db.engagementCounter.rows.push({ id: 'c1', userId: USER, axisKey: 'content.text_message', count: 4000, points: 5000 });
    db.engagementCounter.rows.push({ id: 'c2', userId: USER, axisKey: 'conversation.private', count: 30, points: 150 });
    for (const key of ['content.text_message:1', 'content.text_message:10', 'content.text_message:50', 'content.text_message:100']) {
      db.engagementMilestone.rows.push({ id: key, userId: USER, milestoneType: 'badge', milestoneKey: key, reachedAt: new Date('2026-09-10') });
    }
    for (const key of ['level:10', 'level:50', 'level:150', 'level:400']) {
      db.engagementMilestone.rows.push({ id: key, userId: USER, milestoneType: 'level', milestoneKey: key, reachedAt: new Date('2026-09-10') });
    }

    await new MeeshService(db.prisma).mint(USER, 'frappe-sans-effet-sur-les-badges');

    expect(db.engagementCounter.rows.map((r) => [r.axisKey, r.count, r.points])).toEqual([
      ['content.text_message', 4000, 5000],
      ['conversation.private', 30, 150],
    ]);
    expect(db.engagementMilestone.rows).toHaveLength(8);
    expect(db.engagementMilestone.rows.map((r) => r.reachedAt)).toEqual(Array(8).fill(new Date('2026-09-10')));
  });

  it('fait BAISSER le niveau du prix payé (#10892) : le cycle et le total à vie, indicatifs, ne bougent pas', async () => {
    const db = fakeGameDb();
    // Niveau 9 (8 100 ≤ poche < 10 000) : la frappe retire 665 de la poche, qui retombe au niveau 8.
    const cycle = levelThreshold(9) + 500;
    seedUser(db, { engagementScore: cycle, sparksSincePrestige: cycle, sparksEarnedLifetime: 9_000_000_000, levelRecord: 9, levelMaxLifetime: 52 });

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-niveau');

    expect(issue.status).toBe('minted');
    const row = userRow(db);
    expect(row.sparksSincePrestige).toBe(cycle);
    expect(row.sparksEarnedLifetime).toBe(9_000_000_000);
    expect(row.engagementScore).toBe(cycle - effectiveMeeshPrice(1, 9));
    if (issue.status === 'minted') {
      expect(issue.receipt.levelBefore).toBe(9);
      expect(issue.receipt.levelAfter).toBe(levelFromScore(cycle - effectiveMeeshPrice(1, 9), null));
      expect(issue.receipt.levelAfter).toBe(8);
    }
  });

  it('un compte d\'AVANT le rattrapage (sans cycle) : la frappe pose le cycle sur la poche avant de la débiter — les indicateurs ne tombent pas', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: levelThreshold(8) + 2000, levelRecord: 8 });

    await new MeeshService(db.prisma).mint(USER, 'frappe-avant-rattrapage');

    const row = userRow(db);
    expect(row.sparksSincePrestige).toBe(levelThreshold(8) + 2000);
    expect(row.sparksEarnedLifetime).toBe(levelThreshold(8) + 2000);
  });

  it('refuse SANS débit quand la poche ne couvre pas le prix, et dit ce qui manque', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 600, sparksSincePrestige: 600 });

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-trop-chere');

    expect(issue.status).toBe('insufficient');
    if (issue.status === 'insufficient') expect(issue.plan).toMatchObject({ canMint: false, missingPoints: effectiveMeeshPrice(1, 2) - 600, debitablePoints: 600, floorPoints: 0 });
    expect(userRow(db).engagementScore).toBe(600);
    expect(db.meeshLedger.rows).toHaveLength(0);
  });

  it('le prix monte avec le NIVEAU ACTUEL, pas avec le niveau max historique', async () => {
    const low = fakeGameDb();
    seedUser(low, { engagementScore: 9000, sparksSincePrestige: 9000, levelRecord: 9, levelMaxLifetime: 100 });
    // Un niveau 100 se lit sous ses dix étapes : 5 Meeshes, 10 missions, 30 jours de Flamme, le rang Passeur.
    const high = fakeGameDb();
    seedUser(high, { engagementScore: levelThreshold(100) + 9000, sparksSincePrestige: levelThreshold(100) + 9000, levelRecord: 100, levelMaxLifetime: 100, longestStreakDays: 30 });
    withMints(high, 5);
    withGlory(high, 35_000);
    for (let n = 0; n < 10; n += 1) {
      high.dailyMission.rows.push({ id: `dm${n}`, userId: USER, dayKey: `2026-10-0${n}`, slot: n, completedAt: new Date('2026-10-01') });
    }

    const a = await new MeeshService(low.prisma).mint(USER, 'frappe-niveau-bas');
    const b = await new MeeshService(high.prisma).mint(USER, 'frappe-niveau-haut');

    expect(a).toMatchObject({ status: 'minted', receipt: { price: effectiveMeeshPrice(1, 9) } });
    expect(b).toMatchObject({ status: 'minted', receipt: { number: 6, price: 1221, levelBefore: 100 } });
  });

  it('le numéro de la pièce est mintedLifetime + 1, quelles que soient les Meeshes gardées', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 50_000, sparksSincePrestige: 50_000 });
    withMints(db, 3);
    db.meeshLedger.rows.push({ id: 's1', userId: USER, delta: -1, reason: 'spend', requestId: 'spend-1' });

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-numero');

    expect(issue).toMatchObject({ status: 'minted', balance: 3, mintedLifetime: 4, receipt: { number: 4 } });
  });
});

describe('MeeshService.mint — les réserves du trésor s\'ouvrent par le rang (#10848)', () => {
  it('refuse la 100e Meesh gardée sous Voix I : refus TYPÉ, rien n\'est débité ni gravé', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 90_000, sparksSincePrestige: 90_000 });
    withMints(db, 99);
    withGlory(db, 500);

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-coffre-ferme');

    expect(issue).toMatchObject({
      status: 'treasury-locked',
      lock: { tier: 'coffre', minHeld: 100, requires: { rank: 'voix', division: 1, division5: 1 } },
    });
    expect(userRow(db).engagementScore).toBe(90_000);
    expect(db.meeshLedger.rows).toHaveLength(99);
    expect(db.gloryLedger.rows).toHaveLength(1);
  });

  it('laisse frapper la 100e quand le rang ouvre le Coffre', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 90_000, sparksSincePrestige: 90_000 });
    withMints(db, 99);
    withGlory(db, 14_000); // Voix I (13 200) et au-delà

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-coffre-ouvert');

    expect(issue.status).toBe('minted');
  });

  it('le Mythe ouvre toutes les réserves : la frappe d\'un siège du Mythe n\'est jamais barrée, comme le bloc l\'annonce (#10894)', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 90_000, sparksSincePrestige: 90_000 });
    withMints(db, 99);
    withGlory(db, 500);
    db.mythicSeat.rows.push({ id: '6d7974686500000000000007', number: 7, edition: 7, userId: USER, glory: 1_000_000, grantedAt: new Date() });

    const service = new MeeshService(db.prisma);
    const plan = await service.preview(USER);
    const issue = await service.mint(USER, 'frappe-mythe-coffre');

    expect(plan.canMint).toBe(true);
    expect(issue.status).toBe('minted');
  });

  it('le refus de rang passe avant le refus de poche : un compte pauvre ET sans rang apprend le rang', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10, sparksSincePrestige: 10 });
    withMints(db, 99);

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-deux-refus');

    expect(issue.status).toBe('treasury-locked');
  });

  it('la Bourse, l\'Escarcelle et le Coffret sont ouverts à tous', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 90_000, sparksSincePrestige: 90_000 });
    withMints(db, 49);

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-coffret');

    expect(issue.status).toBe('minted');
  });
});

describe('MeeshService.mint — la dette d\'étincelles bloque la frappe', () => {
  it('refuse SANS débit ni écriture tant qu\'une dette existe, même avec une poche pleine, et dit combien', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 90_000, sparksSincePrestige: 90_000, sparksDebt: 120 });

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-dette');

    expect(issue).toEqual({ status: 'blocked-by-debt', sparksDebt: 120 });
    expect(userRow(db).engagementScore).toBe(90_000);
    expect(db.meeshLedger.rows).toHaveLength(0);
  });

  it('la dette passe avant le refus de rang', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 90_000, sparksSincePrestige: 90_000, sparksDebt: 5 });
    withMints(db, 99);

    expect((await new MeeshService(db.prisma).mint(USER, 'frappe-dette-rang')).status).toBe('blocked-by-debt');
  });

  it('une dette remboursée (0) ne bloque plus', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 90_000, sparksSincePrestige: 90_000, sparksDebt: 0 });

    expect((await new MeeshService(db.prisma).mint(USER, 'frappe-sans-dette')).status).toBe('minted');
  });
});

describe('MeeshService.preview — le plan montré avant de confirmer', () => {
  it('lit la poche : tout est débitable, aucun plancher', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 800, sparksSincePrestige: 800 });
    db.engagementCounter.rows.push({ id: 'c1', userId: USER, axisKey: 'conversation.private', count: 5, points: 800 });

    const plan = await new MeeshService(db.prisma).preview(USER);

    expect(plan).toMatchObject({ debitablePoints: 800, floorPoints: 0, canMint: true, missingPoints: 0, debits: [] });
  });
});
