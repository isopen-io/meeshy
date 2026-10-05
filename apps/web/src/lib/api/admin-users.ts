import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { asCount, asRecord, asText, type AdminDeps } from './admin';
import type { AdminPage } from './admin-page';
import type { ApiResult } from './http';

/**
 * **LA LISTE DES COMPTES** (#6432, #7873) — `GET /admin/users`. Déplacée
 * d'`admin.ts` par #8876 avec sa clé de requête et ses types : ce module porte
 * SES décodeurs, `admin.ts` ne garde que l'identité du lecteur.
 *
 * Clé sous le préfixe `admin` : jamais persistée sur le disque (#8876,
 * `estClefNonPersistable`) — une liste de comptes est une donnée d'administration.
 */
export const adminUsersQueryKey = (adresse: string) => ['admin', 'users', adresse] as const;

export const ADMIN_USERS_PAGE_SIZE = 20;

const dateOuNull = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null);

export type AdminUserRow = {
  readonly id: string;
  readonly username: string;
  /**
   * Le nom affiché TEL QUE SERVI — vide quand le compte n'en a pas. Le décodeur ne
   * fabrique aucun libellé : `personLabel` compose le nom lisible (nom affiché, puis
   * « Prénom Nom », puis `@pseudo`), et c'est lui seul qui décide du repli.
   */
  readonly displayName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: string;
  readonly isActive: boolean;
  readonly isOnline: boolean;
  readonly createdAt: string | null;
  readonly avatar: string;
  /** Masquée par la passerelle sous `canViewPresence` — `null` n'y veut pas dire « jamais ». */
  readonly lastActiveAt: string | null;
  readonly emailVerified: boolean;
  readonly phoneVerified: boolean;
  readonly twoFactorEnabled: boolean;
  /** Les trois dates dont `accountStateOf` tire l'état du compte — jamais un statut recalculé ici. */
  readonly lockedUntil: string | null;
  readonly deactivatedAt: string | null;
  readonly deletedAt: string | null;
};

export type AdminUsersPage = {
  readonly users: readonly AdminUserRow[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

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
      return {
        id: ligne.id,
        username: asText(ligne.username),
        displayName: asText(ligne.displayName).trim(),
        firstName: asText(ligne.firstName).trim(),
        lastName: asText(ligne.lastName).trim(),
        email: asText(ligne.email),
        role: asText(ligne.role) || 'USER',
        isActive: ligne.isActive !== false,
        isOnline: ligne.isOnline === true,
        createdAt: typeof ligne.createdAt === 'string' ? ligne.createdAt : null,
        avatar: asText(ligne.avatar),
        lastActiveAt: typeof ligne.lastActiveAt === 'string' ? ligne.lastActiveAt : null,
        emailVerified: typeof ligne.emailVerifiedAt === 'string' || ligne.emailVerified === true,
        phoneVerified: typeof ligne.phoneVerifiedAt === 'string' || ligne.phoneVerified === true,
        twoFactorEnabled: typeof ligne.twoFactorEnabledAt === 'string' || ligne.twoFactorEnabled === true,
        lockedUntil: dateOuNull(ligne.lockedUntil),
        deactivatedAt: dateOuNull(ligne.deactivatedAt),
        deletedAt: dateOuNull(ligne.deletedAt),
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
    path: `${adminEndpoints.users}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminUsers(result.data, params.offset) };
}

/**
 * La même lecture, rendue sous la forme commune des listes d'administration
 * (`{ rows, total, hasMore }`) que `useAdminList` consomme — un seul chargeur, deux
 * formes de sortie : `loadAdminUsers` garde la forme historique (`users`).
 */
export async function loadAdminUsersPage(params: Parameters<typeof loadAdminUsers>[0]): Promise<ApiResult<AdminPage<AdminUserRow>>> {
  const result = await loadAdminUsers(params);
  if (!result.ok) return result;
  return { ok: true, data: { rows: result.data.users, total: result.data.total, hasMore: result.data.hasMore } };
}
