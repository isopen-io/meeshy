import type { InfiniteData } from '@tanstack/react-query';
import * as z from 'zod/mini';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES LIENS DE PARTAGE** (#5652 bloc D, #6361) — miroir
 * `ShareLinkService` (`packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift`).
 *
 * - `GET /api/v1/links?offset=&limit=&include=summary` — les liens CRÉÉS PAR le
 *   lecteur (`services/gateway/src/routes/links/user.ts` : `where: { createdBy:
 *   userId }`), et sur la première page les agrégats RÉELS dans `meta.summary`
 *   (l'alias `/links/stats` est déprécié, il n'est jamais appelé).
 * - `PATCH /api/v1/links/:linkId { isActive }` — la seule écriture canonique
 *   (`management.ts`) : désactiver révoque aussi les invités déjà entrés.
 * - `POST /api/v1/links` — la création (`creation.ts`), qui sert aussi la
 *   feuille de partage d'un fil (`components/share-link-sheet.tsx`).
 *
 * **Un lien d'un autre compte ne se sert jamais.** La liste est bornée par la
 * passerelle au créateur, et le détail ne se lit QUE dans cette liste : aucune
 * lecture par identifiant public (`GET /links/:identifier` rend la conversation,
 * ses participants et ses messages) n'est faite ici.
 *
 * **Un lien décodé est une PROJECTION.** Le cache de requêtes est persisté
 * (`query-client.ts`) : seules les onze clés du socle y entrent. Le créateur, la
 * conversation et la politique d'accès que `PATCH` rend à côté ne passent pas.
 *
 * **Aucun `identifier` ne part à la création** : `createLinkSchema` (gateway,
 * `routes/links/types.ts`) ne le déclare pas et zod le retire en silence. Le
 * champ « Slug URL » d'iOS n'a donc aucun effet, et n'est pas dessiné (D-63).
 */

export type LinksDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const SHARE_LINKS_QUERY_PREFIX = ['share-links'] as const;
export const SHARE_LINKS_QUERY_KEY = ['share-links', 'mine'] as const;
export const SHARE_LINKS_PAGE_SIZE = 50;
export const MAX_USES_CEILING = 10_000;

export const INACTIVE_REASONS = ['CONVERSATION_CLOSED', 'LINK_EXPIRED', 'REVOKED'] as const;
export type ShareLinkInactiveReason = (typeof INACTIVE_REASONS)[number];

export type MyShareLink = {
  readonly id: string;
  readonly linkId: string;
  readonly identifier: string | null;
  readonly name: string | null;
  readonly isActive: boolean;
  readonly currentUses: number;
  readonly maxUses: number | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly conversationTitle: string | null;
  readonly inactiveReason: ShareLinkInactiveReason | null;
};

export type ShareLinksSummary = { readonly totalLinks: number; readonly activeLinks: number; readonly totalUses: number };

export type ShareLinksPage = {
  readonly links: readonly MyShareLink[];
  readonly summary: ShareLinksSummary | null;
  readonly nextOffset: number | null;
};

export type ShareLinksData = InfiniteData<ShareLinksPage, number>;

export type ShareLinkResult = {
  readonly linkId: string;
  readonly conversationId: string;
  readonly shareLink: {
    readonly id: string;
    readonly linkId: string;
    readonly name: string | null;
    readonly description: string | null;
    readonly expiresAt: string | null;
    readonly isActive: boolean;
  };
};

const optionalText = z.optional(z.nullable(z.string()));
const optionalNumber = z.optional(z.nullable(z.number()));

const WireLink = z.object({
  id: z.string().check(z.minLength(1)),
  linkId: z.string().check(z.minLength(1)),
  identifier: optionalText,
  name: optionalText,
  isActive: z.boolean(),
  currentUses: optionalNumber,
  maxUses: optionalNumber,
  expiresAt: optionalText,
  createdAt: z.string().check(z.refine((value) => !Number.isNaN(Date.parse(value)))),
  conversationTitle: optionalText,
  inactiveReason: optionalText,
});

const WireSummary = z.object({
  summary: z.object({ totalLinks: z.number(), activeLinks: z.number(), totalUses: z.number() }),
});

const WireToggle = z.object({ isActive: z.boolean() });

const WireCreated = z.object({
  linkId: z.string().check(z.minLength(1)),
  conversationId: z.string(),
  shareLink: z.object({
    id: z.string().check(z.minLength(1)),
    linkId: z.string().check(z.minLength(1)),
    name: optionalText,
    description: optionalText,
    expiresAt: optionalText,
    isActive: z.boolean(),
  }),
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

const countOf = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const limitOf = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;

const reasonOf = (isActive: boolean, raw: string | null | undefined): ShareLinkInactiveReason | null =>
  isActive ? null : (INACTIVE_REASONS.find((reason) => reason === raw) ?? 'REVOKED');

export function decodeMyShareLink(raw: unknown): MyShareLink | null {
  const parsed = WireLink.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    id: wire.id,
    linkId: wire.linkId,
    identifier: textOrNull(wire.identifier),
    name: textOrNull(wire.name),
    isActive: wire.isActive,
    currentUses: countOf(wire.currentUses),
    maxUses: limitOf(wire.maxUses),
    expiresAt: textOrNull(wire.expiresAt),
    createdAt: wire.createdAt,
    conversationTitle: textOrNull(wire.conversationTitle),
    inactiveReason: reasonOf(wire.isActive, wire.inactiveReason),
  };
}

export function decodeShareLinksSummary(meta: unknown): ShareLinksSummary | null {
  const parsed = WireSummary.safeParse(meta);
  if (!parsed.success) return null;
  const { totalLinks, activeLinks, totalUses } = parsed.data.summary;
  return { totalLinks: countOf(totalLinks), activeLinks: countOf(activeLinks), totalUses: countOf(totalUses) };
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadMyShareLinks(
  params: LinksDeps & { readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<ShareLinksPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureShareLinksPage } = await import('./fixtures-links');
    return { ok: true, data: fixtureShareLinksPage(params.offset) };
  }
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(SHARE_LINKS_PAGE_SIZE) });
  if (params.offset === 0) query.set('include', 'summary');
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/links?${query.toString()}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const rows: readonly unknown[] = Array.isArray(result.data) ? result.data : [];
  const links = rows.flatMap((raw) => {
    const link = decodeMyShareLink(raw);
    return link === null ? [] : [link];
  });
  return {
    ok: true,
    data: {
      links,
      summary: params.offset === 0 ? decodeShareLinksSummary(result.meta) : null,
      nextOffset: result.pagination?.hasMore === true ? params.offset + rows.length : null,
    },
  };
}

