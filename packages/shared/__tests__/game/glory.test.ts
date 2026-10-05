/**
 * Gloire et rangs (#9373) : un registre qui ne baisse jamais, dix rangs en
 * trois divisions, Mythe désigné par le serveur.
 */

import { describe, it, expect } from 'vitest';
import {
  GLORY_POINTS,
  GLORY_RANKS,
  gloryForAchievement,
  gloryForFlameRecords,
  gloryForNewLevels,
  gloryStanding,
} from '../../utils/game/glory.js';

describe('le barème des sources', () => {
  it('suit la conception', () => {
    expect(GLORY_POINTS.mint).toBe(100);
    expect(GLORY_POINTS.firstLevel).toBe(20);
    expect(GLORY_POINTS.goldMission).toBe(40);
    expect(GLORY_POINTS.leagueUp).toBe(30);
    expect(GLORY_POINTS.leagueCup).toBe(100);
    expect(GLORY_POINTS.season).toBe(500);
    expect(GLORY_POINTS.prestige).toBe(1000);
  });

  it('paie les succès selon leur rareté', () => {
    expect(gloryForAchievement('common')).toBe(10);
    expect(gloryForAchievement('rare')).toBe(25);
    expect(gloryForAchievement('epic')).toBe(60);
    expect(gloryForAchievement('legendary')).toBe(150);
    expect(gloryForAchievement('mythic')).toBe(400);
  });

  it('paie 20 par niveau franchi pour la première fois', () => {
    expect(gloryForNewLevels({ level: 34, previousRecord: 30 })).toBe(80);
    expect(gloryForNewLevels({ level: 30, previousRecord: 36 })).toBe(0);
  });

  it('paie chaque record de Flamme franchi, une fois', () => {
    expect(gloryForFlameRecords({ previousLongest: 0, longest: 6 })).toBe(0);
    expect(gloryForFlameRecords({ previousLongest: 6, longest: 7 })).toBe(50);
    expect(gloryForFlameRecords({ previousLongest: 6, longest: 31 })).toBe(200);
    expect(gloryForFlameRecords({ previousLongest: 0, longest: 365 })).toBe(2700);
    expect(gloryForFlameRecords({ previousLongest: 365, longest: 400 })).toBe(0);
  });
});

describe('les dix rangs', () => {
  it('porte dix clés et seuils stables', () => {
    expect(GLORY_RANKS.map((r) => [r.key, r.minGlory])).toEqual([
      ['murmure', 0],
      ['echo', 500],
      ['voix', 1500],
      ['conteur', 3500],
      ['passeur', 7000],
      ['polyglotte', 12_000],
      ['ambassadeur', 20_000],
      ['orateur', 32_000],
      ['oracle', 50_000],
      ['legende', 80_000],
    ]);
  });
});

describe('le rang et la division lus sur la Gloire', () => {
  it('commence Murmure III', () => {
    const s = gloryStanding({ glory: 0, mythic: false });
    expect(s.rank).toBe('murmure');
    expect(s.division).toBe(3);
  });

  it('coupe chaque intervalle en trois tiers égaux', () => {
    // Voix : 1 500 → 3 500, divisions à 2 166 et 2 833.
    expect(gloryStanding({ glory: 1500, mythic: false })).toMatchObject({ rank: 'voix', division: 3 });
    expect(gloryStanding({ glory: 2165, mythic: false })).toMatchObject({ rank: 'voix', division: 3 });
    expect(gloryStanding({ glory: 2166, mythic: false })).toMatchObject({ rank: 'voix', division: 2 });
    expect(gloryStanding({ glory: 2832, mythic: false })).toMatchObject({ rank: 'voix', division: 2 });
    expect(gloryStanding({ glory: 2833, mythic: false })).toMatchObject({ rank: 'voix', division: 1 });
    expect(gloryStanding({ glory: 3499, mythic: false })).toMatchObject({ rank: 'voix', division: 1 });
    expect(gloryStanding({ glory: 3500, mythic: false })).toMatchObject({ rank: 'conteur', division: 3 });
  });

  it('dit la Gloire manquante pour la division suivante', () => {
    const s = gloryStanding({ glory: 2000, mythic: false });
    expect(s.next).toEqual({ rank: 'voix', division: 2, minGlory: 2166 });
    expect(s.gloryMissing).toBe(166);
  });

  it('passe de la division I au rang suivant', () => {
    const s = gloryStanding({ glory: 3000, mythic: false });
    expect(s.next).toEqual({ rank: 'conteur', division: 3, minGlory: 3500 });
    expect(s.gloryMissing).toBe(500);
  });

  it('fait de Légende un rang sans plafond, en paliers de 40 000', () => {
    expect(gloryStanding({ glory: 80_000, mythic: false })).toMatchObject({ rank: 'legende', division: 3 });
    expect(gloryStanding({ glory: 119_999, mythic: false })).toMatchObject({ rank: 'legende', division: 3 });
    expect(gloryStanding({ glory: 120_000, mythic: false })).toMatchObject({ rank: 'legende', division: 2 });
    expect(gloryStanding({ glory: 160_000, mythic: false })).toMatchObject({ rank: 'legende', division: 1 });
    const top = gloryStanding({ glory: 900_000, mythic: false });
    expect(top).toMatchObject({ rank: 'legende', division: 1 });
    expect(top.next).toBeNull();
    expect(top.gloryMissing).toBeNull();
  });

  it('donne Mythe sur le drapeau du serveur, seulement à partir de Légende', () => {
    const mythe = gloryStanding({ glory: 200_000, mythic: true });
    expect(mythe.rank).toBe('mythe');
    expect(mythe.division).toBeNull();
    expect(mythe.next).toBeNull();
    expect(gloryStanding({ glory: 3000, mythic: true }).rank).toBe('voix');
  });

  it('place la progression dans la division', () => {
    const s = gloryStanding({ glory: 2000, mythic: false });
    expect(s.progress).toBeCloseTo((2000 - 1500) / (2166 - 1500), 6);
  });

  it('traite une Gloire illisible comme zéro', () => {
    expect(gloryStanding({ glory: Number.NaN, mythic: false }).rank).toBe('murmure');
    expect(gloryStanding({ glory: -10, mythic: false }).glory).toBe(0);
  });
});
