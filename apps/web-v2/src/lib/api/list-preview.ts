import type { QueryClient } from '@tanstack/react-query';

import { isLastMessageProtected } from '@meeshy/shared/utils/last-message-protection';

import { CONVERSATIONS_QUERY_KEY, patchConversation } from './conversations';
import type { Conversation, Message } from './types';

/**
 * LES ÉCRITURES DU DERNIER MESSAGE D'UNE LIGNE DE LISTE (#7547) — le site
 * UNIQUE des trois lois que `message:new`, `conversation:updated`,
 * `message:translation`, `message:expired` et l'envoi partagent :
 *
 *  1. **l'ordre** — un événement plus ANCIEN que l'aperçu en place ne le
 *     remplace jamais (`acceptsLastMessage`) ;
 *  2. **la protection** — le cache de liste est PERSISTÉ
 *     (`query-client.ts`) : un vue unique, un flouté, un chiffré ou un
 *     expiré n'y garde ni texte, ni carte du Prisme, ni pièce jointe
 *     (`listSafeLastMessage`, miroir de ce que sert `GET /conversations`,
 *     `core-list.ts` § #6111) ;
 *  3. **l'adoption** — poser un message, c'est poser son rang, sa langue et
 *     sa carte ENSEMBLE (`adoptLastMessage`).
 *
 * Ces règles vivaient recopiées dans chaque puits, sans garde d'ordre ni
 * masquage : un `message:new` en retard faisait redescendre la ligne, un
 * accusé d'envoi en retard ramenait mon ancien message, et `message:new`
 * gardait en clair le texte d'un vue unique dans le cache de liste.
 */

type WithClientId = Message & { readonly clientMessageId?: string };

const clientIdOf = (message: Message | undefined): string | undefined =>
  (message as WithClientId | undefined)?.clientMessageId;

/** Même message : même `id`, ou même `clientMessageId` (l'optimiste et son écho). */
export function isSameMessage(known: Message | undefined, incoming: Message): boolean {
  if (known === undefined || known === null) return false;
  if (known.id === incoming.id) return true;
  const cid = clientIdOf(incoming);
  return cid !== undefined && (clientIdOf(known) === cid || known.id === cid);
}

/**
 * Un optimiste NON CONFIRMÉ (`id === clientMessageId`, `local-message.ts`) est
 * daté par l'horloge de l'appareil : il ne peut pas refuser un événement
 * serveur, sans quoi une horloge en avance cacherait la réponse d'un pair.
 */
const isUnconfirmedLocal = (message: Message | undefined): boolean =>
  message !== undefined && message !== null && clientIdOf(message) === message.id;

const timeOf = (value: unknown): number => new Date(value as string).getTime();

export function acceptsLastMessage(conversation: Conversation, incoming: Message): boolean {
  const current = conversation.lastMessage;
  if (isSameMessage(current, incoming)) return true;
  if (isUnconfirmedLocal(current)) return true;
  const knownAt = conversation.lastMessageAt ?? current?.createdAt;
  if (knownAt === undefined || knownAt === null) return true;
  const knownMs = timeOf(knownAt);
  const incomingMs = timeOf(incoming.createdAt);
  if (Number.isNaN(knownMs) || Number.isNaN(incomingMs)) return true;
  return incomingMs >= knownMs;
}

export function isListProtected(message: Message, now: Date = new Date()): boolean {
  if (message.isEncrypted === true) return true;
  return isLastMessageProtected(
    {
      isBlurred: message.isBlurred,
      isViewOnce: message.isViewOnce,
      expiresAt: message.expiresAt ?? null,
      ephemeralDuration: message.ephemeralDuration ?? null,
    },
    now,
  );
}

/**
 * Ce qui reste d'un message protégé dans la ligne : son identité, son horloge,
 * son auteur et ses DRAPEAUX — ce qui qualifie le placeholder. Tout le
 * contenu part : texte, traductions, pièces jointes, lieu, sticker, citation.
 */
export function listSafeLastMessage(message: Message, now: Date = new Date()): Message {
  if (!isListProtected(message, now)) return message;
  const {
    attachments: _attachments,
    location: _location,
    sticker: _sticker,
    postReplyTo: _postReplyTo,
    replyTo: _replyTo,
    ...identity
  } = message as Message & { location?: unknown; sticker?: unknown; postReplyTo?: unknown; replyTo?: unknown };
  return { ...identity, content: '', translations: [] } as Message;
}

const withoutCard = (conversation: Conversation): Conversation => {
  const { lastMessageTranslations: _card, ...rest } = conversation;
  return rest;
};

/**
 * `adoptLastMessage` — la ligne décrit désormais `message`. Carte VIDE ou
 * message protégé ⇒ clé `lastMessageTranslations` RETIRÉE, jamais posée à
 * `undefined` (`exactOptionalPropertyTypes`).
 */
export function adoptLastMessage(
  conversation: Conversation,
  message: Message,
  translations: Readonly<Record<string, string>> = {},
): Conversation {
  const safe = listSafeLastMessage(message);
  const protectedMessage = safe !== message;
  const rest = withoutCard(conversation);
  return {
    ...rest,
    lastMessage: safe,
    lastMessageAt: message.createdAt,
    lastMessageOriginalLanguage: message.originalLanguage,
    ...(protectedMessage || Object.keys(translations).length === 0 ? {} : { lastMessageTranslations: translations }),
  };
}

/** Le puits commun de `message:new` et de l'envoi : adopte si l'ordre l'autorise. */
export function offerLastMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: Message,
  translations: Readonly<Record<string, string>> = {},
): void {
  patchConversation(queryClient, conversationId, (c) =>
    acceptsLastMessage(c, message) ? adoptLastMessage(c, message, translations) : c,
  );
}

/**
 * `message:translation` ne nomme pas sa conversation : la ligne qui le décrit
 * se retrouve par son DERNIER message, que le fil soit ouvert ou non. Un
 * dernier message protégé ne reçoit jamais de carte.
 */
export function mergeLastMessageCard(
  queryClient: QueryClient,
  messageId: string,
  incoming: Readonly<Record<string, string>>,
): void {
  for (const conversationId of conversationIdsDescribing(queryClient, messageId)) {
    patchConversation(queryClient, conversationId, (c) => {
      if (c.lastMessage?.id !== messageId || isListProtected(c.lastMessage)) return c;
      return { ...c, lastMessageTranslations: { ...c.lastMessageTranslations, ...incoming } };
    });
  }
}

/**
 * `message:expired` — la ligne qui décrit ce message passe à « expiré » sur-
 * le-champ : échéance posée à l'instant, contenu et carte retirés. Le RANG ne
 * bouge pas (`lastMessageAt` intact) : un message qui expire ne remonte rien.
 */
export function expireLastMessage(queryClient: QueryClient, conversationId: string, messageId: string, now: Date = new Date()): void {
  patchConversation(queryClient, conversationId, (c) => {
    const last = c.lastMessage;
    if (last === undefined || last === null || last.id !== messageId) return c;
    const { ephemeralDuration: _duration, ...rest } = last;
    const expired = { ...rest, expiresAt: now.toISOString() as unknown as Date } as Message;
    return { ...withoutCard(c), lastMessage: listSafeLastMessage(expired, now) };
  });
}

function conversationIdsDescribing(queryClient: QueryClient, messageId: string): readonly string[] {
  const data = queryClient.getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(
    CONVERSATIONS_QUERY_KEY,
  );
  if (data === undefined) return [];
  return data.pages.flatMap((p) => p.conversations).filter((c) => c.lastMessage?.id === messageId).map((c) => c.id);
}
