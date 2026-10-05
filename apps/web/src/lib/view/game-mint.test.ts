import { describe, expect, test } from 'bun:test';

import { badgesDroppedByMint } from './game-mint';

/**
 * LES BADGES QUE LA FRAPPE ÉTEINT (#9383) — l'aperçu les annonce AVANT le geste.
 * Le plan de débit est la loi partagée (`computeMeeshMintPlan`) : ce témoin ne
 * mesure que la traduction « actions reprises → paliers perdus ».
 */
describe('badgesDroppedByMint', () => {
  test('un axe à 100 actions et 2000 points : 1221 points reprennent 61 actions, deux paliers tombent', () => {
    const counters = [{ axisKey: 'content.text_message', count: 100, points: 2000 }];
    expect(badgesDroppedByMint(counters, 1221)).toBe(2);
  });

  test('un serveur qui ne sert pas les points : « inconnu », jamais un zéro qui promettrait qu’aucun badge ne tombe', () => {
    expect(badgesDroppedByMint([{ axisKey: 'content.text_message', count: 100 }], 1221)).toBeNull();
  });

  test('des points insuffisants : aucune frappe, aucun badge perdu', () => {
    expect(badgesDroppedByMint([{ axisKey: 'content.text_message', count: 10, points: 90 }], 1221)).toBe(0);
  });

  test('les conversations rendent leurs points sans éteindre un badge', () => {
    expect(badgesDroppedByMint([{ axisKey: 'conversation.private', count: 60, points: 3000 }], 1221)).toBe(0);
  });
});
