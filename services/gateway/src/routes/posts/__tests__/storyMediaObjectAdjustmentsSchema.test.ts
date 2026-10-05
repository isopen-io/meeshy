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
    const r = StoryMediaObjectSchema.safeParse({ ...base, adjustments: { grain: 0.3 } });
    expect(r.success).toBe(true);
  });
});
