import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { AdminDeps } from './admin';
import { memberFromResult, type AdminUserDetail } from './admin-user-detail';
import type { ApiResult } from './http';

/**
 * **SUPPRIMER ET RESTAURER UN COMPTE** (#6822, audit 2026-10-04) — les deux gestes
 * que la passerelle servait sans qu'aucun écran ne les offre :
 *
 * - `DELETE admin.usersByUserId` — suppression DOUCE : `isActive: false`,
 *   `deletedAt`, `deletedBy`, `deactivatedAt` ; les sessions sont fermées. Gardée
 *   par `requireUserDeleteAccess` (`canDeleteUsers` : BIGBOSS, ADMIN) et
 *   `requireHierarchy`. La route ne rend qu'un message : la fiche se RELIT.
 * - `POST admin.usersByUserIdRestore` — l'inverse, même garde ; la route rend la
 *   fiche relue (`getUserById`, avec `_count`), décodée par le décodeur de la fiche.
 *
 * Le motif : la route de suppression ne lit aucun corps aujourd'hui ; un motif
 * ÉCRIT voyage quand même sous `reason` (le geste reste consigné, et la passerelle
 * qui l'apprendra n'aura rien à attendre du client). Absent (rang souverain, spec
 * 2026-10-04 § 4), aucun corps ne part — un `DELETE` au corps JSON vide serait
 * refusé par Fastify.
 */
export type AdminUserDeleted = { readonly deleted: true };

/** Le minimum d'un motif écrit par un rang non souverain — celui des autres gestes destructifs (bannir). */
export const ADMIN_DELETE_MOTIVE_MIN_LENGTH = 3;

export async function deleteAdminUser(params: AdminDeps & { readonly userId: string; readonly reason: string | null }): Promise<ApiResult<AdminUserDeleted>> {
  const motif = params.reason?.trim() ?? '';
  const result = await params.transport.request<unknown>({
    method: 'DELETE',
    path: adminEndpoints.usersByUserId(params.userId),
    ...(motif === '' ? {} : { body: { reason: motif } }),
  });
  return result.ok ? { ok: true, data: { deleted: true } } : result;
}

export async function restoreAdminUser(params: AdminDeps & { readonly userId: string }): Promise<ApiResult<AdminUserDetail>> {
  return memberFromResult(
    await params.transport.request<unknown>({
      method: 'POST',
      path: adminEndpoints.usersByUserIdRestore(params.userId),
    }),
  );
}
