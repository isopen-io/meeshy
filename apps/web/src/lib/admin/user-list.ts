import { defineListSpec, type ListState } from './list-state';
import { ADMIN_PERIODS, isAdminPeriod, periodStart } from './period';

/**
 * LA LISTE DES COMPTES (#7873, #8876) — ce que l'écran sait trier et filtrer, et
 * donc ce que l'adresse peut porter. Les clés de tri sont exactement celles que la
 * passerelle admet (`USER_SORT_KEYS`, `routes/admin/user-list-filters.ts`) ; les
 * filtres, ceux que `GET /admin/users` lit.
 *
 * Les NOMS de paramètres sont un contrat : le tableau de bord mène à
 * `users?isActive=true` et `users?role=ADMINISTRATION`, et un lien partagé doit rouvrir la
 * liste telle qu'on l'a laissée.
 */
export const ADMIN_ROLES = ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST', 'USER'] as const;

/**
 * LE RANG D'ADMINISTRATION comme valeur de filtre : BIGBOSS ET ADMIN, que le tableau de
 * bord compte ensemble (« Administrateurs et créateur »). Ce n'est pas un rôle — il ne
 * se donne à personne (`ADMIN_ROLES` ne le contient pas) — mais une SÉLECTION, que
 * {@link userListFiltersOf} traduit en `role=BIGBOSS,ADMIN`. Sans lui la tuile comptait deux
 * rôles et ouvrait la liste d'un seul : zéro compte, quand le seul administrateur est le
 * créateur.
 */
export const ADMINISTRATION_RANK = 'ADMINISTRATION';
const ADMINISTRATION_ROLES = 'BIGBOSS,ADMIN';

const OUI_NON = ['true', 'false'] as const;

export const USER_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt', 'lastActiveAt', 'username', 'email', 'firstName', 'lastName'],
  defaultSort: 'createdAt',
  ascendingFirst: ['username', 'email', 'firstName', 'lastName'],
  filters: {
    role: [...ADMIN_ROLES, ADMINISTRATION_RANK],
    isActive: OUI_NON,
    emailVerified: OUI_NON,
    phoneVerified: OUI_NON,
    twoFactorEnabled: OUI_NON,
    period: ADMIN_PERIODS,
  },
  pageSizes: [20, 50, 100],
});

export type UserSortKey = (typeof USER_LIST_SPEC.sortKeys)[number];
export type UserFilterKey = keyof typeof USER_LIST_SPEC.filters;
export type UserListState = ListState<UserSortKey, UserFilterKey>;

/**
 * Les filtres TELS QUE LA PASSERELLE LES LIT — la période d'inscription n'existe
 * pas côté serveur, elle devient une borne `createdAfter` (l'horloge est injectée :
 * la fonction ne la lit jamais).
 */
export function userListFiltersOf(filters: UserListState['filters'], now: Date): Readonly<Record<string, string>> {
  const { period, ...others } = filters;
  const plain = Object.fromEntries(Object.entries(others).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const served = plain.role === ADMINISTRATION_RANK ? { ...plain, role: ADMINISTRATION_ROLES } : plain;
  return period !== undefined && isAdminPeriod(period) ? { ...served, createdAfter: periodStart(period, now) } : served;
}
