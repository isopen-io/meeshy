import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { AdminDeps } from './admin';
import { memberFromResult, type AdminUserDetail } from './admin-user-detail';
import type { ApiResult } from './http';

/**
 * **DÉVERROUILLER UN COMPTE, POSER OU RETIRER UN CONSENTEMENT** (#8004) — les
 * deux gestes de la section Sécurité de la fiche qui n'avaient aucune porte côté
 * web, chacun sur l'adresse qui porte SA loi (`routes/admin/users-write.ts`).
 *
 * - `PATCH admin.usersByUserIdSecurity` `{ unlock: true, reason? }` — le champ
 *   `unlock` est gardé par `canUpdateUsers` ET par la hiérarchie sur la cible ;
 * - `PATCH admin.usersByUserIdConsents` `{ voiceProfile?, voiceData?,
 *   dataProcessing?, voiceCloning?, reason }` — poser au nom d'autrui qu'il a
 *   consenti à l'usage de sa VOIX fabrique une pièce légale : rang SOUVERAIN
 *   (BIGBOSS) et motif écrit d'au moins dix caractères.
 *
 * Jamais les adresses historiques (`…Unlock`, `…VoiceConsent`) : ce sont des
 * alias qui traduisent leur corps d'époque vers ces mêmes champs, et une console
 * qui les appelle porte un sursis de retrait.
 *
 * Chaque écriture rend le membre à jour (forme de `GET`), décodé par
 * `memberFromResult` : le cache de la fiche se remplace par la vérité servie.
 * L'analytique (`analyticsConsentAt`) n'a AUCUNE écriture administrative côté
 * passerelle : elle se lit, elle ne se pose pas.
 */

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

/** Les consentements qu'un administrateur souverain peut poser ou retirer — l'analytique n'en fait pas partie. */
export const ADMIN_WRITABLE_CONSENTS = ['voiceProfile', 'voiceData', 'dataProcessing', 'voiceCloning'] as const;

export type AdminConsent = (typeof ADMIN_WRITABLE_CONSENTS)[number];

/** Le minimum que la passerelle impose (`consentSchema`) — un consentement posé sans raison ne se justifierait devant personne. */
export const CONSENT_MOTIVE_MIN = 10;

export async function unlockAdminUser(
  params: AdminDeps & { readonly userId: string; readonly reason?: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserDetail>> {
  const motif = params.reason?.trim() ?? '';
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: adminEndpoints.usersByUserIdSecurity(params.userId),
    body: { unlock: true, ...(motif === '' ? {} : { reason: motif }) },
    ...withSignal(params.signal),
  });
  return memberFromResult(result);
}

export async function setAdminUserConsent(
  params: AdminDeps & {
    readonly userId: string;
    readonly consent: AdminConsent;
    readonly granted: boolean;
    readonly reason: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUserDetail>> {
  const motif = params.reason.trim();
  if (motif.length < CONSENT_MOTIVE_MIN) {
    return { ok: false, status: 0, error: `Le motif doit compter au moins ${CONSENT_MOTIVE_MIN} caractères` };
  }
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: adminEndpoints.usersByUserIdConsents(params.userId),
    body: { [params.consent]: params.granted, reason: motif },
    ...withSignal(params.signal),
  });
  return memberFromResult(result);
}
