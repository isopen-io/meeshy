/**
 * Gloire et rangs (#9373, échelle de #9636) : un registre qui ne baisse jamais,
 * dix rangs en cinq divisions (V la plus faible, I la plus haute), Mythe
 * désigné par le serveur, la division héritée (III, II, I) gardée sur le fil.
 */

import { describe, it, expect } from 'vitest';
import {
  GLORY_DIVISIONS,
  GLORY_POINTS,
  GLORY_RANKS,
  MISSION_GLORY,
  MYTHE_GLORY,
  MYTHE_SIZE,
  gloryForAchievement,
  gloryForFlameRecords,
  gloryForMission,
  gloryForNewLevels,
  gloryLadder,
  gloryStanding,
  isMythicNumber,
  legacyGloryDivision,
} from '../../utils/game/glory.js';

const at = (glory: number) => gloryStanding({ glory });

describe('le barème des sources (#9636)', () => {
  it('suit la décision du porteur', () => {
    expect(GLORY_POINTS).toEqual({ mint: 1000, firstLevel: 100, leagueUp: 300, leagueCup: 1000, season: 5000, prestige: 10_000 });
  });

  it('paie les missions par difficulté : 40 / 100 / 250 / 500', () => {
    expect(MISSION_GLORY).toEqual({ easy: 40, medium: 100, hard: 250, gold: 500 });
    expect(gloryForMission('easy')).toBe(40);
    expect(gloryForMission('medium')).toBe(100);
    expect(gloryForMission('hard')).toBe(250);
    expect(gloryForMission('gold')).toBe(500);
  });

  it('paie les succès selon leur rareté, dix fois l’ancien barème', () => {
    expect(gloryForAchievement('common')).toBe(100);
    expect(gloryForAchievement('rare')).toBe(250);
    expect(gloryForAchievement('epic')).toBe(600);
    expect(gloryForAchievement('legendary')).toBe(1500);
    expect(gloryForAchievement('mythic')).toBe(4000);
  });

  it('paie 100 par niveau franchi pour la première fois', () => {
    expect(gloryForNewLevels({ level: 34, previousRecord: 30 })).toBe(400);
    expect(gloryForNewLevels({ level: 30, previousRecord: 36 })).toBe(0);
  });

  it('paie chaque record de Flamme franchi, une fois', () => {
    expect(gloryForFlameRecords({ previousLongest: 0, longest: 6 })).toBe(0);
    expect(gloryForFlameRecords({ previousLongest: 6, longest: 7 })).toBe(500);
    expect(gloryForFlameRecords({ previousLongest: 6, longest: 31 })).toBe(2000);
    expect(gloryForFlameRecords({ previousLongest: 0, longest: 365 })).toBe(27000);
    expect(gloryForFlameRecords({ previousLongest: 365, longest: 400 })).toBe(0);
  });
});

describe('les dix rangs et le Mythe', () => {
  it('porte dix clés et les seuils du porteur, Mythe à un million et cent places', () => {
    expect(GLORY_RANKS.map((r) => [r.key, r.minGlory])).toEqual([
      ['murmure', 0],
      ['echo', 2000],
      ['voix', 6000],
      ['conteur', 15_000],
      ['passeur', 35_000],
      ['polyglotte', 70_000],
      ['ambassadeur', 130_000],
      ['orateur', 230_000],
      ['oracle', 380_000],
      ['legende', 600_000],
    ]);
    expect(MYTHE_GLORY).toBe(1_000_000);
    expect(MYTHE_SIZE).toBe(100);
  });

  it('coupe chaque rang en cinq divisions de la largeur décidée', () => {
    const widths = { murmure: 400, echo: 800, voix: 1800, conteur: 4000, passeur: 7000, polyglotte: 12_000, ambassadeur: 20_000, orateur: 30_000, oracle: 44_000, legende: 80_000 };
    const ladder = gloryLadder();
    expect(ladder).toHaveLength(50);
    for (const rank of GLORY_RANKS) {
      const steps = ladder.filter((s) => s.rank === rank.key);
      expect(steps.map((s) => s.division5)).toEqual([5, 4, 3, 2, 1]);
      expect(steps.map((s) => s.minGlory)).toEqual([0, 1, 2, 3, 4].map((k) => rank.minGlory + k * widths[rank.key]));
    }
  });

  it('cite l’exemple d’Écho : V 2 000, IV 2 800, III 3 600, II 4 400, I 5 200', () => {
    expect(gloryLadder().filter((s) => s.rank === 'echo').map((s) => [s.division5, s.minGlory])).toEqual([
      [5, 2000],
      [4, 2800],
      [3, 3600],
      [2, 4400],
      [1, 5200],
    ]);
  });
});

