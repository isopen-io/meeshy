import type { QueryClient } from '@tanstack/react-query';

import { unwrap } from './client';
import type { ConversationsInfiniteData, ConversationsPage, ConversationsPageParam } from './conversations-pages';
import { flattenConversationPages, nextConversationsCursor } from './conversations-pages';
import type { DataSource } from './config';
import { decodeConversation } from './decode';
import { CONVERSATIONS } from './fixtures';
import { pageOfConversations } from './fixtures-pagination';
import type { ApiResult, ApiSuccess, HttpTransport } from './http';
import type { Conversation } from './types';

/**
 * LE PORT DE LA LISTE ET D'UNE CONVERSATION (#5650, F2 ; paginé #6195) —
 * `source` résolue ICI, jamais dans le hook ni dans l'écran — les fixtures
 * sont servies par le MÊME chemin (critère b de l'issue).
 *
 * `GET /api/v1/conversations?limit=30[&before=<id>]`
 * (`services/gateway/src/routes/conversations/core-list.ts:62-136`,
 * `optionalAuth`) — voir `loadConversationsPage`.
 *
 * `GET /api/v1/conversations/:id` (`core-detail.ts:244-358`, `optionalAuth`) —
 * 404 `'Conversation not found'` (SANS code, `code` reste `undefined`), 403
 * `CONVERSATION_ACCESS_DENIED`.
 */
export const CONVERSATIONS_QUERY_KEY = ['conversations'] as const;
export const conversationQueryKey = (id: string) => ['conversations', id] as const;

/** Le défaut serveur (`validatePagination`, `core-list.ts:151`) — c'est aussi
 * la seule limite que ce client demande jamais. */
export const PAGE_SIZE = 30;

export type ConversationsDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

/**
 * La PRÉCÉDENCE de `hasMore` — miroir `ConversationService.swift:153-156` :
 * `cursorPagination.hasMore` d'abord (elle seule reste juste sur une page 1
 * de EXACTEMENT `PAGE_SIZE`, où `pagination.hasMore` peut diverger — § 3 de
 * la spécification #6195), puis `pagination.hasMore`, puis « la page est
 * pleine » en tout dernier repli.
 */
function hasMoreOf(result: ApiSuccess<readonly Conversation[]>, pageSize: number): boolean {
  if (result.cursorPagination !== undefined) return result.cursorPagination.hasMore;
  if (result.pagination !== undefined) return result.pagination.hasMore;
  return result.data.length === pageSize;
}

/**
 * `loadConversationsPage` — UNE page de la Lentille, `before` transmis tel
 * quel comme paramètre de requête (`ConversationService.swift:140-143`). En
 * fixtures, `pageOfConversations` (`fixtures-pagination.ts`) mime la MÊME
 * loi que la passerelle sur le MÊME corpus (`CONVERSATIONS`, 45 lignes).
 */
export async function loadConversationsPage(
  params: ConversationsDeps & { readonly before?: ConversationsPageParam; readonly signal?: AbortSignal },
): Promise<ApiResult<ConversationsPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    return {
      ok: true,
      data: pageOfConversations(CONVERSATIONS, {
        ...(params.before !== undefined ? { before: params.before } : {}),
        limit: PAGE_SIZE,
      }),
    };
  }
  const query = new URLSearchParams({
    limit: String(PAGE_SIZE),
    ...(params.before !== undefined ? { before: params.before } : {}),
  });
  const result = await params.transport.request<readonly Conversation[]>({
    method: 'GET',
    path: `/api/v1/conversations?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const hasMore = hasMoreOf(result, PAGE_SIZE);
  return {
    ok: true,
    data: {
      conversations: result.data,
      pagination: result.pagination ?? { limit: PAGE_SIZE, offset: 0, total: 0, hasMore },
      cursorPagination: { limit: PAGE_SIZE, hasMore, nextCursor: result.cursorPagination?.nextCursor ?? null },
    },
  };
}

export async function loadConversation(
  params: ConversationsDeps & { readonly id: string; readonly signal?: AbortSignal },
): Promise<ApiResult<Conversation>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const found = CONVERSATIONS.find((c) => c.id === params.id);
    return found === undefined
      ? { ok: false, status: 404, error: 'Conversation not found' }
      : { ok: true, data: found };
  }
  return params.transport.request<Conversation>({
    method: 'GET',
    path: `/api/v1/conversations/${params.id}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

/**
 * `conversationsInfiniteOptions` — spreadable dans `useInfiniteQuery` OU
 * `QueryClient.fetchInfiniteQuery`, SANS `select` : `conversationsQuery`
 * (ci-dessous) en est la seule qui en ajoute un, pour que
 * `refreshConversations` (qui n'a besoin que des PAGES brutes) n'en paie pas
 * le coût. `initialPageParam: undefined` ⇒ la première page ne porte aucun
 * `before` — la MÊME absence que `nextCursor` d'une page épuisée.
 */
export function conversationsInfiniteOptions(deps: ConversationsDeps) {
  return {
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: ConversationsPageParam; readonly signal?: AbortSignal }) =>
      unwrap(
        await loadConversationsPage({
          ...deps,
          ...(pageParam !== undefined ? { before: pageParam } : {}),
          ...(signal !== undefined ? { signal } : {}),
        }),
      ),
    initialPageParam: undefined as ConversationsPageParam,
    getNextPageParam: nextConversationsCursor,
  };
}

