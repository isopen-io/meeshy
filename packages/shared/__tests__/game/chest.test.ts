import { describe, it, expect } from 'vitest';
import {
  CHEST_ODDS,
  chestBonusAmounts,
  chestPriceCutoff,
  chestContentForEffort,
  chestPointsForEffort,
  dailyChest,
  dayEffort,
  missionEffort,
} from '../../utils/game/chest.js';
import { meeshPrice } from '../../utils/game/mint.js';
import { seededRng } from '../../utils/game/day-prng.js';
import { gloryForChest } from '../../utils/game/glory.js';
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
      minGlory: 50,
      maxGlory: 1000,
      bonusWhole: 1 / 20,
      bonusFifth: 1 / 6,
    });
  });

  it('est déterministe pour un utilisateur, un jour et un effort', () => {
    expect(dailyChest({ userId: 'u1', dayKey: '2026-10-05', effort: 900, nextMeeshPrice: 1221 })).toEqual(dailyChest({ userId: 'u1', dayKey: '2026-10-05', effort: 900, nextMeeshPrice: 1221 }));
  });

  it('garde le fragment en prime et le gel d\'avant : la première valeur du générateur reste consommée', () => {
    for (let u = 0; u < 200; u++) {
      const rng = seededRng({ userId: `u${u}`, dayKey: '2026-10-05', salt: 'chest' });
      rng();
      const fragment = rng() < 1 / 6;
      const freeze = rng() < 1 / 20;
      expect(dailyChest({ userId: `u${u}`, dayKey: '2026-10-05', effort: 1200, nextMeeshPrice: 1221 })).toMatchObject({ fragment, freeze });
    }
  });

  it('ne fait dépendre que les points et la Gloire de l\'effort, jamais les tirages', () => {
    const light = dailyChest({ userId: 'u7', dayKey: '2026-10-08', effort: 300, nextMeeshPrice: 1221 });
    const heavy = dailyChest({ userId: 'u7', dayKey: '2026-10-08', effort: 4500, nextMeeshPrice: 1221 });
    expect({ fragment: light.fragment, freeze: light.freeze, bonus: light.bonus }).toEqual({ fragment: heavy.fragment, freeze: heavy.freeze, bonus: heavy.bonus });
    expect(heavy.points).toBeGreaterThan(light.points);
  });

  it('tient ses probabilités sur un grand nombre de coffres', () => {
    const N = 6000;
    const chests = Array.from({ length: N }, (_, u) => dailyChest({ userId: `user-${u}`, dayKey: '2026-10-05', effort: 600, nextMeeshPrice: 1221 }));
    const fragments = chests.filter((c) => c.fragment).length / N;
    const freezes = chests.filter((c) => c.freeze).length / N;
    expect(fragments).toBeGreaterThan(1 / 6 - 0.03);
    expect(fragments).toBeLessThan(1 / 6 + 0.03);
    expect(freezes).toBeGreaterThan(1 / 20 - 0.02);
    expect(freezes).toBeLessThan(1 / 20 + 0.02);
  });

  it('ne donne jamais plus d\'UN fragment d\'étoile : `fragment` est un booléen', () => {
    for (let u = 0; u < 300; u++) {
      expect(typeof dailyChest({ userId: `p${u}`, dayKey: '2026-10-05', effort: 4500, nextMeeshPrice: 16_556 }).fragment).toBe('boolean');
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
      const chest = dailyChest({ userId: `b${u}`, dayKey: '2026-10-09', effort: 300, nextMeeshPrice: 1587 });
      const bonus = whole ? 'whole' : fifth ? 'fifth' : 'none';
      const bonusPoints = whole ? 1587 : fifth ? 317 : 0;
      expect(chest).toMatchObject({ bonus, bonusPoints, points: 500 + bonusPoints, glory: 50 });
    }
  });

  it('se crédite dans `points` (ce que lit un ancien client), sans Gloire de plus', () => {
    const all = Array.from({ length: 2000 }, (_, u) => dailyChest({ userId: `c${u}`, dayKey: '2026-10-09', effort: 1000, nextMeeshPrice: 1221 }));
    const whole = all.find((c) => c.bonus === 'whole')!;
    const fifth = all.find((c) => c.bonus === 'fifth')!;
    expect(whole).toMatchObject({ points: 2083 + 1221, bonusPoints: 1221, glory: 208 });
    expect(fifth).toMatchObject({ points: 2083 + 244, bonusPoints: 244, glory: 208 });
  });

  it('tient ses probabilités : 1/20 entière, puis 19/20 × 1/6 d\'un cinquième', () => {
    const N = 12_000;
    const all = Array.from({ length: N }, (_, u) => dailyChest({ userId: `d${u}`, dayKey: '2026-10-09', effort: 600, nextMeeshPrice: 1221 }));
    const whole = all.filter((c) => c.bonus === 'whole').length / N;
    const fifth = all.filter((c) => c.bonus === 'fifth').length / N;
    expect(Math.abs(whole - 1 / 20)).toBeLessThan(0.012);
    expect(Math.abs(fifth - (19 / 20) * (1 / 6))).toBeLessThan(0.02);
  });

  it('suit le cours du compte : plus de Meeshes frappées, une prime plus grosse', () => {
    expect(chestContentForEffort(300, meeshPrice(1)).bonusWhole).toBe(1221);
    expect(chestContentForEffort(300, meeshPrice(101)).bonusWhole).toBe(16_556);
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

describe('la Gloire', () => {
  it('donne un point de Gloire pour dix points', () => {
    expect(gloryForChest(500)).toBe(50);
    expect(gloryForChest(1759)).toBe(175);
    expect(gloryForChest(10_000)).toBe(1000);
    expect(gloryForChest(-5)).toBe(0);
  });

  it('se lit avec les points et les primes possibles sur l\'effort et le cours', () => {
    expect(chestContentForEffort(300, 1221)).toEqual({ points: 500, glory: 50, bonusWhole: 1221, bonusFifth: 244 });
    expect(chestContentForEffort(4500, 16_556)).toEqual({ points: 10_000, glory: 1000, bonusWhole: 16_556, bonusFifth: 3311 });
  });
});

describe('le coffre donne au moins 500 points (porteur, 2026-10-10, 3e précision)', () => {
  it('500 points au jour le plus léger, 10 000 au plus lourd, la Gloire de 50 à 1 000', () => {
    expect(chestPointsForEffort(0)).toBe(500);
    expect(chestPointsForEffort(300)).toBe(500);
    expect(chestPointsForEffort(4500)).toBe(10_000);
    expect(CHEST_ODDS.minPoints).toBe(500);
    expect(CHEST_ODDS.minGlory).toBe(50);
    expect(CHEST_ODDS.maxGlory).toBe(1000);
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
