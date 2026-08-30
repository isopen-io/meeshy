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
  /**
   * Voir isOnline/lastActiveAt d'un utilisateur (directive produit 2026-08-25 :
   * « les utilisateurs avec le rôle ADMIN et supérieur peuvent constamment
   * avoir l'état de présence »). Distinct de canViewSensitiveData — la
   * présence n'est ni un email ni un téléphone, et le seuil est BIGBOSS/ADMIN
   * seulement : MODERATOR, qui voit les données sensibles nulle part mais
   * modère du contenu, ne doit pas voir la présence non plus.
   */
  canViewPresence: boolean;
  /**
   * Configurer l'AGENT — ses sujets, ses réglages par conversation, ses rôles.
   *
   * Ajoutée par #4153, et volontairement calquée sur l'admission d'aujourd'hui
   * (BIGBOSS, ADMIN) : ce lot uniformise le VOCABULAIRE, pas les niveaux. Sans
   * ce mot, `agent.ts` et `agent-topics.ts` devraient emprunter une permission
   * qui parle d'autre chose — et un emprunt sémantique est exactement ce qui
   * rend une matrice illisible.
   */
  canManageAgent: boolean;
}

export class PermissionsService {
  private readonly ROLE_HIERARCHY: Record<string, number> = {
    'BIGBOSS': 7,
    'ADMIN': 5,
    'MODERATOR': 4,
    'AUDIT': 3,
    'ANALYST': 2,
    'USER': 1
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
      canManageTranslations: true,
      canViewPresence: true,
      canManageAgent: true
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
      canManageTranslations: true,  // ADMIN can now manage translations
      canViewPresence: true,
      canManageAgent: true
    },
    'MODERATOR': {
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
      canManageTranslations: false,
      canViewPresence: false,  // ❌ Modération de contenu ≠ visibilité de présence
      canManageAgent: false
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
      canManageTranslations: false,
      canViewPresence: false,
      canManageAgent: false
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
      canManageTranslations: false,
      canViewPresence: false,
      canManageAgent: false
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
      canManageTranslations: false,
      canViewPresence: false,
      canManageAgent: false
    },
    // Aliases are handled by resolveRole method
  };

  /**
   * Résout les alias LEGACY vers les rôles de la matrice.
   *
   * Cette méthode ne faisait rien, et son commentaire affirmait que les alias
   * avaient été supprimés « suite à l'unification des types ». Le dépôt les
   * déclare pourtant toujours : `UserRole` (`role-types.ts`) énumère `MODO`,
   * `CREATOR` et `MEMBER`, le schéma de validation partagé les ACCEPTE, et la
   * migration `migrate-user-roles.ts` documente `MODO → MODERATOR` — ce qui
   * signifie que des lignes ont porté cette valeur.
   *
   * Or la matrice n'a pas de clé `MODO` : un compte que la migration aurait
   * manqué retombe donc sur `USER`, c'est-à-dire qu'un modérateur perd
   * SILENCIEUSEMENT tous ses droits. Le repli sur `USER` est le bon défaut
   * pour un rôle inconnu ; il est faux pour un rôle CONNU sous un autre nom.
   *
   * Un commentaire qui déclare une chose disparue se vérifie comme une
   * affirmation : celui-ci était faux, et son effet était de laisser cette
   * méthode vide.
   */
  private resolveRole(role: UserRoleEnum): UserRoleEnum {
    const ALIAS: Record<string, string> = {
      MODO: 'MODERATOR',
      CREATOR: 'ADMIN',
      MEMBER: 'USER',
    };
    return (ALIAS[String(role)] ?? role) as UserRoleEnum;
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
   * Le rang NUMÉRIQUE d'un rôle — la hiérarchie, exposée.
   *
   * Elle était recopiée dans la matrice locale de `routes/admin/services`, qui
   * n'est plus qu'une projection : sans cet accès, elle aurait dû garder sa
   * copie, et la copie aurait fini par diverger comme l'a fait la matrice.
   */
  getRoleLevel(role: UserRoleEnum): number {
    return this.ROLE_HIERARCHY[this.resolveRole(role)] ?? 0;
  }

  /**
   * Vérifie si un admin peut voir les données sensibles
   */
  canViewSensitiveData(role: UserRoleEnum): boolean {
    return this.hasPermission(role, 'canViewSensitiveData');
  }

  /**
   * Vérifie si un rôle peut voir l'état de présence (isOnline/lastActiveAt)
   * d'un utilisateur dans l'espace admin (directive produit 2026-08-25 :
   * ADMIN et supérieur uniquement — constamment).
   */
  canViewPresence(role: UserRoleEnum): boolean {
    return this.hasPermission(role, 'canViewPresence');
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
