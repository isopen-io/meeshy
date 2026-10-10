import { describe, expect, test } from 'bun:test';

import { typistAvatarLookup } from './use-typist-avatar';

describe('typistAvatarLookup — la photo d’un frappeur, depuis les participants déjà en cache (#6985)', () => {
  test('rend la photo du participant, retrouvé par son compte puis par son rang', () => {
    const avatarOf = typistAvatarLookup([
      { id: 'p1', userId: 'u1', avatar: 'rang.png', user: { avatar: 'compte.png' } },
      { id: 'p2', avatar: null, user: { avatar: 'compte-2.png' } },
    ]);
    expect(avatarOf('u1')).toBe('rang.png');
    expect(avatarOf('p2')).toBe('compte-2.png');
  });

  test('un frappeur inconnu, ou sans photo, n’a pas de photo', () => {
    const avatarOf = typistAvatarLookup([{ id: 'p1', userId: 'u1', avatar: '   ', user: { avatar: null } }]);
    expect(avatarOf('u1')).toBeUndefined();
    expect(avatarOf('personne')).toBeUndefined();
  });

  test('sans participants, personne n’a de photo', () => {
    expect(typistAvatarLookup(undefined)('u1')).toBeUndefined();
  });
});
