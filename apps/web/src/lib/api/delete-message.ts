import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import * as messagesEndpoints from '@meeshy/shared/api/endpoints/messages';

import { removalBody } from '@/lib/view/content-removal';

import { CONVERSATIONS_QUERY_KEY, findCachedConversation, patchConversation } from './conversations';
import type { ApiResult, HttpRequest } from './http';
import { mediaHubConversationKey } from './media-hub-cache';
import { findCachedThreadMessage, messagesQueryKey, patchThreadMessages } from './messages';
import type { MessagesPage, MessagesPageParam } from './messages-pages';
import type { Conversation, Message } from './types';

/**
 * SUPPRIMER UN OU PLUSIEURS MESSAGES (#10582) — deux gestes, deux routes.
 *
 * POUR TOUS : `DELETE` sur `conversations.byIdMessagesByMessageId`
 * (`services/gateway/src/routes/conversations/messages-advanced-delete.ts`),
 * la route d'iOS. Plusieurs messages BOUCLENT sur cette route unitaire, comme
 * iOS : il n'existe pas de suppression de masse pour tous. La pierre tombale
 * est celle que pose `message:deleted` reçu d'ailleurs (`applyMessageDeleted`,
 * morceau `realtime` chargé à la demande) — rangée, citations, ligne de liste.
 *
 * POUR MOI : `DELETE` sur `messages.byMessageIdDeleteForMe` pour un message,
 * `messages.bulkDeleteForMe` pour plusieurs (`routes/user-deletions.ts`, 100
 * au plus — le plafond de la sélection). La rangée QUITTE le fil et l'écran
 * des médias : le serveur ne la servira plus à ce lecteur.
 *
 * Optimiste dans les deux cas, et un refus ou une coupure REND ce qui n'est
 * pas parti, à sa place, sans écraser ce que le cache a appris pendant le vol.
 * Un échec PARTIEL ne rend que les messages refusés : l'issue les compte.
 *
 * RETIRER (#11150) — la même boucle « pour tous », le MOTIF en corps
 * (`{ reason }`) : c'est ce qui distingue, côté passerelle, le retrait par la
 * modération de la suppression par l'auteur. Sans motif, aucun corps — un
 * auteur supprime comme avant.
 *
 * Hors ligne, la boucle « pour tous » s'arrête au premier échec de réseau :
 * les suivants échoueraient de même, chacun après son délai de garde.
 */
export type MessageDeleteResult = { readonly deleted: number; readonly failed: number; readonly offline: boolean };

type Transport = { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };

type DeleteParams = {
  readonly queryClient: QueryClient;
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly transport: Transport;
};

const NOTHING: MessageDeleteResult = { deleted: 0, failed: 0, offline: false };

type TombstoneSnapshot = {
  readonly id: string;
  readonly row: Message | undefined;
  readonly quotes: ReadonlyMap<string, Message>;
  readonly conversation: Conversation | undefined;
};

type PagedMessages = InfiniteData<MessagesPage, MessagesPageParam>;

const windowsOf = (queryClient: QueryClient, queryKey: QueryKey): readonly (readonly [QueryKey, PagedMessages])[] =>
  queryClient
    .getQueriesData<PagedMessages>({ queryKey })
    .flatMap(([key, data]) => (data === undefined || !Array.isArray(data.pages) ? [] : [[key, data] as const]));

const snapshotOf = (queryClient: QueryClient, conversationId: string, message: Message): TombstoneSnapshot => ({
  id: message.id,
  row: findCachedThreadMessage(queryClient, conversationId, message.id),
  quotes: new Map(
    windowsOf(queryClient, messagesQueryKey(conversationId))
      .flatMap(([, data]) => data.pages)
      .flatMap((page) => page.messages)
      .flatMap((m) => (m.replyTo !== undefined && m.replyTo !== null && m.replyTo.id === message.id ? [[m.id, m.replyTo] as const] : [])),
  ),
  conversation: findCachedConversation(queryClient, conversationId),
});

const wasTombstonedAt = (message: Message | null | undefined, deletedAt: string): boolean =>
  message !== undefined && message !== null && String(message.deletedAt) === deletedAt;

