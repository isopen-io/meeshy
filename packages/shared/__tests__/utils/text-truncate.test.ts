import { describe, it, expect } from 'vitest';
import { sliceCodePoints } from '../../utils/text-truncate';

// Détecte une demi-paire de substitution ISOLÉE (haute non suivie d'une basse,
// ou basse non précédée d'une haute) — le glyphe cassé `�`. Une paire complète
// (emoji valide) contient l'unité haute mais N'EST PAS isolée : elle passe.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('sliceCodePoints', () => {
  it('returns the whole string when it already fits the budget', () => {
    expect(sliceCodePoints('hello', 10)).toBe('hello');
    expect(sliceCodePoints('hello', 5)).toBe('hello');
  });

  it('truncates ASCII by UTF-16 units exactly (parity with substring)', () => {
    expect(sliceCodePoints('hello world', 5)).toBe('hello');
    expect(sliceCodePoints('abcdef', 3)).toBe('abc');
  });

  it('returns an empty string for non-positive budgets', () => {
    expect(sliceCodePoints('hello', 0)).toBe('');
    expect(sliceCodePoints('hello', -3)).toBe('');
  });

  it('never leaves an isolated high surrogate at the cut (the � bug)', () => {
    // 'AAAA🎉' : 4 unités ASCII + une paire (2 unités) = longueur 6.
    // Un budget de 5 couperait 🎉 en deux avec substring → demi-paire isolée.
    const input = 'AAAA🎉BBBB';
    const out = sliceCodePoints(input, 5);
    expect(out).toBe('AAAA'); // l'emoji débordant est écarté en entier
    expect(LONE_SURROGATE.test(out)).toBe(false);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it('keeps an astral char whole when it fits exactly within the budget', () => {
    // 'AAAA🎉' avec budget 6 : les 6 unités tiennent, l'emoji reste entier.
    const out = sliceCodePoints('AAAA🎉BBBB', 6);
    expect(out).toBe('AAAA🎉');
    expect(LONE_SURROGATE.test(out)).toBe(false);
    expect([...out]).toHaveLength(5); // 4 A + 1 emoji (point de code unique)
  });

  it('preserves the <= max UTF-16 invariant even across many astral chars', () => {
    const input = '🎉'.repeat(50); // 100 unités UTF-16, 50 points de code
    const out = sliceCodePoints(input, 7); // 3 emojis (6 unités) tiennent, le 4e déborde
    expect(out).toBe('🎉🎉🎉');
    expect(out.length).toBeLessThanOrEqual(7);
    expect(LONE_SURROGATE.test(out)).toBe(false);
  });

  it('fixes what substring corrupted at the same boundary (regression witness)', () => {
    // Le corps de push tronquait `content.substring(0, N)` : ici la limite tombe
    // au milieu de l'emoji → substring laisse la demi-paire, sliceCodePoints non.
    const input = 'AAAA🎉BBBB';
    expect(LONE_SURROGATE.test(input.substring(0, 5))).toBe(true); // ancien bug
    expect(LONE_SURROGATE.test(sliceCodePoints(input, 5))).toBe(false); // corrigé
  });
});
