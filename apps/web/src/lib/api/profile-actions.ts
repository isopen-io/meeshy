import type { QueryClient } from '@tanstack/react-query';

import { uploadProfileImage } from '@/lib/profile/image-upload';

import type { AccountVault } from './accounts';
import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { repaintMyPortrait } from './my-portrait';
import {
  LANGUAGE_PATCH_KEYS,
  MY_PROFILE_QUERY_KEY,
  patchMyImage,
  patchMyProfile,
  validateProfilePatch,
  type MyProfile,
  type ProfileDeps,
  type ProfileImageKind,
  type ProfilePatch,
} from './profile';
import { publicProfileQueryKey, type PublicProfileView } from './public-profile';
import type { SessionProfileFields, SessionStoreApi, SessionUser } from './session';

/**
 * **LES GESTES DU PROFIL, OPTIMISTES** (#6289) — CLAUDE.md § Optimistic
 * Updates : instantané → application locale → réseau → retour arrière. Miroir
 * `ProfileView.saveProfile()` (`ProfileView.swift:842-923`).
 *
 * **Deux lieux, écrits ensemble.** Le cache du profil (ce que l'écran peint) et
 * la SESSION (ce que le Prisme de tout le produit lit, `useReaderLanguages`).
 * Écrire le seul cache laisserait la liste des conversations dans l'ancienne
 * langue pendant que le profil affiche la nouvelle — le Prisme ANNONCÉ sans
 * être APPLIQUÉ (CLAUDE.md § Prisme, cycle 123).
 *
 * **Une langue confirmée relit la liste.** Les aperçus que la passerelle sert
 * ne portent que les traductions vers le Prisme qu'elle CONNAÎT
 * (`buildLastMessagePreviewTranslations`, `services/gateway/src/routes/
 * conversations/utils/last-message-preview.ts:71`) : changer de langue
 * principale bascule sur-le-champ les aperçus dont la traduction est déjà là,
 * et la relecture apporte les autres. Relire AVANT la confirmation servirait
 * encore l'ancien Prisme.
 *
 * **Hors ligne, l'édition est refusée** (critère de fin de #6289). iOS la met
 * en file (`SettingsActionQueue`) ; le web n'a pas encore de file d'écriture —
 * un geste qui dirait « enregistré » sans jamais partir serait un contrôle qui
 * ment.
 */

export type ProfileActionDeps = ProfileDeps & {
  readonly queryClient: QueryClient;
  readonly session: SessionStoreApi;
  /** La liste des comptes de l'appareil (#8886). */
  readonly accounts: Pick<AccountVault, 'refreshUser'>;
  readonly isOnline: () => boolean;
};

export type ProfileEditOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'offline' }
  | { readonly status: 'invalid'; readonly field: string }
  | { readonly status: 'refused'; readonly error: string; readonly field?: string };

const clearable = (value: string | undefined, current: string | null): string | null =>
  value === undefined ? current : value === '' ? null : value;

export function applyProfilePatch(profile: MyProfile, patch: ProfilePatch): MyProfile {
  return {
    ...profile,
    displayName: patch.displayName ?? profile.displayName,
    firstName: patch.firstName ?? profile.firstName,
    lastName: patch.lastName ?? profile.lastName,
    bio: patch.bio ?? profile.bio,
    systemLanguage: patch.systemLanguage ?? profile.systemLanguage,
    regionalLanguage: clearable(patch.regionalLanguage, profile.regionalLanguage),
    customDestinationLanguage: clearable(patch.customDestinationLanguage, profile.customDestinationLanguage),
  };
}

const emptyAsNull = (value: string | undefined): string | null | undefined =>
  value === undefined ? undefined : value === '' ? null : value;

function sessionFieldsOfPatch(patch: ProfilePatch): SessionProfileFields {
  const regionalLanguage = emptyAsNull(patch.regionalLanguage);
  const customDestinationLanguage = emptyAsNull(patch.customDestinationLanguage);
  return {
    ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
    ...(patch.systemLanguage === undefined ? {} : { systemLanguage: patch.systemLanguage }),
    ...(regionalLanguage === undefined ? {} : { regionalLanguage }),
    ...(customDestinationLanguage === undefined ? {} : { customDestinationLanguage }),
  };
}

export function sessionFieldsOfProfile(profile: MyProfile): SessionProfileFields {
  return {
    displayName: profile.displayName,
    avatar: profile.avatar,
    systemLanguage: profile.systemLanguage,
    regionalLanguage: profile.regionalLanguage,
    customDestinationLanguage: profile.customDestinationLanguage,
  };
}

function sessionFieldsOfUser(user: SessionUser): SessionProfileFields {
  return {
    displayName: user.displayName ?? null,
    avatar: user.avatar ?? null,
    ...(user.systemLanguage === undefined ? {} : { systemLanguage: user.systemLanguage }),
    regionalLanguage: user.regionalLanguage ?? null,
    customDestinationLanguage: user.customDestinationLanguage ?? null,
  };
}

