import * as z from 'zod/mini';
import * as linksEndpoints from '@meeshy/shared/api/endpoints/links';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import type { ShareLinkStats } from './link-stats';

/**
 * **TOUTES LES ARRIVÉES D'UN LIEN D'INVITATION** (#7813) — `GET
 * links.byLinkIdArrivals?cursor=&limit=`, réservée aux lecteurs des
 * statistiques (le créateur, les administrateurs du groupe). La page de
 * détail n'en montre que les vingt dernières ; celle-ci les rend toutes, page
 * par page, sous un curseur opaque que la passerelle tient stable.
 *
 * Une arrivée n'y porte que nom, badge « sans compte », pays, langue et date —
 * le décodeur ne garde rien d'autre, même si une charge en portait plus.
 *
 * **Cache d'abord** : l'entrée est persistée avec la famille `['share-links']`
 * (`query-client.ts`) ; à la première ouverture, les arrivées récentes déjà en
 * main (`seedArrivalsFromStats`) se peignent avant la première réponse.
 */

export type ShareLinkArrivalsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type LinkArrival = {
  readonly displayName: string;
  readonly isAnonymous: boolean;
  readonly country: string | null;
  readonly language: string | null;
  readonly joinedAt: string;
};

export type ShareLinkArrivalsPage = {
  readonly arrivals: readonly LinkArrival[];
  readonly nextCursor: string | null;
};

export const SHARE_LINK_ARRIVALS_PAGE_SIZE = 30;
export const SHARE_LINK_ARRIVALS_STALE_TIME = 60_000;

export const shareLinkArrivalsQueryKey = (linkId: string) => ['share-links', 'arrivals', linkId] as const;

const optionalText = z.optional(z.nullable(z.string()));

const WirePage = z.object({
  arrivals: z.array(
    z.object({
      displayName: optionalText,
      isAnonymous: z.optional(z.nullable(z.boolean())),
      country: optionalText,
      language: optionalText,
      joinedAt: optionalText,
    }),
  ),
  nextCursor: optionalText,
});

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const ISO2 = /^[A-Z]{2}$/u;
const countryOf = (value: string | null | undefined): string | null => {
  const code = textOrNull(value)?.toUpperCase() ?? null;
  return code !== null && ISO2.test(code) ? code : null;
};

const toArrival = (row: {
  readonly displayName?: string | null | undefined;
  readonly isAnonymous?: boolean | null | undefined;
  readonly country?: string | null | undefined;
  readonly language?: string | null | undefined;
  readonly joinedAt?: string | null | undefined;
}): LinkArrival[] => {
  const displayName = textOrNull(row.displayName);
  const joinedAt = textOrNull(row.joinedAt);
  if (displayName === null || joinedAt === null || Number.isNaN(Date.parse(joinedAt))) return [];
  return [
    {
      displayName,
      isAnonymous: row.isAnonymous === true,
      country: countryOf(row.country),
      language: textOrNull(row.language)?.toLowerCase() ?? null,
      joinedAt,
    },
  ];
};

export function decodeShareLinkArrivalsPage(raw: unknown): ShareLinkArrivalsPage | null {
  const parsed = WirePage.safeParse(raw);
  if (!parsed.success) return null;
  return { arrivals: parsed.data.arrivals.flatMap(toArrival), nextCursor: textOrNull(parsed.data.nextCursor) };
}

/** Les arrivées récentes des statistiques, projetées en première page à peindre sans attendre. */
export function seedArrivalsFromStats(stats: ShareLinkStats | null | undefined): { readonly arrivals: readonly LinkArrival[] } | null {
  if (stats === null || stats === undefined) return null;
  return { arrivals: stats.recentArrivals.flatMap(toArrival) };
}

const UNREADABLE_ARRIVALS = 'UNREADABLE_LINK_ARRIVALS';

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadShareLinkArrivals(
  params: ShareLinkArrivalsDeps & { readonly linkId: string; readonly cursor: string | null; readonly signal?: AbortSignal },
): Promise<ApiResult<ShareLinkArrivalsPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureShareLinkArrivals } = await import('./fixtures-link-stats');
    return { ok: true, data: fixtureShareLinkArrivals(params.linkId, params.cursor) };
  }
  const query = new URLSearchParams({ limit: String(SHARE_LINK_ARRIVALS_PAGE_SIZE) });
  if (params.cursor !== null) query.set('cursor', params.cursor);
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${linksEndpoints.byLinkIdArrivals(params.linkId)}?${query.toString()}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const page = decodeShareLinkArrivalsPage(result.data);
  return page === null ? { ok: false, status: 0, error: 'Arrivées illisibles', code: UNREADABLE_ARRIVALS } : { ok: true, data: page };
}

export function shareLinkArrivalsQueryOptions(deps: ShareLinkArrivalsDeps, linkId: string) {
  return {
    queryKey: shareLinkArrivalsQueryKey(linkId),
    staleTime: SHARE_LINK_ARRIVALS_STALE_TIME,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }: { readonly pageParam: string | null; readonly signal?: AbortSignal }) =>
      unwrap(await loadShareLinkArrivals({ ...deps, linkId, cursor: pageParam, ...withSignal(signal) })),
    getNextPageParam: (page: ShareLinkArrivalsPage): string | undefined => page.nextCursor ?? undefined,
  };
}
