/**
 * LA FRAPPE GRATUITE PAR FRAGMENTS (#10011, porteur 2026-10-10) — cinq fragments de Meesh au lieu des points,
 * au prix courant ignoré : aucun point, aucun axe, aucun niveau ; numéro, édition et Gloire d'une frappe ;
 * idempotente, et la consommation gravée sur la ligne de la frappe, dans la même transaction.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { meeshPrice } from '@meeshy/shared/utils/game/mint';
import { MeeshService } from '../MeeshService';
import { fakeGameDb, seedUser, USER, writeConflict, type FakeGameDb } from '../../game/__tests__/fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const account = (db: FakeGameDb, params: { readonly earned: number; readonly score?: number; readonly mints?: number }) => {
  seedUser(db, { engagementScore: params.score ?? 5000, levelRecord: 31, meeshBalance: 0, meeshMintedLifetime: 0 });
  db.engagementCounter.rows.push({ id: 'c1', userId: USER, axisKey: 'content.text_message', count: 4000, points: params.score ?? 5000 });
  db.gameDay.rows.push({ id: 'jour-1', userId: USER, dayKey: '2026-10-01', rerollCount: 0, chestClaimedAt: new Date(), chestMeeshFragments: params.earned });
  for (let n = 0; n < (params.mints ?? 0); n += 1) {
    db.meeshLedger.rows.push({ id: `m${n}`, userId: USER, delta: 1, reason: 'mint', requestId: `old-mint-${n}` });
  }
};

describe('MeeshService.mintWithFragments', () => {
  it('frappe contre cinq fragments : aucun point ni axe débité, la consommation gravée sur la ligne de la frappe', async () => {
    const db = fakeGameDb();
    account(db, { earned: 7, score: 5000 });

    const issue = await new MeeshService(db.prisma).mintWithFragments(USER, 'gratuite-0001');

    expect(issue).toMatchObject({
      status: 'minted',
      balance: 1,
      mintedLifetime: 1,
      receipt: { number: 1, edition: 'silver', price: 0, gloryGained: 1000, paidWith: 'fragments', fragmentsSpent: 5 },
      fragments: { held: 2, perMeesh: 5 },
    });
    expect(db.user.rows[0]?.engagementScore).toBe(5000);
    expect(db.engagementCounter.rows[0]?.points).toBe(5000);
    expect(db.meeshLedger.rows.find((r) => r.requestId === 'gratuite-0001')).toMatchObject({ reason: 'mint', delta: 1, fragmentsSpent: 5 });
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(1);
  });

  it('ignore le prix courant, mais compte comme une frappe : la suivante en points coûte le prix de son rang', async () => {
    const db = fakeGameDb();
    account(db, { earned: 5, score: 20_000, mints: 10 });

    const issue = await new MeeshService(db.prisma).mintWithFragments(USER, 'gratuite-0011');
    const next = await new MeeshService(db.prisma).preview(USER);

    expect(issue).toMatchObject({ status: 'minted', receipt: { number: 11, price: 0 } });
    expect(db.user.rows[0]?.engagementScore).toBe(20_000);
    expect(next.debits.reduce((sum, d) => sum + d.points, 0)).toBe(meeshPrice(12));
  });

  it('refuse sans rien écrire sous cinq fragments, et dit combien il en manque', async () => {
    const db = fakeGameDb();
    account(db, { earned: 3 });

    const issue = await new MeeshService(db.prisma).mintWithFragments(USER, 'gratuite-0002');

    expect(issue).toEqual({ status: 'insufficient-fragments', fragments: { held: 3, perMeesh: 5 }, missingFragments: 2 });
    expect(db.meeshLedger.rows).toHaveLength(0);
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(0);
  });

  it('rejouer rend la même pièce sans consommer de nouveaux fragments', async () => {
    const db = fakeGameDb();
    account(db, { earned: 12 });
    const service = new MeeshService(db.prisma);

    const first = await service.mintWithFragments(USER, 'gratuite-0003');
    const again = await service.mintWithFragments(USER, 'gratuite-0003');

    expect(again.status).toBe('already-minted');
    expect(again.status === 'already-minted' && again.receipt).toEqual(first.status === 'minted' ? first.receipt : null);
    expect(db.meeshLedger.rows.filter((r) => r.fragmentsSpent === 5)).toHaveLength(1);
  });

  it('deux frappes gratuites ne consomment jamais les mêmes cinq fragments', async () => {
    const db = fakeGameDb();
    account(db, { earned: 7 });
    const service = new MeeshService(db.prisma);

    const first = await service.mintWithFragments(USER, 'gratuite-0004');
    const second = await service.mintWithFragments(USER, 'gratuite-0005');

    expect(first.status).toBe('minted');
    expect(second).toEqual({ status: 'insufficient-fragments', fragments: { held: 2, perMeesh: 5 }, missingFragments: 3 });
  });

  it('un conflit d’écriture rejoue la frappe en bloc : une seule ligne, une seule Gloire', async () => {
    const db = fakeGameDb();
    account(db, { earned: 5 });
    const update = db.user.update.bind(db.user);
    let conflicts = 1;
    db.user.update = (async (args: Parameters<typeof update>[0]) => {
      if (conflicts > 0 && 'meeshBalance' in args.data) {
        conflicts -= 1;
        throw writeConflict();
      }
      return update(args);
    }) as typeof db.user.update;

    const issue = await new MeeshService(db.prisma).mintWithFragments(USER, 'gratuite-conflit');

    expect(issue.status).toBe('minted');
    expect(db.meeshLedger.rows.filter((r) => r.fragmentsSpent === 5)).toHaveLength(1);
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'mint')).toHaveLength(1);
  });
});