export function shareLinksQueryOptions(deps: LinksDeps) {
  return {
    queryKey: SHARE_LINKS_QUERY_KEY,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: { readonly pageParam: number; readonly signal?: AbortSignal }) =>
      unwrap(await loadMyShareLinks({ ...deps, offset: pageParam, ...withSignal(signal) })),
    getNextPageParam: (page: ShareLinksPage) => page.nextOffset ?? undefined,
  };
}

export async function setShareLinkActive(deps: LinksDeps, linkId: string, isActive: boolean): Promise<ApiResult<{ readonly isActive: boolean }>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureSetShareLinkActive } = await import('./fixtures-links');
    return fixtureSetShareLinkActive(linkId, isActive);
  }
  const result = await deps.transport.request<unknown>({
    method: 'PATCH',
    path: `/api/v1/links/${encodeURIComponent(linkId)}`,
    body: { isActive },
  });
  if (!result.ok) return result;
  const parsed = WireToggle.safeParse(result.data);
  return parsed.success ? { ok: true, data: { isActive: parsed.data.isActive } } : { ok: false, status: 0, error: 'Lien illisible' };
}

export const SHARE_LINK_EXPIRATIONS = ['never', 'h24', 'd7', 'd30', 'm3'] as const;
export type ShareLinkExpiration = (typeof SHARE_LINK_EXPIRATIONS)[number];

export type ShareLinkDraft = {
  readonly conversationId: string | null;
  readonly name: string;
  readonly description: string;
  readonly requireAccount: boolean;
  readonly requireNickname: boolean;
  readonly requireEmail: boolean;
  readonly requireBirthday: boolean;
  readonly allowAnonymousMessages: boolean;
  readonly allowAnonymousImages: boolean;
  readonly allowAnonymousFiles: boolean;
  readonly allowViewHistory: boolean;
  readonly limitUses: boolean;
  readonly maxUses: number;
  readonly expiration: ShareLinkExpiration;
};

export type CreateShareLinkBody = {
  readonly conversationId: string;
  readonly name?: string;
  readonly description?: string;
  readonly maxUses?: number;
  readonly expiresAt?: string;
  readonly allowAnonymousMessages: boolean;
  readonly allowAnonymousFiles: boolean;
  readonly allowAnonymousImages: boolean;
  readonly allowViewHistory: boolean;
  readonly requireAccount: boolean;
  readonly requireNickname: boolean;
  readonly requireEmail: boolean;
  readonly requireBirthday: boolean;
};

export type ShareLinkDraftField = 'conversationId' | 'maxUses';