function restoreTombstone(queryClient: QueryClient, conversationId: string, snapshot: TombstoneSnapshot, deletedAt: string): void {
  const { id, row, quotes, conversation } = snapshot;
  patchThreadMessages(queryClient, conversationId, (messages) =>
    messages.map((m) => {
      if (m.id === id) return row !== undefined && (wasTombstonedAt(m, deletedAt) || m.isViewOnce) ? row : m;
      const quoted = quotes.get(m.id);
      return quoted !== undefined && m.replyTo?.id === id && wasTombstonedAt(m.replyTo, deletedAt) ? { ...m, replyTo: quoted } : m;
    }),
  );
  if (conversation?.lastMessage?.id !== id) return;
  patchConversation(queryClient, conversationId, (c) => (c.lastMessage?.id === id && wasTombstonedAt(c.lastMessage, deletedAt) ? conversation : c));
}

export async function performDeleteForEveryone(params: DeleteParams & { readonly now?: Date; readonly reason?: string }): Promise<MessageDeleteResult> {
  const { queryClient, conversationId, messages, transport } = params;
  if (messages.length === 0) return NOTHING;

  const { applyMessageDeleted } = await import('./realtime-message-mutations');
  const now = params.now ?? new Date();
  const deletedAt = now.toISOString();
  const snapshots = messages.map((message) => snapshotOf(queryClient, conversationId, message));
  messages.forEach((message) => applyMessageDeleted(queryClient, { messageId: message.id, conversationId }, now));

  const outcome = await snapshots.reduce<Promise<{ readonly deleted: number; readonly failed: readonly TombstoneSnapshot[]; readonly offline: boolean }>>(
    async (previous, snapshot) => {
      const so = await previous;
      if (so.offline) return { ...so, failed: [...so.failed, snapshot] };
      const result = await transport.request<unknown>({
        method: 'DELETE',
        path: conversationsEndpoints.byIdMessagesByMessageId(conversationId, snapshot.id),
        ...removalBody(params.reason),
      });
      if (result.ok) return { ...so, deleted: so.deleted + 1 };
      return { ...so, failed: [...so.failed, snapshot], offline: result.status === 0 };
    },
    Promise.resolve({ deleted: 0, failed: [], offline: false }),
  );

  outcome.failed.forEach((snapshot) => restoreTombstone(queryClient, conversationId, snapshot, deletedAt));
  return { deleted: outcome.deleted, failed: outcome.failed.length, offline: outcome.offline };
}

type RemovedRow = {
  readonly key: QueryKey;
  readonly pageIndex: number;
  readonly index: number;
  readonly message: Message;
  readonly beforeId: string | null;
  readonly afterId: string | null;
};

function removeRows(queryClient: QueryClient, queryKey: QueryKey, ids: ReadonlySet<string>): readonly RemovedRow[] {
  const removed = windowsOf(queryClient, queryKey).flatMap(([key, data]) =>
    data.pages.flatMap((page, pageIndex) =>
      page.messages.flatMap((message, index) =>
        ids.has(message.id)
          ? [{ key, pageIndex, index, message, beforeId: page.messages[index - 1]?.id ?? null, afterId: page.messages[index + 1]?.id ?? null }]
          : [],
      ),
    ),
  );
  if (removed.length === 0) return removed;
  queryClient.setQueriesData<PagedMessages>({ queryKey }, (data) =>
    data === undefined || !Array.isArray(data.pages)
      ? data
      : { ...data, pages: data.pages.map((page) => ({ ...page, messages: page.messages.filter((m) => !ids.has(m.id)) })) },
  );
  return removed;
}

const insertedAt = (messages: readonly Message[], at: number, message: Message): readonly Message[] => [
  ...messages.slice(0, at),
  message,
  ...messages.slice(at),
];

/**
 * UNE RANGÉE RENDUE RETROUVE SON VOISIN, pas un rang compté : pendant le vol,
 * un message a pu arriver ou une page se charger. Le voisin d'AVANT d'abord
 * (les rangées se rendent dans leur ordre d'origine, il est donc déjà revenu
 * s'il était parti lui aussi), puis celui d'APRÈS, puis le rang d'origine.
 */
