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

/** Ce qu'« Activer le compte » doit savoir du membre pour choisir ses gestes. */
export type AdminActivationSubject = Pick<AdminUserDetail, 'id' | 'isActive' | 'emailVerifiedAt' | 'email' | 'phoneNumber'>;

/**
 * Le compte peut-il être en phase `blocked` (#8238) ? Seul un compte SANS
 * adresse prouvée ET sans numéro l'atteint (`account-activation.ts`) : un
 * numéro n'est jamais bloquant.
 */
export const adminActivationNeedsProof = (m: AdminActivationSubject): boolean =>
  m.emailVerifiedAt === null && m.email !== '' && m.phoneNumber === '';

/** « Activer le compte » a-t-il quelque chose à faire ? */
export const adminAccountNeedsActivation = (m: AdminActivationSubject): boolean => !m.isActive || adminActivationNeedsProof(m);

/**
 * **ACTIVER LE COMPTE EN UN GESTE** (#8289) — le rend actif ET le sort de la
 * phase `blocked` de #8238, comme « Marquer l'adresse vérifiée » : c'est la
 * preuve de l'adresse qui lève le blocage. Deux écritures sous leurs propres
 * lois et leurs propres traces d'audit, dans cet ordre ; la première refusée
 * arrête tout.
 */
export async function activateAdminUser(
  params: AdminDeps & { readonly membre: AdminActivationSubject; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserDetail>> {
  const { membre } = params;
  const reactivation = membre.isActive
    ? null
    : await params.transport.request<unknown>({
        method: 'PATCH',
        path: adminEndpoints.usersByUserId(membre.id),
        body: { isActive: true },
        ...withSignal(params.signal),
      });
  if (reactivation !== null && !reactivation.ok) return reactivation;
  if (!adminActivationNeedsProof(membre)) {
    return reactivation === null ? { ok: false, status: 0, error: 'Rien à activer' } : membreRendu(reactivation);
  }
  return setAdminUserVerification({
    source: params.source,
    transport: params.transport,
    userId: membre.id,
    channel: 'email',
    verified: true,
    ...withSignal(params.signal),
  });
}
