import type { InfiniteData } from '@tanstack/react-query';
import * as z from 'zod/mini';
import * as trackingLinksEndpoints from '@meeshy/shared/api/endpoints/tracking-links';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE SES LIENS DE SUIVI** (#6408) — miroir `TrackingLinkService`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Services/TrackingLinkService.swift`),
 * pour le PROPRIÉTAIRE des liens. Les deux routes publiques d'un lien suivi
 * (le clic, la résolution) restent dans `tracking-links.ts`.
 *
 * - `GET trackingLinks.userMe?offset=&limit=` — les liens CRÉÉS PAR le lecteur
 *   (`creation.ts` : `where: { createdBy: userId }`), cinquante au plus par page.
 * - `GET trackingLinks.stats` — les agrégats RÉELS de tous ses liens.
 * - `GET trackingLinks.byTokenStats` — la ventilation d'UN lien (pays,
 *   appareils, navigateurs, sources sociales), calculée sur TOUS ses clics.
 *   iOS la recalcule depuis les cinquante derniers clics seulement : la
 *   passerelle sert mieux, le web la prend.
 * - `GET trackingLinks.byTokenClicks` — les derniers clics, sans aucune
 *   identité du visiteur (`trackingLinkClickResponseSchema`).
 * - `POST trackingLinks.root`, `PATCH trackingLinks.byToken` (`{ isActive }`),
 *   `DELETE trackingLinks.byToken`.
 *
 * **Un lien d'un autre compte ne se sert jamais.** La liste est bornée par la
 * passerelle au créateur ; les clics et la ventilation d'un lien refusent tout
 * autre compte (`tracking.ts` : `findFirst({ token, createdBy })`, 403 sur un
 * lien d'autrui) ; et le détail ne se lit QUE dans la liste.
 *
 * **Un lien décodé est une PROJECTION** : le cache est persisté
 * (`query-client.ts`), seuls les champs peints y entrent — ni l'identifiant
 * interne, ni le créateur, ni la conversation ou le message rattachés.
 *
 * **Le jeton personnalisé part en `customToken`**, la clé que la passerelle
 * déclare (`createTrackingLinkSchema`). iOS l'envoie en `token`, que zod
 * retire en silence : le champ d'iOS n'a aucun effet, celui du web en a un.
 */

export type MyTrackingLinksDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const TRACKING_LINKS_QUERY_PREFIX = ['tracking-links'] as const;
export const TRACKING_LINKS_QUERY_KEY = ['tracking-links', 'mine'] as const;
export const TRACKING_LINKS_SUMMARY_QUERY_KEY = ['tracking-links', 'summary'] as const;
export const trackingLinkStatsQueryKey = (token: string) => ['tracking-links', 'stats', token] as const;
export const trackingLinkClicksQueryKey = (token: string) => ['tracking-links', 'clicks', token] as const;
export const TRACKING_LINKS_PAGE_SIZE = 50;
export const RECENT_CLICKS_LIMIT = 20;
export const TRACKING_LINKS_STALE_TIME = 5 * 60_000;

export type MyTrackingLink = {
  readonly token: string;
  readonly name: string | null;
  readonly campaign: string | null;
  readonly source: string | null;
  readonly medium: string | null;
  readonly originalUrl: string;
  readonly totalClicks: number;
  readonly uniqueClicks: number;
  readonly isActive: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly lastClickedAt: string | null;
};

export type TrackingLinksSummary = {
  readonly totalLinks: number;
  readonly activeLinks: number;
  readonly totalClicks: number;
  readonly uniqueClicks: number;
};

export type TrackingLinksPage = { readonly links: readonly MyTrackingLink[]; readonly nextOffset: number | null };
export type TrackingLinksData = InfiniteData<TrackingLinksPage, number>;

/** Une part de la ventilation, triée de la plus forte à la plus faible. */
export type Breakdown = readonly { readonly label: string; readonly count: number }[];

export type TrackingLinkStats = {
  readonly totalClicks: number;
  readonly uniqueClicks: number;
  readonly countries: Breakdown;
  readonly devices: Breakdown;
  readonly browsers: Breakdown;
  readonly socialSources: Breakdown;
};

export type RedirectStatus = 'pending' | 'confirmed' | 'failed';

export type TrackingClick = {
  readonly id: string;
  readonly country: string | null;
  readonly city: string | null;
  readonly device: string | null;
  readonly browser: string | null;
  readonly socialSource: string | null;
  readonly redirectStatus: RedirectStatus;
  readonly clickedAt: string;
};

const optionalText = z.optional(z.nullable(z.string()));
const optionalNumber = z.optional(z.nullable(z.number()));
const isoDate = z.string().check(z.refine((value) => !Number.isNaN(Date.parse(value))));

const WireTrackingLink = z.object({
  token: z.string().check(z.minLength(1)),
  name: optionalText,
  campaign: optionalText,
  source: optionalText,
  medium: optionalText,
  originalUrl: z.string().check(z.minLength(1)),
  totalClicks: optionalNumber,
  uniqueClicks: optionalNumber,
  isActive: z.boolean(),
  expiresAt: optionalText,
  createdAt: isoDate,
  lastClickedAt: optionalText,
});

const WireList = z.object({ trackingLinks: z.array(z.unknown()) });
const WireSummary = z.object({ totalLinks: optionalNumber, activeLinks: optionalNumber, totalClicks: optionalNumber, uniqueClicks: optionalNumber });
const WireCounts = z.optional(z.nullable(z.record(z.string(), z.number())));
const WireStats = z.object({
  totalClicks: optionalNumber,
  uniqueClicks: optionalNumber,
  clicksByCountry: WireCounts,
  clicksByDevice: WireCounts,
  clicksByBrowser: WireCounts,
  clicksBySocialSource: WireCounts,
});
const WireClick = z.object({
  id: z.string().check(z.minLength(1)),
  country: optionalText,
  city: optionalText,
  device: optionalText,
  browser: optionalText,
  socialSource: optionalText,
  redirectStatus: optionalText,
  clickedAt: isoDate,
});
const WireClicks = z.object({ clicks: z.array(z.unknown()) });
const WireCreated = z.object({ trackingLink: z.unknown() });

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value.trim();

const countOf = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const REDIRECT_STATUSES: readonly RedirectStatus[] = ['pending', 'confirmed', 'failed'];
const redirectStatusOf = (raw: string | null | undefined): RedirectStatus => REDIRECT_STATUSES.find((status) => status === raw) ?? 'pending';

export function decodeTrackingLink(raw: unknown): MyTrackingLink | null {
  const parsed = WireTrackingLink.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    token: wire.token,
    name: textOrNull(wire.name),
    campaign: textOrNull(wire.campaign),
    source: textOrNull(wire.source),
    medium: textOrNull(wire.medium),
    originalUrl: wire.originalUrl,
    totalClicks: countOf(wire.totalClicks),
    uniqueClicks: countOf(wire.uniqueClicks),
    isActive: wire.isActive,
    expiresAt: textOrNull(wire.expiresAt),
    createdAt: wire.createdAt,
    lastClickedAt: textOrNull(wire.lastClickedAt),
  };
}

