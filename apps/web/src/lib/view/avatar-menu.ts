import type { AuthorStoryRing } from './author-story-ring';

/**
 * **LE MENU D'UN AVATAR** (#7828) — ce que propose l'appui long sur l'identité
 * d'une personne. Miroir `MeeshyAvatar.effectiveContextMenuItems`
 * (`MeeshyAvatar.swift:331-354`) : « Voir le profil », puis « Voir la story »
 * quand un anneau existe (vue ou non), puis les entrées de l'hôte — ici
 * « Détails de la conversation ».
 *
 * Chaque entrée n'existe que si elle a un EFFET (loi 4) : sans pseudo, pas de
 * profil (`/u/` n'est pas une adresse) ; sans anneau, pas de story ; sans
 * hôte capable d'ouvrir les détails, pas d'entrée « Détails ». Une liste vide
 * veut dire « pas de menu » — l'appui long retombe alors sur l'hôte parent.
 *
 * Le TOUCHER reste la loi de `identityTarget` : le menu ajoute des chemins, il
 * n'en déplace aucun.
 */
export type AvatarMenuEntry =
  | { readonly kind: 'profile'; readonly username: string }
  | { readonly kind: 'story'; readonly post: string }
  | { readonly kind: 'details' };

export function avatarMenuEntries(params: {
  readonly username?: string | null | undefined;
  readonly storyRing?: AuthorStoryRing | undefined;
  readonly details: boolean;
}): readonly AvatarMenuEntry[] {
  const username = typeof params.username === 'string' && params.username !== '' ? params.username : undefined;
  const post = params.storyRing?.entryStoryId;
  return [
    ...(username === undefined ? [] : [{ kind: 'profile', username } as const]),
    ...(post === undefined || post === '' ? [] : [{ kind: 'story', post } as const]),
    ...(params.details ? [{ kind: 'details' } as const] : []),
  ];
}
