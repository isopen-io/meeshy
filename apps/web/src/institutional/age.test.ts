import { describe, expect, test } from 'bun:test';

import { PAGE_PRIVACY } from './privacy';
import { PAGE_TERMS } from './terms';
import { pageText } from './text';

/**
 * LES TEXTES LÉGAUX DISENT LA RÈGLE DE L'ÂGE (#9928, décision #9926) : 13 ans
 * minimum, Meeshy Global ouverte en écriture à 18 ans, l'âge déclaré de façon
 * facultative. Une règle appliquée par le produit et tue par ses conditions
 * promettrait moins qu'elle ne fait.
 */
describe.each([
  ['Conditions d’utilisation', PAGE_TERMS],
  ['Politique de confidentialité', PAGE_PRIVACY],
] as const)('%s — la règle de l’âge', (_name, page) => {
  const text = pageText(page);

  test('l’âge minimum est de 13 ans', () => {
    expect(text).toMatch(/13 ans et plus/);
  });

  test('Meeshy Global n’est ouverte en écriture qu’à partir de 18 ans', () => {
    expect(text).toMatch(/Meeshy Global[^.]*écriture[^.]*18 ans/);
  });

  test('l’âge se déclare facultativement', () => {
    expect(text).toMatch(/date de naissance[^.]*facultati/i);
  });

  test('la date de mise à jour suit le changement', () => {
    expect(page.mention).toBe('Dernière mise à jour : 22 octobre 2026');
  });
});
