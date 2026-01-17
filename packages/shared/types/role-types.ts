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
 * BIGBOSS > ADMIN > MODO > AUDIT > ANALYST > USER
 *
 * @see schema.prisma User.role
 */
export enum GlobalUserRole {
  /** Super administrateur - tous les droits */
  BIGBOSS = 'BIGBOSS',
  /** Administrateur - gestion complète sauf configuration système */
  ADMIN = 'ADMIN',
  /** Modérateur global - modération de contenu */
  MODO = 'MODO',
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
  | 'MODO'
  | 'AUDIT'
  | 'ANALYST'
  | 'USER';

/**
 * Alias pour rétrocompatibilité avec les anciens noms
 */
export const GLOBAL_ROLE_ALIASES: Record<string, GlobalUserRole> = {
  'MODERATOR': GlobalUserRole.MODO,
  'CREATOR': GlobalUserRole.ADMIN,
  'MEMBER': GlobalUserRole.USER,
};

/**
 * Hiérarchie numérique des rôles globaux
 * Plus le nombre est élevé, plus les permissions sont importantes
 */
export const GLOBAL_ROLE_HIERARCHY: Record<GlobalUserRole, number> = {
  [GlobalUserRole.BIGBOSS]: 100,
  [GlobalUserRole.ADMIN]: 80,
  [GlobalUserRole.MODO]: 60,
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
  // Vérifier les alias d'abord
  const aliasRole = GLOBAL_ROLE_ALIASES[upper];
  if (aliasRole !== undefined) {
    return aliasRole;
  }
  // Vérifier si c'est un rôle valide
  if (Object.values(GlobalUserRole).includes(upper as GlobalUserRole)) {
    return upper as GlobalUserRole;
  }
  // Par défaut, retourner USER
  return GlobalUserRole.USER;
}

// ============================================================================
// CONVERSATION MEMBER ROLES - Rôles dans une conversation
// ============================================================================

/**
 * Rôles d'un membre dans une conversation
 * Ces rôles sont contextuels à une conversation spécifique.
 *
 * @see schema.prisma ConversationMember.role
 */
export enum ConversationMemberRole {
  /** Administrateur de la conversation */
  ADMIN = 'admin',
  /** Modérateur de la conversation */
  MODERATOR = 'moderator',
  /** Membre standard */
  MEMBER = 'member',
}

/**
 * Type string union pour les rôles de conversation
 */
export type ConversationMemberRoleType = 'admin' | 'moderator' | 'member';

/**
 * Hiérarchie des rôles de conversation
 */
export const CONVERSATION_ROLE_HIERARCHY: Record<ConversationMemberRole, number> = {
  [ConversationMemberRole.ADMIN]: 30,
  [ConversationMemberRole.MODERATOR]: 20,
  [ConversationMemberRole.MEMBER]: 10,
};

/**
 * Vérifie si un rôle de conversation a un niveau égal ou supérieur à un autre
 */
export function hasMinimumConversationRole(
  userRole: ConversationMemberRole | ConversationMemberRoleType,
  requiredRole: ConversationMemberRole | ConversationMemberRoleType
): boolean {
  const userLevel = CONVERSATION_ROLE_HIERARCHY[userRole as ConversationMemberRole] || 0;
  const requiredLevel = CONVERSATION_ROLE_HIERARCHY[requiredRole as ConversationMemberRole] || 0;
  return userLevel >= requiredLevel;
}

// ============================================================================
// COMMUNITY ROLES - Rôles dans une communauté
// ============================================================================

/**
 * Rôles d'un membre dans une communauté
 * Similaire aux rôles de conversation mais avec un contexte communauté.
 *
 * @see schema.prisma CommunityMember.role
 */
export enum CommunityMemberRole {
  /** Créateur/propriétaire de la communauté */
  CREATOR = 'creator',
  /** Administrateur de la communauté */
  ADMIN = 'admin',
  /** Modérateur de la communauté */
  MODERATOR = 'moderator',
  /** Membre standard */
  MEMBER = 'member',
}

/**
 * Type string union pour les rôles de communauté
 */
export type CommunityMemberRoleType = 'creator' | 'admin' | 'moderator' | 'member';

/**
 * Hiérarchie des rôles de communauté
 */
export const COMMUNITY_ROLE_HIERARCHY: Record<CommunityMemberRole, number> = {
  [CommunityMemberRole.CREATOR]: 40,
  [CommunityMemberRole.ADMIN]: 30,
  [CommunityMemberRole.MODERATOR]: 20,
  [CommunityMemberRole.MEMBER]: 10,
};

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
 * @deprecated Utilisez ConversationMemberRole ou ConversationMemberRoleType à la place
 */
export type ConversationRole = ConversationMemberRoleType;

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
 * Vérifie si une valeur est un rôle de conversation valide
 */
export function isConversationMemberRole(value: string): value is ConversationMemberRoleType {
  const validRoles: string[] = Object.values(ConversationMemberRole);
  return validRoles.includes(value.toLowerCase());
}

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
  return hasMinimumRole(role, GlobalUserRole.MODO);
}

/**
 * Vérifie si un membre est admin de la conversation
 */
export function isConversationAdmin(role: ConversationMemberRole | ConversationMemberRoleType | string): boolean {
  const normalized = typeof role === 'string' ? role.toLowerCase() : role;
  return normalized === ConversationMemberRole.ADMIN;
}

/**
 * Vérifie si un membre est modérateur de la conversation ou plus
 */
export function isConversationModerator(role: ConversationMemberRole | ConversationMemberRoleType): boolean {
  return hasMinimumConversationRole(role, ConversationMemberRole.MODERATOR);
}
