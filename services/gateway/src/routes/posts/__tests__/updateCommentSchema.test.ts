import { describe, it, expect } from '@jest/globals';
import { UpdateCommentSchema, UpdatePostSchema } from '../types';

// #6598 — le jumeau POST (`UpdatePostSchema`) portait déjà `originalLanguage` ;
// `UpdateCommentSchema` divergeait en silence, aucun témoin ne comparant les
// deux schémas. Ce témoin lit les DEUX, pour que la divergence ne se
// reproduise pas sans faire tomber quelque chose.
describe('UpdateCommentSchema — parité avec UpdatePostSchema sur originalLanguage', () => {
  it('accepte originalLanguage, comme son jumeau UpdatePostSchema', () => {
    const commentResult = UpdateCommentSchema.safeParse({ content: 'x', originalLanguage: 'fr' });
    const postResult = UpdatePostSchema.safeParse({ content: 'x', originalLanguage: 'fr' });

    expect(commentResult.success).toBe(true);
    expect(postResult.success).toBe(true);
    if (commentResult.success) expect(commentResult.data.originalLanguage).toBe('fr');
    if (postResult.success) expect(postResult.data.originalLanguage).toBe('fr');
  });

  it('reste une édition valide quand originalLanguage est absent (repli inchangé)', () => {
    const r = UpdateCommentSchema.safeParse({ content: 'x' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.originalLanguage).toBeUndefined();
  });

  it('rejette une langue hors bornes (même contrat que le post : 2 à 16 caractères)', () => {
    const tooShort = UpdateCommentSchema.safeParse({ content: 'x', originalLanguage: 'f' });
    const tooLong = UpdateCommentSchema.safeParse({ content: 'x', originalLanguage: 'x'.repeat(17) });
    expect(tooShort.success).toBe(false);
    expect(tooLong.success).toBe(false);
  });
});
