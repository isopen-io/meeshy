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

/**
 * L'EFFECTIF d'une communauté (#18766, seconde tranche de #16857) — trois
 * noms, découpés comme la jumelle conversation (`participant:joined`,
 * `participant:left`, `participant:role-updated`).
 *
 * Audience : la room personnelle de chaque membre ACTIF après l'écriture, du
 * créateur, et de la personne CONCERNÉE (qui apprend son propre départ ou
 * retrait sur ses autres appareils). Jamais un non-membre, jamais un ancien
 * membre tiers.
 *
 * La charge ne nomme la personne que par son identifiant, comme la liste des
 * membres que chaque destinataire lit déjà : ni profil, ni présence, ni
 * coordonnées. Un client qui veut le profil relit la liste, qui repasse par
 * les gardes de la passerelle. `memberCount` compte les membres ACTIFS après
 * l'écriture ; `at` est une chaîne ISO.
 */
export type CommunityMemberRole = 'admin' | 'moderator' | 'member';

/** Comment la personne est entrée : d'elle-même, ou par un tiers (invitation, ajout). */
export type CommunityMemberJoinVia = 'self' | 'invited';

/** Comment la personne est sortie : d'elle-même, ou retirée par un administrateur. */
export type CommunityMemberLeftReason = 'left' | 'removed';

export interface CommunityMemberJoinedEventData {
  readonly communityId: string;
  readonly userId: string;
  readonly role: CommunityMemberRole;
  readonly via: CommunityMemberJoinVia;
  readonly memberCount: number;
  readonly at: string;
}

export interface CommunityMemberLeftEventData {
  readonly communityId: string;
  readonly userId: string;
  readonly reason: CommunityMemberLeftReason;
  readonly memberCount: number;
  readonly at: string;
}

export interface CommunityMemberRoleUpdatedEventData {
  readonly communityId: string;
  readonly userId: string;
  readonly role: CommunityMemberRole;
  readonly memberCount: number;
  readonly at: string;
}

/**
 * `community:deleted` (#19590, dernière tranche de #16857) — la communauté
 * n'existe plus pour ses membres : supprimée par son créateur (`deleted`) ou
 * désactivée par l'équipe (`deactivated`).
 *
 * Audience : la room personnelle de chaque membre ACTIF et du créateur, lue
 * AVANT l'écriture (la suppression efface les lignes d'appartenance), une fois
 * chacun. Jamais un ancien membre, jamais un non-membre.
 *
 * La charge ne dit que QUOI a disparu et QUAND : ni membres, ni créateur, ni
 * identité. Le client retire la communauté de ses caches ; une relecture du
 * détail repasse par les gardes de la passerelle (404). Une réactivation par
 * l'équipe est annoncée par `community:updated`. `at` est une chaîne ISO.
 */
export type CommunityDeletedReason = 'deleted' | 'deactivated';

export interface CommunityDeletedEventData {
  readonly communityId: string;
  readonly reason: CommunityDeletedReason;
  readonly at: string;
}
