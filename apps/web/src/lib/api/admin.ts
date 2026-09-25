import type { AdminPermissions } from '@/lib/admin/sections';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE L'ADMINISTRATION** (#6432) — `services/gateway/src/routes/admin/*`.
 *
 * Trois lectures, et c'est tout : la MATRICE de permissions, les COMPTEURS du
 * tableau de bord, la LISTE des comptes. Aucune écriture dans cette tranche —
 * bannir, changer un rôle ou réinitialiser un mot de passe restent au legacy
 * tant que leurs confirmations n'ont pas été portées, et une écriture
 * d'administration sans sa confirmation serait pire que son absence.
 *
 * - `GET /me/permissions` — l'adresse CANONIQUE (`routes/me/permissions.ts`).
 *   Pas `/admin/me/permissions`, qui en est l'alias DÉPRÉCIÉ (#4350) : viser
 *   l'alias ferait porter à chaque ouverture de l'espace un en-tête `Deprecation`
 *   que rien ne justifie.
 * - `GET /admin/dashboard` — compteurs mis en cache 10 min côté serveur.
 * - `GET /admin/users?offset=&limit=&search=` — la liste paginée. **`offset`,
 *   jamais `page`** : c'est ce que `validatePagination` lit
 *   (`utils/pagination.ts`), et un `?page=2` serait simplement IGNORÉ — la
 *   deuxième page rendrait la première, sans erreur, indéfiniment.
 *
 * **Aucune branche `fixtures`.** Les autres ports en portent une parce que le
 * POC se capture sans passerelle ; l'administration, elle, n'a de sens que
 * SERVIE — un tableau de bord de démonstration afficherait des chiffres faux
 * dans un écran dont le métier est de dire le vrai. Sous `source: 'fixtures'`
 * les trois fonctions échouent proprement, et l'écran rend son refus.
 */

export type AdminDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const ADMIN_PERMISSIONS_QUERY_KEY = ['admin', 'permissions'] as const;
export const ADMIN_DASHBOARD_QUERY_KEY = ['admin', 'dashboard'] as const;
export const adminUsersQueryKey = (adresse: string) => ['admin', 'users', adresse] as const;

export const ADMIN_USERS_PAGE_SIZE = 20;

export type AdminIdentity = {
  readonly role: string;
  readonly permissions: AdminPermissions;
};

export type AdminDashboard = {
  readonly totalUsers: number;
  readonly activeUsers: number;
  readonly totalMessages: number;
  readonly totalCommunities: number;
  readonly totalReports: number;
  readonly newUsers24h: number;
  readonly newMessages24h: number;
};

export type AdminUserRow = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: string;
  readonly isActive: boolean;
  readonly isOnline: boolean;
  readonly createdAt: string | null;
  readonly avatar: string;
  /** Masquée par la passerelle sous `canViewPresence` — `null` n'y veut pas dire « jamais ». */
  readonly lastActiveAt: string | null;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
};

