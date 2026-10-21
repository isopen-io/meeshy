import { describe, expect, test } from 'bun:test';

import { ringsByAuthor, servedRingOf } from './author-ring';

const served = { avatarRing: { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null }, banner: null };

describe('le contour servi avec une personne', () => {
  test('se lit sur le participant, ou sur son compte', () => {
    expect(servedRingOf({ profileDecor: served })?.item).toBe('filet');
    expect(servedRingOf({ user: { profileDecor: served } })?.item).toBe('filet');
  });
  test('absent, illisible ou ancienne passerelle : aucun contour, jamais d’erreur', () => {
    expect(servedRingOf({})).toBeNull();
    expect(servedRingOf(null)).toBeNull();
    expect(servedRingOf({ profileDecor: { avatarRing: { pack: 3 } } })).toBeNull();
  });
  test('les contours d’une conversation se rangent sous la clé de l’avatar d’auteur', () => {
    const rings = ringsByAuthor([{ id: 'p1', userId: 'u1', user: { id: 'u1', profileDecor: served } }, { id: 'p2', userId: 'u2' }]);
    expect([...rings.keys()]).toEqual(['u1']);
  });
});