/** FABRIQUE (F3) — `{ queryKey, queryFn, select }`, exerçable par
 * `QueryClient.fetchQuery`/`useInfiniteQuery` SANS DOM (motif
 * `auth-screens.test.tsx`). `select` reste une fonction de MODULE, jamais une
 * lambda écrite en ligne — `flattenConversationPages` (`conversations-pages.ts`). */
export function conversationsQuery(deps: ConversationsDeps) {
  return { ...conversationsInfiniteOptions(deps), select: flattenConversationPages };
}

/**
 * `conversationQuery` — pose `initialData` depuis la liste EN CACHE
 * (`findCachedConversation`) et `initialDataUpdatedAt` depuis l'état de cette
 * même requête : la case du fil se peint depuis la liste, sans requête si la
 * liste est FRAÎCHE (TanStack respecte `staleTime` sur `initialDataUpdatedAt`).
 * `queryClient` est OPTIONNEL : la fabrique reste appelable sans lui (témoin,
 * ou un appelant qui n'a pas encore de liste en cache), simplement sans ce
 * raccourci.
 */
/**
 * `findCachedConversation` — parcourt les PAGES du cache de liste ; `undefined`
 * si absente, si le cache est vide, ou si le cache porte encore l'ANCIENNE
 * forme (`readonly Conversation[]`, avant #6195) — jamais une exception : un
 * cache persisté écrit avant ce lot est purgé par `CACHE_SCHEMA`
 * (`query-client.ts`), mais un appelant qui lirait entre-temps ne doit rien
 * casser.
 */
export function findCachedConversation(queryClient: QueryClient, id: string): Conversation | undefined {
  const cache = queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY);
  if (cache === undefined || !Array.isArray(cache.pages)) return undefined;
  for (const page of cache.pages) {
    const found = page.conversations.find((c) => c.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * LA MUTATION DE LISTE (#5813, étape 0 ; paginée #6195) — le SITE UNIQUE qui
 * patch UNE conversation du cache `CONVERSATIONS_QUERY_KEY`, quelle que soit
 * la page où elle vit ; les autres pages et les autres rangées restent
 * `toBe`-identiques. Réutilisé par `send/perform-send.ts` (« la liste suit
 * l'envoi ») et par `realtime-apply.ts` (quatre patchs).
 */
export function patchConversation(
  queryClient: QueryClient,
  conversationId: string,
  updater: (conversation: Conversation) => Conversation,
): void {
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, (data) => {
    if (data === undefined) return data;
    return {
      ...data,
      pages: data.pages.map((page) =>
        page.conversations.some((c) => c.id === conversationId)
          ? { ...page, conversations: page.conversations.map((c) => (c.id === conversationId ? updater(c) : c)) }
          : page,
      ),
    };
  });
}

/**
 * `refreshConversations` — le TIRER : UNE requête, page 1 seule, curseur
 * remis à zéro. `pages: 1` fait REBÂTIR `InfiniteData` depuis `{ pages: [],
 * pageParams: [] }` (`infiniteQueryBehavior.ts:23-25,94-107` — la boucle
 * s'arrête après une itération) : le premier `pageParam` essayé est celui de
 * l'ANCIENNE première page (`undefined`, jamais un `before`), donc c'est bien
 * la page 1 qui revient. Un ÉCHEC laisse `data` INTACT (TanStack ne remplace
 * jamais un résultat par une erreur) — fetch-then-replace, iOS `:1961-1966` —
 * et la promesse REJETTE : c'est `usePullToRefresh` qui la traduit en
 * `completing failed`.
 */
export function refreshConversations(queryClient: QueryClient, deps: ConversationsDeps): Promise<void> {
  return queryClient
    .fetchInfiniteQuery({ ...conversationsInfiniteOptions(deps), pages: 1, staleTime: 0 })
    .then(() => undefined);
}

/**
 * `createDirectConversation` (#5652, bloc D) — `POST /api/v1/conversations`
 * (`services/gateway/src/routes/conversations/core-lifecycle.ts:77-91`,
 * `requiredAuth`), § 3.5 de la spécification. IDEMPOTENT côté serveur : un
 * direct déjà existant entre les deux comptes est RENDU, jamais recréé — ce
 * port n'a donc pas à distinguer les deux issues, les DEUX rendent la même
 * `Conversation`.
 */
export function createDirectConversation(deps: ConversationsDeps, participantId: string): Promise<ApiResult<Conversation>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const found = CONVERSATIONS.find((c) => c.type === 'direct' && c.participants.some((p) => p.userId === participantId));
    if (found !== undefined) return Promise.resolve({ ok: true, data: found });
    return Promise.resolve({ ok: false, status: 501, error: 'Création de direct indisponible en fixtures' });
  }
  return deps.transport.request<Conversation>({
    method: 'POST',
    path: '/api/v1/conversations',
    body: { type: 'direct', participantIds: [participantId] },
  });
}

export function conversationQuery(deps: ConversationsDeps, id: string, init?: { readonly queryClient?: QueryClient }) {
  const found = init?.queryClient === undefined ? undefined : findCachedConversation(init.queryClient, id);
  const dataUpdatedAt = init?.queryClient?.getQueryState(CONVERSATIONS_QUERY_KEY)?.dataUpdatedAt;

  return {
    queryKey: conversationQueryKey(id),
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadConversation({ ...deps, id, ...(signal !== undefined ? { signal } : {}) })),
    select: decodeConversation,
    ...(found !== undefined ? { initialData: found } : {}),
    ...(dataUpdatedAt !== undefined ? { initialDataUpdatedAt: dataUpdatedAt } : {}),
  };
}
