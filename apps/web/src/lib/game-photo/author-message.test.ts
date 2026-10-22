import { describe, expect, test } from 'bun:test';

import { AUTHOR_MESSAGE_MAX_GRAPHEMES, authorMessageGraphemes, authorMessageOf, isolatedAuthorMessage } from './author-message';

/**
 * LE MESSAGE DE L'AUTEUR (#10165, L12, § 5.14 du prompt des Cadres de gloire) :
 * ≤ 60 graphèmes comptés par `Intl.Segmenter`, une seule ligne, aucun caractère
 * de contrôle, sens d'écriture isolé au rendu, jamais interprété. Les fixtures
 * du lot : « Для мамы », « 給媽媽 », « माँ के लिए », « לאמא », « 🎉🎉 », un
 * mélange latin et arabe — aucune coupe.
 */
const FIXTURES = ['Для мамы', '給媽媽', 'माँ के लिए', 'לאמא', '🎉🎉', 'Merci يا أمي'] as const;

describe('la borne : 60 graphèmes, jamais un point de code', () => {
  test('61 graphèmes se tronquent à 60, 60 passent entiers', () => {
    const sixtyOne = 'a'.repeat(61);
    expect(authorMessageOf(sixtyOne)).toBe('a'.repeat(60));
    expect(authorMessageOf('a'.repeat(60))).toBe('a'.repeat(60));
    expect(AUTHOR_MESSAGE_MAX_GRAPHEMES).toBe(60);
  });

  test('un drapeau, un emoji composé ou une lettre accentuée décomposée comptent pour UN graphème', () => {
    const flags = '🇫🇷'.repeat(61);
    expect(authorMessageGraphemes(authorMessageOf(flags) ?? '')).toBe(60);
    const family = '👨‍👩‍👧'.repeat(61);
    expect(authorMessageGraphemes(authorMessageOf(family) ?? '')).toBe(60);
    const decomposed = 'é'.repeat(61);
    expect(authorMessageGraphemes(authorMessageOf(decomposed) ?? '')).toBe(60);
  });

  for (const text of FIXTURES) {
    test(`« ${text} » passe sans coupe`, () => {
      expect(authorMessageOf(text)).toBe(text.normalize('NFC'));
    });
  }
});

describe('une ligne, du texte seulement', () => {
  test('les retours à la ligne deviennent une espace, les espaces se resserrent, les bords se taillent', () => {
    expect(authorMessageOf('Pour toi,\nmaman')).toBe('Pour toi, maman');
    expect(authorMessageOf('  Pour\r\n\r\ntoi \t maman  ')).toBe('Pour toi maman');
  });

  test('les caractères de contrôle et les marques bidi incrustées sont retirés', () => {
    expect(authorMessageOf('Ub\u0007untu‎, ‮toujours‬')).toBe('Ubuntu, toujours');
    expect(authorMessageOf('⁨Salam⁩ ​')).toBe('Salam');
  });

  test('vide, espaces seuls, absent : aucun message', () => {
    expect(authorMessageOf('')).toBeNull();
    expect(authorMessageOf('   \n ')).toBeNull();
    expect(authorMessageOf(null)).toBeNull();
    expect(authorMessageOf(undefined)).toBeNull();
  });

  test('le texte n’est jamais interprété : balises et liens restent des lettres', () => {
    expect(authorMessageOf('<b>https://x.y</b>')).toBe('<b>https://x.y</b>');
  });
});

describe('le sens d’écriture est isolé au rendu (FSI … PDI)', () => {
  test('un message hébreu ou arabe est enveloppé, un message latin aussi — la plaque ne dépend pas de l’interface', () => {
    expect(isolatedAuthorMessage('לאמא')).toBe('⁨לאמא⁩');
    expect(isolatedAuthorMessage('Merci')).toBe('⁨Merci⁩');
  });
});
