import { describe, it, expect } from 'vitest';
import {
  CHEST_ODDS,
  CHEST_EARLY_GLORY_MAX,
  CHEST_GLORY_BASE_MAX,
  CHEST_GLORY_MAX,
  CHEST_GLORY_MIN,
  chestBaseGloryForEffort,
  chestBonusAmounts,
  chestDayStart,
  chestEarlyGlory,
  chestElapsedHours,
  chestPriceCutoff,
  chestContentForEffort,
  chestPointsForEffort,
  dailyChest,
  dayEffort,
  missionEffort,
} from '../../utils/game/chest.js';
import { meeshPrice } from '../../utils/game/mint.js';
import { seededRng } from '../../utils/game/day-prng.js';
import { MISSION_TEMPLATES } from '../../utils/game/mission-catalog.js';
import { drawDailyMissions } from '../../utils/game/missions.js';

const mission = (templateKey: string, difficulty: string, target: number) => ({ templateKey, difficulty, target });

describe('le coffre du jour', () => {
  it('expose ses probabilités et ses bornes avant l\'ouverture', () => {
    expect(CHEST_ODDS).toEqual({
      minPoints: 500,
      maxPoints: 10_000,
      fragment: 1 / 6,
      freeze: 1 / 20,
      minGlory: 1250,
      maxGlory: 5800,
      bonusWhole: 1 / 20,
      bonusFifth: 1 / 6,
    });
  });

  it('est déterministe pour un utilisateur, un jour et un effort', () => {
    expect(dailyChest({ userId: 'u1', dayKey: '2026-10-05', effort: 900, nextMeeshPrice: 1221, elapsedHours: 23 })).toEqual(dailyChest({ userId: 'u1', dayKey: '2026-10-05', effort: 900, nextMeeshPrice: 1221, elapsedHours: 23 }));
  });

  it('garde le fragment en prime et le gel d\'avant : la première valeur du générateur reste consommée', () => {
    for (let u = 0; u < 200; u++) {
      const rng = seededRng({ userId: `u${u}`, dayKey: '2026-10-05', salt: 'chest' });
      rng();
      const fragment = rng() < 1 / 6;
      const freeze = rng() < 1 / 20;
      expect(dailyChest({ userId: `u${u}`, dayKey: '2026-10-05', effort: 1200, nextMeeshPrice: 1221, elapsedHours: 23 })).toMatchObject({ fragment, freeze });
    }
  });

  it('ne fait dépendre que les points et la Gloire de l\'effort, jamais les tirages', () => {
    const light = dailyChest({ userId: 'u7', dayKey: '2026-10-08', effort: 300, nextMeeshPrice: 1221, elapsedHours: 23 });
    const heavy = dailyChest({ userId: 'u7', dayKey: '2026-10-08', effort: 4500, nextMeeshPrice: 1221, elapsedHours: 23 });
    expect({ fragment: light.fragment, freeze: light.freeze, bonus: light.bonus }).toEqual({ fragment: heavy.fragment, freeze: heavy.freeze, bonus: heavy.bonus });
    expect(heavy.points).toBeGreaterThan(light.points);
  });

  it('tient ses probabilités sur un grand nombre de coffres', () => {
    const N = 6000;
    const chests = Array.from({ length: N }, (_, u) => dailyChest({ userId: `user-${u}`, dayKey: '2026-10-05', effort: 600, nextMeeshPrice: 1221, elapsedHours: 23 }));
    const fragments = chests.filter((c) => c.fragment).length / N;
    const freezes = chests.filter((c) => c.freeze).length / N;
    expect(fragments).toBeGreaterThan(1 / 6 - 0.03);
    expect(fragments).toBeLessThan(1 / 6 + 0.03);
    expect(freezes).toBeGreaterThan(1 / 20 - 0.02);
    expect(freezes).toBeLessThan(1 / 20 + 0.02);
  });

  it('ne donne jamais plus d\'UN fragment d\'étoile : `fragment` est un booléen', () => {
    for (let u = 0; u < 300; u++) {
      expect(typeof dailyChest({ userId: `p${u}`, dayKey: '2026-10-05', effort: 4500, nextMeeshPrice: 16_556, elapsedHours: 23 }).fragment).toBe('boolean');
    }
  });
});

