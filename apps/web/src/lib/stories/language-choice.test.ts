import { describe, expect, test } from 'bun:test';

import { served } from '@/lib/api/prism';

import { AUTO_CHOICE, isActiveLanguage, originalStoryLanguageChoice, storyBadgeCode, storyPrism } from './language-choice';

describe('storyPrism — le prisme du lecteur, le choix en tête', () => {
  test('auto rend la chaîne du lecteur TELLE QUELLE — même identité de tableau', () => {
    const readerLanguages = ['fr', 'en'];
    expect(storyPrism({ readerLanguages, choice: AUTO_CHOICE })).toBe(readerLanguages);
  });

  test('explore "de" sur ["fr", "en"] => ["de", "fr", "en"], jamais une seconde insertion', () => {
    expect(storyPrism({ readerLanguages: ['fr', 'en'], choice: { kind: 'explore', language: 'de' } })).toEqual([
      'de',
      'fr',
      'en',
    ]);
  });

  test('explore "fr" sur ["fr", "en"] => ["fr", "en"] — DÉDUPLIQUÉ', () => {
    expect(storyPrism({ readerLanguages: ['fr', 'en'], choice: { kind: 'explore', language: 'fr' } })).toEqual([
      'fr',
      'en',
    ]);
  });

  test('original => [] — la sentinelle iOS est une chaîne VIDE', () => {
    expect(storyPrism({ readerLanguages: ['fr', 'en'], choice: originalStoryLanguageChoice() })).toEqual([]);
  });
});

describe('la descente sur st-amie-1 — le rang 0 n’est PAS un court-circuit', () => {
  const stAmie1 = {
    content: 'Hello from the park!',
    originalLanguage: 'en',
    translations: { fr: { text: 'Bonjour depuis le parc !' } },
  };

  const servedFor = (choice: Parameters<typeof storyPrism>[0]['choice'], readerLanguages: readonly string[] = ['fr']) => {
    const prism = storyPrism({ readerLanguages, choice });
    return served({
      preferredLanguages: prism,
      originalLanguage: stAmie1.originalLanguage,
      translations: { fr: stAmie1.translations.fr.text },
      original: stAmie1.content,
    });
  };

  test('témoin de RANG — explore "de" (aucune traduction allemande) sur lecteur ["fr"] => "Bonjour depuis le parc !", langue "fr"', () => {
    const result = servedFor({ kind: 'explore', language: 'de' });
    expect(result.text).toBe('Bonjour depuis le parc !');
    expect(result.language).toBe('fr');
  });

  test('explore "en" => l’ORIGINAL "Hello from the park!", langue "en", translated:false', () => {
    const result = servedFor({ kind: 'explore', language: 'en' });
    expect(result.text).toBe('Hello from the park!');
    expect(result.language).toBe('en');
    expect(result.translated).toBe(false);
  });

  test('original => l’original, translated:false', () => {
    const result = servedFor(originalStoryLanguageChoice());
    expect(result.text).toBe('Hello from the park!');
    expect(result.translated).toBe(false);
  });

  test('auto (lecteur ["fr"]) => "Bonjour depuis le parc !"', () => {
    const result = servedFor(AUTO_CHOICE);
    expect(result.text).toBe('Bonjour depuis le parc !');
  });
});

describe('storyBadgeCode — la tête de la chaîne, en majuscules', () => {
  test('une chaîne non vide rend sa tête en MAJUSCULES', () => {
    expect(storyBadgeCode(['en', 'fr'])).toBe('EN');
  });

  test('une chaîne VIDE (original) ne rend aucun badge', () => {
    expect(storyBadgeCode([])).toBeNull();
  });
});

describe('isActiveLanguage — base BCP-47, casse ignorée (QuickBar.swift:170-179)', () => {
  test('pt-BR et pt sont la MÊME langue active', () => {
    expect(isActiveLanguage('pt-BR', 'pt')).toBe(true);
  });

  test('aucune langue active => jamais actif', () => {
    expect(isActiveLanguage('fr', null)).toBe(false);
  });

  test('deux langues distinctes => pas actif', () => {
    expect(isActiveLanguage('fr', 'en')).toBe(false);
  });
});