function restoreRow(data: PagedMessages, removed: RemovedRow): PagedMessages {
  if (data.pages.some((page) => page.messages.some((m) => m.id === removed.message.id))) return data;
  const pageHolding = (id: string | null): number => (id === null ? -1 : data.pages.findIndex((page) => page.messages.some((m) => m.id === id)));
  const beforePage = pageHolding(removed.beforeId);
  const afterPage = beforePage === -1 ? pageHolding(removed.afterId) : -1;
  const target = beforePage !== -1 ? beforePage : afterPage !== -1 ? afterPage : Math.min(removed.pageIndex, data.pages.length - 1);
  const page = data.pages[target];
  if (page === undefined) return data;
  const at =
    beforePage !== -1
      ? page.messages.findIndex((m) => m.id === removed.beforeId) + 1
      : afterPage !== -1
        ? page.messages.findIndex((m) => m.id === removed.afterId)
        : Math.min(removed.index, page.messages.length);
  return { ...data, pages: data.pages.map((p, index) => (index === target ? { ...p, messages: insertedAt(p.messages, at, removed.message) } : p)) };
}

function restoreRows(queryClient: QueryClient, removed: readonly RemovedRow[]): void {
  removed.forEach((row) => {
    queryClient.setQueryData<PagedMessages>(row.key, (data) => (data === undefined || !Array.isArray(data.pages) ? data : restoreRow(data, row)));
  });
}

const servedCount = (data: unknown): number | undefined => {
  if (typeof data !== 'object' || data === null) return undefined;
  const count = (data as { readonly deletedCount?: unknown }).deletedCount;
  return typeof count === 'number' ? count : undefined;
};

/**
 * CE QU'UN MESSAGE MASQUÉ « POUR MOI » QUITTE — le fil et l'écran des médias de
 * SA conversation. Site unique : le geste local (`performDeleteForMe`) et
 * l'événement reçu d'un autre appareil (`realtime-message-hidden.ts`, #10587)
 * retirent les mêmes rangées. `describedByList` dit si la ligne de liste
 * décrivait l'un d'eux — son remplaçant, seul le serveur le calcule.
 */
export function hideRowsForReader(
  queryClient: QueryClient,
  conversationId: string,
  ids: ReadonlySet<string>,
): { readonly removed: readonly RemovedRow[]; readonly describedByList: boolean } {
  const describedByList = ids.has(findCachedConversation(queryClient, conversationId)?.lastMessage?.id ?? '');
  const removed = [
    ...removeRows(queryClient, messagesQueryKey(conversationId), ids),
    ...removeRows(queryClient, mediaHubConversationKey(conversationId), ids),
  ];
  return { removed, describedByList };
}

export async function performDeleteForMe(params: DeleteParams): Promise<MessageDeleteResult> {
  const { queryClient, conversationId, messages, transport } = params;
  const [only] = messages;
  if (only === undefined) return NOTHING;

  const { removed, describedByList } = hideRowsForReader(queryClient, conversationId, new Set(messages.map((m) => m.id)));

  const result = await transport.request<unknown>(
    messages.length === 1
      ? { method: 'DELETE', path: messagesEndpoints.byMessageIdDeleteForMe(only.id) }
      : { method: 'DELETE', path: messagesEndpoints.bulkDeleteForMe, body: { messageIds: messages.map((m) => m.id) } },
  );

  if (!result.ok) {
    restoreRows(queryClient, removed);
    return { deleted: 0, failed: messages.length, offline: result.status === 0 };
  }

  /* La ligne de liste décrivait un message masqué : le serveur sert désormais
     l'aperçu personnel de ce lecteur, la liste le relit. */
  if (describedByList) void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY, exact: true });

  const deleted = Math.min(servedCount(result.data) ?? messages.length, messages.length);
  /* La route de masse ne NOMME pas ce qu'elle a refusé : le fil est relu
     plutôt que de deviner quelles rangées rendre. */
  if (deleted < messages.length) void queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
  return { deleted, failed: messages.length - deleted, offline: false };
}
