import * as z from 'zod/mini';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES COMMUNAUTÉS** (#6364) — miroir `CommunityService` (iOS,
 * `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift`).
 *
 * - `GET /api/v1/communities?offset=&limit=&search=` — celles dont le lecteur
 *   est créateur ou membre (`services/gateway/src/routes/communities/core.ts`),
 *   pagination à l'OFFSET, recherche serveur à partir de deux caractères (le
 *   schéma de la route refuse en deçà : elle ne part donc pas).
 * - `GET /api/v1/communities/:id` — par id OU identifiant ; 403 sur une
 *   communauté privée dont le lecteur n'est pas membre, 404 sinon.
 * - `GET /api/v1/communities/:id/conversations` — celles dont le lecteur est
 *   participant, par page.
 * - `POST /api/v1/communities` — le créateur devient administrateur ; 201.
 *
 * **Une communauté décodée est une PROJECTION.** La route de liste charge
 * `members[].user.isOnline` et le créateur ; la route de conversations charge
 * les participants et leur ligne entière. Le cache de requêtes est persisté
 * (`query-client.ts`) : rien de cela n'y entre. Seuls les champs peints
 * passent — la présence d'autrui n'est JAMAIS servie hors amitié acceptée
 * (`resolvePresenceVisibility`), et un cache n'est pas une exception.
 *
 * **La frontière est validée par `zod/mini` dans les deux sens** (motif
 * `profile.ts`) : à la sortie, un brouillon hors des bornes de
 * `createCommunityRequestSchema` (`packages/shared/types/api-schemas/
 * community.ts`) ne part pas et nomme son champ.
 */

export const COMMUNITIES_QUERY_PREFIX = ['communities'] as const;
export const COMMUNITIES_PAGE_SIZE = 20;
export const SEARCH_MIN_LENGTH = 2;

export const communitiesQueryKey = (search: string) => ['communities', 'list', searchTermOf(search)] as const;
export const communityQueryKey = (communityId: string) => ['communities', 'detail', communityId] as const;
export const communityConversationsQueryKey = (communityId: string) => ['communities', 'conversations', communityId] as const;

export type CommunitiesDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type CommunitySummary = {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly description: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly isPrivate: boolean;
  readonly createdBy: string | null;
  readonly memberCount: number;
  readonly conversationCount: number;
};

export type CommunityConversation = {
  readonly id: string;
  readonly identifier: string | null;
  readonly title: string | null;
  readonly type: string | null;
  readonly avatar: string | null;
  readonly memberCount: number;
  readonly lastMessageAt: string | null;
};

export type CommunityPage = { readonly communities: readonly CommunitySummary[]; readonly nextOffset: number | null };
export type CommunityConversationPage = { readonly conversations: readonly CommunityConversation[]; readonly nextOffset: number | null };

export type CommunityDraft = { readonly name: string; readonly identifier: string; readonly description: string; readonly isPrivate: boolean };
export type CreateCommunityBody = { readonly name: string; readonly identifier?: string; readonly description?: string; readonly isPrivate: boolean };
export type DraftValidation = { readonly ok: true; readonly body: CreateCommunityBody } | { readonly ok: false; readonly field: keyof CommunityDraft };

/** La recherche qui PART — rognée, et vide sous deux caractères. */
export function searchTermOf(search: string): string {
  const term = search.trim();
  return term.length >= SEARCH_MIN_LENGTH ? term : '';
}

const optionalText = z.optional(z.nullable(z.string()));
const counter = z.optional(z.nullable(z.number()));

const WireCommunity = z.object({
  id: z.string().check(z.minLength(1)),
  identifier: z.optional(z.string()),
  name: z.string().check(z.refine((value) => value.trim().length > 0)),
  description: optionalText,
  avatar: optionalText,
  banner: optionalText,
  isPrivate: z.optional(z.boolean()),
  createdBy: optionalText,
  memberCount: counter,
  conversationCount: counter,
  _count: z.optional(z.object({ members: counter, Conversation: counter })),
});

