import type { QueryClient } from '@tanstack/react-query';
import type { AttachmentDeletedEventData } from '@meeshy/shared/types/socketio-events/attachment';
import type { LastMessageAttachmentSummary, PreviewAttachmentKind } from '@meeshy/shared/types/conversation-preview';

import { CONVERSATIONS_QUERY_KEY, findCachedConversation, patchConversation } from './conversations';
import { deleteLastMessage, isListProtected, type ListLastMessage } from './list-preview';
import { patchMediaHubMessages } from './media-hub-cache';
import { findCachedThreadMessage, latestSurvivingThreadMessage, patchThreadMessages } from './messages';
import { belongsTo } from './quote-tombstone';
import { applyMessageDeleted } from './realtime-message-mutations';
import type { Attachment, Message } from './types';

/**
 * LE PUITS DE `attachment:deleted` (#13611) — la passerelle diffuse
 * `{ conversationId, messageId, attachmentId }` à la room de la conversation
 * quand un membre retire UNE pièce d'un message (#13608). Aucun contenu de la
 * pièce ne voyage. Miroir Android : `AttachmentRemovalDeltas` (#13609).
 *
 * Trois surfaces suivent, en un geste : le fil, l'écran des médias de la
 * conversation (`media-hub-cache.ts`) et la ligne de liste.
 *
 * Un message qui n'a plus NI texte NI pièce (NI lieu, NI sticker) prend le
 * rendu d'une suppression de message : `applyMessageDeleted` — pierre
 * tombale, citations, ligne de liste dont le survivant du fil reprend la place.
 *
 * FAIL-CLOSED : charge incomplète ignorée ; un message qui se dit d'une AUTRE
 * conversation que celle annoncée n'est pas touché ; fil non chargé, message ou
 * pièce inconnus ⇒ rien ne se crée. IDEMPOTENT : rejoué, l'événement retombe
 * sur « pièce déjà absente » et ne change rien (mêmes références).
 *
 * LA LIGNE DE LISTE ne montre jamais en clair un message protégé (vue unique,
 * flouté, chiffré, éphémère) : elle est PERSISTÉE. Ce qui reprend la ligne
 * passe par `adoptLastMessage` (`listSafeLastMessage`) ; une ligne protégée dont
 * on ne peut pas savoir, depuis le cache, si le message est vidé, n'est pas
 * devinée : la liste est relue.
 */
export function isAttachmentDeletedEvent(payload: unknown): payload is AttachmentDeletedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return [p.conversationId, p.messageId, p.attachmentId].every((id) => typeof id === 'string' && id !== '');
}

const holds = (pieces: readonly Attachment[] | undefined, attachmentId: string): boolean =>
  pieces !== undefined && pieces.some((a) => a.id === attachmentId);

const hasNothingLeft = (message: Message, remaining: readonly Attachment[]): boolean =>
  remaining.length === 0 &&
  (message.content ?? '').trim() === '' &&
  ((message as Message & { readonly location?: unknown }).location ?? null) === null &&
  (message.sticker === undefined || message.sticker === null);

const without = (pieces: readonly Attachment[], attachmentId: string): readonly Attachment[] =>
  pieces.filter((a) => a.id !== attachmentId);

const kindOf = (piece: Attachment): PreviewAttachmentKind => {
  const family = (piece.mimeType ?? '').split('/')[0];
  return family === 'image' || family === 'video' || family === 'audio' ? family : 'file';
};

const summaryOf = (pieces: readonly Attachment[]): LastMessageAttachmentSummary | undefined => {
  if (pieces.length === 0) return undefined;
  const sizes = pieces.flatMap((piece) => (typeof piece.fileSize === 'number' ? [piece.fileSize] : []));
  return {
    count: pieces.length,
    kinds: pieces.reduce<Partial<Record<PreviewAttachmentKind, number>>>(
      (kinds, piece) => ({ ...kinds, [kindOf(piece)]: (kinds[kindOf(piece)] ?? 0) + 1 }),
      {},
    ),
    totalSize: sizes.length === 0 ? null : sizes.reduce((sum, size) => sum + size, 0),
  };
};

