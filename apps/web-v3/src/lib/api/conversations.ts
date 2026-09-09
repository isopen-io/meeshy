import type { QueryClient } from '@tanstack/react-query';

import { unwrap } from './client';
import type { DataSource } from './config';
import { decodeConversation, decodeConversations } from './decode';
import { CONVERSATIONS } from './fixtures';
import type { ApiResult, HttpTransport } from './http';
import type { Conversation } from './types';

/**
 * LE PORT DE LA LISTE ET D'UNE CONVERSATION (#5650, F2) — motif EXISTANT
 * `loadEngagementProgress` (`engagement.ts:56-66`) : `source` résolue ICI,
 * jamais dans le hook ni dans l'écran — les fixtures sont servies par le
 * MÊME chemin (critère b de l'issue).
 *
 * `GET /api/v1/conversations` (`services/gateway/src/routes/conversations/
 * core-list.ts:62-136`, `optionalAuth`) — SANS paramètre : page 1 par
 * défaut (30 conversations, limite serveur ; 9 sur le compte cible), la
 * pagination est une issue compagnon (`lentille.md` écart 10, Q4).
 *
 * `GET /api/v1/conversations/:id` (`core-detail.ts:244-358`, `optionalAuth`) —
 * 404 `'Conversation not found'` (SANS code, `code` reste `undefined`), 403
 * `CONVERSATION_ACCESS_DENIED`.
 */
export const CONVERSATIONS_QUERY_KEY = ['conversations'] as const;
export const conversationQueryKey = (id: string) => ['conversations', id] as const;

export type ConversationsDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

export async function loadConversations(
  params: ConversationsDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly Conversation[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: CONVERSATIONS };
  return params.transport.request<readonly Conversation[]>({
    method: 'GET',
    path: '/api/v1/conversations',
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
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

/** FABRIQUE (F3) — `{ queryKey, queryFn, select }`, exerçable par
 * `QueryClient.fetchQuery` SANS DOM (motif `auth-screens.test.tsx`). */
export function conversationsQuery(deps: ConversationsDeps) {
  return {
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadConversations({ ...deps, ...(signal !== undefined ? { signal } : {}) })),
    select: decodeConversations,
  };
}

/**
 * `conversationQuery` — pose `initialData` depuis la liste EN CACHE
 * (`queryClient.getQueryData(CONVERSATIONS_QUERY_KEY)?.find(...)`) et
 * `initialDataUpdatedAt` depuis l'état de cette même requête : la case du
 * fil se peint depuis la liste, sans requête si la liste est FRAÎCHE
 * (TanStack respecte `staleTime` sur `initialDataUpdatedAt`). `queryClient`
 * est OPTIONNEL : la fabrique reste appelable sans lui (témoin, ou un appelant
 * qui n'a pas encore de liste en cache), simplement sans ce raccourci.
 */
/**
 * LA MUTATION DE LISTE (#5813, étape 0 — extrait de
 * `conversation-actions.ts:50-58`, AUCUN changement de règle) — le SITE
 * UNIQUE qui patch UNE conversation du cache `CONVERSATIONS_QUERY_KEY` ;
 * les autres restent `toBe`-identiques (`list.map` ne recrée pas les lignes
 * non touchées). Réutilisé par `send/perform-send.ts` (« la liste suit
 * l'envoi », § 3.1/3.5 de la spécification #5813).
 */
export function patchConversation(
  queryClient: QueryClient,
  conversationId: string,
  updater: (conversation: Conversation) => Conversation,
): void {
  queryClient.setQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY, (list) =>
    list === undefined ? list : list.map((c) => (c.id === conversationId ? updater(c) : c)),
  );
}

export function conversationQuery(deps: ConversationsDeps, id: string, init?: { readonly queryClient?: QueryClient }) {
  const cached = init?.queryClient?.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY);
  const found = cached?.find((c) => c.id === id);
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
