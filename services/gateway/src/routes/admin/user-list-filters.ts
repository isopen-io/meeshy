/**
 * Les filtres de `GET /admin/users`, lus depuis la QUERYSTRING (#7873).
 *
 * La route n'a pas de schéma de requête : tout y arrive en CHAÎNE. Recopiés
 * tels quels dans `UserFilters`, les booléens mentaient — `"false"` est une
 * chaîne NON VIDE, donc vraie : `emailVerified=false` filtrait les comptes
 * VÉRIFIÉS, et `isActive=false` partait à Prisma comme une chaîne sur une
 * colonne booléenne (erreur de validation servie en 500). Chaque valeur est
 * donc traduite ICI, et tout ce qui n'est pas lisible est IGNORÉ plutôt que
 * transmis : un filtre qu'on ne comprend pas ne restreint rien.
 */
import { UserRoleEnum, type UserFilters } from '@meeshy/shared/types';

export type UserListQuery = {
  readonly search?: string;
  readonly role?: string;
  readonly isActive?: string;
  readonly emailVerified?: string;
  readonly phoneVerified?: string;
  readonly twoFactorEnabled?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly lastActiveAfter?: string;
  readonly lastActiveBefore?: string;
  readonly sortBy?: string;
  readonly sortOrder?: string;
  readonly offset?: string;
  readonly limit?: string;
};

type UserSortKey = NonNullable<UserFilters['sortBy']>;

const USER_SORT_KEYS: ReadonlySet<string> = new Set<UserSortKey>([
  'createdAt', 'lastActiveAt', 'username', 'email', 'firstName', 'lastName'
]);

const USER_ROLES: ReadonlySet<string> = new Set<string>(Object.values(UserRoleEnum));

// Directive produit 2026-08-25 (revue adversariale F4) : une SÉLECTION ou un
// ORDRE qui dépend de lastActiveAt révèle la présence autant que le champ que
// sanitizeUsers masque. Sans canViewPresence, les bornes sont IGNORÉES en
// silence (un 403 confirmerait l'existence du filtre) et le tri retombe sur
// createdAt.
const PRESENCE_SORT_KEYS: ReadonlySet<string> = new Set(['lastActiveAt', 'isOnline']);

const queryBoolean = (value: unknown): boolean | undefined => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

const queryDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const queryRole = (value: unknown): string | undefined =>
  typeof value === 'string' && USER_ROLES.has(value) ? value : undefined;

const querySearch = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const querySortOrder = (value: unknown): 'asc' | 'desc' => (value === 'asc' ? 'asc' : 'desc');

const querySortKey = (value: unknown, canViewPresence: boolean): UserSortKey => {
  if (typeof value !== 'string' || !USER_SORT_KEYS.has(value)) return 'createdAt';
  if (!canViewPresence && PRESENCE_SORT_KEYS.has(value)) return 'createdAt';
  return value as UserSortKey;
};

/**
 * Traduit la querystring de `GET /admin/users` en `UserFilters` sûrs.
 * `canViewPresence` gouverne les bornes `lastActive*` et le tri par présence.
 */
export function userListFilters(query: UserListQuery, canViewPresence: boolean): UserFilters {
  return {
    search: querySearch(query.search),
    role: queryRole(query.role),
    isActive: queryBoolean(query.isActive),
    emailVerified: queryBoolean(query.emailVerified),
    phoneVerified: queryBoolean(query.phoneVerified),
    twoFactorEnabled: queryBoolean(query.twoFactorEnabled),
    createdAfter: queryDate(query.createdAfter),
    createdBefore: queryDate(query.createdBefore),
    lastActiveAfter: canViewPresence ? queryDate(query.lastActiveAfter) : undefined,
    lastActiveBefore: canViewPresence ? queryDate(query.lastActiveBefore) : undefined,
    sortBy: querySortKey(query.sortBy, canViewPresence),
    sortOrder: querySortOrder(query.sortOrder)
  };
}
