import { UserRoleEnum } from '@meeshy/shared/types';

type UserRole = UserRoleEnum;

export interface UserPermissions {
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageCommunities: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canViewAuditLogs: boolean;
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
  };

  private readonly DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
    'BIGBOSS': {
      canAccessAdmin: true,
      canManageUsers: true,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canViewAuditLogs: true,
      canManageNotifications: true,
      canManageTranslations: true,
    },
    'ADMIN': {
      canAccessAdmin: true,
      canManageUsers: true,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canViewAuditLogs: false,
      canManageNotifications: true,
      canManageTranslations: false,
    },
    'MODO': {
      canAccessAdmin: true,
      canManageUsers: false,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: false,
      canModerateContent: true,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    'AUDIT': {
      canAccessAdmin: true,
      canManageUsers: false,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: true,
      canModerateContent: false,
      canViewAuditLogs: true,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    'ANALYST': {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: true,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    'USER': {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
  };

  getUserPermissions(role: UserRole): UserPermissions {
    return this.DEFAULT_PERMISSIONS[role] || this.DEFAULT_PERMISSIONS.USER;
  }

  hasPermission(userRole: UserRole, permission: keyof UserPermissions): boolean {
    const permissions = this.getUserPermissions(userRole);
    return permissions[permission];
  }

  canManageUser(adminRole: UserRole, targetRole: UserRole): boolean {
    return this.ROLE_HIERARCHY[adminRole] > this.ROLE_HIERARCHY[targetRole];
  }

  getRoleLevel(role: UserRole): number {
    return this.ROLE_HIERARCHY[role] || 0;
  }
}

export const permissionsService = new PermissionsService();