function stripFromHub(queryClient: QueryClient, data: AttachmentDeletedEventData): void {
  const concerned = (m: Message): boolean =>
    m.id === data.messageId && belongsTo(m, data.conversationId) && holds(m.attachments, data.attachmentId);
  patchMediaHubMessages(queryClient, data.conversationId, (messages) =>
    messages.some(concerned)
      ? messages.flatMap((m) => {
          if (!concerned(m)) return [m];
          const remaining = without(m.attachments ?? [], data.attachmentId);
          return remaining.length === 0 ? [] : [{ ...m, attachments: [...remaining] }];
        })
      : messages,
  );
}

function stripFromThread(queryClient: QueryClient, data: AttachmentDeletedEventData): void {
  patchThreadMessages(queryClient, data.conversationId, (messages) =>
    messages.some((m) => m.id === data.messageId && belongsTo(m, data.conversationId) && holds(m.attachments, data.attachmentId))
      ? messages.map((m) =>
          m.id === data.messageId && belongsTo(m, data.conversationId) && holds(m.attachments, data.attachmentId)
            ? { ...m, attachments: [...without(m.attachments ?? [], data.attachmentId)] }
            : m,
        )
      : messages,
  );
}

const relistConversations = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY, exact: true });
};

function updateListPreview(
  queryClient: QueryClient,
  data: AttachmentDeletedEventData,
  known: Message | undefined,
  now: Date,
): void {
  const last = findCachedConversation(queryClient, data.conversationId)?.lastMessage;
  if (last === undefined || last === null || last.id !== data.messageId) return;

  if (isListProtected(last)) {
    if (known === undefined) relistConversations(queryClient);
    return;
  }

  const pieces = last.attachments ?? known?.attachments;
  if (pieces === undefined) {
    if ((last as ListLastMessage).attachmentSummary !== undefined) relistConversations(queryClient);
    return;
  }
  if (!holds(pieces, data.attachmentId)) return;

  const remaining = without(pieces, data.attachmentId);
  if (hasNothingLeft(last, remaining)) {
    const survivor = latestSurvivingThreadMessage(queryClient, data.conversationId, data.messageId);
    deleteLastMessage(queryClient, data.conversationId, data.messageId, now, survivor);
    if (survivor === undefined) relistConversations(queryClient);
    return;
  }

  const summary = summaryOf(remaining);
  patchConversation(queryClient, data.conversationId, (conversation) => {
    const current = conversation.lastMessage as ListLastMessage | undefined | null;
    if (current === undefined || current === null || current.id !== data.messageId) return conversation;
    const { attachmentSummary: previous, ...rest } = current;
    return {
      ...conversation,
      lastMessage: {
        ...rest,
        ...(current.attachments === undefined ? {} : { attachments: [...remaining] }),
        ...(previous === undefined || summary === undefined ? {} : { attachmentSummary: summary }),
      } as Message,
    };
  });
}

export function applyAttachmentDeleted(queryClient: QueryClient, data: AttachmentDeletedEventData, now: Date = new Date()): void {
  const known = findCachedThreadMessage(queryClient, data.conversationId, data.messageId);
  if (known !== undefined && !belongsTo(known, data.conversationId)) return;

  stripFromHub(queryClient, data);

  if (known !== undefined && holds(known.attachments, data.attachmentId)) {
    if (hasNothingLeft(known, without(known.attachments ?? [], data.attachmentId))) {
      applyMessageDeleted(queryClient, { messageId: data.messageId, conversationId: data.conversationId }, now);
      return;
    }
    stripFromThread(queryClient, data);
  }
  updateListPreview(queryClient, data, known, now);
}