export type AdminUsersPage = {
  readonly users: readonly AdminUserRow[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

/**
 * LES TROIS LECTURES PRUDENTES DU PORT D'ADMINISTRATION, exportées pour le
 * détail d'un membre (#6819) — et pour lui seul tant qu'aucun autre port n'en
 * a besoin.
 *
 * Elles sortent d'ici plutôt que d'être recopiées ailleurs : une seconde
 * définition serait une jumelle divergente (CLAUDE.md § Single Source of
 * Truth), et c'est précisément sur des helpers de trois lignes que la
 * divergence passe inaperçue — l'un tolérerait un jour `NaN` ou une chaîne
 * numérique que l'autre refuse, sans qu'aucun témoin ne rougisse.
 *
 * Elles ne rejoignent PAS `./decode` : ce module-là décode les DATES DU FIL
 * pour le cache TanStack (`toDate`, `decodeMessage`, `decodeConversation`) et
 * n'a aucun helper de ce genre. Les deux outils sont distincts, pas
 * redondants — vérifié avant d'extraire.
 */
export const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null;

export const asCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

export const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Une page SERVIE : ses lignes, et la pagination telle que le transport la remet. */
export type PageServie = {
  readonly lignes: readonly unknown[];
  readonly meta: Readonly<Record<string, unknown>>;
};

/**
 * **OÙ LA PAGINATION SE LIT VRAIMENT** (#6862, revue-correction) — le SITE
 * UNIQUE, parce que quatre décodeurs d'administration s'étaient trompés de la
 * même façon, doc-comment à l'appui.
 *
 * Les routes d'administration paginées passent par `sendPaginatedSuccess` :
 * l'enveloppe vaut `{ success, data, pagination }`, la pagination À CÔTÉ de
 * `data`. Chaque décodeur le DISAIT — et recevait ensuite `result.data`,
 * c'est-à-dire le TABLEAU seul, où il cherchait `charge.pagination`. Le
 * transport a déjà dépaqueté (`http.ts:355-366`) : `pagination` est un SIBLING
 * de `ok`, sur l'`ApiResult`.
 *
 * Conséquence mesurée, et invisible : `total` retombait sur la longueur de la
 * page, `hasMore` valait `false` pour toujours, et le bouton « Suivants »
 * était ÉTEINT en production sur les quatre listes — un contrôle qui existe et
 * n'a aucun effet (loi 4). Les témoins, eux, verdissaient : leur double rendait
 * `{ ok: true, data: enveloppeEntière }`, où `data.pagination` existe.
 *
 * Le repli sur `data.pagination` reste, pour les charges qu'un appelant remet
 * telles quelles (une fixture, une réponse non paginée) : il ne peut pas
 * masquer le défaut ci-dessus, puisque le niveau SERVI gagne.
 */
export function pageServie(resultat: { readonly data: unknown; readonly pagination?: unknown }): PageServie {
  const charge = asRecord(resultat.data);
  const lignes = Array.isArray(resultat.data) ? resultat.data : Array.isArray(charge?.data) ? charge.data : [];
  const meta = asRecord(resultat.pagination) ?? asRecord(charge?.pagination) ?? {};
  return { lignes, meta };
}

/**
 * LE BORNAGE D'UNE PAGE DÉCODÉE (#7845) — `total` et `hasMore` tels que servis,
 * avec le même repli que les quatre premières listes : un `hasMore` absent se
 * déduit du total, un total absent retombe sur la longueur de la page.
 */
export function bornesDePage(
  lignes: readonly unknown[],
  meta: PageServie['meta'],
  offset: number,
): { readonly total: number; readonly offset: number; readonly hasMore: boolean } {
  const total = asCount(meta.total);
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + lignes.length < total;
  return { total: total || lignes.length, offset, hasMore };
}

/**
 * `false` par DÉFAUT sur chaque clé — une permission absente de la charge est
 * une permission qu'on n'a pas. Le `?? false` n'est pas de la prudence
 * décorative : la matrice servie peut gagner des clés (elle en a déjà gagné),
 * et un client qui lirait `undefined` comme « vrai » ouvrirait une porte que
 * personne n'a ouverte.
 */
export function decodeAdminPermissions(raw: unknown): AdminPermissions {
  const source = asRecord(raw) ?? {};
  const lire = (clef: keyof AdminPermissions): boolean => source[clef] === true;

  return {
    canAccessAdmin: lire('canAccessAdmin'),
    canManageUsers: lire('canManageUsers'),
    canManageGroups: lire('canManageGroups'),
    canManageConversations: lire('canManageConversations'),
    canViewAnalytics: lire('canViewAnalytics'),
    canModerateContent: lire('canModerateContent'),
    canViewAuditLogs: lire('canViewAuditLogs'),
    canManageNotifications: lire('canManageNotifications'),
    canManageTranslations: lire('canManageTranslations'),
    // La garde RÉELLE des routes `/admin/agent/*` (#6733). La passerelle la
    // sert depuis le lot B ; ce décodeur ne la lisait pas, et la clé se
    // perdait au décodage — silencieusement, puisqu'une clé absente d'un type
    // rend `undefined` que personne ne lit.
    canManageAgent: lire('canManageAgent'),
  };
}

export async function loadAdminIdentity(
  params: AdminDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<AdminIdentity>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: '/api/v1/me/permissions',
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const charge = asRecord(result.data) ?? {};
  return {
    ok: true,
    data: {
      role: asText(charge.role) || 'USER',
      permissions: decodeAdminPermissions(charge.permissions),
    },
  };
}

/**
 * **LA LECTURE DES PERMISSIONS, écrite UNE fois** (#6458) — l'écran `/admin`,
 * la liste des comptes, la rangée des Réglages et le barreau du menu flottant
 * la partagent. Quatre `queryFn` recopiés sous la même clé auraient pu
 * diverger sur la façon de lire un refus ; ici un refus LÈVE, et chaque site
 * le lit comme l'absence du droit.
 *
 * Une matrice de permissions ne bouge pas pendant qu'on regarde un écran :
 * cinq minutes de fraîcheur, et aucun nouvel essai — un 403 relancé trois fois
 * remplirait les journaux d'audit de refus.
 */
export function adminIdentityQueryOptions(deps: AdminDeps) {
  return {
    queryKey: ADMIN_PERMISSIONS_QUERY_KEY,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<AdminIdentity> => {
      const resultat = await loadAdminIdentity({ ...deps, ...(signal === undefined ? {} : { signal }) });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  };
}

export function decodeAdminDashboard(raw: unknown): AdminDashboard {
  const charge = asRecord(raw) ?? {};
  const stats = asRecord(charge.statistics) ?? {};
  const recent = asRecord(charge.recentActivity) ?? {};

  return {
    totalUsers: asCount(stats.totalUsers),
    activeUsers: asCount(stats.activeUsers),
    totalMessages: asCount(stats.totalMessages),
    totalCommunities: asCount(stats.totalCommunities),
    totalReports: asCount(stats.totalReports),
    newUsers24h: asCount(recent.newUsers),
    newMessages24h: asCount(recent.newMessages),
  };
}

export async function loadAdminDashboard(
  params: AdminDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<AdminDashboard>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: '/api/v1/admin/dashboard',
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminDashboard(result.data) };
}

/**
 * La pagination est DANS `data`, pas à côté.
 *
 * `POST`/`GET /admin/users` répond par `sendSuccess(reply, { users, pagination })` —
 * l'objet `pagination` est donc une clé de la charge, là où d'autres routes du
 * dépôt le servent au niveau du `sendPaginatedSuccess`. Le lire au mauvais
 * endroit rendrait `total: 0` et `hasMore: false` : une liste qui s'arrête à
 * la première page sans que rien n'échoue.
 */
export function decodeAdminUsers(raw: unknown, offset: number): AdminUsersPage {
  const charge = asRecord(raw) ?? {};
  const brut = Array.isArray(charge.users) ? charge.users : Array.isArray(raw) ? raw : [];

  const users = brut
    .map((entree): AdminUserRow | null => {
      const ligne = asRecord(entree);
      if (ligne === null || typeof ligne.id !== 'string') return null;
      const username = asText(ligne.username);
      return {
        id: ligne.id,
        username,
        // Le nom affiché retombe sur le pseudo — jamais une ligne sans nom
        // dans un tableau où l'on cherche quelqu'un.
        displayName: asText(ligne.displayName) || username,
        email: asText(ligne.email),
        role: asText(ligne.role) || 'USER',
        isActive: ligne.isActive !== false,
        isOnline: ligne.isOnline === true,
        createdAt: typeof ligne.createdAt === 'string' ? ligne.createdAt : null,
        avatar: asText(ligne.avatar),
        lastActiveAt: typeof ligne.lastActiveAt === 'string' ? ligne.lastActiveAt : null,
        emailVerified: typeof ligne.emailVerifiedAt === 'string' || ligne.emailVerified === true,
        twoFactorEnabled: typeof ligne.twoFactorEnabledAt === 'string' || ligne.twoFactorEnabled === true,
      };
    })
    .filter((ligne): ligne is AdminUserRow => ligne !== null);

  const meta = asRecord(charge.pagination) ?? {};
  const total = asCount(meta.total);
  // `hasMore` vient du SERVEUR quand il le dit ; sinon il se recalcule depuis
  // l'offset et ce qui a été rendu — jamais depuis la seule longueur de page,
  // qui vaut aussi bien « fin de liste » que « page pleine ».
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + users.length < total;

  return { users, total: total || users.length, offset, hasMore };
}

export async function loadAdminUsers(
  params: AdminDeps & {
    readonly offset: number;
    readonly search: string;
    readonly limit?: number;
    /** Le tri et les filtres d'une liste d'administration (#7873), déjà passés par la liste blanche de l'écran. */
    readonly sortBy?: string;
    readonly sortOrder?: 'asc' | 'desc';
    readonly filters?: Readonly<Record<string, string>>;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUsersPage>> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(params.limit ?? ADMIN_USERS_PAGE_SIZE),
    ...(params.search.trim() === '' ? {} : { search: params.search.trim() }),
    ...(params.sortBy === undefined ? {} : { sortBy: params.sortBy }),
    ...(params.sortOrder === undefined ? {} : { sortOrder: params.sortOrder }),
    ...params.filters,
  });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminUsers(result.data, params.offset) };
}
