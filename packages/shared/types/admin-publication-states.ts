/**
 * **L'ÉTAT D'UNE PUBLICATION ET LES GESTES QU'IL PERMET** (#10392, #10394) — la part
 * SANS Zod du contrat `admin-publications.ts` : les constantes, l'état lu par priorité
 * (`adminPostStateOf`) et les gestes offerts (`adminGesturesFor`). Un client web les
 * importe d'ici sans tirer Zod dans son chunk ; `admin-publications.ts` les ré-exporte.
 *
 * L'état LU d'une publication tient en cinq valeurs, une seule à la fois, par
 * priorité : supprimée > hors ligne (`moderationHiddenAt`) > expirée > privée
 * (`visibility = PRIVATE` sans retrait) > publiée.
 */

export const ADMIN_POST_STATES = ['published', 'offline', 'private', 'expired', 'deleted'] as const;
export type AdminPostState = (typeof ADMIN_POST_STATES)[number];

export const ADMIN_POST_VISIBILITIES = ['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY'] as const;
export type AdminPostVisibility = (typeof ADMIN_POST_VISIBILITIES)[number];

/** Les audiences que l'administration pose ; `EXCEPT` et `ONLY` exigent une liste que seul l'auteur choisit. */
export const ADMIN_SETTABLE_VISIBILITIES = ['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE'] as const;
export type AdminSettableVisibility = (typeof ADMIN_SETTABLE_VISIBILITIES)[number];

export const ADMIN_POST_GESTURES = ['take-offline', 'restore', 'set-visibility'] as const;
export type AdminPostGestureName = (typeof ADMIN_POST_GESTURES)[number];

export const ADMIN_POST_GESTURE_OUTCOMES = ['applied', 'unchanged', 'refused'] as const;
export type AdminPostGestureOutcome = (typeof ADMIN_POST_GESTURE_OUTCOMES)[number];

export const ADMIN_REPORT_ACTIONS = ['take-offline', 'make-private', 'remove-comment', 'dismiss'] as const;
export type AdminReportAction = (typeof ADMIN_REPORT_ACTIONS)[number];

export const ADMIN_POST_BATCH_MAX = 50;
export const ADMIN_MODERATION_REASON_MAX = 500;

export type AdminPostStateFacts = {
  readonly visibility: string;
  readonly deletedAt: Date | string | null;
  readonly expiresAt: Date | string | null;
  readonly moderationHiddenAt: Date | string | null;
};

const instantOf = (value: Date | string | null): number | null => {
  if (value === null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

/** L'état LU d'une publication — une seule définition pour la passerelle et l'espace web. */
export function adminPostStateOf(facts: AdminPostStateFacts, now: Date): AdminPostState {
  if (facts.deletedAt !== null && facts.deletedAt !== '') return 'deleted';
  if (facts.moderationHiddenAt !== null && facts.moderationHiddenAt !== '') return 'offline';
  const expiry = instantOf(facts.expiresAt);
  if (expiry !== null && expiry <= now.getTime()) return 'expired';
  if (facts.visibility === 'PRIVATE') return 'private';
  return 'published';
}

/**
 * Ce que chaque état laisse faire d'un geste — l'interface ne propose que ceux-là.
 * Une publication hors ligne se remet en ligne avec l'audience de son auteur
 * (`restore`) ou avec celle que l'administration choisit (`set-visibility`).
 */
export function adminGesturesFor(state: AdminPostState): readonly AdminPostGestureName[] {
  switch (state) {
    case 'deleted':
      return [];
    case 'offline':
      return ['restore', 'set-visibility'];
    case 'published':
    case 'private':
    case 'expired':
      return ['take-offline', 'set-visibility'];
  }
}

/**
 * **L'AUDIENCE DE L'AUTEUR** (#10471) — une seule loi, lue par la passerelle
 * (`services/admin/publication-moderation.ts`) et par l'espace web.
 *
 * `moderationPriorVisibility` porte l'audience que l'AUTEUR a choisie dès qu'un geste
 * d'administration en sert une autre — vers `PRIVATE` comme vers une audience plus
 * étroite —, et `null` quand l'audience servie est la sienne. L'auteur l'efface
 * lui-même en rechoisissant (`moderationHold.ts`). Sans elle, un resserrement oubliait
 * l'audience d'origine : revenir en arrière passait pour un élargissement, et
 * « Remettre en ligne » rendait le resserrement.
 */
export type AdminAudienceFacts<V extends string = string> = {
  readonly visibility: V;
  readonly moderationPriorVisibility: V | null;
};

export function authorAudienceOf<V extends string>(facts: AdminAudienceFacts<V>): V {
  return facts.moderationPriorVisibility ?? facts.visibility;
}

/** L'audience à retenir quand l'administration sert `served` : celle de l'auteur si elle en diffère. */
export function heldAuthorAudience<V extends string>(facts: AdminAudienceFacts<V>, served: V): V | null {
  const author = authorAudienceOf(facts);
  return author === served ? null : author;
}

/**
 * **L'ADMINISTRATION NE PUBLIE JAMAIS AU-DELÀ DE CE QUE L'AUTEUR A CHOISI** (#10453).
 * Seul `PUBLIC` contient toutes les autres audiences ; `FRIENDS`, `COMMUNITY`, `EXCEPT`
 * et `ONLY` ne se comparent pas entre elles, donc passer de l'une à l'autre élargit
 * pour quelqu'un. Resserrer et rendre l'audience de l'auteur restent permis.
 */
export function widensAuthorAudience(facts: AdminAudienceFacts, target: AdminSettableVisibility): boolean {
  const author = authorAudienceOf(facts);
  if (target === 'PRIVATE' || target === author) return false;
  return author !== 'PUBLIC';
}

/** Les audiences qu'un écran d'administration propose : celles que la passerelle accepte. */
export function adminAudiencesOffered(facts: AdminAudienceFacts): readonly AdminSettableVisibility[] {
  return ADMIN_SETTABLE_VISIBILITIES.filter((visibility) => !widensAuthorAudience(facts, visibility));
}
