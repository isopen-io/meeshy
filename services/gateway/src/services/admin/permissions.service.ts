import { UserRoleEnum } from '@meeshy/shared/types';

export interface AdminPermissions {
  canAccessAdmin: boolean;
  canViewUsers: boolean;
  canViewUserDetails: boolean;
  canViewSensitiveData: boolean;
  canCreateUsers: boolean;
  canUpdateUsers: boolean;
  canUpdateUserRoles: boolean;
  canDeleteUsers: boolean;
  canResetPasswords: boolean;
  canViewAuditLogs: boolean;
  canManageCommunities: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canManageNotifications: boolean;
  canManageTranslations: boolean;
}

export class PermissionsService {
  private readonly ROLE_HIERARCHY: Record<string, number> = {
    'BIGBOSS': 7,
    'ADMIN': 5,
    'MODO': 4,
    'AUDIT': 3,
    'ANALYST': 2,
    'USER': 1,
    'MODERATOR': 4,  // Alias
    'CREATOR': 5,    // Alias
    'MEMBER': 1      // Alias
  };

  private readonly PERMISSIONS_MATRIX: Record<string, AdminPermissions> = {
    'BIGBOSS': {
      canAccessAdmin: true,
      canViewUsers: true,
      canViewUserDetails: true,
      canViewSensitiveData: true,
      canCreateUsers: true,
      canUpdateUsers: true,
      canUpdateUserRoles: true,
      canDeleteUsers: true,
      canResetPasswords: true,
      canViewAuditLogs: true,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canManageNotifications: true,
      canManageTranslations: true
    },
    'ADMIN': {
      canAccessAdmin: true,
      canViewUsers: true,
      canViewUserDetails: true,
      canViewSensitiveData: true,
      canCreateUsers: true,
      canUpdateUsers: true,
      canUpdateUserRoles: true,
      canDeleteUsers: true,
      canResetPasswords: true,
      canViewAuditLogs: false,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canManageNotifications: true,
      canManageTranslations: false
    },
    'MODO': {
      canAccessAdmin: true,
      canViewUsers: true,
      canViewUserDetails: true,
      canViewSensitiveData: false,  // ❌ Données masquées
      canCreateUsers: false,
      canUpdateUsers: false,
      canUpdateUserRoles: false,
      canDeleteUsers: false,
      canResetPasswords: false,
      canViewAuditLogs: false,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: false,
      canModerateContent: true,
      canManageNotifications: false,
      canManageTranslations: false
    },
    'AUDIT': {
      canAccessAdmin: true,
      canViewUsers: true,
      canViewUserDetails: true,
      canViewSensitiveData: false,  // ❌ Email/phone masqués
      canCreateUsers: false,
      canUpdateUsers: false,
      canUpdateUserRoles: false,
      canDeleteUsers: false,
      canResetPasswords: false,
      canViewAuditLogs: true,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: true,
      canModerateContent: false,
      canManageNotifications: false,
      canManageTranslations: false
    },
    'ANALYST': {
      canAccessAdmin: false,
      canViewUsers: false,  // ❌ Pas d'accès à la gestion users
      canViewUserDetails: false,
      canViewSensitiveData: false,
      canCreateUsers: false,
      canUpdateUsers: false,
      canUpdateUserRoles: false,
      canDeleteUsers: false,
      canResetPasswords: false,
      canViewAuditLogs: false,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: true,
      canModerateContent: false,
      canManageNotifications: false,
      canManageTranslations: false
    },
    'USER': {
      canAccessAdmin: false,
      canViewUsers: false,
      canViewUserDetails: false,
      canViewSensitiveData: false,
      canCreateUsers: false,
      canUpdateUsers: false,
      canUpdateUserRoles: false,
      canDeleteUsers: false,
      canResetPasswords: false,
      canViewAuditLogs: false,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canManageNotifications: false,
      canManageTranslations: false
    },
    // Aliases are handled by resolveRole method
  };

  /**
   * Résout les alias vers les rôles réels
   */
  private resolveRole(role: UserRoleEnum): UserRoleEnum {
    const aliasMap: Record<string, UserRoleEnum> = {
      [UserRoleEnum.MODERATOR]: UserRoleEnum.MODO,
      [UserRoleEnum.CREATOR]: UserRoleEnum.ADMIN,
      [UserRoleEnum.MEMBER]: UserRoleEnum.USER
    };
    return aliasMap[role] || role;
  }

  /**
   * Obtient les permissions d'un rôle
   */
  getPermissions(role: UserRoleEnum): AdminPermissions {
    const resolvedRole = this.resolveRole(role);
    return this.PERMISSIONS_MATRIX[resolvedRole] || this.PERMISSIONS_MATRIX['USER'];
  }

  /**
   * Vérifie si un rôle a une permission spécifique
   */
  hasPermission(role: UserRoleEnum, permission: keyof AdminPermissions): boolean {
    const permissions = this.getPermissions(role);
    return permissions[permission];
  }

  /**
   * Vérifie si un admin peut gérer un utilisateur cible
   */
  canManageUser(adminRole: UserRoleEnum, targetRole: UserRoleEnum): boolean {
    const adminLevel = this.ROLE_HIERARCHY[this.resolveRole(adminRole)];
    const targetLevel = this.ROLE_HIERARCHY[this.resolveRole(targetRole)];
    return adminLevel > targetLevel;
  }

  /**
   * Vérifie si un admin peut voir les données sensibles
   */
  canViewSensitiveData(role: UserRoleEnum): boolean {
    return this.hasPermission(role, 'canViewSensitiveData');
  }

  /**
   * Vérifie si un admin peut modifier un utilisateur
   */
  canModifyUser(adminRole: UserRoleEnum, targetRole: UserRoleEnum): boolean {
    return this.hasPermission(adminRole, 'canUpdateUsers') &&
           this.canManageUser(adminRole, targetRole);
  }

  /**
   * Vérifie si un admin peut changer le rôle d'un utilisateur
   */
  canChangeRole(
    adminRole: UserRoleEnum,
    currentTargetRole: UserRoleEnum,
    newTargetRole: UserRoleEnum
  ): boolean {
    // Doit pouvoir gérer l'utilisateur actuel ET le nouveau rôle
    return this.hasPermission(adminRole, 'canUpdateUserRoles') &&
           this.canManageUser(adminRole, currentTargetRole) &&
           this.canManageUser(adminRole, newTargetRole);
  }
}

// Instance singleton
export const permissionsService = new PermissionsService();
