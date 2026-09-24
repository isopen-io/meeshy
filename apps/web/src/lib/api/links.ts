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
 * - `PATCH /api/v1/links/:linkId` — la seule écriture canonique
 *   (`management.ts`) : `{ isActive }` pour (dés)activer — désactiver révoque
 *   aussi les invités déjà entrés — et les champs changés de la page du
 *   créateur (#7797).
 * - `DELETE /api/v1/links/:linkId` — « Supprimer » (#7797). La passerelle ne
 *   fait aujourd'hui que FERMER la ligne (`admin.ts`, #6411).
 * - `POST /api/v1/links` — la création (`creation.ts`), qui sert aussi la
 *   feuille de partage d'un fil (`components/share-link-sheet.tsx`).
 *
 * **Un lien d'un autre compte ne se sert jamais.** La liste est bornée par la
 * passerelle au créateur, et le détail ne se lit QUE dans cette liste : aucune
 * lecture par identifiant public (`GET /links/:identifier` rend la conversation,
 * ses participants et ses messages) n'est faite ici.
 *
 * **Un lien décodé est une PROJECTION.** Le cache de requêtes est persisté
 * (`query-client.ts`) : les onze clés du socle, le message d'invitation et la
 * POLITIQUE du lien (`?expand=policy`, #7797 — ce que la page du créateur
 * montre et modifie) y entrent. Ce sont les liens DU LECTEUR, bornés par la
 * passerelle à `createdBy`. Le créateur, la conversation, les plages IP et les
 * pays que la charge porte à côté ne passent pas.
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

/**
 * **LA POLITIQUE D'UN LIEN** (#7797) — ce qu'il exige et concède, telle que
 * `GET /links?expand=policy` la sert. `allowedLanguages` VIDE signifie
 * « toutes ». `maxConcurrentUsers: null` : sans limite.
 */
export type ShareLinkPolicy = {
  readonly maxConcurrentUsers: number | null;
  readonly requireAccount: boolean;
  readonly requireNickname: boolean;
  readonly requireEmail: boolean;
  readonly requireBirthday: boolean;
  readonly allowAnonymousMessages: boolean;
  readonly allowAnonymousImages: boolean;
  readonly allowAnonymousFiles: boolean;
  readonly allowViewHistory: boolean;
  readonly allowedLanguages: readonly string[];
};

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
  /** Le message d'invitation (`description`), affiché aux invités. */
  readonly description: string | null;
  /** `null` : la ligne a été lue sans `?expand=policy` (cache d'avant #7797). */
  readonly policy: ShareLinkPolicy | null;
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
const optionalFlag = z.optional(z.nullable(z.boolean()));

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
  description: optionalText,
  maxConcurrentUsers: optionalNumber,
  requireAccount: optionalFlag,
  requireNickname: optionalFlag,
  requireEmail: optionalFlag,
  requireBirthday: optionalFlag,
  allowAnonymousMessages: optionalFlag,
  allowAnonymousImages: optionalFlag,
  allowAnonymousFiles: optionalFlag,
  allowViewHistory: optionalFlag,
  allowedLanguages: z.optional(z.nullable(z.array(z.string()))),
});

type WireLinkRow = z.infer<typeof WireLink>;

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

/** La politique n'existe que si la charge la PORTE : `requireAccount` est
 * toujours servi par `?expand=policy`. Sans lui, rien ne s'invente. */
function policyOf(wire: WireLinkRow): ShareLinkPolicy | null {
  if (typeof wire.requireAccount !== 'boolean') return null;
  return {
    maxConcurrentUsers: limitOf(wire.maxConcurrentUsers),
    requireAccount: wire.requireAccount,
    requireNickname: wire.requireNickname === true,
    requireEmail: wire.requireEmail === true,
    requireBirthday: wire.requireBirthday === true,
    allowAnonymousMessages: wire.allowAnonymousMessages === true,
    allowAnonymousImages: wire.allowAnonymousImages === true,
    allowAnonymousFiles: wire.allowAnonymousFiles === true,
    allowViewHistory: wire.allowViewHistory === true,
    allowedLanguages: (wire.allowedLanguages ?? []).map((code) => code.trim().toLowerCase()).filter((code) => code !== ''),
  };
}

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
    description: textOrNull(wire.description),
    policy: policyOf(wire),
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
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(SHARE_LINKS_PAGE_SIZE), expand: 'policy' });
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

