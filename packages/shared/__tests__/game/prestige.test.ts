/**
 * Le Prestige (#9389) : niveau 100 → niveau 1, une étoile (cinq au plus),
 * +1 000 de Gloire, un trophée numéroté — et rien de perdu côté trésor ni rang.
 */

import { describe, it, expect } from 'vitest';
import { prestigeTransition } from '../../utils/game/prestige.js';
import { GLORY_POINTS } from '../../utils/game/glory.js';
import { levelThreshold } from '../../utils/game/levels.js';

const AT_100 = levelThreshold(100);

describe('le passage en Prestige', () => {
  it('remet le niveau et son record à 1, pose une étoile, rend +1 000 de Gloire et le trophée numéroté', () => {
    expect(prestigeTransition({ score: AT_100, prestige: 0, levelRecord: 100 })).toEqual({
      allowed: true,
      prestigeAfter: 1,
      scoreAfter: 0,
      levelAfter: 1,
      levelRecordAfter: 1,
      gloryGained: GLORY_POINTS.prestige,
      trophyKey: 'trophy.prestige.1',
    });
  });

  it('numérote le trophée sur l\'étoile posée', () => {
    expect(prestigeTransition({ score: AT_100 + 5000, prestige: 4, levelRecord: 100 })).toMatchObject({ allowed: true, prestigeAfter: 5, trophyKey: 'trophy.prestige.5' });
  });

  it('exige le niveau 100 gravé au record : le million ne suffit pas sans ses dix étapes (#9706)', () => {
    expect(prestigeTransition({ score: AT_100, prestige: 0, levelRecord: 99 })).toEqual({ allowed: false, reason: 'level-too-low' });
    expect(prestigeTransition({ score: AT_100, prestige: 0, levelRecord: null })).toEqual({ allowed: false, reason: 'level-too-low' });
  });

  it('exige le niveau 100', () => {
    expect(prestigeTransition({ score: AT_100 - 1, prestige: 0, levelRecord: 100 })).toEqual({ allowed: false, reason: 'level-too-low' });
    expect(prestigeTransition({ score: 0, prestige: 0, levelRecord: 100 })).toEqual({ allowed: false, reason: 'level-too-low' });
  });

  it('s\'arrête à cinq étoiles', () => {
    expect(prestigeTransition({ score: AT_100, prestige: 5, levelRecord: 100 })).toEqual({ allowed: false, reason: 'at-maximum' });
    expect(prestigeTransition({ score: 10, prestige: 7, levelRecord: 100 })).toEqual({ allowed: false, reason: 'at-maximum' });
  });

  it('ne dit rien du trésor ni du rang : ils ne bougent pas', () => {
    const result = prestigeTransition({ score: AT_100, prestige: 0, levelRecord: 100 });
    expect(Object.keys(result)).not.toContain('balance');
    expect(Object.keys(result)).not.toContain('glory');
  });

  it('lit une étoile illisible comme zéro', () => {
    expect(prestigeTransition({ score: AT_100, prestige: Number.NaN, levelRecord: 100 })).toMatchObject({ allowed: true, prestigeAfter: 1 });
  });
});
