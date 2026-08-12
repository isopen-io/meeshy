/**
 * Tests for translation-cleaner utility.
 *
 * These helpers post-process NLLB translation output before it enters the
 * Prisme display flow. The product's primary/fallback language is French
 * (`resolveUserLanguage` fallback `'fr'`), where apostrophes (`l'`, `d'`, `c'`,
 * `qu'`, `n'`) and multi-line messages are pervasive — the cleaner MUST NOT
 * corrupt either.
 */

import {
  cleanTranslationOutput,
  deepCleanTranslationOutput,
} from '../../utils/translation-cleaner';

describe('cleanTranslationOutput', () => {
  it('returns empty string for falsy input', () => {
    expect(cleanTranslationOutput('')).toBe('');
  });

  it('strips NLLB/T5 special tokens', () => {
    expect(cleanTranslationOutput('Bonjour<extra_id_0> le<pad> monde</s>')).toBe(
      'Bonjour le monde'
    );
  });

  it('replaces the SentencePiece boundary marker with a space and trims', () => {
    expect(cleanTranslationOutput('▁Bonjour▁le▁monde')).toBe('Bonjour le monde');
  });

  it('collapses runs of whitespace', () => {
    expect(cleanTranslationOutput('Bonjour    le   monde')).toBe('Bonjour le monde');
  });
});

describe('deepCleanTranslationOutput', () => {
  it('returns empty string for falsy input', () => {
    expect(deepCleanTranslationOutput('')).toBe('');
  });

  it('adds a space after punctuation glued to a following word', () => {
    expect(deepCleanTranslationOutput('Bonjour.Le monde')).toBe('Bonjour. Le monde');
  });

  it('removes the French space before closing punctuation', () => {
    expect(deepCleanTranslationOutput('Bonjour , le monde .')).toBe('Bonjour, le monde.');
  });

  // Regression: the ASCII apostrophe is NOT a quote delimiter. French
  // contractions must survive verbatim — never be rewritten as double quotes.
  it('preserves French apostrophe contractions verbatim', () => {
    expect(deepCleanTranslationOutput("d'accord, c'est l'ami de Jean")).toBe(
      "d'accord, c'est l'ami de Jean"
    );
  });

  it('does not corrupt a single-apostrophe contraction', () => {
    expect(deepCleanTranslationOutput("qu'il vienne")).toBe("qu'il vienne");
  });

  // Regression: stripping control chars must keep newlines/tabs, otherwise
  // adjacent lines get glued into one word.
  it('preserves newlines between lines instead of gluing words', () => {
    expect(deepCleanTranslationOutput('ligne un\nligne deux')).toBe('ligne un\nligne deux');
  });

  it('preserves tabs', () => {
    expect(deepCleanTranslationOutput('col1\tcol2')).toBe('col1\tcol2');
  });

  it('still removes genuine non-printable control characters', () => {
    expect(deepCleanTranslationOutput('Bonjour\x00\x07 le monde')).toBe('Bonjour le monde');
  });

  // Genuine double-quote styles (guillemets, curly, straight) still normalize
  // to a straight double quote — the original intent, minus the apostrophe bug.
  it('normalizes guillemets and curly double quotes to straight double quotes', () => {
    expect(deepCleanTranslationOutput('«bonjour»')).toBe('"bonjour"');
    expect(deepCleanTranslationOutput('“bonjour”')).toBe('"bonjour"');
  });
});