/** Les clés vides ou « unknown » de la passerelle ne sont pas une catégorie : elles ne se peignent pas. */
function breakdownOf(counts: Readonly<Record<string, number>> | null | undefined): Breakdown {
  return Object.entries(counts ?? {})
    .map(([label, count]) => ({ label: label.trim(), count: countOf(count) }))
    .filter((entry) => entry.label !== '' && entry.label.toLowerCase() !== 'unknown' && entry.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function decodeTrackingLinkStats(raw: unknown): TrackingLinkStats | null {
  const parsed = WireStats.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    totalClicks: countOf(wire.totalClicks),
    uniqueClicks: countOf(wire.uniqueClicks),
    countries: breakdownOf(wire.clicksByCountry),
    devices: breakdownOf(wire.clicksByDevice),
    browsers: breakdownOf(wire.clicksByBrowser),
    socialSources: breakdownOf(wire.clicksBySocialSource),
  };
}

export function decodeTrackingClick(raw: unknown): TrackingClick | null {
  const parsed = WireClick.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    id: wire.id,
    country: textOrNull(wire.country),
    city: textOrNull(wire.city),
    device: textOrNull(wire.device),
    browser: textOrNull(wire.browser),
    socialSource: textOrNull(wire.socialSource),
    redirectStatus: redirectStatusOf(wire.redirectStatus),
    clickedAt: wire.clickedAt,
  };
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });
const illegible = (): ApiResult<never> => ({ ok: false, status: 0, error: 'Lien de suivi illisible' });

