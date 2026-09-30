import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { asRecord } from './admin';
import { readAdmin, servedCount, type AdminReadParams } from './admin-overview';
import type { ApiResult } from './http';

/**
 * **LES COMPTEURS DE LA PLATEFORME** (#6432, #8876) — `GET /admin/dashboard`,
 * mis en cache dix minutes côté serveur. Déplacés d'`admin.ts` par #8876 : ce
 * module porte SES décodeurs et sa clé de requête, `admin.ts` ne garde que
 * l'identité du lecteur.
 *
 * ## Ce que la passerelle sert sous ce chemin et que nous ne lisons PAS
 *
 * `topLanguages`, `usersByRole` et `messagesByType` sont des BOUCHE-TROUS — des
 * constantes en dur (deux langues à zéro, deux dictionnaires vides) : les
 * afficher ferait lire un zéro comme une mesure. Les langues et les types de
 * messages viennent des lectures analytiques (`admin-overview.ts`).
 * `totalInvitations` compte des `CommunityMember`, pas des invitations : le
 * nom ment, on ne le lit pas. `userPermissions` est la matrice que
 * `GET /me/permissions` sert déjà.
 *
 * Clé sous le préfixe `admin` : jamais persistée sur le disque (#8876,
 * `estClefNonPersistable`). Le second segment `dash` est celui de TOUT le
 * tableau de bord : « Recalculer maintenant » (Réglages) invalide
 * `ADMIN_DASH_QUERY_KEY` et relit donc les seize lectures d'un coup.
 */
export const ADMIN_DASH_QUERY_KEY = ['admin', 'dash'] as const;

export const ADMIN_DASHBOARD_QUERY_KEY = [...ADMIN_DASH_QUERY_KEY, 'platform'] as const;

export type AdminDashboard = {
  readonly totalUsers: number | null;
  readonly activeUsers: number | null;
  readonly inactiveUsers: number | null;
  readonly adminUsers: number | null;
  readonly totalAnonymousUsers: number | null;
  readonly activeAnonymousUsers: number | null;
  readonly totalMessages: number | null;
  readonly totalCommunities: number | null;
  readonly totalTranslations: number | null;
  readonly totalShareLinks: number | null;
  readonly activeShareLinks: number | null;
  readonly totalReports: number | null;
  readonly newUsers24h: number | null;
  readonly newConversations24h: number | null;
  readonly newMessages24h: number | null;
  readonly newAnonymousUsers24h: number | null;
};

/**
 * `null` quand `statistics` manque : une charge sans statistiques n'est pas un
 * tableau de bord à zéro, c'est une réponse illisible — l'écran dessine son
 * erreur et « Réessayer ». Un compteur isolé illisible vaut `null` (« — »).
 */
export function decodeAdminDashboard(raw: unknown): AdminDashboard | null {
  const payload = asRecord(raw);
  const stats = asRecord(payload?.statistics);
  if (payload === null || stats === null || Array.isArray(raw) || Array.isArray(payload.statistics)) return null;
  const recent = asRecord(payload.recentActivity);

  return {
    totalUsers: servedCount(stats.totalUsers),
    activeUsers: servedCount(stats.activeUsers),
    inactiveUsers: servedCount(stats.inactiveUsers),
    adminUsers: servedCount(stats.adminUsers),
    totalAnonymousUsers: servedCount(stats.totalAnonymousUsers),
    activeAnonymousUsers: servedCount(stats.activeAnonymousUsers),
    totalMessages: servedCount(stats.totalMessages),
    totalCommunities: servedCount(stats.totalCommunities),
    totalTranslations: servedCount(stats.totalTranslations),
    totalShareLinks: servedCount(stats.totalShareLinks),
    activeShareLinks: servedCount(stats.activeShareLinks),
    totalReports: servedCount(stats.totalReports),
    newUsers24h: servedCount(recent?.newUsers),
    newConversations24h: servedCount(recent?.newConversations),
    newMessages24h: servedCount(recent?.newMessages),
    newAnonymousUsers24h: servedCount(recent?.newAnonymousUsers),
  };
}

export const loadAdminDashboard = (params: AdminReadParams): Promise<ApiResult<AdminDashboard>> =>
  readAdmin(params, adminEndpoints.dashboard, decodeAdminDashboard);
