import { VIEWER_HANDLE, VIEWER_ID } from './fixtures-base';
import type { MyProfile, MyStats, ProfilePatch } from './profile';

/**
 * **LE LECTEUR DE RECETTE, SON PROFIL** (#6289) — servi par le MÊME chemin que
 * la passerelle (`profile.ts`, garde `__FIXTURES__ && source === 'fixtures'`),
 * élagué de tout build `VITE_DATA_SOURCE=gateway` (`vite.config.ts §
 * FIXTURE_MODULE`).
 *
 * Deux langues du Prisme sont posées, jamais une : un Prisme à un seul échelon
 * rend vert n'importe quel résolveur (leçon 261). Une ÉDITION est tenue en
 * mémoire le temps de l'onglet — c'est ce qui permet au gate navigateur de
 * mesurer qu'une modification optimiste reste après la « réponse ».
 */

const INITIAL: MyProfile = {
  id: VIEWER_ID,
  username: VIEWER_HANDLE,
  displayName: 'Awa Diallo',
  firstName: 'Awa',
  lastName: 'Diallo',
  bio: 'Je traduis entre le wolof, le français et l’anglais — et j’apprends le portugais.',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  email: { masked: 'a•••@meeshy.example', verified: true },
  phone: { masked: '+22 •••• 45', verified: false },
  createdAt: '2025-03-14T09:00:00.000Z',
};

const state: { profile: MyProfile } = { profile: INITIAL };

const clearable = (value: string | undefined, current: string | null): string | null =>
  value === undefined ? current : value === '' ? null : value;

export function fixtureMyProfile(): MyProfile {
  return state.profile;
}

export function fixturePatchMyProfile(patch: ProfilePatch): MyProfile {
  const current = state.profile;
  state.profile = {
    ...current,
    displayName: patch.displayName ?? current.displayName,
    firstName: patch.firstName ?? current.firstName,
    lastName: patch.lastName ?? current.lastName,
    bio: patch.bio ?? current.bio,
    systemLanguage: patch.systemLanguage ?? current.systemLanguage,
    regionalLanguage: clearable(patch.regionalLanguage, current.regionalLanguage),
    customDestinationLanguage: clearable(patch.customDestinationLanguage, current.customDestinationLanguage),
  };
  return state.profile;
}

export function fixturePatchMyImage(kind: 'avatar' | 'banner', url: string): MyProfile {
  state.profile = { ...state.profile, [kind]: url };
  return state.profile;
}

export function fixtureMyStats(): MyStats {
  return {
    totalMessages: 1204,
    totalConversations: 18,
    totalTranslations: 356,
    languagesUsed: 4,
    memberDays: 183,
    friendRequestsReceived: 3,
  };
}
