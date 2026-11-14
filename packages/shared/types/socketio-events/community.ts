/**
 * Les événements temps réel d'une COMMUNAUTÉ (#16857).
 *
 * Une communauté n'avait aucune surface temps réel : renommer, changer
 * l'avatar, la bannière ou la confidentialité restait invisible sur l'écran
 * ouvert des autres membres jusqu'à la péremption de leur cache. Ce sont des
 * noms NEUFS (`community:*`), jamais l'élargissement d'un événement de
 * conversation : un décodeur strict rend l'élargissement plus cher que le nom
 * neuf (`UserPreferencesCommunityReorderedEventData`), et un ancien client
 * ignore un nom qu'il ne connaît pas.
 */

/**
 * `community:updated` (#18435) — l'IDENTITÉ publique d'une communauté telle
 * qu'elle vient d'être écrite. Diffusé sur la room personnelle `user:<id>` de
 * chaque membre ACTIF et du créateur, jamais à un ancien membre ni à un
 * non-membre.
 *
 * La charge ne porte que ce que tout membre lit déjà dans le détail : ni les
 * membres, ni leur présence, ni l'agrégat « N en ligne », ni le créateur. Le
 * nom et la description voyagent tels que STOCKÉS (échappés, #16786), comme
 * dans la réponse HTTP : le client les décode par le même chemin.
 * `memberCount` compte les membres ACTIFS après l'écriture (une bascule en
 * privée en fait entrer, #16741). `updatedAt` est une chaîne ISO.
 */
export interface CommunityUpdatedEventData {
  readonly communityId: string;
  readonly identifier: string;
  readonly name: string;
  readonly description: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly isPrivate: boolean;
  readonly memberCount: number;
  readonly updatedAt: string;
}
