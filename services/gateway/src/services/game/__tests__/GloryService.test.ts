/**
 * LE REGISTRE DE GLOIRE (#9374) — en ajout seul, total lu au registre.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { GloryService, gloryTotalFromLedger } from '../GloryService';
import { fakeGameDb, seedUser, USER } from './fakeGameDb';

describe('GloryService.credit', () => {
  it('grave une ligne et le total se lit au registre', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const service = new GloryService(db.prisma);

    const written = await service.credit({ userId: USER, delta: 100, reason: 'mint', requestId: 'mint:abc' });

    expect(written).toBe(true);
    expect(await gloryTotalFromLedger(db.prisma, USER)).toBe(100);
  });

  it('rejouer la même clé ne grave rien de plus (idempotence par requestId)', async () => {
    const db = fakeGameDb();
    const service = new GloryService(db.prisma);

    await service.credit({ userId: USER, delta: 20, reason: 'level', requestId: 'level:2' });
    const second = await service.credit({ userId: USER, delta: 20, reason: 'level', requestId: 'level:2' });

    expect(second).toBe(false);
    expect(await service.total(USER)).toBe(20);
  });

  it('un compte sans ligne a une Gloire de zéro, pas null', async () => {
    const db = fakeGameDb();
    expect(await gloryTotalFromLedger(db.prisma, USER)).toBe(0);
  });

  it('refuse un delta nul : le registre ne grave jamais zéro', async () => {
    const db = fakeGameDb();
    const written = await new GloryService(db.prisma).credit({ userId: USER, delta: 0, reason: 'level', requestId: 'level:3' });
    expect(written).toBe(false);
    expect(db.gloryLedger.rows).toHaveLength(0);
  });
});

describe('GloryService.creditLevelProgress — la Gloire du premier passage', () => {
  it('100 par niveau inédit (#9636), une ligne par niveau, et le record monte', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 3 });
    const service = new GloryService(db.prisma);

    const gained = await service.creditLevelProgress({ userId: USER, score: 10 * 6 * 6, previousRecord: 3 });

    expect(gained).toBe(300);
    expect(db.gloryLedger.rows.map((r) => r.requestId)).toEqual(['level:4', 'level:5', 'level:6']);
    expect(db.user.rows[0]?.levelRecord).toBe(6);
  });

  it('un niveau déjà connu ne rapporte rien — redescendre puis remonter ne paie pas deux fois', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 10 });

    const gained = await new GloryService(db.prisma).creditLevelProgress({ userId: USER, score: 10 * 7 * 7, previousRecord: 10 });

    expect(gained).toBe(0);
    expect(db.gloryLedger.rows).toHaveLength(0);
    expect(db.user.rows[0]?.levelRecord).toBe(10);
  });

  it('un record absent (compte antérieur) se lit comme le niveau 1', async () => {
    const db = fakeGameDb();
    seedUser(db);

    const gained = await new GloryService(db.prisma).creditLevelProgress({ userId: USER, score: 10 * 3 * 3, previousRecord: null });

    expect(gained).toBe(200);
    expect(db.user.rows[0]?.levelRecord).toBe(3);
  });

  it('deux passages concurrents ne gravent pas deux fois le même niveau', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 1 });
    const service = new GloryService(db.prisma);

    await Promise.all([
      service.creditLevelProgress({ userId: USER, score: 40, previousRecord: 1 }),
      service.creditLevelProgress({ userId: USER, score: 40, previousRecord: 1 }),
    ]);

    expect(await service.total(USER)).toBe(100 * 1);
  });
});

describe('GloryService.creditFlameRecords', () => {
  it('une ligne par record de Flamme franchi', async () => {
    const db = fakeGameDb();
    const service = new GloryService(db.prisma);

    const gained = await service.creditFlameRecords({ userId: USER, previousLongest: 6, longest: 7 });

    expect(gained).toBe(50);
    expect(db.gloryLedger.rows[0]).toMatchObject({ requestId: 'flame-record:7', reason: 'flame-record', delta: 50 });
  });

  it('ne repaie pas un record déjà franchi', async () => {
    const db = fakeGameDb();
    const service = new GloryService(db.prisma);
    await service.creditFlameRecords({ userId: USER, previousLongest: 6, longest: 7 });

    const again = await service.creditFlameRecords({ userId: USER, previousLongest: 6, longest: 7 });

    expect(again).toBe(0);
    expect(await service.total(USER)).toBe(50);
  });
});

describe('GloryService.creditAchievement — la Gloire d’un succès, figée à l’obtention (#9390)', () => {
  const KEY = 'achievement.first_voice';

  it('sans instantané de rareté, le succès vaut « commun » (100)', async () => {
    const db = fakeGameDb();
    const gained = await new GloryService(db.prisma).creditAchievement(USER, KEY);
    expect(gained).toBe(100);
    expect(db.gloryLedger.rows[0]).toMatchObject({ reason: 'achievement', requestId: `achievement:${KEY}`, delta: 100 });
  });

  it('suit la rareté mesurée au moment de l’obtention', async () => {
    const db = fakeGameDb();
    db.achievementRarityStat.rows.push({ id: 's', milestoneKey: KEY, holders: 3, population: 5000, rarity: 'legendary' });
    expect(await new GloryService(db.prisma).creditAchievement(USER, KEY)).toBe(1500);
  });

  it('est FIGÉE : une rareté qui change ensuite ne paie rien de plus ni ne reprend rien', async () => {
    const db = fakeGameDb();
    const service = new GloryService(db.prisma);
    await service.creditAchievement(USER, KEY);
    db.achievementRarityStat.rows.push({ id: 's', milestoneKey: KEY, holders: 1, population: 9000, rarity: 'mythic' });

    expect(await service.creditAchievement(USER, KEY)).toBe(0);
    expect(await service.total(USER)).toBe(100);
  });
});

describe('GloryService.credit — la place du Mythe au franchissement (#9636)', () => {
  it('le crédit qui fait passer de 999 999 à 1 000 000 prend la première place', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const service = new GloryService(db.prisma);

    await service.credit({ userId: USER, delta: 999_999, reason: 'season', requestId: 'season:1' });
    expect(db.mythicSeat.rows).toHaveLength(0);

    await service.credit({ userId: USER, delta: 1, reason: 'level', requestId: 'level:2' });
    expect(db.mythicSeat.rows).toEqual([expect.objectContaining({ userId: USER, number: 1, glory: 1_000_000 })]);
  });

  it('une place qui ne se prend pas ne fait jamais échouer le crédit déjà gravé', async () => {
    const db = fakeGameDb();
    const seats = { claimIfEligible: async () => Promise.reject(new Error('base indisponible')) };
    const written = await new GloryService(db.prisma, { seats }).credit({ userId: USER, delta: 1_000_000, reason: 'season', requestId: 'season:1' });
    expect(written).toBe(true);
    expect(await gloryTotalFromLedger(db.prisma, USER)).toBe(1_000_000);
  });

  it('une correction négative ne demande pas de place', async () => {
    const db = fakeGameDb();
    let asked = 0;
    const seats = { claimIfEligible: async () => { asked += 1; return null; } };
    await new GloryService(db.prisma, { seats }).credit({ userId: USER, delta: -5, reason: 'correction', requestId: 'fix:1' });
    expect(asked).toBe(0);
  });
});
