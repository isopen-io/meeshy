/**
 * LE PRESTIGE ET LA FRAPPE DEPUIS LES ÉTINCELLES (#10846, porteur 2026-10-16 ; #10892, porteur 2026-10-17).
 *
 * Le niveau 100 qui ouvre le Prestige se lit sur la POCHE (#10892), comme tout niveau.
 *
 * Le prestige VIDE la poche et le cycle (le niveau actuel retombe à 1) ; le TOTAL À VIE et le NIVEAU MAX À VIE ne bougent
 * pas. Les compteurs par axe ne sont plus remis à zéro (la frappe ne les débite plus, ils disent ce que chaque axe a
 * rapporté). La poche ne descend jamais sous zéro.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PrestigeService } from '../PrestigeService';
import { MeeshService } from '../../meesh/MeeshService';
import { effectiveMeeshPrice } from '@meeshy/shared/utils/game/sparks';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const LEVEL_100 = 100 * 100 * 100;
const AT_LEVEL_100 = LEVEL_100 + 3000;

const account = (pocket: number, extra: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, {
    engagementScore: pocket,
    sparksSincePrestige: LEVEL_100 + 5000,
    sparksEarnedLifetime: LEVEL_100 + 9000,
    levelRecord: 100,
    levelMaxLifetime: 100,
    meeshBalance: 0,
    meeshMintedLifetime: 0,
    ...extra,
  });
  db.engagementCounter.rows.push(
    { id: 'c1', userId: USER, axisKey: 'content.text_message', count: 40_000, points: 900_000 },
    { id: 'c2', userId: USER, axisKey: 'tool.reaction', count: 500, points: 1000 },
  );
  return db;
};

const user = (db: FakeGameDb) => db.user.rows[0]!;

describe('le Prestige vide la poche et le cycle, jamais le total à vie ni le niveau max', () => {
  it('poche et cycle à 0, niveau à 1, étoile posée', async () => {
    const db = account(AT_LEVEL_100);

    const result = await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });

    expect(result).toMatchObject({ status: 'passed', prestige: 1, score: 0, level: 1 });
    expect(user(db)).toMatchObject({ engagementScore: 0, sparksSincePrestige: 0, levelRecord: 1, prestige: 1 });
  });

  it('le total à vie et le niveau max à vie ne bougent pas', async () => {
    const db = account(AT_LEVEL_100);

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });

    expect(user(db)).toMatchObject({ sparksEarnedLifetime: LEVEL_100 + 9000, levelMaxLifetime: 100 });
  });

  it('un compte d\'AVANT le rattrapage : le total à vie et le max à vie sont posés avant que le cycle ne soit vidé', async () => {
    const db = account(LEVEL_100 + 500, { sparksSincePrestige: undefined, sparksEarnedLifetime: undefined, levelMaxLifetime: undefined });

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });

    expect(user(db)).toMatchObject({ engagementScore: 0, sparksSincePrestige: 0, sparksEarnedLifetime: LEVEL_100 + 500, levelMaxLifetime: 100 });
  });

  it('les compteurs par axe ne sont pas remis à zéro : ni points ni actions', async () => {
    const db = account(AT_LEVEL_100);

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });

    expect(db.engagementCounter.rows.map((r) => [r.count, r.points])).toEqual([[40_000, 900_000], [500, 1000]]);
  });

  it('la poche fait le niveau 100 : une poche presque vide ferme le Prestige, même avec un cycle au 100', async () => {
    const db = account(10);

    await expect(new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' })).rejects.toMatchObject({ code: 'PRESTIGE_LEVEL_TOO_LOW' });
  });

  it('une poche sous le niveau 100 refuse le Prestige, même avec le max à vie à 100', async () => {
    const db = account(900_000, { sparksSincePrestige: 5000, levelRecord: 1 });

    await expect(new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' })).rejects.toMatchObject({ code: 'PRESTIGE_LEVEL_TOO_LOW' });
  });
});

describe('la frappe et le Prestige ne dépensent jamais deux fois les mêmes étincelles', () => {
  it('Prestige puis frappe : la poche est vide, rien à frapper, jamais négatif', async () => {
    const db = account(AT_LEVEL_100);

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });
    const mint = await new MeeshService(db.prisma).mint(USER, 'mint-after-prestige');

    expect(mint.status).toBe('insufficient');
    expect(user(db).engagementScore).toBe(0);
  });

  it('frappe puis Prestige : la frappe ne touche ni cycle ni total à vie, le Prestige vide la poche restante', async () => {
    const db = account(LEVEL_100 + 5000);

    const mint = await new MeeshService(db.prisma).mint(USER, 'mint-before-prestige');
    expect(mint.status).toBe('minted');
    expect(mint.status === 'minted' && user(db).engagementScore).toBe(LEVEL_100 + 5000 - (mint.status === 'minted' ? mint.receipt.price : 0));
    expect(user(db).sparksSincePrestige).toBe(LEVEL_100 + 5000);

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });

    expect(user(db)).toMatchObject({ engagementScore: 0, sparksSincePrestige: 0, sparksEarnedLifetime: LEVEL_100 + 9000 });
  });

  it('après le Prestige, le niveau ACTUEL est 1 : la frappe se paie au tarif réduit, quel que soit le max à vie', async () => {
    const db = account(AT_LEVEL_100);
    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });
    // Quelques étincelles gagnées dans le cycle neuf (niveau 2, 400 ≤ 700 < 900) : de quoi payer, au tarif du niveau 2.
    Object.assign(user(db), { engagementScore: 700, sparksSincePrestige: 700 });

    const mint = await new MeeshService(db.prisma).mint(USER, 'mint-after');

    expect(mint).toMatchObject({ status: 'minted', receipt: { price: effectiveMeeshPrice(1, 2) } });
  });
});
