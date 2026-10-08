/**
 * LA FRAPPE DU JEU (#9374) — prix de rareté, Gloire dans la MÊME transaction,
 * numéro et édition de la pièce, niveau avant et après.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MeeshService } from '../MeeshService';
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
  it('la 11e Meesh coûte 1 294 points, débités au score et au compteur', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 5000 });
    withMints(db, 10);

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-0011');

    expect(issue.status).toBe('minted');
    expect(db.user.rows[0]?.engagementScore).toBe(5000 - 1294);
    expect(db.engagementCounter.rows[0]?.points).toBe(5000 - 1294);
  });

  it('refuse SANS débit quand les points débitables ne couvrent pas le prix du jour', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 1250 });
    withMints(db, 10);

    const issue = await new MeeshService(db.prisma).mint(USER, 'frappe-trop-chere');

    expect(issue.status).toBe('insufficient');
    expect(db.user.rows[0]?.engagementScore).toBe(1250);
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
    expect(issue).toMatchObject({
      status: 'minted',
      receipt: { number: 1, edition: 'silver', price: 1221, gloryGained: 1000, levelBefore: 9, levelAfter: 19 },
    });
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(1);
    expect(db.gloryLedger.rows.find((r) => r.reason === 'mint')).toMatchObject({ delta: 1000 });
    expect(db.gloryLedger.rows.find((r) => r.reason === 'mint')?.meta).toMatchObject({ number: 1, edition: 'silver', price: 1221, levelBefore: 9, levelAfter: 19 });
    expect(db.user.rows[0]?.levelRecord).toBe(19);
  });

  it('la 100e pièce est une édition or', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 20000, levelRecord: 44 });
    withMints(db, 99);

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

describe('MeeshService.mint — le record de niveau est posé AVANT le débit', () => {
  it('un compte sans record grave le record et la Gloire des niveaux franchis, puis frappe — et la frappe ouvre le niveau 10', async () => {
    const db = fakeGameDb();
    richAccount(db, { score: 100 * 15 * 15, levelRecord: null });

    await new MeeshService(db.prisma).mint(USER, 'frappe-record-1');

    // Avant la frappe, l'étape du 10 manque : le record s'arrête à 9. La frappe la fait, le reste (21 279) lit 14.
    expect(db.user.rows[0]?.levelRecord).toBe(14);
    const levels = db.gloryLedger.rows.filter((r) => r.reason === 'level');
    expect(levels).toHaveLength(13);
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(1);
  });
});