describe('la prime, en points au cours de la Meesh du compte', () => {
  it('vaut le prix entier de la prochaine Meesh, ou son cinquième arrondi', () => {
    expect(chestBonusAmounts(1221)).toEqual({ whole: 1221, fifth: 244 });
    expect(chestBonusAmounts(1587)).toEqual({ whole: 1587, fifth: 317 });
    expect(chestBonusAmounts(16_556)).toEqual({ whole: 16_556, fifth: 3311 });
    expect(chestBonusAmounts(1223)).toEqual({ whole: 1223, fifth: 245 });
    expect(chestBonusAmounts(Number.NaN)).toEqual({ whole: 0, fifth: 0 });
  });

  it('suit les tirages 4 (entière, 1/20) puis 5 (un cinquième, 1/6), toujours consommés', () => {
    for (let u = 0; u < 400; u++) {
      const rng = seededRng({ userId: `b${u}`, dayKey: '2026-10-09', salt: 'chest' });
      rng();
      rng();
      rng();
      const whole = rng() < 1 / 20;
      const fifth = rng() < 1 / 6;
      const chest = dailyChest({ userId: `b${u}`, dayKey: '2026-10-09', effort: 300, nextMeeshPrice: 1587, elapsedHours: 23 });
      const bonus = whole ? 'whole' : fifth ? 'fifth' : 'none';
      const bonusPoints = whole ? 1587 : fifth ? 317 : 0;
      expect(chest).toMatchObject({ bonus, bonusPoints, points: 500 + bonusPoints, glory: 1250 });
    }
  });

  it('se crédite dans `points` (ce que lit un ancien client), sans Gloire de plus', () => {
    const all = Array.from({ length: 2000 }, (_, u) => dailyChest({ userId: `c${u}`, dayKey: '2026-10-09', effort: 1000, nextMeeshPrice: 1221, elapsedHours: 23 }));
    const whole = all.find((c) => c.bonus === 'whole')!;
    const fifth = all.find((c) => c.bonus === 'fifth')!;
    expect(whole).toMatchObject({ points: 2083 + 1221, bonusPoints: 1221, glory: 1542 });
    expect(fifth).toMatchObject({ points: 2083 + 244, bonusPoints: 244, glory: 1542 });
  });

  it('tient ses probabilités : 1/20 entière, puis 19/20 × 1/6 d\'un cinquième', () => {
    const N = 12_000;
    const all = Array.from({ length: N }, (_, u) => dailyChest({ userId: `d${u}`, dayKey: '2026-10-09', effort: 600, nextMeeshPrice: 1221, elapsedHours: 23 }));
    const whole = all.filter((c) => c.bonus === 'whole').length / N;
    const fifth = all.filter((c) => c.bonus === 'fifth').length / N;
    expect(Math.abs(whole - 1 / 20)).toBeLessThan(0.012);
    expect(Math.abs(fifth - (19 / 20) * (1 / 6))).toBeLessThan(0.02);
  });

  it('suit le cours du compte : plus de Meeshes frappées, une prime plus grosse', () => {
    expect(chestContentForEffort(300, meeshPrice(1), 23).bonusWhole).toBe(1221);
    expect(chestContentForEffort(300, meeshPrice(101), 23).bonusWhole).toBe(16_556);
  });
});

describe('l\'effort des missions du jour', () => {
  it('pèse la base de la difficulté plus les points par unité d\'objectif', () => {
    expect(missionEffort(mission('send-texts', 'easy', 5))).toBe(40 + 15 * 5);
    expect(missionEffort(mission('publish-story', 'medium', 1))).toBe(80 + 560);
    expect(missionEffort(mission('publish-posts', 'gold', 3))).toBe(320 + 950 * 3);
  });

  it('ne pèse que sa difficulté pour un gabarit inconnu, et comme une facile pour une difficulté inconnue', () => {
    expect(missionEffort(mission('retiré-du-catalogue', 'hard', 9))).toBe(160);
    expect(missionEffort(mission('send-texts', 'légendaire', 1))).toBe(40 + 15);
    expect(missionEffort(mission('send-texts', 'easy', Number.NaN))).toBe(40);
  });

  it('additionne les trois missions du jour', () => {
    expect(dayEffort([mission('send-texts', 'easy', 3), mission('send-texts', 'medium', 3), mission('send-texts', 'hard', 3)])).toBe(85 + 125 + 205);
    expect(dayEffort([])).toBe(0);
  });

  it('pèse davantage une mission d\'Or que la même difficile', () => {
    expect(missionEffort(mission('publish-reel', 'gold', 1))).toBeGreaterThan(missionEffort(mission('publish-reel', 'hard', 1)));
  });

  it('couvre le catalogue entre ses deux ancres : le jour le plus léger frôle le plancher, le plus lourd dépasse le plafond', () => {
    const lightest = (difficulty: 'easy' | 'medium' | 'hard') =>
      Math.min(...MISSION_TEMPLATES.filter((t) => t.difficulty === difficulty).map((t) => missionEffort(mission(t.key, difficulty, t.minTarget))));
    const heaviestGold = Math.max(
      ...MISSION_TEMPLATES.filter((t) => t.difficulty === 'gold' || t.difficulty === 'hard').map((t) => missionEffort(mission(t.key, 'gold', t.maxTarget))),
    );
    const floorDay = lightest('easy') + lightest('medium') + lightest('hard');
    expect(floorDay).toBeGreaterThanOrEqual(300);
    expect(floorDay).toBeLessThan(400);
    expect(heaviestGold).toBeGreaterThan(3000);
  });
});

