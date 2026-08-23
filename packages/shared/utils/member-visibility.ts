import {
  GLOBAL_ROLE_HIERARCHY,
  GlobalUserRole,
  MEMBER_ROLE_HIERARCHY,
  MemberRole,
  globalRoleLevel,
} from '../types/role-types.js';

/**
 * Au-delà de ce seuil, l'effectif d'une conversation est servi plafonné
 * (« 199+ ») à tout lecteur que `canViewExactMemberCount` n'autorise pas.
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
 * drapeau au-delà, ENTIER et sans plafond pour un lecteur autorisé
 * (`canViewExactMemberCount`). L'absence du drapeau signifie « non plafonné ».
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
 * Le niveau PLATEFORME que les deux prédicats de ce fichier lisent.
 *
 * Exporté parce que la propriété « échoue fermé » qu'ils annoncent ne
 * s'observe nulle part ailleurs : les deux seuils en place (MODERATOR = 60,
 * USER = 10) refusent aussi bien un niveau 0 qu'un niveau 10, donc un rôle
 * inconnu promu à USER produirait exactement les mêmes réponses — une
 * régression invisible, sous un test vert.
 */
export const platformRoleLevel = (role: string | null | undefined): number =>
  globalRoleLevel(role ?? '');

export type MemberCountViewer = {
  readonly platformRole?: string | null;
  readonly conversationRole?: string | null;
};

/**
 * Qui a droit à l'effectif ENTIER d'une conversation, sans aucun plafond.
 *
 * Deux titres, jamais un seul : le rôle PLATEFORME à partir de MODERATOR
 * (MODERATOR, ADMIN, BIGBOSS — AUDIT et ANALYST lisent des journaux, pas des
 * annuaires), OU le rôle dans la CONVERSATION à partir d'admin (admin,
 * creator). Le second est le vrai élargissement : l'admin d'un groupe de 250
 * personnes administre un effectif qu'aucun écran ne lui montrait.
 *
 * Séparé d'`isMemberListingRestricted` à dessein — ce sont deux questions
 * distinctes : « combien sont-ils » n'est pas « qui sont-ils ». Le listing
 * s'ouvre à tout rôle au-dessus de simple membre (moderator de conversation,
 * AUDIT plateforme, admin de communauté) ; l'effectif exact, non.
 *
 * Échoue fermé DES DEUX CÔTÉS : un rôle inconnu vaut niveau 0. Le niveau
 * plateforme se lit par `globalRoleLevel`, jamais par `normalizeGlobalRole` —
 * ce dernier RÉPARE une chaîne inconnue en `USER`, donc niveau 10, ce qui
 * n'était sans effet que parce que le seuil vaut 60.
 */
export function canViewExactMemberCount(viewer: MemberCountViewer): boolean {
  if (platformRoleLevel(viewer.platformRole) >= GLOBAL_ROLE_HIERARCHY[GlobalUserRole.MODERATOR]) return true;
  return memberLevel(viewer.conversationRole) >= MEMBER_ROLE_HIERARCHY[MemberRole.ADMIN];
}

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
  if (platformRoleLevel(viewer.platformRole) > GLOBAL_ROLE_HIERARCHY[GlobalUserRole.USER]) return false;
  if (memberLevel(viewer.conversationRole) > MEMBER_ROLE_HIERARCHY[MemberRole.MEMBER]) return false;
  if (memberLevel(viewer.communityRole) > MEMBER_ROLE_HIERARCHY[MemberRole.MEMBER]) return false;
  return true;
}
