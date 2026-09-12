import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type {
  ConversationUnreadUpdatedEventData,
  ConversationUpdatedEventData,
} from '@meeshy/shared/types/socketio-events/conversation';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';
import { buildTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import type { ConversationStoreState } from '@/lib/conversation-store';
import type { OutboxState } from '@/lib/send/outbox-store';

import { patchConversation } from './conversations';
import { messagesQueryKey, type MessagesPage } from './messages';
import type { Conversation, Message, Participant } from './types';

/**
 * L'APPLICATION DU TEMPS RÉEL AU CACHE (#5793) — des fonctions PURES,
 * témoignables SANS aucun socket (`socket.test.ts` les exerce directement
 * contre un vrai `QueryClient`, motif `perform-send.test.ts`) : la RÈGLE
 * (dédoublonnage, forme du fil, patch de liste) vit ICI, `api/socket.ts` ne
 * fait que les BRANCHER sur les événements reçus.
 */

/** Garde de FORME, FAIL-CLOSED (miroir `decode(APIMessage.self, from:)`
 * iOS, `MessageSocketManager.swift:3216-3226`) — une charge qui ne décode
 * pas est REJETÉE, jamais une exception qui couperait la connexion pour
 * tous les événements suivants. */
export function isSocketMessage(payload: unknown): payload is SocketIOMessage {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.conversationId === 'string' &&
    typeof p.senderId === 'string' &&
    typeof p.content === 'string' &&
    typeof p.originalLanguage === 'string' &&
    typeof p.messageType === 'string' &&
    (typeof p.createdAt === 'string' || p.createdAt instanceof Date)
  );
}

/**
 * `rawMessageFromSocket` — projette `message:new` en la forme QUE LE CACHE
 * TIENT (D-26, « cache = forme du fil ») : les dates restent des CHAÎNES
 * (le fil encode `Date` en JSON par `JSON.stringify`, exactement comme le
 * port REST), jamais décodées ici — `decodeMessagesPage` (`api/messages.ts`,
 * posé en `select`) est le SEUL site qui les revit en `Date`, que la donnée
 * vienne du réseau, du cache restauré OU d'ici. Un second décodage ferait
 * exactement la jumelle divergente que D-26 existe pour éviter.
 *
 * `sender` (`SocketIOMessageSender`) N'EST PAS un `Participant` — moins de
 * champs, aucun `permissions` — le cast est le même motif JUSTIFIÉ que
 * `confirmedMessageOf` (`send/local-message.ts`) pour les dates : les deux
 * seuls lecteurs de `message.sender` sur cette rangée (`displayName`,
 * `avatar`) n'en demandent pas davantage.
 *
 * `clientMessageId` n'appartient pas au domaine `Message` partagé — porté À
 * CÔTÉ, motif `LocalMessage` (`send/local-message.ts`), pour que le
 * dédoublonnage (`applyMessageNew`, ci-dessous) puisse le relire sans
 * deviner (D-11/D-28 : le MÊME champ que `upsertConfirmed`,
 * `send/perform-send.ts:149-157`).
 */
