/**
 * LE BLOC `game` DE `GET /me/engagement` (#9378) — assemblé des faits que la
 * passerelle PERSISTE, par les lois partagées ; jamais recomposé à la main.
 * Chaque bloc servi passe le schéma partagé : c'est la frontière.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { gameBlockSchema } from '@meeshy/shared/types/game';
import { GameBlockService } from '../GameBlockService';
import { MissionService } from '../MissionService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-05T10:00:00Z');
const DAY = '2026-10-05';

const build = async (db: FakeGameDb) => {
  const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
  const block = await new GameBlockService(db.prisma, { missions }).build({ userId: USER, now: NOW });
  if (block === null) throw new Error('le bloc ne tient pas le contrat partagé');
  return block;
};

const grant = (db: FakeGameDb, balance: number) =>
  db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: balance, reason: 'grant', requestId: 'octroi-0001' });

const counter = (db: FakeGameDb, points: number) =>
  db.engagementCounter.rows.push({ id: 'c1', userId: USER, axisKey: 'content.text_message', count: points, points });

describe('GameBlockService.build', () => {
  it('un compte actif sert un bloc qui passe le schéma partagé', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 25, currentStreakDays: 12, lastStreakDate: new Date('2026-10-04T00:00:00Z'), flameFreezes: 1 });
    counter(db, 4000);
    grant(db, 7);
    db.gloryLedger.rows.push({ id: 'l1', userId: USER, delta: 600, reason: 'level', requestId: 'level:2' });

    const block = await build(db);

    expect(gameBlockSchema.safeParse(block).success).toBe(true);
    expect(block.level).toMatchObject({ level: 20, record: 25 });
    expect(block.glory).toMatchObject({ glory: 600, rank: 'echo' });
    expect(block.treasury).toMatchObject({ held: 7, tier: 'bourse' });
    expect(block.flame).toMatchObject({ days: 12, freezes: 1, status: 'at-risk' });
    expect(block.boosts.tailwind).toBe(1.25);
  });

  it('quand la journée de jeu ouverte la veille au soir continue, la Flamme se juge sur le jour CIVIL', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20, currentStreakDays: 4, lastStreakDate: new Date('2026-10-04T00:00:00Z') });
    for (const [slot, difficulty] of ['easy', 'medium', 'hard'].entries()) {
      db.dailyMission.rows.push({
        id: `m${slot}`, userId: USER, dayKey: '2026-10-04', slot, templateKey: 'send-texts', difficulty,
        signal: 'axis:content.text_message', prism: false, target: 3, progress: 0, reward: 40, glory: 0, seen: [],
        completedAt: null, paidPoints: null, rerolledAt: null, createdAt: new Date('2026-10-04T23:00:00Z'),
      });
    }

    const block = await build(db);

    expect(block.missions.dayKey).toBe('2026-10-04');
    expect(block.flame.status).toBe('at-risk');
  });

  it('un compte ANTÉRIEUR au jeu (aucun champ) sert un bloc neutre mais valide', async () => {
    const db = fakeGameDb();
    seedUser(db, {});

    const block = await build(db);

    expect(gameBlockSchema.safeParse(block).success).toBe(true);
    expect(block.level).toMatchObject({ level: 1, record: 1, prestige: 0 });
    expect(block.glory.glory).toBe(0);
    expect(block.missions).toMatchObject({ unlocked: false, items: [] });
    expect(block.flame).toMatchObject({ days: 0, status: 'none', freezes: 0 });
    expect(block.guideSeen).toEqual([]);
  });

  it('la frappe annonce le prix de la PROCHAINE pièce : la 11e coûte 1 294', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000, levelRecord: 31 });
    counter(db, 5000);
    for (let n = 0; n < 10; n += 1) db.meeshLedger.rows.push({ id: `m${n}`, userId: USER, delta: 1, reason: 'mint', requestId: `old-${n}` });

    const block = await build(db);

    expect(block.mint).toMatchObject({ number: 11, price: 1294, canMint: true, edition: 'silver' });
  });

  it('la Flamme éteinte se rallume sous 48 h : la série perdue est celle d’avant la rupture', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 12, longestStreakDays: 12, lastStreakDate: new Date('2026-10-02T00:00:00Z') });
    grant(db, 3);

    const block = await build(db);

    expect(block.flame).toMatchObject({ days: 0, status: 'out', canRelight: true });
  });

  it('les trois missions du jour sortent du tirage, et le coffre se verrouille tant qu’elles ne sont pas faites', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });
    grant(db, 2);

    const block = await build(db);

    expect(block.missions).toMatchObject({ dayKey: DAY, unlocked: true, rerollAvailable: true });
    expect(block.missions.items).toHaveLength(3);
    expect(block.chest).toMatchObject({ status: 'locked', reward: null });
  });

  it('le coffre est prêt quand les trois sont faites, puis révèle son contenu une fois réclamé', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });
    await build(db);
    for (const row of db.dailyMission.rows) row.completedAt = NOW;

    const ready = await build(db);
    db.gameDay.rows.push({ id: 'gd', userId: USER, dayKey: DAY, rerollCount: 1, chestClaimedAt: NOW, chestPoints: 123, chestFragment: true, chestFreeze: false });
    const claimed = await build(db);

    expect(ready.chest).toMatchObject({ status: 'ready', reward: null });
    expect(claimed.chest).toMatchObject({ status: 'claimed', reward: { points: 123, fragment: true, freeze: false } });
    expect(claimed.missions.rerollAvailable).toBe(false);
  });

  it('une mission faite n’est plus à changer : sans mission non faite, pas de changement offert', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });
    grant(db, 2);
    await build(db);
    for (const row of db.dailyMission.rows) row.completedAt = NOW;

    expect((await build(db)).missions.rerollAvailable).toBe(false);
  });

  it('les clés de guide déjà vues sont servies', async () => {
    const db = fakeGameDb();
    seedUser(db, { guideSeen: ['onboarding.welcome', 'first-level'] });

    expect((await build(db)).guideSeen).toEqual(['onboarding.welcome', 'first-level']);
  });
});

describe('GameBlockService.markGuideSeen', () => {
  const service = (db: FakeGameDb) => new GameBlockService(db.prisma, { missions: new MissionService(db.prisma, { creditPoints: async () => undefined }) });

  it('ajoute les clés nouvelles, sans doublon, dans l’ordre où elles arrivent', async () => {
    const db = fakeGameDb();
    seedUser(db, { guideSeen: ['onboarding.welcome'] });

    const seen = await service(db).markGuideSeen(USER, ['first-level', 'onboarding.welcome', 'first-level']);

    expect(seen).toEqual(['onboarding.welcome', 'first-level']);
    expect(db.user.rows[0]?.guideSeen).toEqual(['onboarding.welcome', 'first-level']);
  });

  it('rejouer la même demande ne change rien', async () => {
    const db = fakeGameDb();
    seedUser(db, {});

    await service(db).markGuideSeen(USER, ['a', 'b']);
    const again = await service(db).markGuideSeen(USER, ['a', 'b']);

    expect(again).toEqual(['a', 'b']);
  });

  it('borne la liste à 200 clés, en gardant les plus récentes', async () => {
    const db = fakeGameDb();
    seedUser(db, { guideSeen: Array.from({ length: 200 }, (_, i) => `k${i}`) });

    const seen = await service(db).markGuideSeen(USER, ['nouvelle']);

    expect(seen).toHaveLength(200);
    expect(seen.at(-1)).toBe('nouvelle');
    expect(seen).not.toContain('k0');
  });
});