export async function loadMyTrackingLinks(
  params: MyTrackingLinksDeps & { readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<TrackingLinksPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureTrackingLinksPage } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureTrackingLinksPage(params.offset) };
  }
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(TRACKING_LINKS_PAGE_SIZE) });
  const result = await params.transport.request<unknown>({ method: 'GET', path: `${trackingLinksEndpoints.userMe}?${query.toString()}`, ...withSignal(params.signal) });
  if (!result.ok) return result;
  const parsed = WireList.safeParse(result.data);
  const rows = parsed.success ? parsed.data.trackingLinks : [];
  const links = rows.flatMap((raw) => {
    const link = decodeTrackingLink(raw);
    return link === null ? [] : [link];
  });
  return { ok: true, data: { links, nextOffset: result.pagination?.hasMore === true ? params.offset + rows.length : null } };
}

export async function loadTrackingLinksSummary(params: MyTrackingLinksDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<TrackingLinksSummary>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureTrackingLinksSummary } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureTrackingLinksSummary() };
  }
  const result = await params.transport.request<unknown>({ method: 'GET', path: trackingLinksEndpoints.stats, ...withSignal(params.signal) });
  if (!result.ok) return result;
  const parsed = WireSummary.safeParse(result.data);
  if (!parsed.success) return illegible();
  return {
    ok: true,
    data: {
      totalLinks: countOf(parsed.data.totalLinks),
      activeLinks: countOf(parsed.data.activeLinks),
      totalClicks: countOf(parsed.data.totalClicks),
      uniqueClicks: countOf(parsed.data.uniqueClicks),
    },
  };
}

export async function loadTrackingLinkStats(params: MyTrackingLinksDeps & { readonly token: string; readonly signal?: AbortSignal }): Promise<ApiResult<TrackingLinkStats>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureTrackingLinkStats } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureTrackingLinkStats(params.token) };
  }
  const result = await params.transport.request<unknown>({ method: 'GET', path: trackingLinksEndpoints.byTokenStats(params.token), ...withSignal(params.signal) });
  if (!result.ok) return result;
  const stats = decodeTrackingLinkStats(result.data);
  return stats === null ? illegible() : { ok: true, data: stats };
}

export async function loadTrackingLinkClicks(
  params: MyTrackingLinksDeps & { readonly token: string; readonly signal?: AbortSignal },
): Promise<ApiResult<readonly TrackingClick[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureTrackingClicks } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureTrackingClicks(params.token) };
  }
  const query = new URLSearchParams({ offset: '0', limit: String(RECENT_CLICKS_LIMIT) });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${trackingLinksEndpoints.byTokenClicks(params.token)}?${query.toString()}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const parsed = WireClicks.safeParse(result.data);
  if (!parsed.success) return illegible();
  return {
    ok: true,
    data: parsed.data.clicks.flatMap((raw) => {
      const click = decodeTrackingClick(raw);
      return click === null ? [] : [click];
    }),
  };
}

export function trackingLinksQueryOptions(deps: MyTrackingLinksDeps) {
  return {
    queryKey: TRACKING_LINKS_QUERY_KEY,
    staleTime: TRACKING_LINKS_STALE_TIME,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: { readonly pageParam: number; readonly signal?: AbortSignal }) =>
      unwrap(await loadMyTrackingLinks({ ...deps, offset: pageParam, ...withSignal(signal) })),
    getNextPageParam: (page: TrackingLinksPage) => page.nextOffset ?? undefined,
  };
}

export function trackingLinksSummaryQueryOptions(deps: MyTrackingLinksDeps) {
  return {
    queryKey: TRACKING_LINKS_SUMMARY_QUERY_KEY,
    staleTime: TRACKING_LINKS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadTrackingLinksSummary({ ...deps, ...withSignal(signal) })),
  };
}

export function trackingLinkStatsQueryOptions(deps: MyTrackingLinksDeps, token: string) {
  return {
    queryKey: trackingLinkStatsQueryKey(token),
    staleTime: TRACKING_LINKS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadTrackingLinkStats({ ...deps, token, ...withSignal(signal) })),
  };
}

export function trackingLinkClicksQueryOptions(deps: MyTrackingLinksDeps, token: string) {
  return {
    queryKey: trackingLinkClicksQueryKey(token),
    staleTime: TRACKING_LINKS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadTrackingLinkClicks({ ...deps, token, ...withSignal(signal) })),
  };
}

