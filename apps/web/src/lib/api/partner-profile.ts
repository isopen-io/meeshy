import type { QueryClient } from '@tanstack/react-query';
import * as lensEndpoints from '@meeshy/shared/api/endpoints/lens';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PROFIL MEESHY SUR LA PAGE ÉDITEUR** (#16440, décision porteur du
 * 2026-11-06) — `GET /lens/partners/me` dit si l'appelant a un profil
 * d'éditeur (`null` sinon) et s'il y nomme son compte Meeshy ;
 * `PUT /lens/partners/me` écrit ce choix, MASQUÉ par défaut.
 *
 * La route d'écriture est celle du profil entier : elle exige le nom et
 * remet le site à `null` s'il manque. L'écriture renvoie donc le nom et le
 * site LUS — inchangés, ils ne retirent pas la vérification — et n'envoie
 * jamais `logo`, que son absence garde. Une passerelle antérieure à #16440
 * ne sert pas `showOwnerProfile` : il vaut masqué, ce qu'elle applique.
 *
 * Optimiste, avec retour arrière sur refus ; hors ligne, rien ne part (le
 * web n'a pas de file d'écriture, motif `circle-notify-preferences.ts`).
 */

export const PARTNER_PROFILE_QUERY_KEY = ['me', 'partner-profile'] as const;

export type PartnerOwnerProfile = {
  readonly displayName: string;
  readonly website: string | null;
  readonly showOwnerProfile: boolean;
};

export type PartnerProfileDecode = { readonly ok: true; readonly profile: PartnerOwnerProfile | null } | { readonly ok: false };

export type PartnerProfileDeps = { readonly source: DataSource; readonly transport: HttpTransport };

const UNREADABLE = { ok: false, status: 0, error: 'Profil d’éditeur illisible' } as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function decodePartnerProfile(raw: unknown): PartnerProfileDecode {
  if (raw === null) return { ok: true, profile: null };
  if (!isRecord(raw) || typeof raw.displayName !== 'string') return { ok: false };
  const website = raw.website ?? null;
  const show = raw.showOwnerProfile ?? false;
  if ((website !== null && typeof website !== 'string') || typeof show !== 'boolean') return { ok: false };
  return { ok: true, profile: { displayName: raw.displayName, website, showOwnerProfile: show } };
}

const served = (data: unknown): ApiResult<PartnerOwnerProfile | null> => {
  const decoded = decodePartnerProfile(data);
  return decoded.ok ? { ok: true, data: decoded.profile } : UNREADABLE;
};

export async function loadPartnerProfile(
  params: PartnerProfileDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<PartnerOwnerProfile | null>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: null };
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: lensEndpoints.partnersMe,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return result.ok ? served(result.data) : result;
}

async function putShowOwnerProfile(
  deps: PartnerProfileDeps,
  params: { readonly profile: PartnerOwnerProfile; readonly show: boolean },
): Promise<ApiResult<PartnerOwnerProfile | null>> {
  const result = await deps.transport.request<unknown>({
    method: 'PUT',
    path: lensEndpoints.partnersMe,
    body: { displayName: params.profile.displayName, website: params.profile.website, showOwnerProfile: params.show },
  });
  return result.ok ? served(result.data) : result;
}

export function partnerProfileQueryOptions(deps: PartnerProfileDeps) {
  return {
    queryKey: PARTNER_PROFILE_QUERY_KEY,
    staleTime: 30 * 60_000,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadPartnerProfile({ ...deps, ...(signal === undefined ? {} : { signal }) })),
  };
}

export type PartnerProfileActionDeps = PartnerProfileDeps & {
  readonly queryClient: QueryClient;
  readonly isOnline: () => boolean;
};

export type ShowOwnerProfileOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'offline' }
  | { readonly status: 'refused'; readonly error: string };

export async function performShowOwnerProfileEdit(params: {
  readonly show: boolean;
  readonly deps: PartnerProfileActionDeps;
}): Promise<ShowOwnerProfileOutcome> {
  const { show, deps } = params;
  if (!deps.isOnline()) return { status: 'offline' };
  await deps.queryClient.cancelQueries({ queryKey: PARTNER_PROFILE_QUERY_KEY });
  const previous = deps.queryClient.getQueryData<PartnerOwnerProfile | null>(PARTNER_PROFILE_QUERY_KEY);
  if (previous === undefined || previous === null) return { status: 'refused', error: 'no-profile' };

  deps.queryClient.setQueryData<PartnerOwnerProfile>(PARTNER_PROFILE_QUERY_KEY, { ...previous, showOwnerProfile: show });
  const result = await putShowOwnerProfile(deps, { profile: previous, show });
  if (!result.ok) {
    deps.queryClient.setQueryData<PartnerOwnerProfile>(PARTNER_PROFILE_QUERY_KEY, previous);
    return { status: 'refused', error: result.error };
  }
  deps.queryClient.setQueryData(PARTNER_PROFILE_QUERY_KEY, result.data);
  return { status: 'saved' };
}
