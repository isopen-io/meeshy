import { describe, it, expect } from 'vitest';
import {
  CHEST_ODDS,
  MEESH_FRAGMENTS_PER_MEESH,
  chestContentForEffort,
  chestFragmentsForPoints,
  chestPointsForEffort,
  dailyChest,
  dayEffort,
  meeshFragmentProgress,
  missionEffort,
} from '../../utils/game/chest.js';
import { seededRng } from '../../utils/game/day-prng.js';
import { gloryForChest } from '../../utils/game/glory.js';
import { MISSION_TEMPLATES } from '../../utils/game/mission-catalog.js';
import { drawDailyMissions } from '../../utils/game/missions.js';

const mission = (templateKey: string, difficulty: string, target: number) => ({ templateKey, difficulty, target });

describe('le coffre du jour', () => {
  it('expose ses probabilités et ses bornes avant l\'ouverture', () => {
    expect(CHEST_ODDS).toEqual({
      minPoints: 100,
      maxPoints: 10_000,
      fragment: 1 / 6,
      freeze: 1 / 20,
      minGlory: 10,
      maxGlory: 1000,
      minMeeshFragments: 1,
      maxMeeshFragments: 4,
      meeshFragmentsPerMeesh: 5,
    });
  });

  it('est déterministe pour un utilisateur, un jour et un effort', () => {
    expect(dailyChest({ userId: 'u1', dayKey: '2026-10-05', effort: 900 })).toEqual(dailyChest({ userId: 'u1', dayKey: '2026-10-05', effort: 900 }));
  });

  it('garde le fragment en prime et le gel d\'avant : la première valeur du générateur reste consommée', () => {
    for (let u = 0; u < 200; u++) {
      const rng = seededRng({ userId: `u${u}`, dayKey: '2026-10-05', salt: 'chest' });
      rng();
      const fragment = rng() < 1 / 6;
      const freeze = rng() < 1 / 20;
      expect(dailyChest({ userId: `u${u}`, dayKey: '2026-10-05', effort: 1200 })).toMatchObject({ fragment, freeze });
    }
  });

  it('ne fait dépendre que les points, la Gloire et les fragments certains de l\'effort, jamais les tirages', () => {
    const light = dailyChest({ userId: 'u7', dayKey: '2026-10-08', effort: 300 });
    const heavy = dailyChest({ userId: 'u7', dayKey: '2026-10-08', effort: 4500 });
    expect({ fragment: light.fragment, freeze: light.freeze }).toEqual({ fragment: heavy.fragment, freeze: heavy.freeze });
    expect(heavy.points).toBeGreaterThan(light.points);
  });

  it('tient ses probabilités sur un grand nombre de coffres', () => {
    const N = 6000;
    const chests = Array.from({ length: N }, (_, u) => dailyChest({ userId: `user-${u}`, dayKey: '2026-10-05', effort: 600 }));
    const fragments = chests.filter((c) => c.fragment).length / N;
    const freezes = chests.filter((c) => c.freeze).length / N;
    expect(fragments).toBeGreaterThan(1 / 6 - 0.03);
    expect(fragments).toBeLessThan(1 / 6 + 0.03);
    expect(freezes).toBeGreaterThan(1 / 20 - 0.02);
    expect(freezes).toBeLessThan(1 / 20 + 0.02);
  });

  it('compte le fragment en prime dans les fragments de Meesh', () => {
    for (let u = 0; u < 300; u++) {
      const chest = dailyChest({ userId: `p${u}`, dayKey: '2026-10-05', effort: 300 });
      expect(chest.meeshFragments).toBe(1 + (chest.fragment ? 1 : 0));
    }
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
  it('vont de 100 à 10 000 sur une droite, bornés aux deux ancres', () => {
    expect(chestPointsForEffort(0)).toBe(100);
    expect(chestPointsForEffort(300)).toBe(100);
    expect(chestPointsForEffort(2400)).toBe(5050);
    expect(chestPointsForEffort(4500)).toBe(10_000);
    expect(chestPointsForEffort(90_000)).toBe(10_000);
    expect(chestPointsForEffort(Number.NaN)).toBe(100);
  });

  it('arrondissent au plus proche : 2,357 points par point d\'effort', () => {
    expect(chestPointsForEffort(301)).toBe(102);
    expect(chestPointsForEffort(415)).toBe(371);
    expect(chestPointsForEffort(1000)).toBe(1750);
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
    expect(points).toBeGreaterThanOrEqual(100);
    expect(points).toBeLessThanOrEqual(10_000);
  });

  it('montent quand la difficile du jour devient une mission d\'Or', () => {
    const day = (top: string) => [mission('send-texts', 'easy', 5), mission('publish-story', 'medium', 1), mission('long-chat', top, 10)];
    expect(chestPointsForEffort(dayEffort(day('gold')))).toBeGreaterThan(chestPointsForEffort(dayEffort(day('hard'))));
  });
});

describe('la Gloire et les fragments certains', () => {
  it('donnent un point de Gloire pour dix points', () => {
    expect(gloryForChest(100)).toBe(10);
    expect(gloryForChest(1759)).toBe(175);
    expect(gloryForChest(10_000)).toBe(1000);
    expect(gloryForChest(-5)).toBe(0);
  });

  it('donnent 1 fragment, 2 dès 2 500 points, 3 dès 7 500', () => {
    expect(chestFragmentsForPoints(100)).toBe(1);
    expect(chestFragmentsForPoints(2499)).toBe(1);
    expect(chestFragmentsForPoints(2500)).toBe(2);
    expect(chestFragmentsForPoints(7499)).toBe(2);
    expect(chestFragmentsForPoints(7500)).toBe(3);
    expect(chestFragmentsForPoints(10_000)).toBe(3);
  });

  it('se lisent ensemble sur l\'effort', () => {
    expect(chestContentForEffort(300)).toEqual({ points: 100, glory: 10, meeshFragments: 1 });
    expect(chestContentForEffort(4500)).toEqual({ points: 10_000, glory: 1000, meeshFragments: 3 });
  });
});

describe('les fragments de Meesh', () => {
  it('se comptent en poche : gagnés aux coffres moins consommés par les frappes, cinq par frappe gratuite', () => {
    expect(MEESH_FRAGMENTS_PER_MEESH).toBe(5);
    expect(meeshFragmentProgress({ earned: 0, spent: 0 })).toEqual({ held: 0, perMeesh: 5 });
    expect(meeshFragmentProgress({ earned: 13, spent: 5 })).toEqual({ held: 8, perMeesh: 5 });
    expect(meeshFragmentProgress({ earned: 3, spent: 5 })).toEqual({ held: 0, perMeesh: 5 });
    expect(meeshFragmentProgress({ earned: Number.NaN, spent: 0 })).toEqual({ held: 0, perMeesh: 5 });
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