export function rawMessageFromSocket(raw: SocketIOMessage): Message & { readonly clientMessageId?: string } {
  const sender = raw.sender;
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    senderId: raw.senderId,
    content: raw.content,
    originalLanguage: raw.originalLanguage,
    messageType: raw.messageType,
    messageSource: (raw.messageSource ?? 'user') as Message['messageSource'],
    isEdited: raw.isEdited ?? false,
    isViewOnce: raw.isViewOnce ?? false,
    viewOnceCount: 0,
    isBlurred: raw.isBlurred ?? false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: raw.isEncrypted ?? false,
    createdAt: raw.createdAt,
    timestamp: raw.createdAt,
    translations: Array.isArray(raw.translations) ? (raw.translations as Message['translations']) : [],
    ...(raw.updatedAt !== undefined ? { updatedAt: raw.updatedAt } : {}),
    ...(raw.editedAt !== undefined ? { editedAt: raw.editedAt } : {}),
    ...(raw.deletedAt !== undefined ? { deletedAt: raw.deletedAt } : {}),
    ...(raw.expiresAt !== undefined ? { expiresAt: raw.expiresAt } : {}),
    ...(raw.maxViewOnceCount !== undefined ? { maxViewOnceCount: raw.maxViewOnceCount } : {}),
    ...(raw.effectFlags !== undefined ? { effectFlags: raw.effectFlags } : {}),
    ...(raw.replyToId !== undefined ? { replyToId: raw.replyToId } : {}),
    ...(raw.storyReplyToId !== undefined ? { storyReplyToId: raw.storyReplyToId } : {}),
    ...(raw.forwardedFromId !== undefined ? { forwardedFromId: raw.forwardedFromId } : {}),
    ...(raw.forwardedFromConversationId !== undefined
      ? { forwardedFromConversationId: raw.forwardedFromConversationId }
      : {}),
    ...(raw.validatedMentions !== undefined ? { validatedMentions: raw.validatedMentions } : {}),
    ...(sender !== undefined ? { sender: sender as unknown as Participant } : {}),
    ...(Array.isArray(raw.attachments) ? { attachments: raw.attachments as unknown as Message['attachments'] } : {}),
    ...(raw.clientMessageId !== undefined ? { clientMessageId: raw.clientMessageId } : {}),
  } as unknown as Message & { readonly clientMessageId?: string };
}

/**
 * `applyMessageNew` — LE PUITS UNIQUE de `message:new` (miroir
 * `ConversationSyncEngine.handleNewMessage`, § 1.1 de la spécification) :
 *
 *  1. upsert dans le fil OUVERT (`['conversations', id, 'messages']`),
 *     dédoublonné par `id` OU `clientMessageId` — LA MÊME règle que
 *     `upsertConfirmed` (`send/perform-send.ts:149-157`), pour que l'écho
 *     socket d'un envoi propre PROMEUVE la rangée optimiste en place plutôt
 *     que de la dupliquer (D-11/D-28) ;
 *  2. l'OUTBOX — un écho portant un `clientMessageId` PROMEUT l'entrée en vol
 *     (retrait, donc `confirmed` incrémenté) : la rangée optimiste d'un envoi
 *     EN COURS ne vit PAS dans la page du cache, elle vit dans
 *     `send/outbox-store.ts` (D-28) et le fil rend
 *     `mergeTimeline(page.messages, entries.map(e => e.message))`
 *     (`thread.tsx`). Dédoublonner la seule page laissait DEUX lignes pour un
 *     même message tant que l'accusé REST n'était pas revenu — et POUR
 *     TOUJOURS s'il se perdait. `remove` est IDEMPOTENT (« rien retiré ⇒ rien
 *     confirmé », `outbox-store.ts:143-160`), donc l'ordre écho-puis-accusé et
 *     l'ordre inverse rendent le même état, sans double annonce ;
 *  3. `patchConversation` — LE SITE UNIQUE (`api/conversations.ts`) qui
 *     patch une ligne de LISTE, réutilisé TEL QUEL (§ 1.4 point 4 de la
 *     spécification, motif exact de `perform-send.ts` § `attempt()`) : c'est
 *     ce qui fait apparaître le dernier message ET réordonne la Lentille
 *     (`lastMessageAt` alimente `orderConversations`/`resolveLensSections`),
 *     pour un message reçu comme pour l'écho du sien. `lastMessageTranslations`
 *     vient de ce que la CHARGE TRANSPORTE (`buildTranslationRecord`,
 *     @meeshy/shared) — la retirer inconditionnellement faisait servir
 *     l'ORIGINAL sur la Lentille alors qu'une traduction du rang du lecteur
 *     voyageait dans le même paquet (cycle 121 : « élit-il le bon rang ? »).
 *     Carte VIDE ⇒ clé RETIRÉE, jamais posée à `undefined`
 *     (`exactOptionalPropertyTypes`).
 *
 * `page === undefined` (le fil n'est pas OUVERT) : rien à peindre
 * localement — la liste seule est patchée, la prochaine ouverture du fil le
 * chargera par `GET …/messages`.
 */