const WireConversation = z.object({
  id: z.string().check(z.minLength(1)),
  identifier: optionalText,
  title: optionalText,
  type: optionalText,
  avatar: optionalText,
  memberCount: counter,
  lastMessageAt: optionalText,
  _count: z.optional(z.object({ participants: counter })),
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

const countOf = (...values: ReadonlyArray<number | null | undefined>): number => {
  const found = values.find((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return found === undefined || found === null ? 0 : Math.floor(found);
};

export function decodeCommunity(raw: unknown): CommunitySummary | null {
  const parsed = WireCommunity.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    id: wire.id,
    identifier: textOrNull(wire.identifier) ?? wire.id,
    name: wire.name,
    description: textOrNull(wire.description),
    avatar: textOrNull(wire.avatar),
    banner: textOrNull(wire.banner),
    isPrivate: wire.isPrivate ?? true,
    createdBy: textOrNull(wire.createdBy),
    memberCount: countOf(wire.memberCount, wire._count?.members),
    conversationCount: countOf(wire.conversationCount, wire._count?.Conversation),
  };
}

export function decodeCommunityConversation(raw: unknown): CommunityConversation | null {
  const parsed = WireConversation.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    id: wire.id,
    identifier: textOrNull(wire.identifier),
    title: textOrNull(wire.title),
    type: textOrNull(wire.type),
    avatar: textOrNull(wire.avatar),
    memberCount: countOf(wire.memberCount, wire._count?.participants),
    lastMessageAt: textOrNull(wire.lastMessageAt),
  };
}

const DraftSchema = z.object({
  name: z.string().check(z.refine((value) => value.trim().length > 0), z.refine((value) => value.trim().length <= 100)),
  identifier: z.string().check(z.refine((value) => value.trim() === '' || /^[a-zA-Z0-9_-]{1,50}$/.test(value.trim()))),
  description: z.string().check(z.refine((value) => value.trim().length <= 500)),
  isPrivate: z.boolean(),
});

const DRAFT_FIELDS: readonly (keyof CommunityDraft)[] = ['name', 'identifier', 'description', 'isPrivate'];

export function validateCommunityDraft(draft: CommunityDraft): DraftValidation {
  const parsed = DraftSchema.safeParse(draft);
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.path[0];
    return { ok: false, field: DRAFT_FIELDS.find((field) => field === key) ?? 'name' };
  }
  const identifier = draft.identifier.trim();
  const description = draft.description.trim();
  return {
    ok: true,
    body: {
      name: draft.name.trim(),
      ...(identifier === '' ? {} : { identifier }),
      ...(description === '' ? {} : { description }),
      isPrivate: draft.isPrivate,
    },
  };
}

const WirePagination = z.object({ hasMore: z.optional(z.boolean()) });

const hasMoreOf = (pagination: unknown): boolean => {
  const parsed = WirePagination.safeParse(pagination);
  return parsed.success && parsed.data.hasMore === true;
};

const rowsOf = <T>(data: unknown, decode: (raw: unknown) => T | null): readonly T[] =>
  (Array.isArray(data) ? data : []).flatMap((raw) => {
    const row = decode(raw);
    return row === null ? [] : [row];
  });

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

const pageQuery = (offset: number, search?: string): string => {
  const query = new URLSearchParams({ offset: String(offset), limit: String(COMMUNITIES_PAGE_SIZE) });
  const term = search === undefined ? '' : searchTermOf(search);
  if (term !== '') query.set('search', term);
  return query.toString();
};

export async function loadCommunities(
  params: CommunitiesDeps & { readonly search: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<CommunityPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCommunities } = await import('./fixtures-communities');
    return { ok: true, data: fixtureCommunities(params.search, params.offset) };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/communities?${pageQuery(params.offset, params.search)}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const communities = rowsOf(result.data, decodeCommunity);
  const received = Array.isArray(result.data) ? result.data.length : 0;
  return { ok: true, data: { communities, nextOffset: hasMoreOf(result.pagination) ? params.offset + received : null } };
}

const communityPath = (communityId: string) => `/api/v1/communities/${encodeURIComponent(communityId)}`;

const communityResult = (result: ApiResult<unknown>): ApiResult<CommunitySummary> => {
  if (!result.ok) return result;
  const community = decodeCommunity(result.data);
  return community === null ? { ok: false, status: 0, error: 'Communauté illisible' } : { ok: true, data: community };
};

export async function loadCommunity(
  params: CommunitiesDeps & { readonly communityId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<CommunitySummary>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCommunity } = await import('./fixtures-communities');
    const community = fixtureCommunity(params.communityId);
    return community === null ? { ok: false, status: 404, error: 'Community not found' } : { ok: true, data: community };
  }
  return communityResult(await params.transport.request<unknown>({ method: 'GET', path: communityPath(params.communityId), ...withSignal(params.signal) }));
}

