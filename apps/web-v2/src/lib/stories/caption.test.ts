import { describe, expect, test } from 'bun:test';

import { captionFor, composeOverlayText, isDerivedCaption, resolveStoryCaption } from './caption';

describe('composeOverlayText', () => {
  test('joint les textes non blancs par UN espace', () => {
    expect(composeOverlayText(['Bonjour', 'le monde'])).toBe('Bonjour le monde');
  });

  test('ignore les textes blancs', () => {
    expect(composeOverlayText(['Bonjour', '  ', 'le monde'])).toBe('Bonjour le monde');
  });

  test('une liste vide compose une chaîne vide', () => {
    expect(composeOverlayText([])).toBe('');
  });
});

describe('isDerivedCaption — ÉGALITÉ STRICTE, jamais une inclusion', () => {
  test('le contenu ÉGAL à la composition des calques EST dérivé', () => {
    expect(isDerivedCaption('Bonjour le monde', ['Bonjour', 'le monde'])).toBe(true);
  });

  test('un contenu qui CONTIENT la composition sans lui être égal n\'est PAS dérivé', () => {
    expect(isDerivedCaption('Bonjour le monde, ça va ?', ['Bonjour', 'le monde'])).toBe(false);
  });

  test('aucun calque texte ⇒ dérivé seulement si le contenu est vide', () => {
    expect(isDerivedCaption('', [])).toBe(true);
    expect(isDerivedCaption('Une légende', [])).toBe(false);
  });
});

describe('captionFor — on décide sur l\'ORIGINAL, on rend le RÉSOLU', () => {
  test('un contenu vide ne produit pas de légende', () => {
    expect(captionFor({ content: '', resolvedContent: '', overlayTexts: [] })).toBeNull();
  });

  test('un contenu DÉRIVÉ des calques ne produit pas de légende (déjà affiché sur la scène)', () => {
    expect(
      captionFor({ content: 'Bonjour le monde', resolvedContent: 'Hello world', overlayTexts: ['Bonjour', 'le monde'] }),
    ).toBeNull();
  });

  test('un contenu NON dérivé rend le texte RÉSOLU (traduit), jamais l\'original', () => {
    expect(captionFor({ content: 'Bonjour', resolvedContent: 'Hello', overlayTexts: [] })).toBe('Hello');
  });
});

/**
 * `resolveStoryCaption` — LE SITE UNIQUE qui compose `served()` (Prisme,
 * `lib/api/prism.ts`) et `captionFor` ci-dessus. Le témoin qui compte est à
 * un rang AUTRE que le premier (CLAUDE.md § Prisme, leçon 261, cycle 120) :
 * au rang 1, un résolveur FAUX rendrait le même verdict qu'un résolveur
 * juste.
 */
describe('resolveStoryCaption — descend prism.ts, témoin de RANG ≠ 1', () => {
  test('rang 1 SANS traduction ⇒ le rang 2 est servi, jamais l\'original ni translations.first', () => {
    const result = resolveStoryCaption({
      preferredLanguages: ['es', 'fr'],
      originalLanguage: 'en',
      translations: { fr: { text: 'Bonjour depuis le parc !' }, de: { text: 'Hallo aus dem Park!' } },
      content: 'Hello from the park!',
    });
    expect(result).toEqual({ text: 'Bonjour depuis le parc !', language: 'fr' });
  });

  test('aucune traduction vers une langue du lecteur ⇒ le texte ORIGINAL, jamais translations.first (règle 1 du Prisme)', () => {
    const result = resolveStoryCaption({
      preferredLanguages: ['es', 'de'],
      originalLanguage: 'en',
      translations: { fr: { text: 'Bonjour depuis le parc !' } },
      content: 'Hello from the park!',
    });
    expect(result).toEqual({ text: 'Hello from the park!', language: 'en' });
  });

  test('un contenu DÉRIVÉ des calques de scène ne produit pas de doublon de légende', () => {
    const result = resolveStoryCaption({
      preferredLanguages: ['fr'],
      originalLanguage: 'en',
      translations: { fr: { text: 'Bonjour le monde' } },
      content: 'Bonjour le monde',
      overlayTexts: ['Bonjour', 'le monde'],
    });
    expect(result).toBeNull();
  });
});