describe('les points du coffre selon l\'effort', () => {
  it('vont de 500 à 10 000 sur une droite, bornés aux deux ancres', () => {
    expect(chestPointsForEffort(0)).toBe(500);
    expect(chestPointsForEffort(300)).toBe(500);
    expect(chestPointsForEffort(2400)).toBe(5250);
    expect(chestPointsForEffort(4500)).toBe(10_000);
    expect(chestPointsForEffort(90_000)).toBe(10_000);
    expect(chestPointsForEffort(Number.NaN)).toBe(500);
  });

  it('arrondissent au plus proche : 2,262 points par point d\'effort', () => {
    expect(chestPointsForEffort(301)).toBe(502);
    expect(chestPointsForEffort(415)).toBe(760);
    expect(chestPointsForEffort(1000)).toBe(2083);
  });

  it('ne baissent jamais quand l\'effort monte, et restent entiers', () => {
    const series = Array.from({ length: 4700 }, (_, effort) => chestPointsForEffort(effort));
    series.forEach((points, i) => {
      expect(Number.isInteger(points)).toBe(true);
      if (i > 0) expect(points).toBeGreaterThanOrEqual(series[i - 1]!);
    });
  });

  it('suivent les missions réellement tirées : un tirage du jour tombe entre les deux bornes', () => {
    const drawn = drawDailyMissions({ userId: 'u1', dayKey: '2026-10-05', level: 20, flameDays: 0, treasury: 0 }).missions;
    const points = chestPointsForEffort(dayEffort(drawn));
    expect(points).toBeGreaterThanOrEqual(500);
    expect(points).toBeLessThanOrEqual(10_000);
  });

  it('montent quand la difficile du jour devient une mission d\'Or', () => {
    const day = (top: string) => [mission('send-texts', 'easy', 5), mission('publish-story', 'medium', 1), mission('long-chat', top, 10)];
    expect(chestPointsForEffort(dayEffort(day('gold')))).toBeGreaterThan(chestPointsForEffort(dayEffort(day('hard'))));
  });
});

