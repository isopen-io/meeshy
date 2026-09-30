import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { asCount, asRecord, type AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * **LES COMPTEURS DU TABLEAU DE BORD** (#6432) — `GET /admin/dashboard`, mis en
 * cache dix minutes côté serveur. Déplacés d'`admin.ts` par #8876 : ce module
 * porte SES décodeurs et sa clé de requête, `admin.ts` ne garde que l'identité
 * du lecteur.
 *
 * Clé sous le préfixe `admin` : jamais persistée sur le disque (#8876,
 * `estClefNonPersistable`).
 */
export const ADMIN_DASHBOARD_QUERY_KEY = ['admin', 'dashboard'] as const;

export type AdminDashboard = {
  readonly totalUsers: number;
  readonly activeUsers: number;
  readonly totalMessages: number;
  readonly totalCommunities: number;
  readonly totalReports: number;
  readonly newUsers24h: number;
  readonly newMessages24h: number;
};

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
    path: adminEndpoints.dashboard,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminDashboard(result.data) };
}
