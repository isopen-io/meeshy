import { describe, expect, test } from 'bun:test';

import { FEED_TEXT_TRUNCATION_LIMIT, resolveFeedText, truncateWords, wordCountOf } from './text';

describe('truncateWords — miroir FeedPostCard.swift:171-176', () => {
  test('20 mots ou moins ⇒ intact, jamais tronqué', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `mot${i}`).join(' ');
    expect(truncateWords(twenty, 20)).toEqual({ text: twenty, truncated: false });
  });

  test('21 mots ⇒ les 20 premiers, suivis de « ... »', () => {
    const words = Array.from({ length: 21 }, (_, i) => `mot${i}`);
    const result = truncateWords(words.join(' '), 20);
    expect(result.truncated).toBe(true);
    expect(result.text).toBe(`${words.slice(0, 20).join(' ')}...`);
  });

  test('des espaces multiples ne comptent pas comme des mots vides', () => {
    expect(truncateWords('un   deux   trois', 20)).toEqual({ text: 'un   deux   trois', truncated: false });
  });
});

describe('wordCountOf', () => {
  test('compte les mots séparés par un blanc quelconque', () => {
    expect(wordCountOf('Bonjour à tous')).toBe(3);
    expect(wordCountOf('   ')).toBe(0);
  });
});

describe('resolveFeedText — le SITE UNIQUE Prisme + dépouillement POST', () => {
  test('sans traduction vers le prisme ⇒ l’original, à son rang (règle 1 du Prisme)', () => {
    const resolved = resolveFeedText({
      preferredLanguages: ['fr'],
      originalLanguage: 'fr',
      translations: {},
      content: 'Bonjour !',
    });
    expect(resolved).toEqual({ text: 'Bonjour !', language: 'fr', translated: false });
  });

  /**
   * TÉMOIN DE RANG ≠ 1 (leçon 261) — le lecteur porte DEUX langues, la
   * traduction n'existe QUE pour la seconde. Un résolveur qui ne servirait
   * que le rang 1 rendrait ici l'ORIGINAL espagnol, jamais l'anglais.
   */
  test('rang 2 : aucune traduction française, une traduction anglaise ⇒ servie en anglais', () => {
    const resolved = resolveFeedText({
      preferredLanguages: ['fr', 'en'],
      originalLanguage: 'es',
      translations: { en: { text: 'Good morning everyone' } },
      content: 'Buenos días a todos',
    });
    expect(resolved).toEqual({ text: 'Good morning everyone', language: 'en', translated: true });
  });

  test('la carte langue → { text } d’UN POST se dépouille, jamais la forme tableau d’un message', () => {
    const resolved = resolveFeedText({
      preferredLanguages: ['fr'],
      originalLanguage: 'en',
      translations: { fr: { text: 'Bonjour depuis le parc !', translationModel: 'medium' } },
      content: 'Hello from the park!',
    });
    expect(resolved.text).toBe('Bonjour depuis le parc !');
    expect(resolved.language).toBe('fr');
  });

  test('FEED_TEXT_TRUNCATION_LIMIT vaut 20 — le seuil que FeedPostCard.swift applique', () => {
    expect(FEED_TEXT_TRUNCATION_LIMIT).toBe(20);
  });
});