export async function setTrackingLinkActive(deps: MyTrackingLinksDeps, token: string, isActive: boolean): Promise<ApiResult<{ readonly isActive: boolean }>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { isActive } };
  const result = await deps.transport.request<unknown>({ method: 'PATCH', path: trackingLinksEndpoints.byToken(token), body: { isActive } });
  return result.ok ? { ok: true, data: { isActive } } : result;
}

export async function deleteTrackingLink(deps: MyTrackingLinksDeps, token: string): Promise<ApiResult<{ readonly token: string }>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { token } };
  const result = await deps.transport.request<unknown>({ method: 'DELETE', path: trackingLinksEndpoints.byToken(token) });
  return result.ok ? { ok: true, data: { token } } : result;
}

export type TrackingLinkDraft = {
  readonly originalUrl: string;
  readonly name: string;
  readonly campaign: string;
  readonly source: string;
  readonly medium: string;
  readonly customToken: string;
};

export const emptyTrackingLinkDraft = (): TrackingLinkDraft => ({ originalUrl: '', name: '', campaign: '', source: '', medium: '', customToken: '' });

export type CreateTrackingLinkBody = {
  readonly originalUrl: string;
  readonly name?: string;
  readonly campaign?: string;
  readonly source?: string;
  readonly medium?: string;
  readonly customToken?: string;
};

export type TrackingLinkDraftField = 'originalUrl' | 'name' | 'customToken';

export type TrackingLinkDraftValidation =
  | { readonly ok: true; readonly body: CreateTrackingLinkBody }
  | { readonly ok: false; readonly field: TrackingLinkDraftField };

/** Les bornes de `createTrackingLinkSchema` (gateway) : nom ≤ 32, UTM ≤ 100, jeton 5 à 50 pour un compte ordinaire. */
export const TRACKING_NAME_MAX = 32;
export const TRACKING_UTM_MAX = 100;
const CUSTOM_TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{3,48}[a-zA-Z0-9]$/u;

/** Une adresse sans protocole (« meeshy.me/tarifs ») est ce qu'on tape : elle se lit en https. */
export function normalizedUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '' || /\s/u.test(trimmed)) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

const optionalField = (key: keyof CreateTrackingLinkBody, value: string, max: number) => {
  const trimmed = value.trim().slice(0, max);
  return trimmed === '' ? {} : { [key]: trimmed };
};

export function validateTrackingLinkDraft(draft: TrackingLinkDraft): TrackingLinkDraftValidation {
  const originalUrl = normalizedUrl(draft.originalUrl);
  if (originalUrl === null) return { ok: false, field: 'originalUrl' };
  if (draft.name.trim().length > TRACKING_NAME_MAX) return { ok: false, field: 'name' };
  const customToken = draft.customToken.trim();
  if (customToken !== '' && !CUSTOM_TOKEN.test(customToken)) return { ok: false, field: 'customToken' };
  return {
    ok: true,
    body: {
      originalUrl,
      ...optionalField('name', draft.name, TRACKING_NAME_MAX),
      ...optionalField('campaign', draft.campaign, TRACKING_UTM_MAX),
      ...optionalField('source', draft.source, TRACKING_UTM_MAX),
      ...optionalField('medium', draft.medium, TRACKING_UTM_MAX),
      ...(customToken === '' ? {} : { customToken }),
    },
  };
}

export async function createTrackingLink(deps: MyTrackingLinksDeps, body: CreateTrackingLinkBody, now: Date): Promise<ApiResult<MyTrackingLink>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureCreateTrackingLink } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureCreateTrackingLink(body, now) };
  }
  const result = await deps.transport.request<unknown>({ method: 'POST', path: trackingLinksEndpoints.root, body });
  if (!result.ok) return result;
  const parsed = WireCreated.safeParse(result.data);
  const link = parsed.success ? decodeTrackingLink(parsed.data.trackingLink) : null;
  return link === null ? illegible() : { ok: true, data: link };
}

/** L'adresse à partager — celle que la passerelle compose (`buildTrackingUrl` : `/l/<token>`), sur l'origine publique. */
export const trackingLinkUrl = (origin: string, token: string): string => `${origin}/l/${encodeURIComponent(token)}`;

export const trackingDisplayNameOf = (link: Pick<MyTrackingLink, 'name' | 'token'>): string => link.name ?? link.token;
