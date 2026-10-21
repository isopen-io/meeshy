import type { QueryClient } from '@tanstack/react-query';
import * as messagesEndpoints from '@meeshy/shared/api/endpoints/messages';

import { findCachedConversation } from './conversations';
import type { ApiResult, HttpRequest } from './http';
import { editLastMessage } from './list-preview';
import { findCachedThreadMessage, messagesQueryKey, patchThreadMessages } from './messages';
import type { MessagesInfiniteData } from './messages-pages';
import type { Message } from './types';

/**
 * MODIFIER SON MESSAGE (#10581) — `PUT` sur `messages.byMessageId`
 * (`services/gateway/src/routes/messages-writes.ts`), le transport d'iOS.
 *
 * Optimiste : le texte change AVANT l'accusé, par le puits qui reçoit déjà
 * l'édition faite ailleurs (`applyMessageEdited`) — la rangée, les citations
 * que les réponses embarquent et la ligne de liste suivent d'un seul geste, et
 * les traductions de l'ancien texte ne sont plus servies. Ce puits vit dans le
 * morceau `realtime`, chargé à la demande : il est importé de même ici.
 *
 * L'optimiste ne pose AUCUNE heure d'édition : celle du serveur arrive avec
 * l'accusé (et avec `message:edited`), et une heure locale en avance la ferait
 * passer pour périmée (`isStaleEdit`).
 *
 * Un refus ou une coupure REND la rangée d'avant — texte, traductions,
 * citations, ligne de liste — sans écraser ce que le cache a appris pendant le
 * vol : une rangée qui ne porte plus le texte optimiste n'est pas touchée.
 *
 * Un texte vide ou inchangé ne part pas.
 */
export type MessageEditOutcome = 'ok' | 'unchanged' | 'offline' | 'refused';

type EditedFields = Pick<Message, 'content' | 'isEdited' | 'translations'> & Partial<Pick<Message, 'validatedMentions'>>;

const editedFieldsOf = (message: Message): EditedFields => ({
  content: message.content,
  isEdited: message.isEdited,
  translations: message.translations,
  ...(message.validatedMentions === undefined ? {} : { validatedMentions: message.validatedMentions }),
});

const withEditedFields = (message: Message, fields: EditedFields): Message => {
  const { validatedMentions: _mentions, ...rest } = message;
  return { ...rest, ...fields };
};

const quotesOf = (queryClient: QueryClient, conversationId: string, messageId: string): ReadonlyMap<string, Message> =>
  new Map(
    queryClient
      .getQueriesData<MessagesInfiniteData>({ queryKey: messagesQueryKey(conversationId) })
      .flatMap(([, data]) => (data === undefined || !Array.isArray(data.pages) ? [] : data.pages))
      .flatMap((page) => page.messages)
      .flatMap((m) => (m.replyTo !== undefined && m.replyTo !== null && m.replyTo.id === messageId ? [[m.id, m.replyTo] as const] : [])),
  );

const isServedEdit = (data: unknown): data is { readonly id: string; readonly conversationId: string; readonly content: string } => {
  if (typeof data !== 'object' || data === null) return false;
  const served = data as Record<string, unknown>;
  return typeof served.id === 'string' && typeof served.conversationId === 'string' && typeof served.content === 'string';
};

export async function performMessageEdit(params: {
  readonly queryClient: QueryClient;
  readonly conversationId: string;
  readonly message: Message;
  readonly content: string;
  readonly transport: { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };
}): Promise<MessageEditOutcome> {
  const { queryClient, conversationId, message, transport } = params;
  const content = params.content.trim();
  if (content === '' || content === message.content.trim()) return 'unchanged';

  const { applyMessageEdited } = await import('./realtime-message-mutations');
  const before = editedFieldsOf(findCachedThreadMessage(queryClient, conversationId, message.id) ?? message);
  const quotesBefore = quotesOf(queryClient, conversationId, message.id);
  applyMessageEdited(queryClient, { id: message.id, conversationId, content, isEdited: true });

  const result = await transport.request<unknown>({ method: 'PUT', path: messagesEndpoints.byMessageId(message.id), body: { content } });
  if (result.ok) {
    if (isServedEdit(result.data) && result.data.id === message.id) applyMessageEdited(queryClient, { ...result.data, conversationId });
    return 'ok';
  }

  patchThreadMessages(queryClient, conversationId, (messages) =>
    messages.map((m) => {
      if (m.id === message.id) return m.content === content ? withEditedFields(m, before) : m;
      const quoted = quotesBefore.get(m.id);
      if (quoted === undefined || m.replyTo === undefined || m.replyTo === null) return m;
      return m.replyTo.id === message.id && m.replyTo.content === content ? { ...m, replyTo: quoted } : m;
    }),
  );
  if (findCachedConversation(queryClient, conversationId)?.lastMessage?.content === content) {
    editLastMessage(queryClient, conversationId, { messageId: message.id, content: before.content, isEdited: before.isEdited });
  }
  return result.status === 0 ? 'offline' : 'refused';
}
