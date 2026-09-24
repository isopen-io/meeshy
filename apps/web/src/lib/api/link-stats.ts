import * as z from 'zod/mini';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LES STATISTIQUES D'UN LIEN D'INVITATION** (#7797) — `GET
 * /api/v1/links/:linkId/stats`, réservée au créateur du lien et aux
 * administrateurs du groupe. Visites, arrivées, arrivées sans compte, langues
 * et pays des arrivants, derniers arrivés.
 *
 * **La route arrive en parallèle** (passerelle, #7794). Tant qu'elle répond
 * 404, ce port rend `data: null` — « pas encore mesuré » — et la page dessine
 * ses emplacements : jamais des zéros, qui diraient « personne n'est venu ».
 *
 * **Cache d'abord** : l'entrée est persistée comme le reste de la famille
 * `['share-links']` (`query-client.ts`) ; une page rouverte se peint depuis
 * elle, puis se revalide en silence au-delà d'une minute.
 */

export type ShareLinkStatsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type LanguageCount = { readonly code: string; readonly count: number };
export type CountryCount = { readonly country: string; readonly count: number };

export type RecentArrival = {
  readonly participantId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly isAnonymous: boolean;
  readonly country: string | null;
  readonly language: string | null;
  readonly joinedAt: string;
};

export type ShareLinkStats = {
  readonly visits: number;
  readonly arrivals: number;
  readonly anonymousArrivals: number;
  readonly arrivalsByLanguage: readonly LanguageCount[];
  readonly arrivalsByCountry: readonly CountryCount[];
  readonly recentArrivals: readonly RecentArrival[];
};

export const SHARE_LINK_STATS_STALE_TIME = 60_000;

export const shareLinkStatsQueryKey = (linkId: string) => ['share-links', 'stats', linkId] as const;

const optionalText = z.optional(z.nullable(z.string()));
const optionalNumber = z.optional(z.nullable(z.number()));

const WireStats = z.object({
  visits: optionalNumber,
  arrivals: optionalNumber,
  anonymousArrivals: optionalNumber,
  arrivalsByLanguage: z.optional(z.nullable(z.array(z.object({ language: optionalText, count: optionalNumber })))),
  arrivalsByCountry: z.optional(z.nullable(z.array(z.object({ country: optionalText, count: optionalNumber })))),
  recentArrivals: z.optional(
    z.nullable(
      z.array(
        z.object({
          participantId: optionalText,
          displayName: optionalText,
          avatar: optionalText,
          isAnonymous: z.optional(z.nullable(z.boolean())),
          country: optionalText,
          language: optionalText,
          joinedAt: optionalText,
        }),
      ),
    ),
  ),
});

const countOf = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const ISO2 = /^[A-Z]{2}$/u;
const countryOf = (value: string | null | undefined): string | null => {
  const code = textOrNull(value)?.toUpperCase() ?? null;
  return code !== null && ISO2.test(code) ? code : null;
};

export function decodeShareLinkStats(raw: unknown): ShareLinkStats | null {
  const parsed = WireStats.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    visits: countOf(wire.visits),
    arrivals: countOf(wire.arrivals),
    anonymousArrivals: countOf(wire.anonymousArrivals),
    arrivalsByLanguage: (wire.arrivalsByLanguage ?? []).flatMap((row) => {
      const code = textOrNull(row.language)?.toLowerCase() ?? null;
      const count = countOf(row.count);
      return code === null || count === 0 ? [] : [{ code, count }];
    }),
    arrivalsByCountry: (wire.arrivalsByCountry ?? []).flatMap((row) => {
      const country = countryOf(row.country);
      const count = countOf(row.count);
      return country === null || count === 0 ? [] : [{ country, count }];
    }),
    recentArrivals: (wire.recentArrivals ?? []).flatMap((row): RecentArrival[] => {
      const participantId = textOrNull(row.participantId);
      const displayName = textOrNull(row.displayName);
      const joinedAt = textOrNull(row.joinedAt);
      if (participantId === null || displayName === null || joinedAt === null || Number.isNaN(Date.parse(joinedAt))) return [];
      return [
        {
          participantId,
          displayName,
          avatar: textOrNull(row.avatar),
          isAnonymous: row.isAnonymous === true,
          country: countryOf(row.country),
          language: textOrNull(row.language)?.toLowerCase() ?? null,
          joinedAt,
        },
      ];
    }),
  };
}

const UNREADABLE_STATS = 'UNREADABLE_LINK_STATS';

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadShareLinkStats(
  params: ShareLinkStatsDeps & { readonly linkId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<ShareLinkStats | null>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureShareLinkStats } = await import('./fixtures-link-stats');
    return { ok: true, data: fixtureShareLinkStats(params.linkId) };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/links/${encodeURIComponent(params.linkId)}/stats`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result.status === 404 ? { ok: true, data: null } : result;
  const stats = decodeShareLinkStats(result.data);
  return stats === null ? { ok: false, status: 0, error: 'Statistiques illisibles', code: UNREADABLE_STATS } : { ok: true, data: stats };
}

export function shareLinkStatsQueryOptions(deps: ShareLinkStatsDeps, linkId: string) {
  return {
    queryKey: shareLinkStatsQueryKey(linkId),
    staleTime: SHARE_LINK_STATS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadShareLinkStats({ ...deps, linkId, ...withSignal(signal) })),
  };
}
