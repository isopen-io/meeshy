import { unwrap } from './client';
import type { ConversationsDeps } from './conversations';
import { decodeMessages } from './decode';
import { hasOlderMessagesOf, messagesOf } from './fixtures';
import type { ApiResult, HttpTransport } from './http';
import type { Message } from './types';

/**
 * LE PORT DU FIL (#5650, F2) — `GET /api/v1/conversations/:id/messages`
 * (`services/gateway/src/routes/conversations/messages-list.ts:91-201`,
 * `optionalAuth`), `?limit=50` (le Salon Rivière porte 40 messages,
 * `targets/seed.md`) — la clé de requête ne porte PAS `limit` (une seule
 * page, Q4).
 *
 * ORDRE : la passerelle sert `createdAt DESC` (vue par défaut CHRONOLOGIE,
 * `messages-list-views.ts:101-107`) ; ce port RENVERSE en ASCENDANT — l'ordre
 * des fixtures (`fixtures.ts:80-96`) et de `place()` (`grouping.ts`).
 *
 * `hasOlder` = `cursorPagination.hasMore` (« une page plus ancienne existe » ;
 * `messages-list.ts:699-710`).
 */
export type MessagesPage = {
  readonly messages: readonly Message[];
  readonly hasOlder: boolean;
};

export const messagesQueryKey = (id: string) => ['conversations', id, 'messages'] as const;

const MESSAGES_LIMIT = 50;

export async function loadMessages(
  params: ConversationsDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<MessagesPage>> {
  if (params.source === 'fixtures') {
    return {
      ok: true,
      data: { messages: messagesOf(params.conversationId), hasOlder: hasOlderMessagesOf(params.conversationId) },
    };
  }
  const result = await params.transport.request<readonly Message[]>({
    method: 'GET',
    path: `/api/v1/conversations/${params.conversationId}/messages?limit=${MESSAGES_LIMIT}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      messages: [...result.data].reverse(),
      hasOlder: result.cursorPagination?.hasMore === true,
    },
  };
}

/**
 * `decodeMessagesPage` — FONCTION DE MODULE, jamais une lambda écrite en
 * ligne dans la fabrique (#5650, F1/F3, revue-correction). `useBaseQuery`
 * rappelle `observer.getOptimisticResult(options)` à CHAQUE rendu, et
 * `QueryObserver#createResult` ne réutilise le résultat mémorisé que si
 * `options.select === this.#selectFn` : une lambda neuve à chaque rendu
 * re-décode toute la page, et le partage structurel ne rattrape rien —
 * `replaceEqualDeep` compare les `Date` par IDENTITÉ, et décoder une chaîne
 * ISO en fabrique une nouvelle à chaque passage. `threadData.messages`
 * changeait alors d'identité à chaque rendu, ce qui défaisait `useMemo`,
 * `place()` et toute la mémoïsation du fil virtualisé — à 60 images par
 * seconde de défilement. Témoin : `messages.test.ts` § « identité du
 * résultat entre deux rendus (source gateway) ».
 */
function decodeMessagesPage(page: MessagesPage): MessagesPage {
  return { ...page, messages: decodeMessages(page.messages) };
}

/** FABRIQUE (F3) — la même forme que `conversationQuery`. */
export function messagesQuery(deps: ConversationsDeps, conversationId: string) {
  return {
    queryKey: messagesQueryKey(conversationId),
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadMessages({ ...deps, conversationId, ...(signal !== undefined ? { signal } : {}) })),
    select: decodeMessagesPage,
  };
}

export type { HttpTransport };
