import {
  GLOBAL_ROLE_HIERARCHY,
  GlobalUserRole,
  MEMBER_ROLE_HIERARCHY,
  MemberRole,
  normalizeGlobalRole,
} from '../types/role-types.js';

/**
 * Au-delà de ce seuil, l'effectif d'une conversation est servi plafonné
 * (« 199+ ») à tout lecteur qui n'est pas administrateur plateforme.
 */
export const MEMBER_COUNT_DISPLAY_CAP = 199;

/**
 * Taille du listing de membres servi à un simple membre : les N participants
 * les plus actifs, jamais l'annuaire complet.
 */
export const ACTIVE_MEMBER_LISTING_LIMIT = 99;

export type PresentedMemberCount = {
  readonly memberCount: number;
  readonly memberCountCapped?: true;
};

/**
 * Présente un effectif de conversation pour le fil : plafonné à 199 avec
 * drapeau au-delà, exact pour les lecteurs autorisés (admins plateforme).
 * L'absence du drapeau sur le fil signifie « non plafonné ».
 */
export function presentMemberCount(
  count: number,
  options?: { readonly viewerSeesExactCount?: boolean }
): PresentedMemberCount {
  if (options?.viewerSeesExactCount || count <= MEMBER_COUNT_DISPLAY_CAP) {
    return { memberCount: count };
  }
  return { memberCount: MEMBER_COUNT_DISPLAY_CAP, memberCountCapped: true };
}

/**
 * Rendu client d'un effectif présenté : « 199+ » quand plafonné, la valeur
 * brute sinon. Chiffres + « + » : identique dans toutes les langues.
 */
export function formatMemberCount(count: number, capped?: boolean): string {
  return capped ? `${count}+` : `${count}`;
}

const memberLevel = (role: string | null | undefined): number =>
  MEMBER_ROLE_HIERARCHY[(role ?? '').toLowerCase() as MemberRole] ?? 0;

/**
 * Le listing des membres est restreint aux plus actifs pour un lecteur qui est
 * simple USER plateforme ET simple member de la conversation, sauf s'il tient
 * un rôle au-dessus de member dans la communauté qui héberge la conversation.
 * Un lecteur sans rôle plateforme (anonyme) est restreint par construction.
 */
export function isMemberListingRestricted(viewer: {
  readonly platformRole?: string | null;
  readonly conversationRole?: string | null;
  readonly communityRole?: string | null;
}): boolean {
  const platformLevel = viewer.platformRole
    ? GLOBAL_ROLE_HIERARCHY[normalizeGlobalRole(viewer.platformRole)]
    : 0;
  if (platformLevel > GLOBAL_ROLE_HIERARCHY[GlobalUserRole.USER]) return false;
  if (memberLevel(viewer.conversationRole) > MEMBER_ROLE_HIERARCHY[MemberRole.MEMBER]) return false;
  if (memberLevel(viewer.communityRole) > MEMBER_ROLE_HIERARCHY[MemberRole.MEMBER]) return false;
  return true;
}
