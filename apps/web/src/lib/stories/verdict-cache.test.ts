import { describe, expect, test } from 'bun:test';

import { verdictKey } from './verdict-cache';

/**
 * `verdictKey` (T12, #6899) — la clé de cache du verdict `imageOnlyPresentation`
 * pour une story, miroir de `StoryImageOnlyVerdictCache.key` (§ 1.4 de la
 * spécification `stories-lecteur` : « le lecteur cache le verdict par
 * `story.id|chaîne|nb traductions|taille` »). Un texte TRADUIT change la
 * longueur mesurée : la clé doit donc changer avec le nombre de traductions
 * connues, pas seulement avec la chaîne du prisme.
 */
describe('verdictKey — story.id | chaîne | nb traductions | taille (T12)', () => {
  const base = { storyId: 's1', chain: ['fr', 'en'], translationCounts: { t1: 2 }, canvasSize: { width: 1080, height: 1920 } };

  test('deux appels identiques rendent la MÊME clé', () => {
    expect(verdictKey(base)).toBe(verdictKey({ ...base }));
  });

  test('une story différente change la clé', () => {
    expect(verdictKey(base)).not.toBe(verdictKey({ ...base, storyId: 's2' }));
  });

  test('une chaîne de langues différente (même longueur) change la clé', () => {
    expect(verdictKey(base)).not.toBe(verdictKey({ ...base, chain: ['en', 'fr'] }));
  });

  test('un nombre de traductions différent change la clé — un texte traduit changera la longueur mesurée', () => {
    expect(verdictKey(base)).not.toBe(verdictKey({ ...base, translationCounts: { t1: 3 } }));
  });

  test('une taille de canvas différente change la clé', () => {
    expect(verdictKey(base)).not.toBe(verdictKey({ ...base, canvasSize: { width: 400, height: 700 } }));
  });

  test("l'ORDRE des clés de `translationCounts` n'affecte pas la clé", () => {
    expect(verdictKey({ ...base, translationCounts: { a: 1, b: 2 } })).toBe(verdictKey({ ...base, translationCounts: { b: 2, a: 1 } }));
  });
});
