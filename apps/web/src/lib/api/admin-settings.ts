import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * **RECALCULER LES COMPTEURS DU TABLEAU DE BORD** (#8876, #6732) — `POST
 * /admin/dashboard/invalidate-cache`.
 *
 * La plateforme garde les compteurs du tableau de bord dix minutes (`dashboard.ts`,
 * `DASHBOARD_CACHE_KEY`) ; cette route vide ce cache, et le prochain `GET
 * /admin/dashboard` recalcule. Le geste exige `canManageNotifications` (une ÉCRITURE
 * demande plus que la lecture du tableau de bord).
 *
 * Le client n'envoie aucun corps et ne garde rien de la réponse : un accusé. La vérité
 * se relit par invalidation des lectures du tableau de bord (`ADMIN_DASHBOARD_KEYS`).
 */
export async function recomputeAdminDashboard(params: AdminDeps): Promise<ApiResult<{ readonly recomputed: true }>> {
  const result = await params.transport.request<unknown>({ method: 'POST', path: adminEndpoints.dashboardInvalidateCache });
  if (!result.ok) return result;
  return { ok: true, data: { recomputed: true }, ...(result.status === undefined ? {} : { status: result.status }) };
}

/**
 * Les lectures du tableau de bord à relire après le recalcul. `invalidateQueries` compare
 * par SEGMENTS : `['admin', 'dash']` (les blocs du tableau de bord) ne couvre pas
 * `['admin', 'dashboard']` (le bloc de chiffres du hub) — les deux familles sont nommées.
 * Toutes deux restent en mémoire (`estClefNonPersistable`).
 */
export const ADMIN_DASHBOARD_KEYS = [
  ['admin', 'dash'],
  ['admin', 'dashboard'],
] as const;
