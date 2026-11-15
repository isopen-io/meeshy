import * as z from 'zod/mini';
import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import { isConsentPurpose, type ConsentPurpose } from '@meeshy/shared/types/consents';

import { unwrap } from './client';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LES CONSENTEMENTS QUE LA PASSERELLE A ENREGISTRÉS** (#10502) — `GET
 * /me/consents` (`services/gateway/src/routes/me/consents.ts`), miroir de
 * `UserPreferencesManager.grantedConsents` (iOS, `ConsentService.swift`).
 *
 * **La lecture est une PROJECTION** : seuls les `purpose` ACCORDÉS entrent dans
 * le cache persisté — ni date, ni version de politique, ni bloc dérivé. Un
 * `purpose` inconnu (serveur plus récent) est ignoré sans rendre la liste
 * illisible ; une charge mal formée est un ÉCHEC, jamais un accord deviné : la
 * télémétrie n'accorde que sur une confirmation lue.
 */

export const CONSENTS_QUERY_KEY = ['me', 'consents'] as const;

/** Trente minutes, comme les réglages : un consentement n'a qu'un auteur, et il change ici ou dans l'app iOS. */
export const CONSENTS_STALE_TIME = 30 * 60_000;

export type GrantedConsents = readonly ConsentPurpose[];

export type ConsentsDeps = { readonly transport: HttpTransport };

const Entry = z.object({ purpose: z.string(), granted: z.boolean() });
const Served = z.object({ consents: z.array(Entry) });

export function decodeGrantedConsents(raw: unknown): GrantedConsents | null {
  const parsed = Served.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.consents.flatMap(({ purpose, granted }) => (granted && isConsentPurpose(purpose) ? [purpose] : []));
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadGrantedConsents(
  params: ConsentsDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<GrantedConsents>> {
  const result = await params.transport.request<unknown>({ method: 'GET', path: meEndpoints.consents, ...withSignal(params.signal) });
  if (!result.ok) return result;
  const granted = decodeGrantedConsents(result.data);
  return granted === null ? { ok: false, status: 0, error: 'Consentements illisibles' } : { ok: true, data: granted };
}

export function consentsQueryOptions(deps: ConsentsDeps) {
  return {
    queryKey: CONSENTS_QUERY_KEY,
    staleTime: CONSENTS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadGrantedConsents({ ...deps, ...withSignal(signal) })),
  };
}