export async function loadCommunityConversations(
  params: CommunitiesDeps & { readonly communityId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<CommunityConversationPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCommunityConversations } = await import('./fixtures-communities');
    return { ok: true, data: fixtureCommunityConversations(params.communityId) };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${communityPath(params.communityId)}/conversations?${pageQuery(params.offset)}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const conversations = rowsOf(result.data, decodeCommunityConversation);
  const received = Array.isArray(result.data) ? result.data.length : 0;
  return { ok: true, data: { conversations, nextOffset: hasMoreOf(result.pagination) ? params.offset + received : null } };
}

export async function createCommunity(deps: CommunitiesDeps, draft: CommunityDraft): Promise<ApiResult<CommunitySummary>> {
  const validated = validateCommunityDraft(draft);
  if (!validated.ok) {
    return { ok: false, status: 0, error: 'Communauté invalide', code: 'INVALID_COMMUNITY_DRAFT', field: validated.field };
  }
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureCreateCommunity } = await import('./fixtures-communities');
    return fixtureCreateCommunity(validated.body);
  }
  return communityResult(await deps.transport.request<unknown>({ method: 'POST', path: '/api/v1/communities', body: validated.body }));
}

type PageContext = { readonly pageParam: number; readonly signal?: AbortSignal };

/**
 * **CINQ MINUTES DE FRAÎCHEUR SUR LES TROIS REQUÊTES** (#6974) — un annuaire
 * de communautés, la fiche de l'une et la liste de ses conversations ne
 * changent pas toutes les trente secondes, et c'est le défaut qui
 * s'appliquait (`query-client.ts:234`). La recherche est DÉBOUNCÉE et chaque
 * terme a sa propre clé (`communitiesQueryKey`) : sans fenêtre, revenir sur un
 * terme déjà tapé re-payait sa page.
 *
 * **Ce que la fenêtre coûte, dit à voix haute** : aucun événement socket ne
 * porte `['communities']` — vérifié, `socket.ts` n'invalide que
 * `['conversations']`, `['notifications']` et `['friends']`. Ici la donnée
 * bouge sous les gestes de TIERS (une communauté créée par quelqu'un d'autre,
 * un compteur de membres, une conversation ajoutée), et rien ne le dit : la
 * fenêtre reste donc au PLANCHER du lot, cinq minutes. Ce qui vient du porteur
 * est déjà couvert sans relecture — `community-actions.ts:64` écrit la fiche,
 * `:66` la met en tête de la liste, `:67` périme les autres termes de
 * recherche sans les refetcher.
 *
 * **La fenêtre du DÉTAIL est neutralisée chez son unique consommateur, et
 * c'est assumé** : `routes/community.tsx:69` repose `staleTime: 0` APRÈS avoir
 * répandu cette fabrique — cache-first par `initialData` (la ligne déjà reçue
 * par la liste), revalidation en fond, justifié par son propre doc-comment et
 * hors périmètre de #6974. La valeur ci-dessous ne gouverne donc, aujourd'hui,
 * que la liste et les conversations ; elle reste posée pour tout consommateur
 * qui LAISSERAIT la fabrique décider.
 */
export const COMMUNITIES_STALE_TIME = 5 * 60_000;

export function communitiesQueryOptions(deps: CommunitiesDeps, search: string) {
  return {
    queryKey: communitiesQueryKey(search),
    staleTime: COMMUNITIES_STALE_TIME,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(await loadCommunities({ ...deps, search, offset: pageParam, ...withSignal(signal) })),
    getNextPageParam: (page: CommunityPage) => page.nextOffset ?? undefined,
  };
}

export function communityQueryOptions(deps: CommunitiesDeps, communityId: string) {
  return {
    queryKey: communityQueryKey(communityId),
    staleTime: COMMUNITIES_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadCommunity({ ...deps, communityId, ...withSignal(signal) })),
  };
}

export function communityConversationsQueryOptions(deps: CommunitiesDeps, communityId: string) {
  return {
    queryKey: communityConversationsQueryKey(communityId),
    staleTime: COMMUNITIES_STALE_TIME,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(await loadCommunityConversations({ ...deps, communityId, offset: pageParam, ...withSignal(signal) })),
    getNextPageParam: (page: CommunityConversationPage) => page.nextOffset ?? undefined,
  };
}
