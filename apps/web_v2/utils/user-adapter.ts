/**
 * Utilitaires pour adapter les types utilisateur entre gateway et frontend
 */

import type { SocketIOUser, User, UserPermissions } from '@/types';

/**
 * Convertit un SocketIOUser (from API/WebSocket) en User (frontend avec permissions)
 */
export function socketIOUserToUser(socketUser: SocketIOUser): User {
  return {
    ...socketUser,
    permissions: getDefaultPermissions(socketUser.role),
    // S'assurer que toutes les propriétés User sont présentes
    isActive: socketUser.isActive ?? true,
    updatedAt: socketUser.updatedAt ?? new Date(),
    phoneNumber: socketUser.phoneNumber ?? '',
  };
}

/**
 * Retourne les permissions par défaut basées sur le rôle
 */
export function getDefaultPermissions(role: string): UserPermissions {
  const rolePermissions: Record<string, UserPermissions> = {
    BIGBOSS: {
      canAccessAdmin: true,
      canManageUsers: true,
      canManageGroups: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canViewAuditLogs: true,
      canManageNotifications: true,
      canManageTranslations: true,
    },
    ADMIN: {
      canAccessAdmin: true,
      canManageUsers: true,
      canManageGroups: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canViewAuditLogs: true,
      canManageNotifications: true,
      canManageTranslations: false,
    },
    CREATOR: {
      canAccessAdmin: true,
      canManageUsers: true,
      canManageGroups: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canViewAuditLogs: true,
      canManageNotifications: true,
      canManageTranslations: false,
    },
    MODERATOR: {
      canAccessAdmin: true,
      canManageUsers: false,
      canManageGroups: true,
      canManageConversations: true,
      canViewAnalytics: false,
      canModerateContent: true,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    MODO: {
      canAccessAdmin: true,
      canManageUsers: false,
      canManageGroups: true,
      canManageConversations: true,
      canViewAnalytics: false,
      canModerateContent: true,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    AUDIT: {
      canAccessAdmin: true,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: true,
      canModerateContent: false,
      canViewAuditLogs: true,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    ANALYST: {
      canAccessAdmin: true,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: true,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    USER: {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    MEMBER: {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    }
  };

  return rolePermissions[role] || rolePermissions.USER;
}

/**
 * Crée un utilisateur par défaut pour les cas d'erreur
 */
export function createDefaultUser(id?: string): User {
  return {
    id: id || 'unknown',
    username: 'Utilisateur inconnu',
    firstName: 'Utilisateur',
    lastName: 'Inconnu',
    email: 'unknown@example.com',
    displayName: 'Utilisateur inconnu',
    avatar: '',
    role: 'USER',
    isOnline: false,
    lastActiveAt: new Date(),
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: false,
    translateToSystemLanguage: false,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: getDefaultPermissions('USER')
  };
}