export function applyMessageNew(
  queryClient: QueryClient,
  outbox: StoreApi<OutboxState>,
  raw: SocketIOMessage,
): void {
  if (!isSocketMessage(raw)) return;
  const message = rawMessageFromSocket(raw);
  const cid = raw.clientMessageId;

  queryClient.setQueryData<MessagesPage>(messagesQueryKey(raw.conversationId), (page) => {
    if (page === undefined) return page;
    const index = page.messages.findIndex(
      (m) => m.id === message.id || (cid !== undefined && (m as { readonly clientMessageId?: string }).clientMessageId === cid),
    );
    if (index === -1) return { ...page, messages: [...page.messages, message] };
    return { ...page, messages: page.messages.map((m, i) => (i === index ? message : m)) };
  });

  /* Le cid ne voyage QUE vers la room personnelle de l'expéditeur
     (`stripClientMessageId`, `MeeshySocketIOManager.ts:3011-3039`) : sa
     présence PROUVE que cet écho est le nôtre — l'écho d'un pair n'en porte
     jamais, donc cette ligne ne peut pas retirer l'envoi de quelqu'un d'autre. */
  if (cid !== undefined) outbox.getState().remove(raw.conversationId, cid);

  const translations = buildTranslationRecord(raw.translations);
  patchConversation(queryClient, raw.conversationId, (c) => {
    const { lastMessageTranslations: _lastMessageTranslations, ...rest } = c;
    return {
      ...rest,
      lastMessage: message,
      lastMessageAt: message.createdAt,
      lastMessageOriginalLanguage: message.originalLanguage,
      ...(Object.keys(translations).length === 0 ? {} : { lastMessageTranslations: translations }),
    };
  });
}

/** Garde de FORME pour `conversation:unread-updated` (§ 3.4 de la
 * spécification #5793) — `bridge` est IGNORÉ ce lot (pas de pont ✦ sur le
 * web, `targets/lentille.md:657`, suivi). */
export function isConversationUnreadUpdated(payload: unknown): payload is ConversationUnreadUpdatedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.conversationId === 'string' && typeof p.unreadCount === 'number';
}

/**
 * `applyConversationUnreadUpdated` — le compte AUTORITAIRE reçu du serveur
 * REMPLACE la ligne de liste (`patchConversation`) et EFFACE l'override
 * optimiste de `conversationStore` (`markRead`/`markUnread`, motif
 * `clearOverride` déjà établi par `performRowAction` sur un 2xx/4xx) : un
 * évènement serveur JOUE le même rôle qu'une confirmation REST — le cache
 * prend la valeur SERVEUR, l'override n'a plus lieu d'être.
 */
export function applyConversationUnreadUpdated(
  queryClient: QueryClient,
  conversationStore: StoreApi<ConversationStoreState>,
  data: ConversationUnreadUpdatedEventData,
): void {
  patchConversation(queryClient, data.conversationId, (c) => ({ ...c, unreadCount: data.unreadCount }));
  conversationStore.getState().clearOverride(data.conversationId, ['unreadCount']);
}

/** Garde de FORME pour `conversation:updated` (revue-correction #5793,
 * défaut 1) — SEULS les trois champs OBLIGATOIRES du contrat sont vérifiés ;
 * les champs du groupe d'aperçu sont TRI-ÉTAT par construction (absent /
 * `null` / valeur) et validés un par un dans `applyConversationUpdated`,
 * jamais ici — une valeur de forme inattendue sur l'un d'eux ne doit pas
 * REJETER tout l'évènement (fail-closed CHAMP PAR CHAMP, pas message par
 * message, motif la doc de `ConversationUpdatedEventData`). */
export function isConversationUpdated(payload: unknown): payload is ConversationUpdatedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.conversationId !== 'string' || typeof p.updatedAt !== 'string') return false;
  const updatedBy = p.updatedBy;
  return typeof updatedBy === 'object' && updatedBy !== null && typeof (updatedBy as Record<string, unknown>).id === 'string';
}

