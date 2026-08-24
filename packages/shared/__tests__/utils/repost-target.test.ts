import { describe, it, expect } from 'vitest';
import { repostTargetId } from '../../utils/repost-target.js';

describe('repostTargetId', () => {
  it('rend la carte elle-même quand elle ne repartage rien', () => {
    expect(repostTargetId({ id: 'post-1' })).toBe('post-1');
  });

  it('remonte au maillon précédent quand la carte est un repost', () => {
    expect(repostTargetId({ id: 'repost-2', repostOfId: 'post-1' })).toBe('post-1');
  });

  it("préfère la RACINE au maillon — une chaîne se replie sur sa source", () => {
    expect(
      repostTargetId({ id: 'repost-3', repostOfId: 'repost-2', originalRepostOfId: 'post-1' }),
    ).toBe('post-1');
  });

  it('traite `null` comme une absence — Prisma sert le champ non posé à `null`', () => {
    expect(repostTargetId({ id: 'post-1', repostOfId: null, originalRepostOfId: null })).toBe('post-1');
    expect(repostTargetId({ id: 'repost-2', repostOfId: 'post-1', originalRepostOfId: null })).toBe('post-1');
  });
});
