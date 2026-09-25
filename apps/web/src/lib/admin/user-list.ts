import { defineListSpec } from './list-state';

/**
 * LA LISTE DES COMPTES (#7873) — ce que l'écran sait trier et filtrer, et
 * donc ce que l'adresse peut porter. Les clés de tri sont exactement celles
 * que la passerelle admet (`USER_SORT_KEYS`, `user-management.service.ts`) ;
 * les filtres, ceux que `GET /admin/users` lit.
 */
export const ADMIN_ROLES = ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST', 'USER'] as const;

const OUI_NON = ['true', 'false'] as const;

export const USER_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt', 'lastActiveAt', 'username', 'email'],
  defaultSort: 'createdAt',
  ascendingFirst: ['username', 'email'],
  filters: { role: ADMIN_ROLES, isActive: OUI_NON, emailVerified: OUI_NON, twoFactorEnabled: OUI_NON },
  pageSizes: [20, 50, 100],
});
