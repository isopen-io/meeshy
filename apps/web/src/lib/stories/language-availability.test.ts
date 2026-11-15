import { describe, expect, test } from 'bun:test';

import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import { availableStoryLanguages, hasTranslatableStoryContent, hasTranslatableStoryText, servedStoryIndicator } from './language-availability';

const textObject = (payload: Record<string, unknown>, locale?: string) => ({
  id: 't',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  ...(locale !== undefined ? { locale } : {}),
  payload,
});

function documentOf(objects: readonly unknown[]): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects }] });
  if (doc === null) throw new Error('vecteur invalide');
  return doc;
}

describe('availableStoryLanguages — miroir StoryTextLanguageAvailability.swift', () => {
  test('légende en + traductions { fr } => ["en", "fr"], triées', () => {
    expect(
      availableStoryLanguages({
        content: 'Hello',
        originalLanguage: 'en',
        translations: { fr: { text: 'Bonjour' } },
        document: null,
      }),
    ).toEqual(['en', 'fr']);
  });

  test('objet texte locale "es", translations { en }, SANS légende => ["en", "es"] — le canvas COMPTE', () => {
    const document = documentOf([textObject({ text: 'Hola', translations: { en: 'Hello' } }, 'es')]);
    expect(availableStoryLanguages({ content: null, originalLanguage: null, translations: undefined, document })).toEqual([
      'en',
      'es',
    ]);
  });

  test('fr-FR, FR, fr => une seule entrée fr', () => {
    const document = documentOf([textObject({ text: 'Bonjour' }, 'fr-FR'), textObject({ text: 'Salut', translations: { FR: 'Coucou' } }, 'fr')]);
    expect(availableStoryLanguages({ content: null, originalLanguage: null, translations: undefined, document })).toEqual(['fr']);
  });

  test('un objet texte BLANC n’apporte rien', () => {
    const document = documentOf([textObject({ text: '   ' }, 'es')]);
    expect(availableStoryLanguages({ content: null, originalLanguage: null, translations: undefined, document })).toEqual([]);
  });

  test('une traduction au texte vide est ignorée', () => {
    const document = documentOf([textObject({ text: 'Hola', translations: { en: '' } }, 'es')]);
    expect(availableStoryLanguages({ content: null, originalLanguage: null, translations: undefined, document })).toEqual(['es']);
  });

  test('union légende + canvas', () => {
    const document = documentOf([textObject({ text: 'Hola', translations: { en: 'Hello' } }, 'es')]);
    expect(
      availableStoryLanguages({ content: 'Bonjour', originalLanguage: 'fr', translations: undefined, document }),
    ).toEqual(['en', 'es', 'fr']);
  });
});

describe('hasTranslatableStoryContent — la porte du bouton', () => {
  test('deux langues prêtes => true', () => {
    expect(hasTranslatableStoryContent({ hasText: true, availableLanguages: ['fr', 'en'], canRequestTranslation: false })).toBe(
      true,
    );
  });

  test('une seule langue et canRequestTranslation: false => false (tranche 1)', () => {
    expect(hasTranslatableStoryContent({ hasText: true, availableLanguages: ['fr'], canRequestTranslation: false })).toBe(false);
  });

  test('une seule langue et canRequestTranslation: true => true (la loi iOS, tranche 2)', () => {
    expect(hasTranslatableStoryContent({ hasText: true, availableLanguages: ['fr'], canRequestTranslation: true })).toBe(true);
  });

  test('aucun texte => false quoi qu’il arrive', () => {
    expect(hasTranslatableStoryContent({ hasText: false, availableLanguages: ['fr', 'en'], canRequestTranslation: true })).toBe(
      false,
    );
  });
});

describe('hasTranslatableStoryText — légende non blanche OU objet texte non blanc', () => {
  test('une légende non blanche suffit', () => {
    expect(hasTranslatableStoryText({ content: 'Bonjour', document: null })).toBe(true);
  });

  test('un objet texte non blanc suffit, sans légende', () => {
    const document = documentOf([textObject({ text: 'Hola' })]);
    expect(hasTranslatableStoryText({ content: null, document })).toBe(true);
  });

  test('ni légende ni objet texte => false', () => {
    const document = documentOf([textObject({ text: '  ' })]);
    expect(hasTranslatableStoryText({ content: '', document })).toBe(false);
  });
});

describe('servedStoryIndicator — ce que la pastille dit', () => {
  test('légende servie en fr depuis en => { servedLanguage: "fr", originalLanguage: "en" }', () => {
    const result = servedStoryIndicator({
      content: 'Hello from the park!',
      originalLanguage: 'en',
      translations: { fr: { text: 'Bonjour depuis le parc !' } },
      document: null,
      prism: ['fr'],
    });
    expect(result).toEqual({ servedLanguage: 'fr', originalLanguage: 'en' });
  });

  test('story de SCÈNE sans légende, objet es servi en => { "en", "es" }', () => {
    const document = documentOf([textObject({ text: 'Hola', translations: { en: 'Hello' } }, 'es')]);
    const result = servedStoryIndicator({ content: null, originalLanguage: null, translations: undefined, document, prism: ['en'] });
    expect(result).toEqual({ servedLanguage: 'en', originalLanguage: 'es' });
  });

  test('rien de traduit => null', () => {
    const result = servedStoryIndicator({
      content: 'Bonjour',
      originalLanguage: 'fr',
      translations: undefined,
      document: null,
      prism: ['fr'],
    });
    expect(result).toBeNull();
  });
});
