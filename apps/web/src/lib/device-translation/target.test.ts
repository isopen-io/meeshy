import { describe, expect, test } from 'bun:test';

import { deviceTranslationTarget } from './target';

const everything = () => true;
const nothing = () => false;

describe('deviceTranslationTarget — la langue que l’APPAREIL doit calculer, élue par le Prisme (#9898)', () => {
  test('rien à calculer quand le serveur sert déjà le rang 1', () => {
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'sw',
        translatedLanguages: ['fr'],
        canTranslate: everything,
      }),
    ).toBeNull();
  });

  test('rien à calculer quand le message est déjà écrit dans la langue du rang 1', () => {
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'fr',
        translatedLanguages: [],
        canTranslate: everything,
      }),
    ).toBeNull();
  });

  test('le rang 1 sans traduction serveur est calculé, même si le rang 2 est servi', () => {
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'sw',
        translatedLanguages: ['en'],
        canTranslate: everything,
      }),
    ).toEqual({ source: 'sw', target: 'fr' });
  });

  test('un rang que l’appareil ne sait pas traduire est sauté, la descente continue', () => {
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['ewo', 'fr'],
        originalLanguage: 'en',
        translatedLanguages: [],
        canTranslate: (_source, target) => target !== 'ewo',
      }),
    ).toEqual({ source: 'en', target: 'fr' });
  });

  test('la descente s’arrête au rang déjà servi : jamais calculer une langue MOINS préférée', () => {
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['ewo', 'fr', 'en'],
        originalLanguage: 'sw',
        translatedLanguages: ['fr'],
        canTranslate: (_source, target) => target !== 'ewo',
      }),
    ).toBeNull();
  });

  test('la langue d’origine concourt à son rang : rang 2 original ⇒ seul le rang 1 peut être calculé', () => {
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'en',
        translatedLanguages: [],
        canTranslate: everything,
      }),
    ).toEqual({ source: 'en', target: 'fr' });
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'en',
        translatedLanguages: [],
        canTranslate: nothing,
      }),
    ).toBeNull();
  });

  test('les codes se comparent normalisés : « fr-FR » au prisme, « fr » servi', () => {
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['fr-FR'],
        originalLanguage: 'sw',
        translatedLanguages: ['fr'],
        canTranslate: everything,
      }),
    ).toBeNull();
  });

  test('sans langue d’origine connue, rien n’est calculé : l’appareil ne devine pas la source', () => {
    expect(
      deviceTranslationTarget({
        preferredLanguages: ['fr'],
        originalLanguage: undefined,
        translatedLanguages: [],
        canTranslate: everything,
      }),
    ).toBeNull();
  });
});