/**
 * **MA FICHE PUBLIQUE SUIT MON PROFIL** (#8881) — `/u/<moi>` lit une AUTRE
 * clé (`publicProfileQueryKey`), persistée et servie par la passerelle sous
 * `Cache-Control: max-age=60` : sans cette projection, la photo et la bannière
 * qu'on vient de poser y restaient les anciennes jusqu'à la revalidation. Seul
 * ce que le porteur écrit est recopié — la relation et les compteurs restent
 * ceux que le serveur a servis.
 */
function confirmOntoPublicProfile(queryClient: QueryClient, profile: MyProfile): void {
  queryClient.setQueryData<PublicProfileView>(publicProfileQueryKey(profile.username), (view) =>
    view === undefined
      ? view
      : {
          ...view,
          profile: {
            ...view.profile,
            displayName: profile.displayName,
            avatar: profile.avatar,
            banner: profile.banner,
            bio: profile.bio === '' ? null : profile.bio,
          },
        },
  );
}

/**
 * La valeur SERVIE s'écrit partout où le porteur se voit : le cache du profil,
 * la session (en-tête, réglages, rail des stories), ma fiche publique et la
 * ligne de mon compte dans la liste de l'appareil (#8886) — celle que la
 * connexion et « Changer de compte » affichent.
 */
function confirm(deps: ProfileActionDeps, profile: MyProfile): void {
  deps.queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profile);
  deps.session.getState().updateUser(sessionFieldsOfProfile(profile));
  confirmOntoPublicProfile(deps.queryClient, profile);
  const user = heldUser(deps.session);
  if (user !== undefined) deps.accounts.refreshUser(user);
}

const heldUser = (session: SessionStoreApi): SessionUser | undefined => {
  const state = session.getState().session;
  return state.status === 'authenticated' ? state.user : undefined;
};

const touchesPrism = (patch: ProfilePatch): boolean => LANGUAGE_PATCH_KEYS.some((key) => patch[key] !== undefined);

export async function performProfileEdit(params: {
  readonly patch: ProfilePatch;
  readonly deps: ProfileActionDeps;
}): Promise<ProfileEditOutcome> {
  const { deps } = params;
  const validated = validateProfilePatch(params.patch);
  if (!validated.ok) return { status: 'invalid', field: validated.field };
  if (!deps.isOnline()) return { status: 'offline' };

  const patch = validated.patch;
  await deps.queryClient.cancelQueries({ queryKey: MY_PROFILE_QUERY_KEY });
  const profileSnapshot = deps.queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);
  const userSnapshot = heldUser(deps.session);

  if (profileSnapshot !== undefined) {
    deps.queryClient.setQueryData(MY_PROFILE_QUERY_KEY, applyProfilePatch(profileSnapshot, patch));
  }
  deps.session.getState().updateUser(sessionFieldsOfPatch(patch));

  const result = await patchMyProfile(deps, patch);

  if (!result.ok) {
    if (profileSnapshot !== undefined) deps.queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profileSnapshot);
    if (userSnapshot !== undefined) deps.session.getState().updateUser(sessionFieldsOfUser(userSnapshot));
    return { status: 'refused', error: result.error, ...(result.field === undefined ? {} : { field: result.field }) };
  }

  confirm(deps, result.data);
  if (touchesPrism(patch)) void deps.queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  return { status: 'saved' };
}

export type ImageUpdateOutcome =
  | { readonly status: 'saved'; readonly url: string; readonly bytesSent: number }
  | { readonly status: 'offline' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'refused'; readonly error: string };

export type ImageUpdateDeps = ProfileActionDeps & {
  readonly recompress?: (file: Blob, kind: ProfileImageKind) => Promise<Blob>;
};

/**
 * **CHANGER SA PHOTO OU SA BANNIÈRE** — le chemin d'iOS
 * (`ProfileView.uploadAvatar`, `:925-943`) : recompresser, téléverser par
 * `POST attachments.upload` (`uploadProfileImage`, partagé avec
 * l'administration — #8217), puis poser l'URL servie par `PATCH /users/me/avatar` ou
 * `/banner`. L'APERÇU local est tenu par l'écran, jamais par ce cache : une URL
 * `blob:` persistée survivrait au rechargement sans rien désigner.
 *
 * `bytesSent` est la taille RÉELLEMENT montée — la preuve que la
 * recompression a eu lieu, pas une estimation.
 */
export async function performImageUpdate(params: {
  readonly kind: ProfileImageKind;
  readonly file: Blob;
  readonly signal?: AbortSignal;
  readonly deps: ImageUpdateDeps;
}): Promise<ImageUpdateOutcome> {
  const { kind, file, signal, deps } = params;
  const upload = await uploadProfileImage({ kind, file, deps, ...(signal === undefined ? {} : { signal }) });
  if (upload.status !== 'uploaded') return upload;
  const { url, bytesSent } = upload;

  const result = await patchMyImage(deps, kind, url);
  if (!result.ok) return { status: 'refused', error: result.error };

  confirm(deps, result.data);
  repaintMyPortrait(deps.queryClient, { userId: result.data.id, avatar: result.data.avatar, banner: result.data.banner });
  return { status: 'saved', url, bytesSent };
}