describe('la frontière de chaque division, de V à I', () => {
  it('chaque seuil ouvre sa division, la Gloire d’avant reste dans la précédente', () => {
    const ladder = gloryLadder();
    ladder.forEach((step, index) => {
      expect(at(step.minGlory)).toMatchObject({ rank: step.rank, division5: step.division5, divisionMinGlory: step.minGlory });
      if (index === 0) return;
      const before = ladder[index - 1]!;
      expect(at(step.minGlory - 1)).toMatchObject({ rank: before.rank, division5: before.division5 });
    });
  });

  it('commence Murmure V et finit Légende I, sans plafond sous le Mythe', () => {
    expect(at(0)).toMatchObject({ rank: 'murmure', division5: 5, division: 3 });
    expect(at(919_999)).toMatchObject({ rank: 'legende', division5: 2 });
    expect(at(920_000)).toMatchObject({ rank: 'legende', division5: 1, division: 1, next: null, gloryMissing: null, progress: 1 });
  });

  it('999 999 et 1 000 000 restent Légende I sans place : le seuil seul ne fait pas le Mythe', () => {
    expect(at(999_999)).toMatchObject({ rank: 'legende', division5: 1, mythic: null });
    expect(at(1_000_000)).toMatchObject({ rank: 'legende', division5: 1, mythic: null });
    expect(at(5_000_000)).toMatchObject({ rank: 'legende', division5: 1, next: null });
  });

  it('dit la Gloire manquante pour la division suivante, et passe de I au rang suivant', () => {
    const s = at(2000);
    expect(s.next).toEqual({ rank: 'echo', division: 3, division5: 4, minGlory: 2800 });
    expect(s.gloryMissing).toBe(800);
    const top = at(5200);
    expect(top.next).toEqual({ rank: 'voix', division: 3, division5: 5, minGlory: 6000 });
    expect(top.gloryMissing).toBe(800);
  });

  it('place la progression dans la division', () => {
    expect(at(2400).progress).toBeCloseTo(0.5, 6);
    expect(at(2000).progress).toBe(0);
  });

  it('traite une Gloire illisible comme zéro', () => {
    expect(at(Number.NaN).rank).toBe('murmure');
    expect(at(-10).glory).toBe(0);
  });
});

describe('la division héritée du fil (#9223)', () => {
  it('projette V et IV sur III, III et II sur II, I sur I', () => {
    expect(GLORY_DIVISIONS.map((d) => [d, legacyGloryDivision(d)])).toEqual([
      [5, 3],
      [4, 3],
      [3, 2],
      [2, 2],
      [1, 1],
    ]);
  });

  it('ne sert jamais une division héritée hors de 1–3, à aucune marche', () => {
    for (const step of gloryLadder()) {
      expect([1, 2, 3]).toContain(step.division);
      expect(at(step.minGlory).division).toBe(legacyGloryDivision(step.division5));
    }
  });
});

describe('le Mythe vient du serveur', () => {
  it('rend Mythe, sans division, avec son numéro, quand le serveur sert la place', () => {
    expect(gloryStanding({ glory: 1_000_000, mythicSeat: { number: 7, edition: 7 } })).toEqual({
      glory: 1_000_000,
      rank: 'mythe',
      division: null,
      division5: null,
      divisionMinGlory: null,
      next: null,
      gloryMissing: null,
      progress: 1,
      mythic: { number: 7, edition: 7 },
    });
  });

  it('la place ne se perd pas : une Gloire corrigée sous le seuil ne la retire pas', () => {
    expect(gloryStanding({ glory: 3000, mythicSeat: { number: 100, edition: 131 } })).toMatchObject({ rank: 'mythe', mythic: { number: 100, edition: 131 } });
  });

  it('accepte le drapeau seul d’un appelant qui ne connaît que le rang servi', () => {
    expect(gloryStanding({ glory: 1_200_000, mythic: true })).toMatchObject({ rank: 'mythe', mythic: null });
  });

  it('ignore une place hors des cent, ou une émission illisible', () => {
    for (const bogus of [0, 101, 1.5, -3, Number.NaN]) {
      expect(gloryStanding({ glory: 1_000_000, mythicSeat: { number: bogus, edition: 1 } }).rank).toBe('legende');
      expect(gloryStanding({ glory: 1_000_000, mythicSeat: { number: 1, edition: bogus === 101 ? 0 : bogus } }).rank).toBe('legende');
    }
    expect(isMythicNumber(1)).toBe(true);
    expect(isMythicNumber(100)).toBe(true);
    expect(isMythicNumber(101)).toBe(false);
  });
});
