import type { AuthorStoryRing } from './author-story-ring';

/**
 * **OÙ MÈNE L'IDENTITÉ D'UNE PERSONNE** (#7241, directive porteur du
 * 2026-09-21) — un site unique, parce que l'AVATAR et le NOM doivent mener au
 * même endroit.
 *
 * ## Pourquoi une loi et pas deux composants qui décident chacun
 *
 * La règle était déjà écrite dans `Avatar` (#7185) : l'anneau de story passait avant
 * sur le profil. Le jour où le NOM devient tapable à côté de l'avatar, deux
 * décisions parallèles se mettent à dériver — et rien ne rougit quand un avatar
 * ouvre une story pendant que le nom juste à côté ouvre un profil. Ce n'est pas
 * une hypothèse : c'est la forme exacte des trois familles de résolveurs de
 * Prisme que le dépôt a laissé diverger en trois cycles.
 *
 * ## LA RÈGLE, COMMUNE AU WEB ET À iOS (#7828, #7830, jumelle iOS #7831)
 *
 * Le toucher ouvre la story quand elle n'a PAS ENCORE ÉTÉ VUE — c'est ce que
 * l'anneau plein annonce, et c'est ce qu'iOS fait déjà
 * (`MeeshyAvatar.swift:361-365` : `.unread` ⇒ story, sinon `onSenderTap` ⇒
 * profil). Une story DÉJÀ VUE laisse le toucher au profil ; elle reste
 * atteignable par l'entrée « Voir la story » de l'appui long
 * (`lib/view/avatar-menu.ts`). Sans pseudo, l'identité ne mène nulle part —
 * et alors **rien ne doit paraître tapable** (loi 4).
 *
 * Jusqu'au 2026-09-24, tout anneau ouvrait sa story, même vue : le porteur a
 * énoncé la règle ci-dessus, la même sur toutes les surfaces (#7241).
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
  const ring = params.storyRing;
  if (ring !== undefined && ring.unseen) return { kind: 'story', post: ring.entryStoryId };

  const username = params.username;
  if (typeof username !== 'string' || username === '') return null;

  return { kind: 'profile', username };
}
