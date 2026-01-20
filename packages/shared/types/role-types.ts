/**
 * Role Types - Types de rôles canoniques
 *
 * Ce fichier centralise tous les types de rôles utilisés dans l'application.
 * Distingue les rôles globaux (système) des rôles contextuels (conversation, communauté).
 *
 * @module role-types
 */

// ============================================================================
// GLOBAL USER ROLES - Rôles système globaux
// ============================================================================

/**
 * Rôles globaux des utilisateurs (aligné avec schema.prisma User.role)
 * Ces rôles définissent les permissions système de l'utilisateur.
 *
 * Hiérarchie (du plus élevé au plus bas):
 * BIGBOSS > ADMIN > MODERATOR > AUDIT > ANALYST > USER
 *
 * @see schema.prisma User.role
 */
export enum GlobalUserRole {
  /** Super administrateur - tous les droits */
  BIGBOSS = 'BIGBOSS',
  /** Administrateur - gestion complète sauf configuration système */
  ADMIN = 'ADMIN',
  /** Modérateur global - modération de contenu */
  MODERATOR = 'MODERATOR',
  /** Auditeur - accès aux logs et audits en lecture seule */
  AUDIT = 'AUDIT',
  /** Analyste - accès aux analytics en lecture seule */
  ANALYST = 'ANALYST',
  /** Utilisateur standard */
  USER = 'USER',
}

/**
 * Type string union pour les rôles globaux
 * Utilisé quand l'enum n'est pas pratique (JSON, API, etc.)
 */
export type GlobalUserRoleType =
  | 'BIGBOSS'
  | 'ADMIN'
  | 'MODERATOR'
  | 'AUDIT'
  | 'ANALYST'
  | 'USER';

/**
 * Hiérarchie numérique des rôles globaux
 * Plus le nombre est élevé, plus les permissions sont importantes
 */
export const GLOBAL_ROLE_HIERARCHY: Record<GlobalUserRole, number> = {
  [GlobalUserRole.BIGBOSS]: 100,
  [GlobalUserRole.ADMIN]: 80,
  [GlobalUserRole.MODERATOR]: 60,
  [GlobalUserRole.AUDIT]: 40,
  [GlobalUserRole.ANALYST]: 30,
  [GlobalUserRole.USER]: 10,
};

/**
 * Vérifie si un rôle a un niveau égal ou supérieur à un autre
 */
