import { describe, it, expect } from '@jest/globals';
import { StoryMediaObjectSchema } from '../types';

/** Le filtre PROPRE à un objet média (2026-09-28) : les réglages d'un objet ne
 *  touchent que lui, le filtre de slide restant celui du fond. Le blob vient du
 *  client : le champ est borné comme ses frères. */
describe('filtre propre à un objet média', () => {
  const base = { id: 'media-1', postMediaId: '507f1f77bcf86cd799439011' };

  it('test_mediaFilter_isKeptThroughValidation', () => {
    const r = StoryMediaObjectSchema.safeParse({ ...base, filter: 'vintage' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.filter).toBe('vintage');
  });

  it('test_mediaFilter_isOptional', () => {
    expect(StoryMediaObjectSchema.safeParse(base).success).toBe(true);
  });

  it('test_mediaFilter_absurdLength_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, filter: 'x'.repeat(33) }).success).toBe(false);
  });

  it('test_mediaFilter_nonString_isRejected', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...base, filter: 42 }).success).toBe(false);
  });
});
