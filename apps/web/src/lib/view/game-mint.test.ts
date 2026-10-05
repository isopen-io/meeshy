import { describe, expect, test } from 'bun:test';

import { mintBadgeImpact } from './game-mint';

/**
 * CE QUE LA FRAPPE ÉTEINT (#9383, #9379) — l'aperçu annonce les badges, le
 * guide la distance du plus proche. Le plan de débit est la loi partagée
 * (`computeMeeshMintPlan`) : ces témoins ne mesurent que la traduction
 * « actions reprises → paliers perdus ».
 */
describe('mintBadgeImpact', () => {
  test('un axe à 100 actions et 2000 points : 1221 points reprennent 61 actions, deux paliers tombent', () => {
    const counters = [{ axisKey: 'content.text_message', count: 100, points: 2000 }];
    expect(mintBadgeImpact(counters, 1221)?.lost).toBe(2);
  });

  test('le plus proche palier perdu se rallume en 11 actions (50 − 39)', () => {
    const counters = [{ axisKey: 'content.text_message', count: 100, points: 2000 }];
    expect(mintBadgeImpact(counters, 1221)?.regain).toBe(11);
  });

  test('un serveur qui ne sert pas les points : « inconnu », jamais un zéro qui promettrait qu’aucun badge ne tombe', () => {
    expect(mintBadgeImpact([{ axisKey: 'content.text_message', count: 100 }], 1221)).toBeNull();
  });

  test('des points insuffisants : aucune frappe, rien ne tombe', () => {
    expect(mintBadgeImpact([{ axisKey: 'content.text_message', count: 10, points: 90 }], 1221)).toEqual({ lost: 0, regain: 0 });
  });

  test('les conversations rendent leurs points sans éteindre un badge', () => {
    expect(mintBadgeImpact([{ axisKey: 'conversation.private', count: 60, points: 3000 }], 1221)).toEqual({ lost: 0, regain: 0 });
  });
});
