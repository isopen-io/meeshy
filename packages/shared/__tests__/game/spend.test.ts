/**
 * Ce qu'un geste du jeu dépense ou exige, montré AVANT le geste (#9705) :
 * ce qu'on a, ce que ça coûte, ce qui restera — ou ce qui manque.
 */

import { describe, it, expect } from 'vitest';
import { requirementPreview, spendPreview } from '../../utils/game/spend.js';

describe('ce qu’une dépense laisse', () => {
  it('dit ce qui restera quand le solde couvre le prix', () => {
    expect(spendPreview({ held: 5, cost: 3 })).toEqual({ held: 5, cost: 3, after: 2, missing: 0, affordable: true });
  });

  it('laisse zéro quand le solde est exactement le prix', () => {
    expect(spendPreview({ held: 10, cost: 10 })).toEqual({ held: 10, cost: 10, after: 0, missing: 0, affordable: true });
  });

  it('dit ce qui manque, et garde le solde, quand il ne couvre pas le prix', () => {
    expect(spendPreview({ held: 1, cost: 3 })).toEqual({ held: 1, cost: 3, after: 1, missing: 2, affordable: false });
  });

  it('mesure ce qui manque sur la part DÉPENSABLE quand elle est plus petite que le solde', () => {
    expect(spendPreview({ held: 5000, cost: 1221, spendable: 900 })).toEqual({
      held: 5000,
      cost: 1221,
      after: 5000,
      missing: 321,
      affordable: false,
    });
  });

  it('retire le prix du solde ENTIER quand la part dépensable le couvre', () => {
    expect(spendPreview({ held: 5000, cost: 1221, spendable: 2000 })).toEqual({
      held: 5000,
      cost: 1221,
      after: 3779,
      missing: 0,
      affordable: true,
    });
  });

  it('ne laisse jamais une valeur illisible fausser le compte', () => {
    expect(spendPreview({ held: Number.NaN, cost: 2 })).toEqual({ held: 0, cost: 2, after: 0, missing: 2, affordable: false });
    expect(spendPreview({ held: -4, cost: 2.7 })).toEqual({ held: 0, cost: 2, after: 0, missing: 2, affordable: false });
    expect(spendPreview({ held: 3, cost: 2, spendable: Number.POSITIVE_INFINITY })).toEqual({ held: 3, cost: 2, after: 1, missing: 0, affordable: true });
  });
});

describe('ce qu’une exigence demande', () => {
  it('dit ce qui manque sous le seuil', () => {
    expect(requirementPreview({ current: 3, required: 5 })).toEqual({ current: 3, required: 5, missing: 2, met: false });
  });

  it('est remplie au seuil et au-dessus', () => {
    expect(requirementPreview({ current: 5, required: 5 })).toEqual({ current: 5, required: 5, missing: 0, met: true });
    expect(requirementPreview({ current: 40, required: 20 })).toEqual({ current: 40, required: 20, missing: 0, met: true });
  });

  it('ne laisse jamais une valeur illisible fausser le compte', () => {
    expect(requirementPreview({ current: Number.NaN, required: 10 })).toEqual({ current: 0, required: 10, missing: 10, met: false });
  });
});
