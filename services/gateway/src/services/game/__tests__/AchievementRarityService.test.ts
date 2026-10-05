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

describe('AchievementRarityService.recomputeMythic', () => {
  const glory = (db: FakeGameDb, n: number, delta: number) =>
    db.gloryLedger.rows.push({ id: `g${n}`, userId: uid(n), delta, reason: 'mint', requestId: `r${n}` });

  it('pose le drapeau sur les 100 Légendes les plus glorieuses, jamais en dessous de 80 000', async () => {
    const db = fakeGameDb();
    accounts(db, 120);
    for (let n = 1; n <= 110; n += 1) glory(db, n, 90_000 + n);
    glory(db, 111, 79_999);

    const chosen = await new AchievementRarityService(db.prisma).recomputeMythic();

    expect(chosen).toHaveLength(100);
    expect(chosen).toContain(uid(110));
    expect(chosen).not.toContain(uid(10));
    expect(chosen).not.toContain(uid(111));
    expect(db.gameProfile.rows.filter((p) => p.mythicAt != null)).toHaveLength(100);
  });

  it('retire le drapeau à qui sort du top, et ignore les comptes supprimés', async () => {
    const db = fakeGameDb();
    accounts(db, 3, (n) => (n === 3 ? { isActive: false, deletedAt: new Date() } : {}));
    glory(db, 1, 90_000);
    glory(db, 2, 95_000);
    glory(db, 3, 99_000);
    db.gameProfile.rows.push({ id: 'old', userId: uid(9), mythicAt: new Date('2026-01-01T00:00:00Z') });

    const chosen = await new AchievementRarityService(db.prisma).recomputeMythic();

    expect(chosen).toEqual([uid(2), uid(1)]);
    expect(db.gameProfile.rows.find((p) => p.userId === uid(9))?.mythicAt).toBeNull();
  });

  it('aucune liste globale n’est écrite : seul le drapeau par compte l’est', async () => {
    const db = fakeGameDb();
    accounts(db, 1);
    glory(db, 1, 90_000);
    await new AchievementRarityService(db.prisma).recomputeMythic();
    expect(Object.keys(db.gameProfile.rows[0]!).sort()).toEqual(['createdAt', 'id', 'mythicAt', 'userId']);
  });
});