export type ShareLinkDraftValidation =
  | { readonly ok: true; readonly body: CreateShareLinkBody }
  | { readonly ok: false; readonly field: ShareLinkDraftField };

/** Les défauts de `CreateShareLinkView` — ceux, aussi, de la feuille de partage d'un fil. */
export const defaultShareLinkDraft = (conversationId: string | null): ShareLinkDraft => ({
  conversationId,
  name: '',
  description: '',
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowAnonymousMessages: true,
  allowAnonymousImages: true,
  allowAnonymousFiles: false,
  allowViewHistory: false,
  limitUses: false,
  maxUses: 100,
  expiration: 'never',
});

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const EXPIRATION_AT: Readonly<Record<ShareLinkExpiration, (now: Date) => Date | null>> = {
  never: () => null,
  h24: (now) => new Date(now.getTime() + 24 * HOUR_MS),
  d7: (now) => new Date(now.getTime() + 7 * DAY_MS),
  d30: (now) => new Date(now.getTime() + 30 * DAY_MS),
  m3: (now) =>
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()),
    ),
};

const MaxUses = z.number().check(z.refine((value) => Number.isInteger(value) && value >= 1 && value <= MAX_USES_CEILING));

export function validateShareLinkDraft(draft: ShareLinkDraft, now: Date): ShareLinkDraftValidation {
  const conversationId = draft.conversationId?.trim() ?? '';
  if (conversationId === '') return { ok: false, field: 'conversationId' };
  if (draft.limitUses && !MaxUses.safeParse(draft.maxUses).success) return { ok: false, field: 'maxUses' };
  const name = draft.name.trim();
  const description = draft.description.trim();
  const expiresAt = EXPIRATION_AT[draft.expiration](now);
  return {
    ok: true,
    body: {
      conversationId,
      ...(name === '' ? {} : { name }),
      ...(description === '' ? {} : { description }),
      ...(draft.limitUses ? { maxUses: draft.maxUses } : {}),
      ...(expiresAt === null ? {} : { expiresAt: expiresAt.toISOString() }),
      allowAnonymousMessages: draft.allowAnonymousMessages,
      allowAnonymousFiles: draft.allowAnonymousFiles,
      allowAnonymousImages: draft.allowAnonymousImages,
      allowViewHistory: draft.allowViewHistory,
      requireAccount: draft.requireAccount,
      requireNickname: draft.requireNickname && !draft.requireAccount,
      requireEmail: draft.requireEmail && !draft.requireAccount,
      requireBirthday: draft.requireBirthday && !draft.requireAccount,
    },
  };
}

function decodeCreated(raw: unknown): ShareLinkResult | null {
  const parsed = WireCreated.safeParse(raw);
  if (!parsed.success) return null;
  const { linkId, conversationId, shareLink } = parsed.data;
  return {
    linkId,
    conversationId,
    shareLink: {
      id: shareLink.id,
      linkId: shareLink.linkId,
      name: textOrNull(shareLink.name),
      description: textOrNull(shareLink.description),
      expiresAt: textOrNull(shareLink.expiresAt),
      isActive: shareLink.isActive,
    },
  };
}

export async function createShareLinkFromDraft(deps: LinksDeps, draft: ShareLinkDraft, now: Date): Promise<ApiResult<ShareLinkResult>> {
  const verdict = validateShareLinkDraft(draft, now);
  if (!verdict.ok) return { ok: false, status: 0, error: 'Lien invalide', code: 'INVALID_SHARE_LINK_DRAFT', field: verdict.field };
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureCreateShareLink } = await import('./fixtures-links');
    return fixtureCreateShareLink(verdict.body, now);
  }
  const result = await deps.transport.request<unknown>({ method: 'POST', path: '/api/v1/links', body: verdict.body });
  if (!result.ok) return result;
  const created = decodeCreated(result.data);
  return created === null ? { ok: false, status: 0, error: 'Lien illisible' } : { ok: true, data: created };
}

/**
 * LA FEUILLE DE PARTAGE D'UN FIL (§ 3.3) — un geste, un lien aux défauts
 * d'iOS. `allowViewHistory: false` part EXPLICITE : le repli `?? false` n'est
 * qu'au gestionnaire, jamais un défaut déclaré côté schéma.
 */
export function createShareLink(deps: LinksDeps, conversationId: string): Promise<ApiResult<ShareLinkResult>> {
  return createShareLinkFromDraft(deps, defaultShareLinkDraft(conversationId), new Date());
}

/** L'URL À PARTAGER (§ 3.3) — `${origin}/chat/${slug}`, miroir `MyShareLink.joinUrl`. */
export function shareLinkUrl(origin: string, linkId: string): string {
  return `${origin}/chat/${linkId}`;
}
