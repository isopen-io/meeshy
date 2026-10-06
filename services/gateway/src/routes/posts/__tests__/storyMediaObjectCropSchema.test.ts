import { describe, it, expect } from '@jest/globals';
import { StoryMediaObjectSchema } from '../types';

/** Le recadrage d'une image posée (#9499) voyage dans le blob v1 sous
 *  `crop` — un rectangle en FRACTIONS de la source (`MediaCropRect` iOS). Le
 *  blob vient du client : chaque borne est un nombre fini dans [0, 1], sans
 *  quoi une charge ferait multiplier par n'importe quoi chez les lecteurs. */
describe('recadrage d’une image posée', () => {
  const base = { id: 'media-1', postMediaId: '507f1f77bcf86cd799439011' };
  const carre = { x: 0.125, y: 0, width: 0.75, height: 1 };

  it('test_mediaCrop_isKeptThroughValidation', () => {
    const r = StoryMediaObjectSchema.safeParse({ ...base, crop: carre });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.crop).toEqual(carre);
  });

  it('test_mediaCrop_isOptional', () => {
    expect(StoryMediaObjectSchema.safeParse(base).success).toBe(true);
  });

  it('test_mediaCrop_boundOutsideTheSource_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, crop: { ...carre, width: 4 } }).success).toBe(false);
    expect(StoryMediaObjectSchema.safeParse({ ...base, crop: { ...carre, x: -1 } }).success).toBe(false);
  });

  it('test_mediaCrop_amputated_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, crop: { x: 0, y: 0, width: 1 } }).success).toBe(false);
  });

  it('test_mediaCrop_nonNumeric_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, crop: { ...carre, height: 'tout' } }).success).toBe(false);
  });

  it('test_mediaCrop_emptyArea_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, crop: { ...carre, width: 0 } }).success).toBe(false);
  });
});
