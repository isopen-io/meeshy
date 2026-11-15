import { describe, expect, test } from 'bun:test';

import { avatarMenuEntries } from './avatar-menu';

describe('avatarMenuEntries — le menu d’un avatar (#7828)', () => {
  test('profil, story puis détails : l’ordre d’iOS (MeeshyAvatar.swift:331-354)', () => {
    expect(
      avatarMenuEntries({ username: 'nour', storyRing: { entryStoryId: 's1', unseen: false }, details: true }),
    ).toEqual([{ kind: 'profile', username: 'nour' }, { kind: 'story', post: 's1' }, { kind: 'details' }]);
  });

  test('une story DÉJÀ VUE garde son entrée : l’anneau existe', () => {
    expect(avatarMenuEntries({ username: 'nour', storyRing: { entryStoryId: 's1', unseen: false }, details: false })).toContainEqual({
      kind: 'story',
      post: 's1',
    });
  });

  test('sans anneau, pas d’entrée story', () => {
    expect(avatarMenuEntries({ username: 'nour', details: true })).toEqual([{ kind: 'profile', username: 'nour' }, { kind: 'details' }]);
  });

  test('sans pseudo (participant anonyme), pas d’entrée profil — `/u/` n’est pas une adresse', () => {
    expect(avatarMenuEntries({ username: '', details: true })).toEqual([{ kind: 'details' }]);
    expect(avatarMenuEntries({ username: null, details: false })).toEqual([]);
  });

  test('sans hôte de détails, pas d’entrée détails', () => {
    expect(avatarMenuEntries({ username: 'nour', details: false })).toEqual([{ kind: 'profile', username: 'nour' }]);
  });
});
