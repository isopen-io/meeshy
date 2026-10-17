import * as z from 'zod/mini';
import * as authEndpoints from '@meeshy/shared/api/endpoints/auth';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';
import { reachFailureOf, unreadableFailure, type ReachFailure } from './link-failure';

/**
 * **LE LIEN « CE N'ÉTAIT PAS MOI »** (#10859) — l'alerte de nouvelle connexion
 * porte `…/auth/revoke-sessions?via=email#token=…`. La page remet le jeton à
 * `POST /auth/revoke-all-sessions` dans le CORPS, au CLIC : jamais au montage,
 * pour qu'un pré-chargeur de liens ne déconnecte personne, et jamais dans une
 * adresse qu'un journal d'accès garderait. La passerelle ferme alors toutes
 * les sessions du compte ET coupe ses sockets vivantes.
 */

export type RevokeSessionsDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

const ServedRevocation = z.object({ revokedCount: z.number() });

export type RevokeSessionsResult = { readonly revokedCount: number };

export async function revokeAllSessionsFromLink(deps: RevokeSessionsDeps, token: string): Promise<ApiResult<RevokeSessionsResult>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { revokedCount: 2 } };
  const result = await deps.transport.request<unknown>({ method: 'POST', path: authEndpoints.revokeAllSessions, body: { token } });
  if (!result.ok) return result;
  const parsed = ServedRevocation.safeParse(result.data);
  return parsed.success ? { ok: true, data: { revokedCount: parsed.data.revokedCount } } : unreadableFailure('Révocation des sessions');
}

export type RevokeFailure = 'invalid' | ReachFailure;

/** `INVALID_OR_EXPIRED_LINK` (400) — le code que la passerelle pose sur un jeton expiré, déjà servi ou forgé. */
export function revokeFailureOf(failure: ApiFailure): RevokeFailure {
  if (failure.code === 'INVALID_OR_EXPIRED_LINK' || failure.status === 400) return 'invalid';
  return reachFailureOf(failure);
}
