import { describe, expect, test } from 'bun:test';

import type { MyProfile } from '@/lib/api/profile';

import { draftOf, draftPatch } from './profile-draft';

/**
 * LE BROUILLON DE L'IDENTITÉ (#6289) — ce que l'écran d'édition porte, et le
 * corps PARTIEL qu'il en tire. Miroir `ProfileView.changedOrNil`
 * (`ProfileView.swift:816-818`) : un champ non touché ne part pas (il
 * écraserait un changement concurrent), un champ vidé part vide seulement là
 * où la passerelle l'accepte (la bio).
 */

const profileOf = (overrides: Partial<MyProfile> = {}): MyProfile => ({
  id: 'u-ada',
  username: 'ada',
  displayName: 'Ada L.',
  firstName: 'Ada',
  lastName: null,
  bio: 'Pionnière',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  email: null,
  phone: null,
  createdAt: null,
  ...overrides,
});

describe('le brouillon', () => {
  test('part des valeurs servies, un champ absent devient une saisie vide', () => {
    expect(draftOf(profileOf())).toEqual({ firstName: 'Ada', lastName: '', displayName: 'Ada L.', bio: 'Pionnière' });
  });
});

describe('le corps tiré du brouillon', () => {
  test('rien de touché, rien à envoyer', () => {
    expect(draftPatch(profileOf(), draftOf(profileOf()))).toEqual({});
  });

  test('seuls les champs CHANGÉS partent, rognés', () => {
    expect(draftPatch(profileOf(), { firstName: 'Ada', lastName: ' Lovelace ', displayName: 'Ada Lovelace ', bio: 'Pionnière' })).toEqual({
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
    });
  });

  test('une bio vidée part VIDE — un nom vidé ne part pas', () => {
    expect(draftPatch(profileOf(), { firstName: '', lastName: '', displayName: '  ', bio: '' })).toEqual({ bio: '' });
  });

  test('une espace ajoutée autour d’un nom inchangé ne fait rien partir', () => {
    expect(draftPatch(profileOf(), { firstName: ' Ada ', lastName: '', displayName: 'Ada L.', bio: 'Pionnière' })).toEqual({});
  });
});
