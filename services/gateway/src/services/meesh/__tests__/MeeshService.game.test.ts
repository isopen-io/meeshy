/**
 * LA FRAPPE DU JEU (#9374) — prix de rareté, Gloire dans la MÊME transaction,
 * numéro et édition de la pièce, niveau avant et après.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MeeshService } from '../MeeshService';
import { effectiveMeeshPrice } from '@meeshy/shared/utils/game/sparks';
import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { fakeGameDb, seedUser, USER, writeConflict, type FakeGameDb } from '../../game/__tests__/fakeGameDb';

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

const richAccount = (db: FakeGameDb, params: { score: number; debitable?: number; levelRecord?: number | null }) => {
  seedUser(db, {
    engagementScore: params.score,
    meeshBalance: 0,
    meeshMintedLifetime: 0,
    ...(params.levelRecord !== undefined ? { levelRecord: params.levelRecord } : {}),
  });
  db.engagementCounter.rows.push({
    id: 'c1',
    userId: USER,
    axisKey: 'content.text_message',
    count: 4000,
    points: params.debitable ?? params.score,
  });
};

describe('MeeshService.mint — le prix monte avec les Meeshes déjà frappées', () => {
  it('la 11e Meesh vaut 1 587 de rang (+30 % toutes les dix, #10011) × le facteur du niveau actuel, débités à la seule poche', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 5000 });
    withMints(db, 10);

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-0011');

    // 5 000 étincelles de cycle : niveau 7, facteur 0,535.
    expect(issue.status).toBe('minted');
    expect(db.user.rows[0]?.engagementScore).toBe(5000 - effectiveMeeshPrice(11, 7));
    expect(effectiveMeeshPrice(11, 7)).toBe(849);
    expect(db.engagementCounter.rows[0]?.points).toBe(5000);
  });

  it('refuse SANS débit quand les points débitables ne couvrent pas le prix du jour', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 800 });
    withMints(db, 10);

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-trop-chere');

    expect(issue.status).toBe('insufficient');
    expect(db.user.rows[0]?.engagementScore).toBe(800);
    expect(db.meeshLedger.rows).toHaveLength(10);
    expect(db.gloryLedger.rows).toHaveLength(0);
  });
});

describe('MeeshService.mint — la Gloire part dans la même transaction', () => {
  it('+1 000 de Gloire (#9636), numéro et édition dans la ligne, niveau avant et après dans le reçu', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 100 * 20 * 20, levelRecord: 9 });

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-recu-01');

    // La première Meesh fait l'étape du niveau 10 (#9706) : retenu à 9, le niveau MONTE d'un coup à 19.
    // Le niveau 20 (40 000) est retenu à 9 : le facteur se lit sur le niveau SERVI, 9 → 0,545.
    expect(issue).toMatchObject({
      status: 'minted',
      receipt: { number: 1, edition: 'silver', price: effectiveMeeshPrice(1, 9), gloryGained: 1000, levelBefore: 9, levelAfter: 19 },
    });
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(1);
    expect(db.gloryLedger.rows.find((r) => r.reason === 'mint')).toMatchObject({ delta: 1000 });
    expect(db.gloryLedger.rows.find((r) => r.reason === 'mint')?.meta).toMatchObject({ number: 1, edition: 'silver', price: effectiveMeeshPrice(1, 9), levelBefore: 9, levelAfter: 19 });
    expect(db.user.rows[0]?.levelRecord).toBe(19);
  });

  it('la 100e pièce est une édition or', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 20000, levelRecord: 44 });
    withMints(db, 99);
    // Le Coffre (100 gardées) ne s'ouvre qu'à partir de Voix I (#10848).
    db.gloryLedger.rows.push({ id: 'g0', userId: USER, delta: 14_000, reason: 'correction', requestId: 'seed-glory' });

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-centieme');

    expect(issue).toMatchObject({ status: 'minted', receipt: { number: 100, edition: 'gold' } });
  });

  it('une frappe annulée par un conflit d’écriture ne laisse AUCUNE Gloire : tout est rejoué en bloc', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 5000, levelRecord: 31 });
    const update = db.user.update.bind(db.user);
    let conflicts = 1;
    db.user.update = (async (args: Parameters<typeof update>[0]) => {
      if (conflicts > 0 && 'engagementScore' in args.data) {
        conflicts -= 1;
        throw writeConflict();
      }
      return update(args);
    }) as typeof db.user.update;

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-conflit');

    expect(issue.status).toBe('minted');
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(1);
    expect(db.meeshLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(1);
  });

  it('rejouer la frappe rend le même reçu sans seconde ligne de Gloire', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 5000, levelRecord: 31 });
    const service = new MeeshService(db.prisma);

    const first = await service.mint(USER, 'frappe-rejeu-1');
    const second = await service.mint(USER, 'frappe-rejeu-1');

    expect(second.status).toBe('already-minted');
    expect(second).toMatchObject({ balance: 1, mintedLifetime: 1 });
    expect(second.status === 'already-minted' && second.receipt).toEqual(first.status === 'minted' ? first.receipt : null);
    expect(db.gloryLedger.rows).toHaveLength(1);
  });
});

describe('MeeshService.mint — la frappe fait baisser le niveau, les niveaux gagnés se gravent', () => {
  it('un compte sans record grave le record et la Gloire des niveaux de sa poche APRÈS la frappe, qui ouvre le niveau 10', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 100 * 15 * 15, levelRecord: null });

    await new MeeshService(db.prisma).mint(USER, 'frappe-record-1');

    // La poche (22 500, niveau 15) paie la frappe et retombe au niveau 14 ; l'étape du 10 est faite par la frappe elle-même.
    expect(db.user.rows[0]?.levelRecord).toBe(14);
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'level')).toHaveLength(13);
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(1);
    expect(db.gloryLedger.rows.find((r) => r.reason === 'mint')).toMatchObject({ delta: GLORY_POINTS.mint });
  });
});

describe('MeeshService.mint — le plus haut palier du trésor (D14, #10162)', () => {
  it('une frappe qui fait franchir un palier le grave sur GameProfile, sans rien changer en deçà', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 5000 });
    withMints(db, 9);

    await new MeeshService(db.prisma).mint(USER, 'frappe-0010');

    expect(db.gameProfile.rows.find((row) => row.userId === USER)?.treasuryPeakTier).toBe('escarcelle');
  });
});
