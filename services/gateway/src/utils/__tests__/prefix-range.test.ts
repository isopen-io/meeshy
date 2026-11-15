/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { prefixRange } from '../prefix-range';

const matches = (value: string, prefix: string): boolean => {
  const { gte, lt } = prefixRange(prefix);
  return value >= gte && value < lt;
};

describe('prefixRange : un préfixe lu comme un intervalle de chaînes, jamais comme une regex (#11492)', () => {
  it('rend toute valeur qui commence par le préfixe', () => {
    expect(matches('social.reaction:10', 'social.reaction:')).toBe(true);
    expect(matches('social.reaction:', 'social.reaction:')).toBe(true);
    expect(matches('uploads/a/photo.webp', 'uploads/a/photo.')).toBe(true);
  });

  it('ne lit aucun métacaractère : le point ne remplace pas un autre caractère', () => {
    expect(matches('socialXreaction:10', 'social.reaction:')).toBe(false);
    expect(matches('uploads/a/photoXwebp', 'uploads/a/photo.')).toBe(false);
  });

  it('ne lit pas la barre verticale comme une alternative', () => {
    expect(matches('content:abc', 'receipt:like|')).toBe(false);
    expect(matches('receipt:like|abc', 'receipt:like|')).toBe(true);
  });

  it('écarte ce qui suit le préfixe dans l’ordre lexical sans le prolonger', () => {
    expect(matches('social.reactions', 'social.reaction:')).toBe(false);
    expect(matches('social.reaction;', 'social.reaction:')).toBe(false);
  });

  it('refuse un préfixe vide, qui ne borne rien', () => {
    expect(() => prefixRange('')).toThrow();
  });
});
