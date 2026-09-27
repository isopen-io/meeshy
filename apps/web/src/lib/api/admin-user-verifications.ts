import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps } from './admin';
import { decodeAdminUserDetail, type AdminUserDetail } from './admin-user-detail';
import type { ApiResult } from './http';

/**
 * **LES PREUVES DE CONTACT ET LE SECOND FACTEUR D'UN MEMBRE** (#8289).
 *
 * Trois gestes de la fiche d'administration, chacun sur l'adresse qui porte
 * SA loi côté passerelle (`routes/admin/users-write.ts`,
 * `routes/admin/user-verification-requests.ts`) — jamais mêlés au `PATCH` du
 * profil, dont l'appelant ne pourrait plus deviner le coût.
 */
export type AdminContactChannel = 'email' | 'phone';

const CHAMP_DE_PREUVE: Readonly<Record<AdminContactChannel, 'emailVerified' | 'phoneVerified'>> = {
  email: 'emailVerified',
  phone: 'phoneVerified',
};

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

async function membreRendu(result: ApiResult<unknown>): Promise<ApiResult<AdminUserDetail>> {
  if (!result.ok) return result;
  const membre = decodeAdminUserDetail(result.data);
  return membre === null ? { ok: false, status: 0, error: 'Membre illisible' } : { ok: true, data: membre };
}

/** Marquer un e-mail ou un téléphone vérifié — ou retirer la preuve. */
export async function setAdminUserVerification(
  params: AdminDeps & {
    readonly userId: string;
    readonly channel: AdminContactChannel;
    readonly verified: boolean;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUserDetail>> {
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: adminEndpoints.usersByUserIdVerifications(params.userId),
    body: { [CHAMP_DE_PREUVE[params.channel]]: params.verified },
    ...withSignal(params.signal),
  });
  return membreRendu(result);
}

/** Activer ou désactiver le second facteur du membre. */
export async function setAdminUserTwoFactor(
  params: AdminDeps & { readonly userId: string; readonly enabled: boolean; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserDetail>> {
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: adminEndpoints.usersByUserIdSecurity(params.userId),
    body: { twoFactorEnabled: params.enabled },
    ...withSignal(params.signal),
  });
  return membreRendu(result);
}

/**
 * Renvoyer la vérification — un code + lien par e-mail, un SMS par
 * téléphone. Rien n'est écrit sur le membre : la réponse ne dit que le canal.
 */
export async function requestAdminUserVerification(
  params: AdminDeps & { readonly userId: string; readonly channel: AdminContactChannel; readonly signal?: AbortSignal },
): Promise<ApiResult<{ readonly channel: AdminContactChannel }>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.usersByUserIdVerificationRequests(params.userId),
    body: { channel: params.channel },
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  return { ok: true, data: { channel: params.channel } };
}
