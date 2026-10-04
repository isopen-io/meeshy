import type { InfiniteData } from '@tanstack/react-query';
import * as z from 'zod/mini';
import * as affiliateEndpoints from '@meeshy/shared/api/endpoints/affiliate';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE SES LIENS DE PARRAINAGE** (#6409) — miroir `AffiliateService`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Services/AffiliateService.swift`).
 * La validation d'un code à l'inscription reste dans `affiliate.ts`.
 *
 * - `GET affiliate.tokens?offset=&limit=` — les jetons CRÉÉS PAR le lecteur
 *   (`routes/affiliate.ts` : `where: { createdBy: userId }`), avec le nombre
 *   d'inscrits de chacun (`_count.affiliations`).
 * - `GET affiliate.stats` — les inscrits, terminés et en attente, le nombre de
 *   ses jetons (tous, pas une page), et la liste des filleuls (nom et pseudo
 *   seulement : ce qui se peint).
 * - `POST affiliate.tokens` (`{ name, maxUses? }`), `DELETE affiliate.tokensById`.
 *
 * **L'adresse se compose ici**, sur l'origine publique du site : la passerelle
 * la compose sur `FRONTEND_URL`, qui retombe sur `http://localhost:3100` quand
 * la variable manque — un lien qui ne s'ouvrirait chez personne.
 *
 * **Pas de compteur de clics** : la passerelle n'en sert aucun (le schéma de la
 * liste ne déclare pas `clickCount`, qu'iOS peint toujours à zéro). Un chiffre
 * toujours nul n'est pas une statistique ; il n'est pas dessiné.
 */

export type AffiliateTokensDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const AFFILIATE_QUERY_PREFIX = ['affiliate'] as const;
export const AFFILIATE_TOKENS_QUERY_KEY = ['affiliate', 'tokens'] as const;
export const AFFILIATE_STATS_QUERY_KEY = ['affiliate', 'stats'] as const;
export const AFFILIATE_TOKENS_PAGE_SIZE = 50;
export const AFFILIATE_STALE_TIME = 5 * 60_000;
export const AFFILIATE_NAME_MAX = 100;
export const AFFILIATE_MAX_USES_CEILING = 100_000;

export type AffiliateToken = {
  readonly id: string;
  readonly token: string;
  readonly name: string;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly referrals: number;
  readonly isActive: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string;
};

export type ReferralStatus = 'pending' | 'completed' | 'expired';

export type Referral = {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly status: ReferralStatus;
  readonly createdAt: string | null;
};

export type AffiliateStats = {
  readonly totalTokens: number;
  readonly totalReferrals: number;
  readonly completedReferrals: number;
  readonly pendingReferrals: number;
  readonly referrals: readonly Referral[];
};

export type AffiliateTokensPage = { readonly tokens: readonly AffiliateToken[]; readonly nextOffset: number | null };
export type AffiliateTokensData = InfiniteData<AffiliateTokensPage, number>;

const optionalText = z.optional(z.nullable(z.string()));
const optionalNumber = z.optional(z.nullable(z.number()));
const isoDate = z.string().check(z.refine((value) => !Number.isNaN(Date.parse(value))));

const WireToken = z.object({
  id: z.string().check(z.minLength(1)),
  token: z.string().check(z.minLength(1)),
  name: z.string(),
  maxUses: optionalNumber,
  currentUses: optionalNumber,
  isActive: z.optional(z.nullable(z.boolean())),
  expiresAt: optionalText,
  createdAt: isoDate,
  _count: z.optional(z.nullable(z.object({ affiliations: optionalNumber }))),
});

const WireReferral = z.object({
  id: z.string().check(z.minLength(1)),
  status: optionalText,
  createdAt: optionalText,
  referredUser: z.optional(
    z.nullable(
      z.object({
        username: z.string(),
        displayName: optionalText,
        firstName: optionalText,
        lastName: optionalText,
      }),
    ),
  ),
});

const WireStats = z.object({
  totalReferrals: optionalNumber,
  completedReferrals: optionalNumber,
  pendingReferrals: optionalNumber,
  referrals: z.optional(z.nullable(z.array(z.unknown()))),
  tokens: z.optional(z.nullable(z.array(z.unknown()))),
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value.trim();

const countOf = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const limitOf = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;

const expired = (expiresAt: string | null, now: Date): boolean => expiresAt !== null && Date.parse(expiresAt) <= now.getTime();

/**
 * **Actif, c'est ce qui accepte encore un inscrit** : la colonne `isActive`,
 * une échéance non passée, et un plafond non atteint. La passerelle ne pose
 * que l'échéance à la création ; la liste ne recalcule rien — le web le fait,
 * pour que « Actif » ne se dise jamais d'un lien qui refuserait.
 */
export function decodeAffiliateToken(raw: unknown, now: Date): AffiliateToken | null {
  const parsed = WireToken.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const expiresAt = textOrNull(wire.expiresAt);
  const maxUses = limitOf(wire.maxUses);
  const currentUses = countOf(wire.currentUses);
  const exhausted = maxUses !== null && currentUses >= maxUses;
  return {
    id: wire.id,
    token: wire.token,
    name: wire.name.trim() === '' ? wire.token : wire.name.trim(),
    maxUses,
    currentUses,
    referrals: countOf(wire._count?.affiliations),
    isActive: wire.isActive !== false && !expired(expiresAt, now) && !exhausted,
    expiresAt,
    createdAt: wire.createdAt,
  };
}

const REFERRAL_STATUSES: readonly ReferralStatus[] = ['pending', 'completed', 'expired'];

/** Le nom du filleul : le plus humain d'abord, le pseudo en dernier recours — la loi de `inviterName`. */
export function decodeReferral(raw: unknown): Referral | null {
  const parsed = WireReferral.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const user = wire.referredUser ?? null;
  const username = user === null ? null : textOrNull(user.username);
  const full = user === null ? '' : [user.firstName ?? '', user.lastName ?? ''].map((part) => part.trim()).filter((part) => part !== '').join(' ');
  const name = textOrNull(user?.displayName) ?? (full !== '' ? full : username === null ? null : `@${username}`);
  if (name === null) return null;
  return {
    id: wire.id,
    name,
    username,
    status: REFERRAL_STATUSES.find((status) => status === wire.status) ?? 'pending',
    createdAt: textOrNull(wire.createdAt),
  };
}

export function decodeAffiliateStats(raw: unknown): AffiliateStats | null {
  const parsed = WireStats.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    totalTokens: wire.tokens?.length ?? 0,
    totalReferrals: countOf(wire.totalReferrals),
    completedReferrals: countOf(wire.completedReferrals),
    pendingReferrals: countOf(wire.pendingReferrals),
    referrals: (wire.referrals ?? []).flatMap((row) => {
      const referral = decodeReferral(row);
      return referral === null ? [] : [referral];
    }),
  };
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });
const illegible = (): ApiResult<never> => ({ ok: false, status: 0, error: 'Lien de parrainage illisible' });

export async function loadAffiliateTokens(
  params: AffiliateTokensDeps & { readonly offset: number; readonly now: Date; readonly signal?: AbortSignal },
): Promise<ApiResult<AffiliateTokensPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureAffiliateTokensPage } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureAffiliateTokensPage(params.offset) };
  }
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(AFFILIATE_TOKENS_PAGE_SIZE) });
  const result = await params.transport.request<unknown>({ method: 'GET', path: `${affiliateEndpoints.tokens}?${query.toString()}`, ...withSignal(params.signal) });
  if (!result.ok) return result;
  const rows: readonly unknown[] = Array.isArray(result.data) ? result.data : [];
  const tokens = rows.flatMap((raw) => {
    const token = decodeAffiliateToken(raw, params.now);
    return token === null ? [] : [token];
  });
  return { ok: true, data: { tokens, nextOffset: result.pagination?.hasMore === true ? params.offset + rows.length : null } };
}