export function hasMinimumRole(
  userRole: GlobalUserRole | GlobalUserRoleType,
  requiredRole: GlobalUserRole | GlobalUserRoleType
): boolean {
  const userLevel = GLOBAL_ROLE_HIERARCHY[userRole as GlobalUserRole] || 0;
  const requiredLevel = GLOBAL_ROLE_HIERARCHY[requiredRole as GlobalUserRole] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Normalise un rôle string vers GlobalUserRole
 */
export function normalizeGlobalRole(role: string): GlobalUserRole {
  const upper = role.toUpperCase();
  // Vérifier si c'est un rôle valide
  if (Object.values(GlobalUserRole).includes(upper as GlobalUserRole)) {
    return upper as GlobalUserRole;
  }
  // Par défaut, retourner USER
  return GlobalUserRole.USER;
}

// ============================================================================
// MEMBER ROLES - Rôles dans une conversation ou communauté (unifié)
// ============================================================================

/**
 * Rôles d'un membre dans une conversation ou une communauté
 * Type unifié qui remplace ConversationMemberRole et CommunityMemberRole
 *
 * @see schema.prisma ConversationMember.role
 * @see schema.prisma CommunityMember.role
 */
export enum MemberRole {
  /** Créateur/propriétaire (conversation ou communauté) */
  CREATOR = 'creator',
  /** Administrateur */
  ADMIN = 'admin',
  /** Modérateur */
  MODERATOR = 'moderator',
  /** Membre standard */
  MEMBER = 'member',
}

/**
 * Type string union pour les rôles de membre
 */
export type MemberRoleType = 'creator' | 'admin' | 'moderator' | 'member';

/**
 * Hiérarchie des rôles de membre
 */
export const MEMBER_ROLE_HIERARCHY: Record<MemberRole, number> = {
  [MemberRole.CREATOR]: 40,
  [MemberRole.ADMIN]: 30,
  [MemberRole.MODERATOR]: 20,
  [MemberRole.MEMBER]: 10,
};

/**
 * Vérifie si un rôle de membre a un niveau égal ou supérieur à un autre
 */
export function hasMinimumMemberRole(
  userRole: MemberRole | MemberRoleType | string,
  requiredRole: MemberRole | MemberRoleType
): boolean {
  const userLevel = MEMBER_ROLE_HIERARCHY[userRole as MemberRole] || 0;
  const requiredLevel = MEMBER_ROLE_HIERARCHY[requiredRole as MemberRole] || 0;
  return userLevel >= requiredLevel;
}

// Aliases de compatibilité (à supprimer progressivement)
/** @deprecated Utilisez hasMinimumMemberRole à la place */
export const hasMinimumConversationRole = hasMinimumMemberRole;
/** @deprecated Utilisez MEMBER_ROLE_HIERARCHY à la place */
export const CONVERSATION_ROLE_HIERARCHY = MEMBER_ROLE_HIERARCHY;
/** @deprecated Utilisez MEMBER_ROLE_HIERARCHY à la place */
export const COMMUNITY_ROLE_HIERARCHY = MEMBER_ROLE_HIERARCHY;

// ============================================================================
// WRITE PERMISSIONS - Permissions d'écriture dans une conversation
// ============================================================================

/**
 * Rôle minimum requis pour envoyer des messages dans une conversation
 *
 * @see schema.prisma Conversation.defaultWriteRole
 */
export type WritePermissionLevel =
  | 'everyone'   // Tout le monde (y compris anonymes)
  | 'member'     // Membres uniquement
  | 'moderator'  // Modérateurs et au-dessus
  | 'admin'      // Admins et au-dessus
  | 'creator';   // Créateur uniquement

/**
 * Hiérarchie des permissions d'écriture
 */
export const WRITE_PERMISSION_HIERARCHY: Record<WritePermissionLevel, number> = {
  'everyone': 0,
  'member': 10,
  'moderator': 20,
  'admin': 30,
  'creator': 40,
};

// ============================================================================
// LEGACY ALIASES - Compatibilité avec les anciens types
// ============================================================================

/**
 * Type UserRole unifié pour rétrocompatibilité
 * Combine les valeurs des rôles globaux avec les alias legacy
 *
 * @deprecated Utilisez GlobalUserRole ou GlobalUserRoleType à la place
 */
export type UserRole =
  | 'USER'
  | 'ADMIN'
  | 'MODO'
  | 'BIGBOSS'
  | 'AUDIT'
  | 'ANALYST'
  // Aliases legacy
  | 'MODERATOR'
  | 'CREATOR'
  | 'MEMBER';

/**
 * Type ConversationRole pour rétrocompatibilité
 *
 * @deprecated Utilisez MemberRole ou MemberRoleType à la place
 */
export type ConversationRole = MemberRoleType;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Vérifie si une valeur est un rôle global valide
 */
export function isGlobalUserRole(value: string): value is GlobalUserRoleType {
  const validRoles: string[] = Object.values(GlobalUserRole);
  return validRoles.includes(value.toUpperCase());
}

/**
 * Vérifie si une valeur est un rôle de membre valide
 */
export function isMemberRole(value: string): value is MemberRoleType {
  const validRoles: string[] = Object.values(MemberRole);
  return validRoles.includes(value.toLowerCase());
}

/** @deprecated Utilisez isMemberRole à la place */
export const isConversationMemberRole = isMemberRole;

/**
 * Vérifie si un utilisateur est un administrateur global (ADMIN ou BIGBOSS)
 */
export function isGlobalAdmin(role: GlobalUserRole | GlobalUserRoleType | string): boolean {
  const normalized = typeof role === 'string' ? role.toUpperCase() : role;
  return normalized === GlobalUserRole.ADMIN ||
         normalized === GlobalUserRole.BIGBOSS;
}

/**
 * Vérifie si un utilisateur est un modérateur global ou plus
 */
export function isGlobalModerator(role: GlobalUserRole | GlobalUserRoleType): boolean {
  return hasMinimumRole(role, GlobalUserRole.MODERATOR);
}

/**
 * Vérifie si un membre est admin
 */
export function isMemberAdmin(role: MemberRole | MemberRoleType | string): boolean {
  const normalized = typeof role === 'string' ? role.toLowerCase() : role;
  return normalized === MemberRole.ADMIN;
}

/**
 * Vérifie si un membre est modérateur ou plus
 */
export function isMemberModerator(role: MemberRole | MemberRoleType | string): boolean {
  return hasMinimumMemberRole(role, MemberRole.MODERATOR);
}

/**
 * Vérifie si un membre est créateur
 */
export function isMemberCreator(role: MemberRole | MemberRoleType | string): boolean {
  const normalized = typeof role === 'string' ? role.toLowerCase() : role;
  return normalized === MemberRole.CREATOR;
}

// Aliases de compatibilité (à supprimer progressivement)
/** @deprecated Utilisez isMemberAdmin à la place */
export const isConversationAdmin = isMemberAdmin;
/** @deprecated Utilisez isMemberModerator à la place */
export const isConversationModerator = isMemberModerator;