/**
 * `applyConversationUpdated` — le puits de `conversation:updated` (défaut
 * MAJEUR 1 de la revue #5793) : la QUATRIÈME famille du Prisme (résolue
 * SERVEUR, § CLAUDE.md « Prisme Linguistique ») — l'aperçu de ligne DÉJÀ
 * descendu par lecteur, restreint à ses langues et plafonné
 * (`resolveLastMessagePreviewPrism`, `services/gateway/.../
 * lastMessagePreviewPrism.ts`) — PRIME sur ce que `applyMessageNew` a DÉDUIT
 * de `message:new`, dont `translations` est souvent VIDE à la création (le
 * pipeline traduit APRÈS, défaut 2 de la même revue) : cet évènement est ce
 * qui rattrape la ligne quand la traduction atterrit, ou quand une édition
 * périme la carte. Témoin de RANG SUR UN RANG AUTRE QUE LE PREMIER (CLAUDE.md
 * § Prisme, leçon 261) : ce site gouverne ce que `message:new` ne peut pas
 * couvrir seul.
 *
 * TRI-ÉTAT de `lastMessageId` (doc-comment du type, `packages/shared`) :
 *  - **clé ABSENTE** — cet évènement ne parle pas du dernier message
 *    (renommage, réglage) : RIEN à toucher.
 *  - **`null`** — plus AUCUN message visible pour ce lecteur : la ligne perd
 *    son groupe d'aperçu.
 *  - **présent** — le groupe d'aperçu (`lastMessageAt`,
 *    `lastMessageOriginalLanguage`, `lastMessageTranslations`,
 *    `lastMessagePreview`) est fusionné CHAMP PAR CHAMP, chacun tri-état à
 *    son tour (absent = ne pas toucher, `null` = retirer la clé — jamais
 *    `undefined`, `exactOptionalPropertyTypes`, motif `applyMessageNew`).
 *
 * `lastMessage.content` n'est fusionné que si la ligne connaît DÉJÀ ce
 * message (même `id`) : la charge ne porte pas le corps complet (expéditeur,
 * type, pièces jointes…) et en fabriquer un inventerait des champs qu'elle ne
 * transporte pas (leçon « un instantané qui RECOPIE invente ce que la source
 * ne porte pas ») — un `message:new` déjà reçu ou le prochain
 * `GET …/messages` porte le reste.
 */
export function applyConversationUpdated(queryClient: QueryClient, data: ConversationUpdatedEventData): void {
  if (!('lastMessageId' in data)) return;

  patchConversation(queryClient, data.conversationId, (c) => {
    if (data.lastMessageId === null) {
      const { lastMessage: _m, lastMessageAt: _at, lastMessageTranslations: _tr, lastMessageOriginalLanguage: _lang, ...rest } = c;
      return rest;
    }

    let next: Conversation = c;

    if (data.lastMessageAt !== undefined) {
      if (data.lastMessageAt === null) {
        const { lastMessageAt: _at, ...rest } = next;
        next = rest;
      } else {
        // Chaîne ISO conservée TELLE QUELLE (D-26, « cache = forme du fil ») —
        // `decodeConversation` (le `select`) la revit en `Date`, motif exact de
        // `applyMessageNew` ci-dessus. Cast vers `Date` (jamais
        // `Conversation['lastMessageAt']`, qui inclut `undefined` — une valeur
        // ainsi typée resterait REFUSÉE par `exactOptionalPropertyTypes`).
        next = { ...next, lastMessageAt: data.lastMessageAt as unknown as Date };
      }
    }

    if (data.lastMessageOriginalLanguage !== undefined) {
      if (data.lastMessageOriginalLanguage === null) {
        const { lastMessageOriginalLanguage: _lang, ...rest } = next;
        next = rest;
      } else {
        next = { ...next, lastMessageOriginalLanguage: data.lastMessageOriginalLanguage };
      }
    }

    if (data.lastMessageTranslations !== undefined) {
      if (data.lastMessageTranslations === null || Object.keys(data.lastMessageTranslations).length === 0) {
        const { lastMessageTranslations: _tr, ...rest } = next;
        next = rest;
      } else {
        next = { ...next, lastMessageTranslations: data.lastMessageTranslations };
      }
    }

    if (
      data.lastMessagePreview !== undefined &&
      data.lastMessagePreview !== null &&
      next.lastMessage !== undefined &&
      next.lastMessage.id === data.lastMessageId
    ) {
      next = { ...next, lastMessage: { ...next.lastMessage, content: data.lastMessagePreview } };
    }

    return next;
  });
}

