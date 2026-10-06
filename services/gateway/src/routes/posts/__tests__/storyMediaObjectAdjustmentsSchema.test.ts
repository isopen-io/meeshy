import { describe, it, expect } from '@jest/globals';
import { StoryMediaObjectSchema } from '../types';

/** Les réglages d'une image posée (#9175) : exposition, contraste… portés par
 *  l'objet et cuits par le player. Le blob vient du client : chaque valeur est
 *  un nombre fini et bornée, sans quoi une charge déciderait du coût du rendu
 *  chez tous les lecteurs. */
describe('réglages d’une image posée', () => {
  const base = { id: 'media-1', postMediaId: '507f1f77bcf86cd799439011' };

  it('test_mediaAdjustments_areKeptThroughValidation', () => {
    const r = StoryMediaObjectSchema.safeParse({ ...base, adjustments: { exposure: 0.5, contrast: 1.2 } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adjustments).toEqual({ exposure: 0.5, contrast: 1.2 });
  });

  it('test_mediaAdjustments_areOptional', () => {
    expect(StoryMediaObjectSchema.safeParse(base).success).toBe(true);
  });

  it('test_mediaAdjustments_absurdValue_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, adjustments: { blur: 400 } }).success).toBe(false);
  });

  it('test_mediaAdjustments_nonNumeric_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, adjustments: { exposure: 'fort' } }).success).toBe(false);
  });

  it('test_mediaAdjustments_unknownSetting_travels', () => {
    const r = StoryMediaObjectSchema.safeParse({ ...base, adjustments: { halo: 0.3 } });
    expect(r.success).toBe(true);
  });
});

/** Le FOND d'une scène porte ses réglages sur le même champ (#9496) : même
 *  schéma, mêmes bornes — le fond n'est pas une porte dérobée vers un rendu
 *  sans plafond. */
describe('réglages du fond d’une scène', () => {
  const fond = { id: 'fond', postMediaId: '507f1f77bcf86cd799439012', isBackground: true };

  it('test_backgroundAdjustments_areKeptThroughValidation', () => {
    const r = StoryMediaObjectSchema.safeParse({ ...fond, adjustments: { exposure: 0.5, vignette: 0.4 } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adjustments).toEqual({ exposure: 0.5, vignette: 0.4 });
  });

  it('test_backgroundAdjustments_absurdValue_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...fond, adjustments: { blur: 400 } }).success).toBe(false);
  });
});

/** Les EFFETS d'une image (#9498) — bloom et grain, ce que l'outil « Effets »
 *  de l'ancien éditeur offrait de plus que les réglages — voyagent dans le
 *  même sac, bornés à leur curseur (0…1) : un grain de 400 n'est pas un
 *  réglage, c'est une charge qui déciderait du coût d'un rendu. */
describe('effets d’une image posée ou du fond', () => {
  const base = { id: 'media-1', postMediaId: '507f1f77bcf86cd799439011' };

  it('test_mediaEffects_areKeptThroughValidation', () => {
    const r = StoryMediaObjectSchema.safeParse({ ...base, adjustments: { bloom: 0.5, grain: 0.25, contrast: 1.2 } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adjustments).toEqual({ bloom: 0.5, grain: 0.25, contrast: 1.2 });
  });

  it('test_mediaEffects_outOfRange_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, adjustments: { bloom: 2 } }).success).toBe(false);
    expect(StoryMediaObjectSchema.safeParse({ ...base, adjustments: { grain: -0.1 } }).success).toBe(false);
  });

  it('test_mediaEffects_nonNumeric_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, adjustments: { grain: 'fort' } }).success).toBe(false);
  });
});
