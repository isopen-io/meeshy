import { type AdminDeps, asCount, asRecord } from './admin';
import type { ApiResult } from './http';

/**
 * **LES CHIFFRES ET LES PRÉFÉRENCES D'UN MEMBRE** (#7845).
 *
 * - `GET /api/v1/admin/users/:userId/stats` — des compteurs à plat.
 *   `reportsFiled` vaut `null` pour qui n'a pas `canModerateContent` : ce
 *   n'est pas zéro, c'est un chiffre que la passerelle ne sert pas.
 * - `GET /api/v1/admin/users/:userId/preferences` — les sept catégories,
 *   défauts appliqués, comme `/me/preferences` les sert au membre lui-même.
 *   Chaque lecture est journalisée côté passerelle.
 * - `PATCH /api/v1/admin/users/:userId/preferences/:category` — une écriture
 *   partielle, validée par le MÊME schéma que celle du membre, réservée à
 *   ADMIN+ au-dessus du rang de la cible, journalisée clé par clé.
 */
export const ADMIN_STAT_KEYS = [
  'messagesSent',
  'conversations',
  'posts',
  'reels',
  'stories',
  'comments',
  'reactionsGiven',
  'mediaUploaded',
  'friends',
  'pendingFriendRequestsIn',
  'pendingFriendRequestsOut',
  'reportsFiled',
  'reportsReceived',
  'activeSessions',
  'communities',
] as const;

export type AdminStatKey = (typeof ADMIN_STAT_KEYS)[number];
export type AdminUserStats = Readonly<Record<AdminStatKey, number | null>>;

export const ADMIN_PREFERENCE_CATEGORIES = ['privacy', 'notification', 'message', 'audio', 'video', 'document', 'application'] as const;
export type AdminPreferenceCategory = (typeof ADMIN_PREFERENCE_CATEGORIES)[number];
export type AdminPreferenceValue = boolean | number | string | readonly unknown[] | Readonly<Record<string, unknown>> | null;
export type AdminPreferenceDocument = Readonly<Record<string, AdminPreferenceValue>>;
export type AdminUserPreferences = Readonly<Record<AdminPreferenceCategory, AdminPreferenceDocument>>;

/** Lisibles, jamais écrites par un administrateur : baisser le chiffrement d'autrui est refusé par la passerelle. */
export const ADMIN_READ_ONLY_PREFERENCES: Readonly<Partial<Record<AdminPreferenceCategory, readonly string[]>>> = {
  privacy: ['encryptionPreference', 'autoEncryptNewConversations', 'warnOnUnencrypted'],
};

export const adminUserStatsQueryKey = (userId: string) => ['admin', 'user', userId, 'stats'] as const;
export const adminUserPreferencesQueryKey = (userId: string) => ['admin', 'user', userId, 'preferences'] as const;

export function decodeAdminUserStats(raw: unknown): AdminUserStats {
  const charge = asRecord(raw) ?? {};
  return Object.fromEntries(
    ADMIN_STAT_KEYS.map((cle) => [cle, cle === 'reportsFiled' && charge[cle] === null ? null : asCount(charge[cle])]),
  ) as AdminUserStats;
}

const estValeur = (valeur: unknown): valeur is AdminPreferenceValue =>
  valeur === null || ['boolean', 'number', 'string', 'object'].includes(typeof valeur);

function decodeDocument(raw: unknown): AdminPreferenceDocument {
  return Object.fromEntries(Object.entries(asRecord(raw) ?? {}).filter((entree): entree is [string, AdminPreferenceValue] => estValeur(entree[1])));
}

export function decodeAdminUserPreferences(raw: unknown): AdminUserPreferences {
  const charge = asRecord(raw) ?? {};
  return Object.fromEntries(ADMIN_PREFERENCE_CATEGORIES.map((categorie) => [categorie, decodeDocument(charge[categorie])])) as AdminUserPreferences;
}

export async function loadAdminUserStats(
  params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserStats>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/stats`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return result.ok ? { ok: true, data: decodeAdminUserStats(result.data) } : result;
}

export async function loadAdminUserPreferences(
  params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserPreferences>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/preferences`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return result.ok ? { ok: true, data: decodeAdminUserPreferences(result.data) } : result;
}

export async function patchAdminUserPreferences(
  params: AdminDeps & {
    readonly userId: string;
    readonly category: AdminPreferenceCategory;
    readonly changes: AdminPreferenceDocument;
  },
): Promise<ApiResult<AdminPreferenceDocument>> {
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/preferences/${params.category}`,
    body: params.changes,
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeDocument(asRecord(result.data)?.preferences) };
}
