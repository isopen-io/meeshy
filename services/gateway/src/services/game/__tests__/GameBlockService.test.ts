/**
 * LE BLOC `game` DE `GET /me/engagement` (#9378) — assemblé des faits que la
 * passerelle PERSISTE, par les lois partagées ; jamais recomposé à la main.
 * Chaque bloc servi passe le schéma partagé : c'est la frontière.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { gameBlockSchema } from '@meeshy/shared/types/game';
import { chestContentForEffort, dayEffort } from '@meeshy/shared/utils/game/chest';
import { GameBlockService } from '../GameBlockService';
import { MissionService } from '../MissionService';
import { PersonalMissionService } from '../PersonalMissionService';
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

/** La journée de jeu telle qu'un coffre ouvert la laisse : la lecture du bloc la crée déjà (cours gravé, #10219). */
const putDay = (db: FakeGameDb, fields: Record<string, unknown>) => {
  const row = db.gameDay.rows.find((r) => r.userId === USER && r.dayKey === fields.dayKey);
  if (row) Object.assign(row, fields);
  else db.gameDay.rows.push({ id: `gd-${String(fields.dayKey)}`, userId: USER, ...fields });
};

const counter = (db: FakeGameDb, points: number) =>
  db.engagementCounter.rows.push({ id: 'c1', userId: USER, axisKey: 'content.text_message', count: points, points });

describe('GameBlockService.build', () => {
  it('un compte actif sert un bloc qui passe le schéma partagé', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100 * 20 * 20, levelRecord: 25, currentStreakDays: 12, longestStreakDays: 12, lastStreakDate: new Date('2026-10-04T00:00:00Z'), flameFreezes: 1 });
    counter(db, 4000);
    grant(db, 6);
    db.meeshLedger.rows.push({ id: 'm1', userId: USER, delta: 1, reason: 'mint', requestId: 'frappe-0001' });
    db.dailyMission.rows.push({ id: 'old', userId: USER, dayKey: '2026-09-30', slot: 0, completedAt: new Date('2026-09-30T12:00:00Z') });
    db.gloryLedger.rows.push({ id: 'l1', userId: USER, delta: 2800, reason: 'level', requestId: 'level:2' });

    const block = await build(db);

    expect(gameBlockSchema.safeParse(block).success).toBe(true);
    expect(block.level).toMatchObject({ level: 20, record: 25 });
    // Les étapes (#9706) : une Meesh, une mission et Écho ouvrent jusqu'à 39 ; la prochaine est la Flamme de 7 jours, faite.
    expect(block.level.ladder).toMatchObject({ held: false, steps: { minted: 1, missionsDone: 1, flameRecord: 12 } });
    expect(block.level.ladder?.step).toEqual({ level: 30, kind: 'rank', target: 2000, current: 2800, met: true, rank: 'echo' });
    expect(block.glory).toMatchObject({ glory: 2800, rank: 'echo', division: 3, division5: 4, mythic: null });
    expect(block.treasury).toMatchObject({ held: 7, tier: 'bourse' });
    expect(block.flame).toMatchObject({ days: 12, freezes: 1, status: 'at-risk' });
    // Le Vent arrière est éteint depuis les étincelles (#10846) : le niveau ne descend plus sous son record à la frappe.
    expect(block.boosts.tailwind).toBe(1);
  });

  it('les points sont là, l\'étape du 10 manque : le niveau attend à 9 et dit laquelle (#9706)', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100 * 15 * 15, levelRecord: 9 });

    const block = await build(db);

    expect(block.level).toMatchObject({ level: 9, pointsToNext: 0, progress: 1 });
    expect(block.level.ladder).toMatchObject({ level: 9, held: true, isMax: false });
    expect(block.level.ladder?.step).toEqual({ level: 10, kind: 'mint', target: 1, current: 0, met: false, rank: null });
  });

  it('quand la journée de jeu ouverte la veille au soir continue, la Flamme se juge sur le jour CIVIL', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100 * 20 * 20, levelRecord: 20, currentStreakDays: 4, lastStreakDate: new Date('2026-10-04T00:00:00Z') });
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

  it('la frappe annonce le prix de la PROCHAINE pièce : la 11e vaut 1 587 de rang, au facteur du niveau actuel (#10011, #10847)', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 5000, levelRecord: 31 });
    counter(db, 5000);
    for (let n = 0; n < 10; n += 1) db.meeshLedger.rows.push({ id: `m${n}`, userId: USER, delta: 1, reason: 'mint', requestId: `old-${n}` });

    const block = await build(db);

    expect(block.mint).toMatchObject({ number: 11, basePrice: 1587, canMint: true, edition: 'silver' });
    expect(block.mint.price).toBeLessThan(1587);
    expect(block.mint.price).toBe(Math.round((1587 * Math.round((block.mint.costFactor ?? 1) * 1000)) / 1000));
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
    putDay(db, { dayKey: DAY, rerollCount: 1, chestClaimedAt: NOW, chestPoints: 123, chestFragment: true, chestFreeze: false });
    const claimed = await build(db);

    expect(ready.chest).toMatchObject({ status: 'ready', reward: null });
    expect(claimed.chest).toMatchObject({ status: 'claimed', reward: { points: 123, fragment: true, freeze: false, glory: 0 } });
    expect(claimed.missions.rerollAvailable).toBe(false);
  });

  it('dit le contenu certain du coffre avant l’ouverture, celui des missions tirées (#10011)', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });

    const block = await build(db);

    expect(block.chest.today).toEqual(chestContentForEffort(dayEffort(block.missions.items), 1221));
    expect(block.chest.today?.points).toBeGreaterThanOrEqual(500);
  });

  it('dit la prime au cours du DÉBUT du jour de jeu, et la grave : une frappe du jour ne la change pas (#10219)', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });
    for (let n = 0; n < 9; n += 1) db.meeshLedger.rows.push({ id: `m${n}`, userId: USER, delta: 1, reason: 'mint', requestId: `frappe-${n}`, createdAt: new Date('2026-10-04T12:00:00Z') });

    const before = await build(db);
    db.meeshLedger.rows.push({ id: 'm9', userId: USER, delta: 1, reason: 'mint', requestId: 'frappe-9', createdAt: new Date('2026-10-05T09:30:00Z') });
    const after = await build(db);

    expect(before.chest.today).toEqual(chestContentForEffort(dayEffort(before.missions.items), 1221));
    expect(after.chest.today).toEqual(before.chest.today);
    expect(db.gameDay.rows.find((r) => r.dayKey === DAY)).toMatchObject({ chestMintBase: 9 });
  });

  it('sert le coffre ouvert avec sa Gloire et sa prime, et le total de fragments d\'étoile collectés — jamais de frappe par fragments', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });
    await build(db);
    for (const row of db.dailyMission.rows) row.completedAt = NOW;
    db.gameDay.rows.push({ id: 'avant', userId: USER, dayKey: '2026-10-01', rerollCount: 0, chestClaimedAt: NOW, chestFragment: true });
    putDay(db, {
      dayKey: DAY, rerollCount: 0, chestClaimedAt: NOW,
      chestPoints: 2083 + 244, chestFragment: true, chestFreeze: false, chestGlory: 208, chestBonus: 'fifth', chestBonusPoints: 244,
    });
    db.gameSeason.rows.push({ id: 's1', userId: USER, number: 1, stars: 160, claimedSteps: [5, 15, 25, 35, 40] });

    const block = await build(db);

    expect(block.chest.reward).toEqual({ points: 2083 + 244, fragment: true, freeze: false, glory: 208, bonus: 'fifth', bonusPoints: 244 });
    expect(block.starFragments).toEqual({ collected: 2 + 4 });
    expect('withFragments' in block.mint).toBe(false);
    expect('meeshFragments' in block.chest).toBe(false);
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