describe('la Gloire du coffre (porteur, 2026-11-05, #16414)', () => {
  it('une base de 1 250 à 3 000 sur la même droite d\'effort que les points', () => {
    expect(chestBaseGloryForEffort(0)).toBe(1250);
    expect(chestBaseGloryForEffort(300)).toBe(1250);
    expect(chestBaseGloryForEffort(1000)).toBe(1542);
    expect(chestBaseGloryForEffort(2400)).toBe(2125);
    expect(chestBaseGloryForEffort(4500)).toBe(3000);
    expect(chestBaseGloryForEffort(9000)).toBe(3000);
    expect(chestBaseGloryForEffort(Number.NaN)).toBe(1250);
  });

  it('monte avec l\'effort, jamais ne descend', () => {
    const glories = Array.from({ length: 4600 }, (_, effort) => chestBaseGloryForEffort(effort));
    glories.slice(1).forEach((glory, i) => expect(glory).toBeGreaterThanOrEqual(glories[i]!));
  });

  it('une prime de précocité de 2 800 dans la première heure, 0 à la dernière, linéaire par heure entière', () => {
    expect(chestEarlyGlory(0)).toBe(2800);
    expect(chestEarlyGlory(0.99)).toBe(2800);
    expect(chestEarlyGlory(1)).toBe(2678);
    expect(chestEarlyGlory(11)).toBe(1461);
    expect(chestEarlyGlory(22)).toBe(122);
    expect(chestEarlyGlory(23)).toBe(0);
  });

  it('un jour de jeu prolongé ne paie aucune précocité, une heure illisible non plus', () => {
    expect(chestEarlyGlory(24)).toBe(0);
    expect(chestEarlyGlory(40)).toBe(0);
    expect(chestEarlyGlory(Number.NaN)).toBe(0);
    expect(chestEarlyGlory(Number.POSITIVE_INFINITY)).toBe(0);
    expect(chestEarlyGlory(-3)).toBe(2800);
  });

  it('se lit avec les points et les primes possibles sur l\'effort, le cours et l\'heure', () => {
    expect(chestContentForEffort(300, 1221, 23)).toEqual({ points: 500, glory: 1250, earlyGlory: 0, bonusWhole: 1221, bonusFifth: 244 });
    expect(chestContentForEffort(4500, 16_556, 0)).toEqual({ points: 10_000, glory: 5800, earlyGlory: 2800, bonusWhole: 16_556, bonusFifth: 3311 });
    expect(chestContentForEffort(2400, 1221, 11)).toMatchObject({ glory: 2125 + 1461, earlyGlory: 1461 });
  });

  it('le coffre crédite la base et la précocité, et dit la précocité à part', () => {
    const early = dailyChest({ userId: 'u7', dayKey: '2026-10-08', effort: 4500, nextMeeshPrice: 1221, elapsedHours: 0 });
    const late = dailyChest({ userId: 'u7', dayKey: '2026-10-08', effort: 4500, nextMeeshPrice: 1221, elapsedHours: 23 });
    expect(early).toMatchObject({ glory: 5800, earlyGlory: 2800 });
    expect(late).toMatchObject({ glory: 3000, earlyGlory: 0 });
    expect({ ...early, glory: 0, earlyGlory: 0 }).toEqual({ ...late, glory: 0, earlyGlory: 0 });
  });

  it('tient ses bornes : 1 250 à 5 800', () => {
    expect([CHEST_GLORY_MIN, CHEST_GLORY_BASE_MAX, CHEST_EARLY_GLORY_MAX, CHEST_GLORY_MAX]).toEqual([1250, 3000, 2800, 5800]);
    expect(CHEST_ODDS.minGlory).toBe(CHEST_GLORY_MIN);
    expect(CHEST_ODDS.maxGlory).toBe(CHEST_GLORY_MAX);
  });
});

describe('l\'heure du jour de jeu (#16414)', () => {
  const midnight = new Date('2026-10-05T22:00:00Z');

  it('les heures entières écoulées depuis le début du jour', () => {
    expect(chestElapsedHours({ dayStartedAt: midnight, now: new Date('2026-10-05T22:59:59Z') })).toBe(0);
    expect(chestElapsedHours({ dayStartedAt: midnight, now: new Date('2026-10-05T23:00:00Z') })).toBe(1);
    expect(chestElapsedHours({ dayStartedAt: midnight, now: new Date('2026-10-06T21:30:00Z') })).toBe(23);
    expect(chestElapsedHours({ dayStartedAt: midnight, now: new Date('2026-10-07T03:00:00Z') })).toBe(29);
  });

  it('le début du jour est minuit du fuseau, ou l\'ouverture des missions si elle le précède', () => {
    const opened = [new Date('2026-10-05T22:10:00Z'), new Date('2026-10-05T22:05:00Z')];
    expect(chestDayStart({ localMidnight: midnight, missionsOpenedAt: opened })).toEqual(midnight);
    const shiftedWest = new Date('2026-10-06T09:00:00Z');
    expect(chestDayStart({ localMidnight: shiftedWest, missionsOpenedAt: opened })).toEqual(new Date('2026-10-05T22:05:00Z'));
    expect(chestDayStart({ localMidnight: midnight, missionsOpenedAt: [null, undefined] })).toEqual(midnight);
  });
});

describe('le cours de la prime, figé au début du jour de jeu (#10219)', () => {
  const now = new Date('2026-10-05T10:00:00Z');

  it('l’ouverture du jour de jeu : la plus ancienne mission tirée', () => {
    const missionsOpenedAt = [new Date('2026-10-05T08:00:00Z'), new Date('2026-10-05T06:00:00Z'), new Date('2026-10-05T09:00:00Z')];
    expect(chestPriceCutoff({ missionsOpenedAt, now })).toEqual(new Date('2026-10-05T06:00:00Z'));
  });

  it('jamais après maintenant, et maintenant quand aucune mission ne porte d’instant', () => {
    expect(chestPriceCutoff({ missionsOpenedAt: [new Date('2026-10-06T00:00:00Z')], now })).toEqual(now);
    expect(chestPriceCutoff({ missionsOpenedAt: [null, undefined, new Date(Number.NaN)], now })).toEqual(now);
    expect(chestPriceCutoff({ missionsOpenedAt: [], now })).toEqual(now);
  });
});
