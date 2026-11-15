import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps } from './admin';
import { memberFromResult, type AdminUserDetail } from './admin-user-detail';
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

/** Les trois PREUVES qu'un administrateur peut poser ou retirer : l'e-mail, le téléphone et l'âge (#8004). */
export type AdminProofChannel = AdminContactChannel | 'age';

const CHAMP_DE_PREUVE: Readonly<Record<AdminProofChannel, 'emailVerified' | 'phoneVerified' | 'ageVerified'>> = {
  email: 'emailVerified',
  phone: 'phoneVerified',
  age: 'ageVerified',
};

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

/** Un motif VIDE n'est pas un motif : l'envoyer blanc remplirait le journal d'audit de raisons qui n'en sont pas. */
const withReason = (reason: string | undefined): { readonly reason?: string } => {
  const motif = reason?.trim() ?? '';
  return motif === '' ? {} : { reason: motif };
};

const membreRendu = async (result: ApiResult<unknown>): Promise<ApiResult<AdminUserDetail>> => memberFromResult(result);

/**
 * Marquer un e-mail, un téléphone ou un âge vérifié — ou retirer la preuve.
 * `PATCH admin.usersByUserIdVerifications`, sous la loi de ses champs
 * (`canUpdateUsers`, hiérarchie sur la cible) ; le motif est facultatif mais
 * voyage dans la trace d'audit quand il est écrit.
 */
export async function setAdminUserVerification(
  params: AdminDeps & {
    readonly userId: string;
    readonly channel: AdminProofChannel;
    readonly verified: boolean;
    readonly reason?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUserDetail>> {
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: adminEndpoints.usersByUserIdVerifications(params.userId),
    body: { [CHAMP_DE_PREUVE[params.channel]]: params.verified, ...withReason(params.reason) },
    ...withSignal(params.signal),
  });
  return membreRendu(result);
}

/**
 * Activer ou désactiver le second facteur du membre — `PATCH
 * admin.usersByUserIdSecurity`. Désarmer est le chemin de récupération d'un
 * appareil perdu ; le motif, écrit, part dans la trace.
 */
export async function setAdminUserTwoFactor(
  params: AdminDeps & { readonly userId: string; readonly enabled: boolean; readonly reason?: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserDetail>> {
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: adminEndpoints.usersByUserIdSecurity(params.userId),
    body: { twoFactorEnabled: params.enabled, ...withReason(params.reason) },
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
