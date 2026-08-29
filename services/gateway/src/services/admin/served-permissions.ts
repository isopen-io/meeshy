import { UserRoleEnum } from '@meeshy/shared/types';
import { permissionsService } from './permissions.service';

/**
 * La forme des permissions SERVIES aux clients — neuf clés.
 *
 * Distincte d'`AdminPermissions` (dix-sept clés), qui est la loi. Celle-ci est
 * ce que le fil transporte, et son vocabulaire est celui d'avant les
 * communautés (`canManageGroups`). La séparer ne crée pas une seconde
 * matrice : c'est une PROJECTION, et il n'y a aucune valeur à y tenir à jour.
 */
export type ServedPermissions = {
  readonly canAccessAdmin: boolean;
  readonly canManageUsers: boolean;
  readonly canManageGroups: boolean;
  readonly canManageConversations: boolean;
  readonly canViewAnalytics: boolean;
  readonly canModerateContent: boolean;
  readonly canViewAuditLogs: boolean;
  readonly canManageNotifications: boolean;
  readonly canManageTranslations: boolean;
};

/**
 * Les permissions d'un rôle, telles qu'un client les reçoit — SITE UNIQUE.
 *
 * ## Ce qu'il remplace
 *
 * QUATRE définitions concurrentes vivaient dans le dépôt, et les clients
 * lisaient les moins fiables :
 *
 * | où | écart mesuré |
 * |---|---|
 * | matrice centrale (17 × 6) | fait autorité |
 * | matrice locale de `routes/admin/services` (9 × 6) | `ADMIN.canManageTranslations` à `false` contre `true` |
 * | copie manuscrite servie à la CONNEXION | **`ANALYST.canAccessAdmin: true`**, quand les deux matrices disent `false` |
 * | copie manuscrite servie après ÉDITION DE PROFIL | `canAccessAdmin = isAdmin` seul ⇒ un MODERATOR PERD son accès en changeant d'avatar |
 *
 * Ce ne sont pas des défauts d'affichage : ce sont deux réponses différentes à
 * la même question, servies par le même serveur, à deux moments du même
 * parcours. Un ANALYST se connectait, le web lui peignait la console, et le
 * serveur lui refusait la moitié des routes.
 *
 * ## Les deux traductions de vocabulaire, et pourquoi elles sont sûres
 *
 * - `canManageUsers` ← `canUpdateUsers` : le central décompose ce droit en
 *   créer / modifier / supprimer. Mesuré rôle par rôle, les six valeurs
 *   coïncident, et c'est le droit d'ÉCRITURE que les appelants testent.
 * - `canManageGroups` ← `canManageCommunities` : le même droit, sous le mot
 *   d'avant les communautés. Le renommer sur le fil casserait les clients
 *   installés pour un gain nul.
 */
export function servedUserPermissions(role: UserRoleEnum | string): ServedPermissions {
  const central = permissionsService.getPermissions(
    String(role).toUpperCase() as UserRoleEnum
  );

  return {
    canAccessAdmin: central.canAccessAdmin,
    canManageUsers: central.canUpdateUsers,
    canManageGroups: central.canManageCommunities,
    canManageConversations: central.canManageConversations,
    canViewAnalytics: central.canViewAnalytics,
    canModerateContent: central.canModerateContent,
    canViewAuditLogs: central.canViewAuditLogs,
    canManageNotifications: central.canManageNotifications,
    canManageTranslations: central.canManageTranslations,
  };
}

/** Le schéma de la forme servie — déclaré une fois, partagé par ses routes. */
export const servedPermissionsSchema = {
  type: 'object',
  properties: {
    canAccessAdmin: { type: 'boolean' },
    canManageUsers: { type: 'boolean' },
    canManageGroups: { type: 'boolean' },
    canManageConversations: { type: 'boolean' },
    canViewAnalytics: { type: 'boolean' },
    canModerateContent: { type: 'boolean' },
    canViewAuditLogs: { type: 'boolean' },
    canManageNotifications: { type: 'boolean' },
    canManageTranslations: { type: 'boolean' },
  },
} as const;