/**
 * **CINQ MINUTES DE FRAÎCHEUR** (#6974) — mes liens de partage n'ont qu'un
 * auteur, et `link-actions.ts` écrit le cache à chacun de ses gestes : `:70`
 * la bascule active/inactive (avec son retour arrière `:74`), `:119` un lien
 * neuf en tête de liste. Deux écrans OBSERVENT la même entrée
 * (`routes/share-links.tsx:51` et `routes/share-link.tsx:57`, la fiche lisant
 * la liste plutôt qu'une seconde requête) : sans fenêtre, passer de la liste à
 * une fiche et revenir payait un aller-retour par transition passé les 30 s du
 * défaut (`query-client.ts:234`).
 *
 * **Ce que la fenêtre coûte, dit à voix haute** : aucun événement socket ne
 * porte `['share-links']` (vérifié sur `socket.ts`), et la seule valeur qu'un
 * TIERS fait bouger est le compteur d'usages — un invité qui consomme le lien
 * l'incrémente côté passerelle, sans rien émettre. `usageCount` et le
 * `summary` de la première page peuvent donc afficher jusqu'à cinq minutes de
 * retard. C'est un compteur d'observation, jamais une garde : la limite
 * d'usages est appliquée par la passerelle, pas par ce qui est peint ici.
 */
export const SHARE_LINKS_STALE_TIME = 5 * 60_000;

export function shareLinksQueryOptions(deps: LinksDeps) {
  return {
    queryKey: SHARE_LINKS_QUERY_KEY,
    staleTime: SHARE_LINKS_STALE_TIME,
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

/**
 * **CE QUE LA PAGE DU CRÉATEUR MODIFIE** (#7797) — un sous-ensemble de
 * `updateLinkSchema` (gateway, `routes/links/types.ts`), et SEULEMENT les
 * champs changés : un corps qui renverrait tout écraserait une modification
 * faite ailleurs entre la lecture et l'envoi.
 */
export type ShareLinkPatch = {
  readonly name?: string;
  readonly description?: string;
  readonly expiresAt?: string | null;
  readonly maxUses?: number | null;
  readonly maxConcurrentUsers?: number | null;
  readonly requireAccount?: boolean;
  readonly requireNickname?: boolean;
  readonly requireEmail?: boolean;
  readonly requireBirthday?: boolean;
  readonly allowAnonymousMessages?: boolean;
  readonly allowAnonymousImages?: boolean;
  readonly allowAnonymousFiles?: boolean;
  readonly allowViewHistory?: boolean;
  readonly allowedLanguages?: readonly string[];
};

export async function updateShareLink(deps: LinksDeps, linkId: string, patch: ShareLinkPatch): Promise<ApiResult<{ readonly linkId: string }>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureUpdateShareLink } = await import('./fixtures-links');
    return fixtureUpdateShareLink(linkId, patch);
  }
  const result = await deps.transport.request<unknown>({ method: 'PATCH', path: `/api/v1/links/${encodeURIComponent(linkId)}`, body: patch });
  return result.ok ? { ok: true, data: { linkId } } : result;
}

export async function deleteShareLink(deps: LinksDeps, linkId: string): Promise<ApiResult<{ readonly linkId: string }>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureDeleteShareLink } = await import('./fixtures-links');
    return fixtureDeleteShareLink(linkId);
  }
  const result = await deps.transport.request<unknown>({ method: 'DELETE', path: `/api/v1/links/${encodeURIComponent(linkId)}` });
  return result.ok ? { ok: true, data: { linkId } } : result;
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

export const EXPIRATION_AT: Readonly<Record<ShareLinkExpiration, (now: Date) => Date | null>> = {
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

export { shareLinkUrl } from '../links/web-origin';