export async function loadAffiliateStats(params: AffiliateTokensDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<AffiliateStats>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureAffiliateStats } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureAffiliateStats() };
  }
  const result = await params.transport.request<unknown>({ method: 'GET', path: affiliateEndpoints.stats, ...withSignal(params.signal) });
  if (!result.ok) return result;
  const stats = decodeAffiliateStats(result.data);
  return stats === null ? illegible() : { ok: true, data: stats };
}

export function affiliateTokensQueryOptions(deps: AffiliateTokensDeps) {
  return {
    queryKey: AFFILIATE_TOKENS_QUERY_KEY,
    staleTime: AFFILIATE_STALE_TIME,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: { readonly pageParam: number; readonly signal?: AbortSignal }) =>
      unwrap(await loadAffiliateTokens({ ...deps, offset: pageParam, now: new Date(), ...withSignal(signal) })),
    getNextPageParam: (page: AffiliateTokensPage) => page.nextOffset ?? undefined,
  };
}

export function affiliateStatsQueryOptions(deps: AffiliateTokensDeps) {
  return {
    queryKey: AFFILIATE_STATS_QUERY_KEY,
    staleTime: AFFILIATE_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadAffiliateStats({ ...deps, ...withSignal(signal) })),
  };
}

export type AffiliateTokenDraft = { readonly name: string; readonly limitUses: boolean; readonly maxUses: string };

export const emptyAffiliateTokenDraft = (): AffiliateTokenDraft => ({ name: '', limitUses: false, maxUses: '' });

export type CreateAffiliateTokenBody = { readonly name: string; readonly maxUses?: number };
export type AffiliateDraftField = 'name' | 'maxUses';

export type AffiliateDraftValidation =
  | { readonly ok: true; readonly body: CreateAffiliateTokenBody }
  | { readonly ok: false; readonly field: AffiliateDraftField };

export function validateAffiliateTokenDraft(draft: AffiliateTokenDraft): AffiliateDraftValidation {
  const name = draft.name.trim();
  if (name === '' || name.length > AFFILIATE_NAME_MAX) return { ok: false, field: 'name' };
  if (!draft.limitUses) return { ok: true, body: { name } };
  const maxUses = Number(draft.maxUses.trim());
  if (draft.maxUses.trim() === '' || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > AFFILIATE_MAX_USES_CEILING) return { ok: false, field: 'maxUses' };
  return { ok: true, body: { name, maxUses } };
}

export async function createAffiliateToken(deps: AffiliateTokensDeps, body: CreateAffiliateTokenBody, now: Date): Promise<ApiResult<AffiliateToken>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureCreateAffiliateToken } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureCreateAffiliateToken(body, now) };
  }
  const result = await deps.transport.request<unknown>({ method: 'POST', path: affiliateEndpoints.tokens, body });
  if (!result.ok) return result;
  const token = decodeAffiliateToken(result.data, now);
  return token === null ? illegible() : { ok: true, data: token };
}

export async function deleteAffiliateToken(deps: AffiliateTokensDeps, id: string): Promise<ApiResult<{ readonly id: string }>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { id } };
  const result = await deps.transport.request<unknown>({ method: 'DELETE', path: affiliateEndpoints.tokensById(id) });
  return result.ok ? { ok: true, data: { id } } : result;
}

/** L'adresse de parrainage — la route d'inscription du web (`signupAffiliate`, `/signup/affiliate/$token`). */
export const affiliateLinkUrl = (origin: string, token: string): string => `${origin}/signup/affiliate/${encodeURIComponent(token)}`;
