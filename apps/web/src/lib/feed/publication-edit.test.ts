import { describe, expect, test } from 'bun:test';

import { POST_CONTENT_MAX_LENGTH, POST_CONTENT_WARNING_REMAINING, publicationEditState } from './publication-edit';

/**
 * `publicationEditState` (#7534) — la loi PURE de la feuille d'édition,
 * miroir `EditPostSheet.swift:199-247` : `contentChanged`, `isValid` (réduite
 * au TEXTE — la clause « média restant » de :233-243 ne s'applique pas, cette
 * tranche ne porte que `content`) et `remainingChars`.
 */
describe('publicationEditState', () => {
  test('inchangé quand seul le BLANC diffère — un espace de tête ne rend pas « Publier » actif', () => {
    expect(publicationEditState({ original: 'a', draft: ' a ' }).changed).toBe(false);
  });

  test('changé dès qu’un caractère diffère', () => {
    expect(publicationEditState({ original: 'a', draft: 'ab' }).changed).toBe(true);
  });

  test('non soumissible à vide, ou blanc seul', () => {
    expect(publicationEditState({ original: 'a', draft: '' }).submittable).toBe(false);
    expect(publicationEditState({ original: 'a', draft: '   ' }).submittable).toBe(false);
  });

  test('non soumissible sans changement, même un texte valide', () => {
    expect(publicationEditState({ original: 'a', draft: 'a' }).submittable).toBe(false);
  });

  test(`la borne est à DEUX moitiés : ${POST_CONTENT_MAX_LENGTH} caractères passe, ${POST_CONTENT_MAX_LENGTH + 1} refuse`, () => {
    const atLimit = 'x'.repeat(POST_CONTENT_MAX_LENGTH);
    const overLimit = 'x'.repeat(POST_CONTENT_MAX_LENGTH + 1);
    expect(publicationEditState({ original: 'a', draft: atLimit }).submittable).toBe(true);
    expect(publicationEditState({ original: 'a', draft: overLimit }).submittable).toBe(false);
  });

  test('`remaining` compte le texte BRUT, jamais négatif', () => {
    expect(publicationEditState({ original: '', draft: 'abc' }).remaining).toBe(POST_CONTENT_MAX_LENGTH - 3);
    const over = 'x'.repeat(POST_CONTENT_MAX_LENGTH + 50);
    expect(publicationEditState({ original: '', draft: over }).remaining).toBe(0);
  });

  test(`« warning » s’allume SOUS ${POST_CONTENT_WARNING_REMAINING} restants, pas exactement à la limite`, () => {
    const atThreshold = 'x'.repeat(POST_CONTENT_MAX_LENGTH - POST_CONTENT_WARNING_REMAINING);
    const belowThreshold = 'x'.repeat(POST_CONTENT_MAX_LENGTH - POST_CONTENT_WARNING_REMAINING + 1);
    expect(publicationEditState({ original: '', draft: atThreshold }).warning).toBe(false);
    expect(publicationEditState({ original: '', draft: belowThreshold }).warning).toBe(true);
  });
});
