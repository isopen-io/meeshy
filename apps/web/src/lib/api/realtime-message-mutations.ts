import type { QueryClient } from '@tanstack/react-query';
import type { MessageDeletedEventData, SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { quotedIsProtected } from '@/lib/view/quoted-protection';

import { deleteLastMessage, editLastMessage } from './list-preview';
import { findCachedThreadMessage, patchThreadMessages } from './messages';
import type { Message } from './types';
import { purgeViewOnceIn } from './view-once-seal';

/**
 * LES PUITS DE `message:edited` ET `message:deleted` (#7926) — la passerelle
 * les diffuse à la room de la conversation (`MessageHandler`,
 * `broadcastMessageMutation`). Trois surfaces suivent, en un geste :
 *
 *  1. **la rangée** du fil ouvert ;
 *  2. **les citations** (`replyTo`) que les AUTRES messages du fil embarquent
 *     — le message cité peut être hors de la fenêtre chargée, ses réponses
 *     non ;
 *  3. **la ligne de liste** qui le décrit (`list-preview.ts`).
 *
 * Miroir iOS (`ConversationSocketHandler`) : `markEdited` pose texte,
 * `isEdited` et `editedAt` avec une garde d'ORDRE (une édition plus ancienne
 * que celle en place est ignorée) ; `markDeleted` pose une pierre tombale
 * (`deletedAt`, contenu vidé) et SCELLE une vue unique « déjà ouverte »
 * (`sparingOpenedViewOnce`) au lieu de la tomber.
 *
 * **Aucune fuite inter-conversation** : tout se lit et s'écrit sous la clé de
 * la conversation que la charge NOMME, et une rangée qui se dit d'une autre
 * conversation n'est pas touchée.
 */

export function isMessageEditedEvent(payload: unknown): payload is SocketIOMessage {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.conversationId === 'string' && typeof p.content === 'string';
}

export function isMessageDeletedEvent(payload: unknown): payload is MessageDeletedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.messageId === 'string' && typeof p.conversationId === 'string';
}

/** Tolérance de la garde d'ordre — celle d'iOS (`editOrderingTolerance`), les horloges comparées étant celles du SERVEUR. */
const EDIT_ORDERING_TOLERANCE_MS = 1;

const timeOf = (value: unknown): number => (value === undefined || value === null ? Number.NaN : new Date(value as string).getTime());

const isStaleEdit = (known: Message, incomingEditedAt: unknown): boolean => {
  const knownMs = timeOf(known.editedAt);
  const incomingMs = timeOf(incomingEditedAt);
  if (Number.isNaN(knownMs) || Number.isNaN(incomingMs)) return false;
  return incomingMs < knownMs - EDIT_ORDERING_TOLERANCE_MS;
};

const belongsTo = (message: Message, conversationId: string): boolean => message.conversationId === conversationId;

/** Les traductions de l'ANCIEN texte sont périmées ; seule une carte servie AVEC l'édition peut la suivre. */
const servedTranslations = (data: SocketIOMessage): Message['translations'] =>
  Array.isArray(data.translations) && data.translations.length > 0 ? (data.translations as Message['translations']) : [];

const editedRow = (known: Message, data: SocketIOMessage): Message => ({
  ...known,
  content: data.content,
  isEdited: true,
  translations: servedTranslations(data),
  ...(data.editedAt === undefined ? {} : { editedAt: data.editedAt }),
  ...(data.validatedMentions === undefined ? {} : { validatedMentions: data.validatedMentions }),
});

/** Une citation PROTÉGÉE porte un placeholder servi : le texte en clair n'y entre jamais. */
const editedQuote = (quote: Message, data: SocketIOMessage): Message =>
  quotedIsProtected(quote) || isStaleEdit(quote, data.editedAt) ? quote : editedRow(quote, data);

const tombstone = (message: Message, deletedAt: string): Message => {
  const { attachments: _attachments, ...rest } = message;
  return { ...rest, content: '', translations: [], deletedAt: deletedAt as unknown as Date };
};

const quotes = (message: Message, quotedId: string): boolean =>
  message.replyTo !== undefined && message.replyTo !== null && message.replyTo.id === quotedId;

export function applyMessageEdited(queryClient: QueryClient, data: SocketIOMessage): void {
  const known = findCachedThreadMessage(queryClient, data.conversationId, data.id);
  const rowMayChange = known !== undefined && belongsTo(known, data.conversationId) && !isStaleEdit(known, data.editedAt);

  patchThreadMessages(queryClient, data.conversationId, (messages) =>
    messages.some((m) => (m.id === data.id && rowMayChange) || (quotes(m, data.id) && belongsTo(m, data.conversationId)))
      ? messages.map((m) => {
          if (m.id === data.id) return rowMayChange ? editedRow(m, data) : m;
          if (!quotes(m, data.id) || !belongsTo(m, data.conversationId)) return m;
          const next = editedQuote(m.replyTo as Message, data);
          return next === m.replyTo ? m : { ...m, replyTo: next };
        })
      : messages,
  );

  if (known !== undefined && !rowMayChange) return;
  editLastMessage(queryClient, data.conversationId, {
    messageId: data.id,
    content: data.content,
    ...(data.editedAt === undefined ? {} : { editedAt: data.editedAt }),
  });
}

export function applyMessageDeleted(queryClient: QueryClient, data: MessageDeletedEventData, now: Date = new Date()): void {
  const known = findCachedThreadMessage(queryClient, data.conversationId, data.messageId);
  if (known !== undefined && !belongsTo(known, data.conversationId)) return;
  const deletedAt = now.toISOString();
  const touches = (m: Message): boolean => m.id === data.messageId || (quotes(m, data.messageId) && belongsTo(m, data.conversationId));

  patchThreadMessages(queryClient, data.conversationId, (messages) => {
    if (!messages.some(touches)) return messages;
    /* Une vue unique est SCELLÉE « déjà ouverte » (`purgeViewOnceIn`), jamais tombée — miroir `sparingOpenedViewOnce`. */
    const sealed = known?.isViewOnce === true ? purgeViewOnceIn(messages, data.messageId) : messages;
    return sealed.map((m) => {
      if (m.id === data.messageId) return m.isViewOnce === true ? m : tombstone(m, deletedAt);
      if (!touches(m)) return m;
      return { ...m, replyTo: tombstone(m.replyTo as Message, deletedAt) };
    });
  });

  deleteLastMessage(queryClient, data.conversationId, data.messageId, now);
}
