/**
 * Types unifiés pour les communautés Meeshy
 * Harmonisation Gateway ↔ Frontend
 */

/**
 * Rôles des membres d'une communauté
 * Hiérarchie: ADMIN > MODERATOR > MEMBER
 */
export enum CommunityRole {
  /** Administrateur - Permissions complètes sur la communauté */
  ADMIN = 'admin',
  /** Modérateur - Peut modérer le contenu et les membres */
  MODERATOR = 'moderator',
  /** Membre - Rôle par défaut, accès standard */
  MEMBER = 'member'
}

/**
 * Type helper pour les valeurs de rôle
 */
export type CommunityRoleValue = `${CommunityRole}`;

/**
 * Permissions d'un membre de communauté selon son rôle
 */
export interface CommunityMemberPermissions {
  /** Peut inviter de nouveaux membres */
  readonly canInviteMembers: boolean;
  /** Peut retirer des membres */
  readonly canRemoveMembers: boolean;
  /** Peut modifier les paramètres de la communauté */
  readonly canEditCommunity: boolean;
  /** Peut supprimer la communauté */
  readonly canDeleteCommunity: boolean;
  /** Peut modérer le contenu */
  readonly canModerateContent: boolean;
  /** Peut gérer les rôles des autres membres */
  readonly canManageRoles: boolean;
  /** Peut créer des conversations dans la communauté */
  readonly canCreateConversations: boolean;
  /** Peut modifier les conversations de la communauté */
  readonly canEditConversations: boolean;
}

/**
 * Permissions par défaut selon le rôle
 */
export const DEFAULT_COMMUNITY_PERMISSIONS: Readonly<Record<CommunityRole, CommunityMemberPermissions>> = {
  [CommunityRole.ADMIN]: {
    canInviteMembers: true,
    canRemoveMembers: true,
    canEditCommunity: true,
    canDeleteCommunity: true,
    canModerateContent: true,
    canManageRoles: true,
    canCreateConversations: true,
    canEditConversations: true,
  },
  [CommunityRole.MODERATOR]: {
    canInviteMembers: true,
    canRemoveMembers: true,
    canEditCommunity: false,
    canDeleteCommunity: false,
    canModerateContent: true,
    canManageRoles: false,
    canCreateConversations: true,
    canEditConversations: true,
  },
  [CommunityRole.MEMBER]: {
    canInviteMembers: false,
    canRemoveMembers: false,
    canEditCommunity: false,
    canDeleteCommunity: false,
    canModerateContent: false,
    canManageRoles: false,
    canCreateConversations: true,
    canEditConversations: false,
  },
};

/**
 * Hiérarchie des rôles (pour comparaison)
 */
export const COMMUNITY_ROLE_HIERARCHY: Readonly<Record<CommunityRole, number>> = {
  [CommunityRole.ADMIN]: 3,
  [CommunityRole.MODERATOR]: 2,
  [CommunityRole.MEMBER]: 1,
};

/**
 * Vérifie si un rôle a une hiérarchie supérieure ou égale à un autre
 */
export function hasEqualOrHigherRole(userRole: CommunityRole, requiredRole: CommunityRole): boolean {
  return COMMUNITY_ROLE_HIERARCHY[userRole] >= COMMUNITY_ROLE_HIERARCHY[requiredRole];
}

/**
 * Obtient les permissions pour un rôle donné
 */
export function getCommunityPermissions(role: CommunityRole): CommunityMemberPermissions {
  return DEFAULT_COMMUNITY_PERMISSIONS[role];
}

/**
 * Membre d'une communauté
 */
export interface CommunityMember {
  readonly id: string;
  readonly communityId: string;
  readonly userId: string;
  readonly role: CommunityRole;
  readonly joinedAt: Date;
  readonly user?: {
    readonly id: string;
    readonly username: string;
    readonly displayName?: string;
    readonly avatar?: string;
  };
}

/**
 * Communauté
 */
export interface Community {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly description?: string;
  readonly avatar?: string;
  readonly isPrivate: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly members?: CommunityMember[];
  readonly _count?: {
    readonly members: number;
    readonly conversations: number;
  };
}

/**
 * Données pour créer une communauté
 */
export interface CreateCommunityData {
  readonly name: string;
  readonly identifier?: string;
  readonly description?: string;
  readonly avatar?: string;
  readonly isPrivate?: boolean;
}

/**
 * Données pour mettre à jour une communauté
 */
export interface UpdateCommunityData {
  readonly name?: string;
  readonly identifier?: string;
  readonly description?: string;
  readonly avatar?: string;
  readonly isPrivate?: boolean;
}

/**
 * Données pour ajouter un membre à une communauté
 */
export interface AddCommunityMemberData {
  readonly userId: string;
  readonly role?: CommunityRole;
}

/**
 * Données pour mettre à jour le rôle d'un membre
 */
export interface UpdateMemberRoleData {
  readonly role: CommunityRole;
}

