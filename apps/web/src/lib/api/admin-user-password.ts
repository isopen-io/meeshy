import type { PasswordProposals } from '@meeshy/shared/types/admin-password-proposal';
import * as z from 'zod/mini';
import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * **RÉINITIALISER LE MOT DE PASSE D'UN MEMBRE** (#6819, #8051) —
 * `POST admin.usersByUserIdResetPassword`, sous `canResetPasswords`
 * (ADMIN+) et `requireHierarchy`. Le geste **révoque les sessions ouvertes**
 * de la cible (`resetPassword`, #5569) : la personne est déconnectée partout.
 *
 * ## Les propositions viennent de la PASSERELLE
 *
 * La passerelle applique `validatePasswordStrength` (`routes/admin/users.ts`)
 * — longueur ≥ `PASSWORD_MIN_LENGTH` ET un score `zxcvbn` **proportionnel à
 * la longueur** (`≥16 ⇒ 3`, `≥10 ⇒ 2`, sinon `1`), sans classe de caractères
 * imposée. Un secret composé ICI à partir du pseudo pourrait être refusé
 * **après** l'aller-retour ; reproduire la politique côté client en ferait
 * une jumelle qui divergerait au premier ajustement de palier. Les quatre
 * niveaux (#8051 — simple, facile, moyen, difficile) sont donc composés ET
 * jugés par `POST …/password-proposals` : ce qui s'affiche a déjà été accepté.
 *
 * ## Ce qui est affiché est ce qui part
 *
 * L'administrateur peut retoucher la proposition ou saisir la sienne ; c'est
 * la valeur du champ qui voyage. Un refus de la passerelle sur un secret
 * saisi à la main revient en `error`, et la feuille l'affiche sous le champ.
 *
 * ## Prévenir le membre, sur demande
 *
 * `sendEmail: true` fait envoyer par la passerelle une alerte de sécurité au
 * membre, dans sa langue (`UserManagementService.resetPassword` →
 * `notifyPasswordResetBestEffort`, #6831) ; le secret n'y figure pas. C'est un
 * OPT-IN : la clé ne part que cochée — un administrateur qui répond à un compte
 * compromis ne veut pas forcément alerter son détenteur.
 *
 * ## Le motif
 *
 * Facultatif, consigné au journal quand il est écrit (`logResetPassword`) ; la
 * passerelle en exige alors dix caractères (`resetPasswordValidationSchema`).
 */

/** Le plancher d'un motif ÉCRIT (`resetPasswordValidationSchema` : `min(10)`). */
export const ADMIN_PASSWORD_MOTIVE_MIN_LENGTH = 10;

/**
 * Le plancher SERVEUR (`PASSWORD_MIN_LENGTH` = 6). On refuse en dessous sans
 * appeler : c'est le seul refus dont on soit certain d'avance. Au-delà, c'est
 * le score `zxcvbn` qui décide, et il ne se calcule pas ici.
 */
export const ADMIN_PASSWORD_MIN_LENGTH = 6;

export type { PasswordProposals };

const proposal = z.string().check(z.minLength(ADMIN_PASSWORD_MIN_LENGTH));

const ServedProposals = z.strictObject({ simple: proposal, easy: proposal, medium: proposal, hard: proposal });

export async function fetchAdminPasswordProposals(
  params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<PasswordProposals>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.usersByUserIdPasswordProposals(params.userId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const decoded = ServedProposals.safeParse(result.data);
  if (!decoded.success) return { ok: false, status: 0, error: 'Propositions illisibles' };
  return { ok: true, data: decoded.data };
}

export async function resetAdminUserPassword(
  params: AdminDeps & {
    readonly userId: string;
    readonly newPassword: string;
    readonly reason?: string;
    /** Prévenir le membre par e-mail — la clé ne part que si c'est `true`. */
    readonly sendEmail?: boolean;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<null>> {
  if (params.newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return { ok: false, status: 0, error: `Mot de passe trop court (min ${ADMIN_PASSWORD_MIN_LENGTH} caractères)` };
  }

  const motif = params.reason?.trim() ?? '';
  const corps: Record<string, unknown> = { newPassword: params.newPassword };
  if (motif !== '' && motif.length < ADMIN_PASSWORD_MOTIVE_MIN_LENGTH) {
    return { ok: false, status: 0, error: `Motif trop court (min ${ADMIN_PASSWORD_MOTIVE_MIN_LENGTH} caractères)` };
  }
  if (motif !== '') corps.reason = motif;
  if (params.sendEmail === true) corps.sendEmail = true;

  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.usersByUserIdResetPassword(params.userId),
    body: corps,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  // La route ne rend qu'un message — aucune donnée du membre. Le port ne
  // prétend donc rien décoder : il dit que c'est fait.
  return { ok: true, data: null };
}
