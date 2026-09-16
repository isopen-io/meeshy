import * as z from 'zod/mini';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';
import { reachFailureOf, type ReachFailure } from './link-failure';

/**
 * **LE PORT DU CHANGEMENT D'ADRESSE E-MAIL** (#6715) — la page
 * `/settings/verify-email-change?token=` que la passerelle compose dans
 * l'e-mail envoyé à la NOUVELLE adresse (`routes/users/contact-change.ts`,
 * `routes/users/contact-changes.ts`).
 *
 * **La route UNIFIÉE, pas celle du legacy.** Le legacy appelait
 * `POST /users/me/verify-email-change { token }`, dépréciée au profit de
 * `POST /users/me/contact-changes/email/verify { code }` (#4341) : même jeton,
 * comparaison à temps constant, et le profil à jour dans la réponse.
 *
 * **Sous session.** La route porte `fastify.authenticate` : le jeton ne suffit
 * pas, c'est le compte CONNECTÉ dont le changement en attente est vérifié.
 * Le legacy renvoyait vers la connexion ; l'écran le dit (`verify-email-change.tsx`).
 */

export type EmailChangeDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type EmailChangeResult = { readonly email: string | null };

const ServedVerification = z.object({ user: z.optional(z.object({ email: z.optional(z.nullable(z.string())) })) });

export async function verifyEmailChange(deps: EmailChangeDeps, token: string): Promise<ApiResult<EmailChangeResult>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureEmailChange } = await import('./fixtures-email-links');
    return fixtureEmailChange();
  }
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: '/api/v1/users/me/contact-changes/email/verify',
    body: { code: token },
  });
  if (!result.ok) return result;
  /* Un 200 est un changement FAIT : un profil illisible n'en fait pas un
     échec, il retire seulement l'adresse du texte de succès. */
  const parsed = ServedVerification.safeParse(result.data);
  return { ok: true, data: { email: parsed.success ? (parsed.data.user?.email ?? null) : null } };
}

export type EmailChangeFailure = 'expired' | 'invalid' | 'taken' | 'signed-out' | ReachFailure;

/**
 * Sur ces refus, la passerelle ne sert qu'une phrase ANGLAISE et aucun code
 * (`sendBadRequest(reply, 'Verification token has expired')`). Elle est lue
 * ICI, une fois, et jamais affichée : tout 400 que ces motifs ne reconnaissent
 * pas se dit « lien invalide », le seul conseil juste sans en savoir plus.
 */
const BAD_REQUEST_REASONS: ReadonlyArray<readonly [RegExp, EmailChangeFailure]> = [
  [/expired/i, 'expired'],
  [/no longer available/i, 'taken'],
];

export function emailChangeFailureOf(failure: ApiFailure): EmailChangeFailure {
  if (failure.status === 401) return 'signed-out';
  if (failure.status === 400) return BAD_REQUEST_REASONS.find(([pattern]) => pattern.test(failure.error))?.[1] ?? 'invalid';
  return reachFailureOf(failure);
}
