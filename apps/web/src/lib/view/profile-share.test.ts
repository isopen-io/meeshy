import { describe, expect, test } from 'bun:test';

import { profileSendRequest } from './profile-share';

/** D15 — « Envoyer le profil » : la carte profil part dans la conversation, le lien se copie. */
describe('profileSendRequest', () => {
  test('la carte profil, par l’adresse canonique /u/<pseudo>, et le lien pour le reste', () => {
    expect(profileSendRequest({ id: 'u-lea', username: 'lea.martin', name: 'Léa Martin', avatar: null })).toEqual({
      intent: 'share',
      payload: { kind: 'profile', userId: 'u-lea', url: 'https://meeshy.me/u/lea.martin', name: 'Léa Martin' },
      moreOptions: { url: 'https://meeshy.me/u/lea.martin' },
    });
  });

  test('l’avatar suit quand il existe ; un pseudo à caractères spéciaux est encodé', () => {
    const request = profileSendRequest({ id: 'u', username: 'a b', name: 'A', avatar: 'https://cdn/a.webp' });
    expect(request.payload).toMatchObject({ url: 'https://meeshy.me/u/a%20b', avatarUrl: 'https://cdn/a.webp' });
  });
});