/** Garde de FORME pour `message:translation` (revue-correction #5793,
 * défaut 2) — miroir `decode(APIMessage.self, from:)` iOS : une entrée qui ne
 * décode pas REJETTE tout le tableau plutôt que de fusionner une traduction
 * à moitié formée. */
export function isMessageTranslationEvent(payload: unknown): payload is TranslationEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.messageId !== 'string' || !Array.isArray(p.translations)) return false;
  return p.translations.every((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const t = entry as Record<string, unknown>;
    return (
      typeof t.id === 'string' &&
      typeof t.messageId === 'string' &&
      typeof t.sourceLanguage === 'string' &&
      typeof t.targetLanguage === 'string' &&
      typeof t.translatedContent === 'string' &&
      typeof t.translationModel === 'string' &&
      typeof t.cacheKey === 'string' &&
      typeof t.cached === 'boolean'
    );
  });
}

/**
 * `mergeMessageTranslations` — fusionne les entrées REÇUES dans
 * `message.translations` par `targetLanguage` (remplace l'existante,
 * ajoute la nouvelle) : jamais un doublon de langue après un second passage
 * du pipeline. `TranslationData` (charge socket) et `MessageTranslation`
 * (forme du cache, `MessageTranslation.createdAt: Date` REQUIS) divergent
 * sur un seul champ optionnel (`createdAt?`) — le cast `unknown` est le MÊME
 * motif documenté que `rawMessageFromSocket` ci-dessus (D-26 : le cache
 * tient des dates en CHAÎNES tant que `decodeMessagesPage` ne les a pas
 * revues).
 */
function mergeMessageTranslations(message: Message, incoming: TranslationEvent['translations']): Message {
  const byLanguage = new Map(message.translations.map((t) => [t.targetLanguage, t]));
  for (const t of incoming) byLanguage.set(t.targetLanguage, t as unknown as Message['translations'][number]);
  return { ...message, translations: Array.from(byLanguage.values()) };
}

/**
 * `applyMessageTranslation` — le puits de `message:translation` (défaut
 * MAJEUR 2 de la revue #5793) : le pipeline traduit APRÈS la création
 * (`message:new` porte `translations` VIDE, mesuré sur staging), donc un
 * message reçu reste dans la langue de l'expéditeur jusqu'à CET évènement,
 * dans le fil OUVERT comme sur la Lentille s'il nomme le DERNIER message de
 * sa ligne.
 *
 * La charge (`TranslationEvent`) ne porte PAS `conversationId` : on retrouve
 * la page qui contient ce message en balayant les fils déjà en cache
 * (`['conversations', <id>, 'messages']`) — un message dont le fil n'est
 * jamais ouvert n'a rien à peindre localement, motif `applyMessageNew` §
 * `page === undefined` (le prochain `GET …/messages` sert la traduction).
 */
export function applyMessageTranslation(queryClient: QueryClient, data: TranslationEvent): void {
  const incoming = buildTranslationRecord(data.translations);
  if (Object.keys(incoming).length === 0) return;

  const queries = queryClient.getQueryCache().findAll({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey.length === 3 &&
      query.queryKey[0] === 'conversations' &&
      query.queryKey[2] === 'messages',
  });

  for (const query of queries) {
    const conversationId = query.queryKey[1] as string;
    const page = query.state.data as MessagesPage | undefined;
    if (page === undefined) continue;
    const index = page.messages.findIndex((m) => m.id === data.messageId);
    if (index === -1) continue;

    const merged = mergeMessageTranslations(page.messages[index] as Message, data.translations);
    queryClient.setQueryData<MessagesPage>(query.queryKey as ReturnType<typeof messagesQueryKey>, {
      ...page,
      messages: page.messages.map((m, i) => (i === index ? merged : m)),
    });

    patchConversation(queryClient, conversationId, (c) => {
      if (c.lastMessage?.id !== data.messageId) return c;
      const { lastMessageTranslations: _existing, ...rest } = c;
      return { ...rest, lastMessageTranslations: { ..._existing, ...incoming } };
    });
  }
}
