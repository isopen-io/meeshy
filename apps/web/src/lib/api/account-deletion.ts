import * as z from 'zod/mini';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';
import { reachFailureOf, unreadableFailure, type ReachFailure } from './link-failure';

/**
 * **LE PORT DE LA SUPPRESSION DE COMPTE** (#6715) — obligation réglementaire,
 * deux portes de la passerelle :
 *
 * - `POST /api/v1/account/deletion/resolve` (`routes/account-deletion.ts`) —
 *   PUBLIQUE : le lien de l'e-mail (`buildDeletionPageUrl`,
 *   `routes/me/delete-account.ts`, `?token=&action=confirm|cancel|purge`). Elle
 *   n'exige pas de session parce que la personne qui ANNULE sa suppression a
 *   pu perdre l'accès à son compte — c'est même le cas nominal ;
 * - `POST /api/v1/me/account/deletion` — la demande ouverte depuis les
 *   réglages, sous session ET mot de passe courant (#4183), miroir
 *   `AccountService.openDeletionRequest` (iOS) et `AccountDeletionApi`
 *   (Android). Elle envoie l'e-mail qui porte les deux liens ci-dessus.
 *
 * **Aucune des deux ne part sans un geste humain.** Les liens de courriel
 * visaient autrefois des `GET` qui MUTAIENT : un antivirus de messagerie
 * confirmait la suppression sans que personne ne clique (#4183). Ce port ne
 * connaît pas le moment de l'appel — l'écran le déclenche au CLIC, jamais au
 * montage.
 */

export type AccountDeletionDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const DELETION_ACTIONS = ['confirm', 'cancel', 'purge'] as const;

export type DeletionAction = (typeof DELETION_ACTIONS)[number];

export type DeletionLink = { readonly token: string; readonly action: DeletionAction };

const actionOf = (raw: string | null): DeletionAction | null => DELETION_ACTIONS.find((action) => action === raw) ?? null;

export function deletionLinkFrom(search: URLSearchParams): DeletionLink | null {
  const token = search.get('token') ?? '';
  const action = actionOf(search.get('action'));
  return token === '' || action === null ? null : { token, action };
}

const ServedResolution = z.object({
  status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']),
  gracePeriodEndsAt: z.optional(z.nullable(z.string())),
  dataPurged: z.optional(z.boolean()),
});

export type DeletionResolution = {
  readonly status: z.infer<typeof ServedResolution>['status'];
  readonly gracePeriodEndsAt: string | null;
  readonly dataPurged: boolean;
};

export async function resolveAccountDeletion(deps: AccountDeletionDeps, link: DeletionLink): Promise<ApiResult<DeletionResolution>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureDeletionResolution } = await import('./fixtures-email-links');
    return fixtureDeletionResolution(link);
  }
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: '/api/v1/account/deletion/resolve',
    body: { token: link.token, action: link.action },
  });
  if (!result.ok) return result;
  const parsed = ServedResolution.safeParse(result.data);
  if (!parsed.success) return unreadableFailure('Suppression de compte');
  return {
    ok: true,
    data: { status: parsed.data.status, gracePeriodEndsAt: parsed.data.gracePeriodEndsAt ?? null, dataPurged: parsed.data.dataPurged ?? false },
  };
}

export type DeletionFailure = 'expired' | 'invalid' | ReachFailure;

/** `TOKEN_EXPIRED` / `TOKEN_INVALID` — les codes que `sendGone` pose (410). */
export function deletionFailureOf(failure: ApiFailure): DeletionFailure {
  if (failure.code === 'TOKEN_EXPIRED') return 'expired';
  if (failure.code === 'TOKEN_INVALID' || failure.status === 410 || failure.status === 400) return 'invalid';
  return reachFailureOf(failure);
}

/**
 * La phrase que la passerelle compare en LITTÉRAL (`z.literal`,
 * `validation/delete-account-schemas.ts`). Elle se tape À LA LETTRE dans toutes
 * les langues — sans rognage ni casse, comme iOS (`DeleteAccountView.requiredPhrase`)
 * et Android (`AccountDeletionConfirmation.isConfirmed`) : une tolérance ici
 * rendrait un bouton actif que la passerelle refuserait.
 */
export const DELETION_CONFIRMATION_PHRASE = 'SUPPRIMER MON COMPTE';

export const isDeletionPhraseTyped = (typed: string): boolean => typed === DELETION_CONFIRMATION_PHRASE;

export async function requestAccountDeletion(deps: AccountDeletionDeps, currentPassword: string): Promise<ApiResult<null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureDeletionRequest } = await import('./fixtures-email-links');
    return fixtureDeletionRequest();
  }
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: '/api/v1/me/account/deletion',
    body: { confirmationPhrase: DELETION_CONFIRMATION_PHRASE, currentPassword },
  });
  return result.ok ? { ok: true, data: null } : result;
}

export type DeletionRequestFailure = 'wrong-password' | 'already-pending' | 'no-email' | 'signed-out' | ReachFailure;

/**
 * Les codes que `POST /me/account/deletion` pose : `INVALID_PASSWORD` (400, et
 * non 401 — un mot de passe faux ne déconnecte personne), `ALREADY_PENDING`
 * et `NO_EMAIL` (409). Un compte introuvable (404) n'a rien à dire au
 * lecteur que « réessayez ».
 */
export function requestFailureOf(failure: ApiFailure): DeletionRequestFailure {
  if (failure.code === 'INVALID_PASSWORD') return 'wrong-password';
  if (failure.code === 'ALREADY_PENDING') return 'already-pending';
  if (failure.code === 'NO_EMAIL') return 'no-email';
  if (failure.status === 401) return 'signed-out';
  return reachFailureOf(failure);
}
