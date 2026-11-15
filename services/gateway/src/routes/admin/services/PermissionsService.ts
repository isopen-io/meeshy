import { UserRoleEnum } from '@meeshy/shared/types';
import { permissionsService as adminPermissionsService } from '../../../services/admin/permissions.service';

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

/**
 * PROJECTION de la matrice centrale — plus aucune matrice ici (#4152).
 *
 * ## Ce que ce fichier était
 *
 * Une SECONDE matrice, 9 permissions × 6 rôles, écrite à la main, servant
 * `content.ts`, `posts.ts` et `roles.ts`. Elle divergeait de la centrale sur
 * `ADMIN.canManageTranslations` — `false` ici, `true` là-bas : la même
 * question, deux réponses, selon la route qui la posait.
 *
 * ## Ce qu'il est
 *
 * La forme `UserPermissions` (9 clés) SURVIT, parce que ses trois consommateurs
 * la lisent et qu'un lot qui unifie la loi ne doit pas en même temps réécrire
 * ceux qui l'appliquent. Mais chaque champ est désormais DÉRIVÉ de la matrice
 * centrale : il n'y a plus de valeur à tenir à jour, donc plus rien qui puisse
 * diverger.
 *
 * `canManageUsers` n'existe pas au central, qui décompose ce droit en
 * `canCreateUsers` / `canUpdateUsers` / `canDeleteUsers`. Il projette
 * `canUpdateUsers` — mesuré rôle par rôle, les six valeurs coïncident, et c'est
 * le droit d'ÉCRITURE que les appelants testent.
 */
export class PermissionsService {
  getUserPermissions(role: UserRole): UserPermissions {
    const central = adminPermissionsService.getPermissions(role as UserRoleEnum);

    return {
      canAccessAdmin: central.canAccessAdmin,
      canManageUsers: central.canUpdateUsers,
      canManageCommunities: central.canManageCommunities,
      canManageConversations: central.canManageConversations,
      canViewAnalytics: central.canViewAnalytics,
      canModerateContent: central.canModerateContent,
      canViewAuditLogs: central.canViewAuditLogs,
      canManageNotifications: central.canManageNotifications,
      canManageTranslations: central.canManageTranslations,
    };
  }

  hasPermission(userRole: UserRole, permission: keyof UserPermissions): boolean {
    return this.getUserPermissions(userRole)[permission];
  }

  /** La hiérarchie vit au central : la redéclarer, c'est la faire diverger. */
  canManageUser(adminRole: UserRole, targetRole: UserRole): boolean {
    return adminPermissionsService.canManageUser(adminRole as UserRoleEnum, targetRole as UserRoleEnum);
  }

  getRoleLevel(role: UserRole): number {
    return adminPermissionsService.getRoleLevel(role as UserRoleEnum);
  }
}

export const permissionsService = new PermissionsService();