describe('GameBlockService.build — la mission personnelle (#9539)', () => {
  const buildWith = async (db: FakeGameDb, now: Date) => {
    const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
    const personal = new PersonalMissionService(db.prisma, { missions });
    return new GameBlockService(db.prisma, { missions, personal }).build({ userId: USER, now });
  };

  it('sert `missions.personal` à côté des trois missions du jour, avec sa plage et son état, et passe le schéma partagé', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });

    const block = await buildWith(db, new Date('2026-10-05T06:00:00Z'));

    expect(block).not.toBeNull();
    expect(gameBlockSchema.safeParse(block).success).toBe(true);
    expect(block!.missions.items).toHaveLength(3);
    expect(block!.missions.personal).toMatchObject({ state: 'upcoming' });
    expect(Date.parse(block!.missions.personal!.endsAt) - Date.parse(block!.missions.personal!.startsAt)).toBe(2 * 60 * 60 * 1000);
    expect(block!.chest.status).toBe('locked');
  });

  it('l’état suit l’instant de la lecture : en cours dans la plage, manquée après', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });
    const first = await buildWith(db, new Date('2026-10-05T06:00:00Z'));
    const startsAt = new Date(first!.missions.personal!.startsAt);
    const endsAt = new Date(first!.missions.personal!.endsAt);

    expect((await buildWith(db, new Date(startsAt.getTime() + 60_000)))!.missions.personal?.state).toBe('active');
    expect((await buildWith(db, new Date(endsAt.getTime() + 60_000)))!.missions.personal?.state).toBe('missed');
  });

  it('sans service de mission personnelle, le bloc garde exactement la forme d’avant', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });

    const block = await build(db);

    expect('personal' in block.missions).toBe(false);
  });

  it('une panne du tirage personnel n’emporte pas le bloc', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 20 * 20, levelRecord: 20 });
    const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
    const personal = { ensure: async () => { throw new Error('mongo down'); } };

    const block = await new GameBlockService(db.prisma, { missions, personal }).build({ userId: USER, now: NOW });

    expect(block).not.toBeNull();
    expect(block!.missions.personal).toBeUndefined();
  });

  it('un compte sous le niveau 5 n’a ni missions ni mission personnelle', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 4 * 4, levelRecord: 4 });

    const block = await buildWith(db, NOW);

    expect(block!.missions.personal).toBeUndefined();
  });
});

describe('GameBlockService.build — le record de chaque cycle clos (#10911)', () => {
  it('sert les records gardés par les Prestiges, dans l’ordre, sur l’échelle ouverte', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100 * 12 * 12, levelRecord: 12, levelMaxLifetime: 150, prestige: 2, prestigeLevelRecords: [150, 100] });

    const block = await build(db);

    expect(block.level.ladder?.pastCycleRecords).toEqual([150, 100]);
  });

  it('un compte qui n’en a aucun sert une liste vide, jamais un record inventé', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100 * 12 * 12, levelRecord: 12 });

    const block = await build(db);

    expect(block.level.ladder?.pastCycleRecords).toEqual([]);
  });
});
