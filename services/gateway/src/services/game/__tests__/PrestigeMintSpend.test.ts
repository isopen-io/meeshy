/**
 * LE PRESTIGE ET LA FRAPPE NE DÉPENSENT JAMAIS DEUX FOIS LES MÊMES POINTS (#9675).
 *
 * Le score dépensable a UNE source de vérité : la somme des points des
 * compteurs par axe (`engagementScore == Σ EngagementCounter.points`). Le
 * Prestige remettait le score à 0 sans toucher les compteurs, que la frappe
 * débitait ensuite : le score devenait négatif et bloquait les Prestiges
 * suivants. Témoins : Prestige puis frappe, frappe puis Prestige, et le score
 * ne descend jamais sous zéro.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { meeshPrice } from '@meeshy/shared/utils/game/mint';
import { PrestigeService } from '../PrestigeService';
import { MeeshService } from '../../meesh/MeeshService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const LEVEL_100 = 100 * 100 * 100;
const FIRST_PRICE = meeshPrice(1);

const account = (score: number) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: score, levelRecord: 100, meeshBalance: 0, meeshMintedLifetime: 0 });
  db.engagementCounter.rows.push(
    { id: 'c1', userId: USER, axisKey: 'content.text_message', count: 40_000, points: score - 1000 },
    { id: 'c2', userId: USER, axisKey: 'tool.reaction', count: 500, points: 1000 },
  );
  return db;
};

const score = (db: FakeGameDb) => db.user.rows[0]!.engagementScore as number;
const debitable = (db: FakeGameDb) => db.engagementCounter.rows.reduce((sum, row) => sum + (row.points as number), 0);
const badgesCount = (db: FakeGameDb) => db.engagementCounter.rows.map((row) => row.count);

describe('le Prestige consomme les points dépensables, comme la frappe', () => {
  it('Prestige puis frappe : plus rien à frapper, le score reste à 0, jamais négatif', async () => {
    const db = account(LEVEL_100);

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });
    const mint = await new MeeshService(db.prisma).mint(USER, 'mint-after-prestige');

    expect(mint.status).toBe('insufficient');
    expect(score(db)).toBe(0);
    expect(debitable(db)).toBe(0);
  });

  it('le Prestige ne touche pas aux actions comptées : les badges restent', async () => {
    const db = account(LEVEL_100);
    const before = badgesCount(db);

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });

    expect(badgesCount(db)).toEqual(before);
  });

  it('frappe puis Prestige : la frappe débite, le Prestige remet score ET points dépensables à 0', async () => {
    const db = account(LEVEL_100 + FIRST_PRICE);

    const mint = await new MeeshService(db.prisma).mint(USER, 'mint-before-prestige');
    expect(mint.status).toBe('minted');
    expect(score(db)).toBe(LEVEL_100);
    expect(debitable(db)).toBe(LEVEL_100);

    await new PrestigeService(db.prisma).pass({ userId: USER, requestId: 'prestige-01' });

    expect(score(db)).toBe(0);
    expect(debitable(db)).toBe(0);
  });

  it('la frappe ne fait jamais descendre le score sous zéro, même si les compteurs mentent', async () => {
    const db = account(LEVEL_100);
    db.user.rows[0]!.engagementScore = 10;

    const mint = await new MeeshService(db.prisma).mint(USER, 'mint-lying-counters');

    expect(mint.status).toBe('insufficient');
    expect(score(db)).toBe(10);
    expect(debitable(db)).toBe(LEVEL_100);
  });
});
