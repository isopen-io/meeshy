/**
 * LA RARETÉ DES SUCCÈS ET LE DRAPEAU MYTHE (#9390) — un instantané nocturne,
 * sans rareté sous 1 000 comptes, comptes supprimés hors de la fraction, un
 * drapeau par compte et aucune liste globale.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { AchievementRarityService } from '../AchievementRarityService';
import { fakeGameDb, type FakeGameDb } from './fakeGameDb';

const uid = (n: number) => `68a${String(n).padStart(21, '0')}`;

const accounts = (db: FakeGameDb, count: number, overrides: (n: number) => Record<string, unknown> = () => ({})) => {
  for (let n = 1; n <= count; n += 1) db.user.rows.push({ id: uid(n), isActive: true, deletedAt: null, ...overrides(n) });
};

const hold = (db: FakeGameDb, key: string, holders: number[]) =>
  holders.forEach((n) => db.engagementMilestone.rows.push({ id: `${key}-${n}`, userId: uid(n), milestoneType: 'achievement', milestoneKey: key }));

describe('AchievementRarityService.recomputeRarity', () => {
  it('mesure la rareté par la part de titulaires sur la population', async () => {
    const db = fakeGameDb();
    accounts(db, 1000);
    hold(db, 'achievement.first_content', Array.from({ length: 900 }, (_, i) => i + 1));
    hold(db, 'achievement.editor', Array.from({ length: 150 }, (_, i) => i + 1));
    hold(db, 'achievement.first_voice', Array.from({ length: 30 }, (_, i) => i + 1));
    hold(db, 'achievement.rare_one', [1, 2]);
    const service = new AchievementRarityService(db.prisma);

    expect(await service.recomputeRarity()).toEqual({ population: 1000, keys: 4 });

    const rarity = (key: string) => db.achievementRarityStat.rows.find((r) => r.milestoneKey === key)?.rarity;
    expect(rarity('achievement.first_content')).toBe('common');
    expect(rarity('achievement.editor')).toBe('rare');
    expect(rarity('achievement.first_voice')).toBe('epic');
    expect(rarity('achievement.rare_one')).toBe('legendary');
  });

  it('sous 1 000 comptes, aucune rareté : un pourcentage sur peu de monde ne dit rien', async () => {
    const db = fakeGameDb();
    accounts(db, 999);
    hold(db, 'achievement.first_content', [1, 2, 3]);
    await new AchievementRarityService(db.prisma).recomputeRarity();
    expect(db.achievementRarityStat.rows[0]?.rarity).toBeNull();
  });

  it('les comptes supprimés sortent de la population ET des titulaires (G-2)', async () => {
    const db = fakeGameDb();
    accounts(db, 1100, (n) => (n > 1000 ? { isActive: false, deletedAt: new Date() } : {}));
    hold(db, 'achievement.editor', [1, 2, ...Array.from({ length: 100 }, (_, i) => 1001 + i)]);
    const service = new AchievementRarityService(db.prisma);

    await service.recomputeRarity();

    expect(db.achievementRarityStat.rows[0]).toMatchObject({ holders: 2, population: 1000 });
  });

  it('un compte dont `deletedAt` est ABSENT (tous ceux d’avant la colonne) compte dans la population : `deletedAt: null` ne l’atteint pas sur MongoDB (leçon 318)', async () => {
    const db = fakeGameDb();
    for (let n = 1; n <= 1000; n += 1) db.user.rows.push({ id: uid(n), isActive: true });
    hold(db, 'achievement.editor', Array.from({ length: 150 }, (_, i) => i + 1));

    expect(await new AchievementRarityService(db.prisma).recomputeRarity()).toEqual({ population: 1000, keys: 1 });
    expect(db.achievementRarityStat.rows[0]?.rarity).toBe('rare');
  });

  it('est idempotent : rejouer ne duplique rien', async () => {
    const db = fakeGameDb();
    accounts(db, 1000);
    hold(db, 'achievement.editor', [1, 2, 3]);
    const service = new AchievementRarityService(db.prisma);
    await service.recomputeRarity();
    await service.recomputeRarity();
    expect(db.achievementRarityStat.rows).toHaveLength(1);
  });

  it('reading rend la part, et ne la dit affichable qu’à partir de 20 titulaires et 1 000 comptes', async () => {
    const db = fakeGameDb();
    accounts(db, 1000);
    hold(db, 'achievement.a', Array.from({ length: 19 }, (_, i) => i + 1));
    hold(db, 'achievement.b', Array.from({ length: 20 }, (_, i) => i + 1));
    const service = new AchievementRarityService(db.prisma);
    await service.recomputeRarity();

    expect((await service.reading('achievement.a'))?.displayable).toBe(false);
    expect((await service.reading('achievement.b'))?.displayable).toBe(true);
    expect(await service.reading('achievement.zzz')).toBeNull();
  });
});

describe('AchievementRarityService.served — la carte servie dans le bloc game (#9489)', () => {
  const stat = (db: FakeGameDb, key: string, holders: number, population: number, rarity: string | null) =>
    db.achievementRarityStat.rows.push({ id: key, milestoneKey: key, holders, population, rarity, measuredAt: new Date() });

  it('sert la rareté, les titulaires et la population de chaque succès AFFICHABLE', async () => {
    const db = fakeGameDb();
    stat(db, 'achievement.editor', 150, 1000, 'rare');
    const served = await new AchievementRarityService(db.prisma).served();
    expect(served).toEqual({ 'achievement.editor': { rarity: 'rare', holders: 150, population: 1000 } });
  });

  it('FAIL-CLOSED : un succès sous 20 titulaires est ABSENT, jamais servi à rareté nulle ni « mythique » sur deux personnes', async () => {
    const db = fakeGameDb();
    stat(db, 'achievement.two_people', 2, 5000, 'mythic');
    stat(db, 'achievement.nineteen', 19, 5000, 'legendary');
    stat(db, 'achievement.twenty', 20, 5000, 'legendary');
    const served = await new AchievementRarityService(db.prisma).served();
    expect(Object.keys(served)).toEqual(['achievement.twenty']);
  });

  it('une rareté non mesurée (sous 1 000 comptes) est absente aussi, même avec 20 titulaires', async () => {
    const db = fakeGameDb();
    stat(db, 'achievement.small_base', 30, 999, null);
    stat(db, 'achievement.small_base_labelled', 30, 999, 'epic');
    expect(await new AchievementRarityService(db.prisma).served()).toEqual({});
  });

  it('une rareté illisible en base est ignorée, les autres sont servies', async () => {
    const db = fakeGameDb();
    stat(db, 'achievement.bad', 100, 1000, 'divine');
    stat(db, 'achievement.good', 100, 1000, 'rare');
    expect(Object.keys(await new AchievementRarityService(db.prisma).served())).toEqual(['achievement.good']);
  });

  it('lit la base UNE fois pour des lectures rapprochées, et se rafraîchit au calcul de nuit', async () => {
    const db = fakeGameDb();
    accounts(db, 1000);
    hold(db, 'achievement.editor', Array.from({ length: 150 }, (_, i) => i + 1));
    const service = new AchievementRarityService(db.prisma);
    const t0 = new Date('2026-10-14T10:00:00Z');

    expect(await service.served(t0)).toEqual({});
    await service.recomputeRarity(t0);
    expect(await service.served(new Date(t0.getTime() + 1000))).toEqual({
      'achievement.editor': { rarity: 'rare', holders: 150, population: 1000 },
    });
  });

  it('une lecture plus ancienne que la fenêtre relit la base : une AUTRE instance a pu recalculer', async () => {
    const db = fakeGameDb();
    const service = new AchievementRarityService(db.prisma);
    const t0 = new Date('2026-10-14T10:00:00Z');
    expect(await service.served(t0)).toEqual({});
    stat(db, 'achievement.editor', 150, 1000, 'rare');
    expect(await service.served(new Date(t0.getTime() + 60_000))).toEqual({});
    expect(Object.keys(await service.served(new Date(t0.getTime() + 6 * 60_000)))).toEqual(['achievement.editor']);
  });
});

describe('AchievementRarityService.recomputeMythic — le rattrapage des places du Mythe (#9636)', () => {
  const glory = (db: FakeGameDb, n: number, delta: number, at = '2027-01-01T00:00:00Z') =>
    db.gloryLedger.rows.push({ id: `g${n}-${at}`, userId: uid(n), delta, reason: 'mint', requestId: `r${n}-${at}`, createdAt: new Date(at) });

  it('attribue une place aux comptes à 1 000 000, dans l’ordre d’arrivée, jamais en dessous', async () => {
    const db = fakeGameDb();
    accounts(db, 3);
    glory(db, 1, 1_000_000, '2027-02-01T00:00:00Z');
    glory(db, 2, 1_000_000, '2027-01-01T00:00:00Z');
    glory(db, 3, 999_999);

    expect(await new AchievementRarityService(db.prisma).recomputeMythic()).toEqual([uid(2), uid(1)]);
    expect(db.mythicSeat.rows.map((r) => [r.userId, r.number])).toEqual([
      [uid(2), 1],
      [uid(1), 2],
    ]);
  });

  it('ne retire jamais rien, et ignore les comptes supprimés ; `deletedAt` ABSENT ne vaut pas suppression', async () => {
    const db = fakeGameDb();
    accounts(db, 2, (n) => (n === 2 ? { isActive: false, deletedAt: new Date() } : {}));
    db.user.rows.push({ id: uid(3), isActive: true });
    glory(db, 2, 1_000_000);
    glory(db, 3, 1_000_000);
    db.mythicSeat.rows.push({ id: '6d7974686500000000000001', number: 1, userId: uid(9), glory: 1_000_000, grantedAt: new Date() });

    expect(await new AchievementRarityService(db.prisma).recomputeMythic()).toEqual([uid(3)]);
    expect(db.mythicSeat.rows.map((r) => [r.userId, r.number])).toEqual([
      [uid(9), 1],
      [uid(3), 2],
    ]);
  });

  it('n’écrit plus aucun drapeau « top 100 du moment »', async () => {
    const db = fakeGameDb();
    accounts(db, 1);
    glory(db, 1, 1_000_000);
    await new AchievementRarityService(db.prisma).recomputeMythic();
    expect(db.gameProfile.rows).toHaveLength(0);
  });
});
