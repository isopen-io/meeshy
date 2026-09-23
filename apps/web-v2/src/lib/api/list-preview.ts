import type { QueryClient } from '@tanstack/react-query';

import type {
  ConversationActiveCall,
  ConversationLastReaction,
  LastMessageAttachmentSummary,
  LastMessageCallSummary,
  LastMessageSystemEvent,
} from '@meeshy/shared/types/conversation-preview';
import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';
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

/**
 * LA LIGNE TELLE QUE LE CACHE LA TIENT — le domaine partagé (`Conversation`,
 * `Message`) plus les champs du contrat de la ligne (#7545) qu'il ne déclare
 * pas encore : la dernière réaction, l'appel en cours, et la NATURE du
 * dernier message. Des types de `@meeshy/shared`, jamais redéclarés ici.
 */
export type ListLastMessage = Message & {
  readonly isForwarded?: boolean;
  readonly systemEvent?: LastMessageSystemEvent;
  readonly callSummary?: LastMessageCallSummary;
  readonly attachmentSummary?: LastMessageAttachmentSummary;
};

export type ListConversation = Conversation & {
  readonly lastReaction?: ConversationLastReaction;
  readonly activeCall?: ConversationActiveCall;
  /**
   * LE RANG DE CETTE LIGNE POUR CE LECTEUR, SERVI par la passerelle (#7592) :
   * max(`lastMessageAt`, la dernière réaction à MON message). `GET
   * /conversations` le sert sur chaque ligne ; `conversation:updated` ne le
   * porte que chez l'auteur du message réagi. Clé absente = ne pas réordonner.
   */
  readonly listRankAt?: string;
};

type WithListRank = { readonly listRankAt?: string | null };

/**
 * LE RANG DE TRI D'UNE LIGNE (#7592) — le rang SERVI, jamais recalculé ici,
 * et au moins `lastMessageAt` : un message arrivé après la réaction fait
 * toujours remonter la ligne (contrat #7592, « le rang d'une ligne est
 * toujours au moins `lastMessageAt` »). Sans rang servi, `lastMessageAt`.
 */
export function listRankOf(conversation: Conversation): Date | undefined {
  const served = (conversation as ListConversation).listRankAt;
  const last = conversation.lastMessageAt;
  const lastMs = last === undefined || last === null ? Number.NaN : new Date(last as unknown as string).getTime();
  const servedMs = served === undefined ? Number.NaN : new Date(served).getTime();
  if (Number.isNaN(servedMs)) return last === null ? undefined : last;
  if (Number.isNaN(lastMs) || servedMs > lastMs) return new Date(servedMs);
  return last === null ? undefined : last;
}

/** Le rang comme CHAMP de la loi de tri partagée — la clé n'existe que si elle a une valeur (`exactOptionalPropertyTypes`). */
export function listRankField(conversation: Conversation): { readonly lastMessageAt: Date } | Record<string, never> {
  const rank = listRankOf(conversation);
  return rank === undefined ? {} : { lastMessageAt: rank };
}

/** Le rang servi par `conversation:updated` : posé tel quel, retiré sur `null`, intact si la clé est absente. */
export function withListRank(conversation: Conversation, data: ConversationUpdatedEventData): Conversation {
  if (!('listRankAt' in data)) return conversation;
  const incoming = (data as ConversationUpdatedEventData & WithListRank).listRankAt;
  const { listRankAt: _rank, ...rest } = conversation as ListConversation;
  return (typeof incoming === 'string' ? { ...rest, listRankAt: incoming } : rest) as ListConversation;
}

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
    attachmentSummary: _summary,
    location: _location,
    sticker: _sticker,
    postReplyTo: _postReplyTo,
    replyTo: _replyTo,
    ...identity
  } = message as ListLastMessage & { location?: unknown; sticker?: unknown; postReplyTo?: unknown; replyTo?: unknown };
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

type Nature = {
  readonly messageType?: Message['messageType'];
  readonly effectFlags?: number;
  readonly ephemeralDuration?: number;
  readonly isEncrypted?: boolean;
  readonly isForwarded?: boolean;
  readonly systemEvent?: LastMessageSystemEvent;
  readonly callSummary?: LastMessageCallSummary;
  readonly attachmentSummary?: LastMessageAttachmentSummary;
};

const NATURE_KEYS = {
  lastMessageType: 'messageType',
  lastMessageEffectFlags: 'effectFlags',
  lastMessageEphemeralDuration: 'ephemeralDuration',
  lastMessageIsEncrypted: 'isEncrypted',
  lastMessageIsForwarded: 'isForwarded',
  lastMessageSystemEvent: 'systemEvent',
  lastMessageCallSummary: 'callSummary',
  lastMessageAttachmentSummary: 'attachmentSummary',
} as const satisfies Readonly<Partial<Record<keyof ConversationUpdatedEventData, keyof Nature>>>;

/**
 * LA NATURE DU DERNIER MESSAGE (#7545) — les clés plates `lastMessage*` de
 * `conversation:updated` rendues sous les noms que porte le message de la
 * ligne. TRI-ÉTAT, clé par clé : absente = ne pas toucher, `null` = retirer,
 * valeur = poser. `removed` nomme les clés à retirer.
 */
export function natureOf(data: ConversationUpdatedEventData): { readonly set: Nature; readonly removed: readonly (keyof Nature)[] } {
  const entries = Object.entries(NATURE_KEYS) as [keyof typeof NATURE_KEYS, keyof Nature][];
  const present = entries.filter(([wire]) => data[wire] !== undefined);
  return {
    set: Object.fromEntries(present.filter(([wire]) => data[wire] !== null).map(([wire, key]) => [key, data[wire]])) as Nature,
    removed: present.filter(([wire]) => data[wire] === null).map(([, key]) => key),
  };
}

export function withNature(message: Message, data: ConversationUpdatedEventData): ListLastMessage {
  const { set, removed } = natureOf(data);
  const kept = Object.fromEntries(Object.entries(message).filter(([key]) => !removed.includes(key as keyof Nature)));
  return { ...kept, ...set } as ListLastMessage;
}

/**
 * CE QUI S'EST PASSÉ DEPUIS LE DERNIER MESSAGE (#7545) — la dernière réaction
 * et l'appel en cours, chacun TRI-ÉTAT (absent = inchangé, `null` = retiré).
 * Ils ne touchent jamais au groupe d'aperçu : une réaction n'est pas un
 * message, et elle ne REMONTE la conversation que par le `lastMessageAt` que
 * le serveur choisit de lui joindre (décision porteur : à MON message).
 */
export function withSideband(conversation: Conversation, data: ConversationUpdatedEventData): Conversation {
  const row = conversation as ListConversation;
  const { lastReaction: _reaction, activeCall: _call, ...rest } = row;
  const reaction = data.lastReaction === undefined ? row.lastReaction : (data.lastReaction ?? undefined);
  const call = data.activeCall === undefined ? row.activeCall : (data.activeCall ?? undefined);
  return {
    ...rest,
    ...(reaction === undefined ? {} : { lastReaction: reaction }),
    ...(call === undefined ? {} : { activeCall: call }),
  } as ListConversation;
}
