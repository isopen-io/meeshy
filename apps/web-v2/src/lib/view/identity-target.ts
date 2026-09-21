import type { AuthorStoryRing } from './author-story-ring';

/**
 * **OÙ MÈNE L'IDENTITÉ D'UNE PERSONNE** (#7241, directive porteur du
 * 2026-09-21) — un site unique, parce que l'AVATAR et le NOM doivent mener au
 * même endroit.
 *
 * ## Pourquoi une loi et pas deux composants qui décident chacun
 *
 * La règle était déjà écrite dans `Avatar` (#7185) : l'anneau de story prime
 * sur le profil. Le jour où le NOM devient tapable à côté de l'avatar, deux
 * décisions parallèles se mettent à dériver — et rien ne rougit quand un avatar
 * ouvre une story pendant que le nom juste à côté ouvre un profil. Ce n'est pas
 * une hypothèse : c'est la forme exacte des trois familles de résolveurs de
 * Prisme que le dépôt a laissé diverger en trois cycles.
 *
 * ## LA PRIORITÉ, ET SA RAISON
 *
 * L'anneau gagne parce qu'il est **visible** : il annonce ce qu'il ouvre. Un
 * avatar cerclé qui mènerait au profil contredirait ce que le lecteur voit.
 * Sans anneau, l'identité mène au profil. Sans pseudo, elle ne mène nulle part
 * — et alors **rien ne doit paraître tapable** (loi 4).
 */
export type IdentityTarget =
  | { readonly kind: 'story'; readonly post: string }
  | { readonly kind: 'profile'; readonly username: string };

/**
 * `null` est le cas NOMINAL sur bien des surfaces : un participant anonyme n'a
 * pas de pseudo, et un message système n'a pas d'auteur. L'appelant ne rend une
 * cible que sur une valeur non nulle.
 */
export function identityTarget(params: {
  readonly username?: string | null | undefined;
  readonly storyRing?: AuthorStoryRing | undefined;
}): IdentityTarget | null {
  if (params.storyRing !== undefined) return { kind: 'story', post: params.storyRing.entryStoryId };

  const username = params.username;
  if (typeof username !== 'string' || username === '') return null;

  return { kind: 'profile', username };
}
