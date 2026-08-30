'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { apiService } from '@/services/api.service';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';
import { setConversationUnreadInCache } from '@/lib/conversations/unread-cache';
import { applyReadingModePreferenceBroadcast } from '@/lib/conversations/reading-mode-broadcast';
import { refreshMirroredPreferenceCategory } from '@/lib/preferences/mirrored-preference-categories';
import { useReadingModesFlag } from '@/hooks/lentille/use-reading-modes-flag';
import {
  rebuildInfiniteConversationPages,
  type InfiniteConversationData,
} from '@/lib/conversations/infinite-cache';
import { extractPreviewTranslations } from '@/services/conversations/transformers.service';
import type { Message, Conversation } from '@/types';
import type { TranslationEvent } from '@meeshy/shared/types';
import type { SocketIOTranslation } from '@meeshy/shared/types/attachment-audio';
import type { AudioTranslationReadyEventData, ConversationJoinErrorEventData, MessageRestoredForMeEventData, TranscriptionReadyEventData, ConversationUnreadUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { isMembershipDeniedJoinError } from '@meeshy/shared/utils/conversation-join-error';
import type { OptimisticMessage } from '@/utils/optimistic-message';

function isOptimisticMessage(m: Message): m is OptimisticMessage {
  return '_tempId' in m;
}

function editedAtMs(value: Date | string | undefined | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// A `message:edited` socket event carries no monotonic sequence — a delayed
// duplicate delivery or reordered frame can arrive after a newer edit was
// already applied. Comparing `editedAt` against the cached row's stops a
// stale edit from permanently clobbering the current content.
function isStaleEdit(cached: Message, incoming: Message): boolean {
  const cachedMs = editedAtMs(cached.editedAt);
  if (cachedMs === null) return false;
  const incomingMs = editedAtMs(incoming.editedAt);
  if (incomingMs === null) return false;
  return incomingMs < cachedMs;
}

type CachedMessage = Message & {
  translatedAudios?: Record<string, SocketIOTranslation>;
};

// Socket payloads carry timestamps as ISO strings, while everything the REST
// layer puts in the conversation cache went through
// `transformersService.transformConversationData`, which materialises them as
// `Date` — the shape `Conversation` declares. Writing the raw string back into
// a cached conversation left the cache holding both shapes for the same field.
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const CONVERSATION_DATE_FIELDS = new Set([
  'lastMessageAt',
  'createdAt',
  'updatedAt',
  'encryptionEnabledAt',
]);

/**
 * Le groupe d'APERÇU d'un `conversation:updated` : les champs qui, ENSEMBLE,
 * décrivent le message que la ligne de liste doit rendre.
 *
 * Aucun d'eux n'entre tel quel dans le cache — `Conversation` (web) n'en
 * déclare aucun, et aucun lecteur ne les interroge. La ligne rend
 * `conversation.lastMessage`, un OBJET ; c'est `mergeConversationUpdate` qui
 * les consomme pour le composer. Les recopier en plus n'ajouterait qu'un champ
 * fantôme par ligne, à chaque message.
 *
 * `location` y figure au même titre : elle décrit la position du MESSAGE, et la
 * ligne web ne rend aucune épingle — la composer dans le message neutre
 * fabriquerait une donnée que personne ne lit.
 *
 * `lastMessageAt` n'en fait délibérément PAS partie : il décrit le RANG de la
 * conversation dans la liste, `Conversation` le déclare, et le tri le lit.
 * `lastMessageTranslations` / `lastMessageOriginalLanguage` non plus : le
 * gateway les pose au niveau conversation parce que la carte compacte
 * `{ langue: aperçu }` n'a pas la forme de `Message.translations`, et c'est là
 * que `formatLastMessage` va les chercher.
 */
const PREVIEW_GROUP_KEYS = new Set([
  'lastMessageId',
  'lastMessagePreview',
  'senderId',
  'location',
  'previewRecalculated',
]);

/**
 * Turns an untyped `conversation:updated` payload into a patch that matches
 * `Conversation`: date fields are materialised, and an unparseable date is
 * dropped rather than overwriting a valid cached value with garbage.
 *
 * Ne décide RIEN du dernier message : cela demande de savoir lequel la ligne
 * décrit déjà, que seul l'appelant tient. Voir `mergeConversationUpdate`, le
 * point d'entrée du cache.
 *
 * The final assertion is the trust boundary: the event declares an
 * `[key: string]: unknown` index signature (the gateway spreads whichever
 * fields changed), so no narrower type can be inferred from it.
 */
export function normalizeConversationPatch(raw: Record<string, unknown>): Partial<Conversation> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (PREVIEW_GROUP_KEYS.has(key)) continue;
    if (key === 'lastMessageTranslations') {
      // `null` est une VALEUR ici, pas une absence : le serveur périme
      // `Message.translations` dans la même écriture qu'une édition, et c'est ce
      // null reçu qui doit périmer la carte du cache. La clé reste donc
      // présente (le cache applique `{ ...conv, ...patch }` — une clé absente
      // laisserait la carte de l'ANCIEN texte en place, et `formatLastMessage`
      // la préfère à `lastMessagePreview`). Même forme que le chemin REST.
      patch[key] = extractPreviewTranslations(value);
      continue;
    }
    if (key === 'lastMessageOriginalLanguage') {
      patch[key] = typeof value === 'string' ? value : undefined;
      continue;
    }
    if (!CONVERSATION_DATE_FIELDS.has(key)) {
      patch[key] = value;
      continue;
    }
    const asDate = toDate(value);
    if (asDate) patch[key] = asDate;
  }
  return patch as Partial<Conversation>;
}

/**
 * Les champs du `conversation:updated` qui, avec le groupe d'aperçu ci-dessus,
 * décrivent le message de la ligne — et qui, eux, entrent bien dans le cache.
 *
 * Ils sont MONOTONES AVEC lui : quand la garde ci-dessous rejette un aperçu
 * périmé, ces trois-là partent avec, sinon la ligne garderait le rang et la
 * carte du Prisme d'un message dont elle vient de refuser le texte.
 */
const MONOTONE_GROUP_KEYS = new Set([
  'lastMessageAt',
  'lastMessageTranslations',
  'lastMessageOriginalLanguage',
]);

/** L'horodatage du message que la ligne décrit AUJOURD'HUI. */
function rowMessageAt(conversation: Conversation): Date | null {
  return toDate(conversation.lastMessageAt) ?? toDate(conversation.lastMessage?.createdAt);
}

/**
 * Le groupe d'aperçu est MONOTONE : un écrivain qui nomme un message plus
 * ANCIEN que celui de la ligne décrit un état périmé, et l'appliquer fait
 * reculer la ligne — le texte, l'auteur, la carte du Prisme, et le rang, que
 * `sortConversations` lit dans `lastMessageAt`. Le cache tournant en
 * `staleTime: Infinity`, ce recul ne se corrige jamais de lui-même.
 *
 * Le désordre n'est pas théorique : `MessageHandler` diffuse `message:new` dans
 * la room de CONVERSATION, puis `conversation:updated` dans la room USER de
 * chaque participant — avec un `prisma.participant.findMany` AWAITÉ entre les
 * deux. Deux envois concurrents dans le même fil sortent donc leurs
 * `conversation:updated` dans l'ordre de leurs requêtes, pas dans celui de
 * leurs messages. Le chemin `message:new` a sa propre course, plus courante
 * encore : sur une conversation absente du cache, chaque message déclenche un
 * `GET /conversations/:id`, et deux messages rapides dans un DM tout neuf font
 * deux fetches dont le plus ANCIEN peut résoudre en dernier.
 *
 * C'est la règle que `ConversationStore.merging` tient côté iOS depuis le cycle
 * 46 bis, `previewRecalculated` compris — et que le web décodait sans jamais
 * la lire (`PREVIEW_GROUP_KEYS` la laisse tomber). Deuxième moitié de la même
 * loi, sur le client qui ne l'avait pas.
 *
 * L'ÉGALITÉ n'est pas un recul : c'est le même message, donc une édition, et
 * elle s'applique. L'identité prime sur l'horodatage — un écrivain qui nomme le
 * message de la ligne n'est jamais périmé.
 */
function rowDescribesNewerMessage(
  conversation: Conversation,
  incoming: { id?: string; createdAt: unknown }
): boolean {
  if (incoming.id != null && conversation.lastMessage?.id === incoming.id) return false;
  const incomingAt = toDate(incoming.createdAt);
  if (!incomingAt) return false;
  const currentAt = rowMessageAt(conversation);
  if (!currentAt) return false;
  return currentAt.getTime() > incomingAt.getTime();
}

/**
 * Le message qui vient d'ARRIVER, posé sur la ligne de liste — ou la ligne
 * intacte quand elle décrit déjà un message plus récent.
 *
 * Le pendant, pour les trois écrivains temps réel d'une arrivée (`message:new`,
 * `link:message:new`, et le second écouteur de `use-conversations-v2`), de la
 * garde monotone que `mergeConversationUpdate` applique à `conversation:updated`.
 * Sans elle, corriger le seul chemin `conversation:updated` ne corrigeait rien :
 * les deux pendent au même geste — un message envoyé — et le second réécrit ce
 * que le premier vient de refuser.
 *
 * `updatedAt` accompagne `lastMessageAt` chez deux appelants sur trois ; il
 * reste au site d'appel, qui seul sait s'il le pose.
 */
export function withArrivedMessage(params: {
  conversation: Conversation;
  message: Message;
}): Conversation | null {
  const { conversation, message } = params;
  if (rowDescribesNewerMessage(conversation, message)) return null;
  return withPreviewMessage({ conversation, message });
}

/**
 * Ce que le groupe d'aperçu dit du message que la ligne DÉCRIT — ou rien, quand
 * l'événement ne parle pas de lui (un renommage) ou n'en dit pas assez.
 *
 * `undefined` en `lastMessage` est une DÉCISION (« plus aucun message visible »),
 * pas une absence : d'où le drapeau plutôt qu'un simple retour nullable.
 */
type PreviewedLastMessage =
  | { readonly decided: false }
  | { readonly decided: true; readonly lastMessage: Message | undefined };

/**
 * Le message NEUTRE que le seul groupe d'aperçu permet de composer.
 *
 * Ce que le payload ne porte pas — l'expéditeur, les pièces jointes, les
 * drapeaux éphémères — reste vide plutôt que d'être hérité du message
 * précédent : une ligne INCOMPLÈTE, que la prochaine synchro complète, plutôt
 * qu'une ligne FAUSSE, que rien ne corrige. C'est la règle que
 * `LastMessageFacet` tient côté iOS, pour le même défaut.
 */
function neutralLastMessage(
  raw: Record<string, unknown>,
  conversationId: string,
  id: string,
  createdAt: Date
): Message {
  return {
    id,
    conversationId,
    senderId: typeof raw.senderId === 'string' ? raw.senderId : '',
    content: typeof raw.lastMessagePreview === 'string' ? raw.lastMessagePreview : '',
    originalLanguage:
      typeof raw.lastMessageOriginalLanguage === 'string' ? raw.lastMessageOriginalLanguage : '',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt,
    timestamp: createdAt,
  };
}

/**
 * Quel message la ligne doit décrire après ce `conversation:updated`.
 *
 * Trois formes, et une seule d'entre elles était lue jusqu'ici :
 *
 * - **la clé est absente** — l'événement ne parle pas du dernier message (un
 *   renommage, un réglage). Ne rien toucher.
 * - **`lastMessageId: null`** — la clé PRÉSENTE et nulle est la façon dont le
 *   serveur dit « ce lecteur n'a plus AUCUN message visible ici » : il vient de
 *   masquer POUR LUI le dernier qui lui restait. Seul
 *   `emitConversationPreviewUpdate` produit cette forme.
 * - **`lastMessageId` plein** — et c'est là que tout se joue : le payload nomme
 *   soit le message que la ligne décrit DÉJÀ (une édition, une traduction qui
 *   atterrit), soit un AUTRE (masquage personnel, suppression pour tous). Le
 *   premier cas ne rend faux que le texte ; le second rend faux TOUT ce que la
 *   ligne disait.
 *
 * L'identité est la seule chose qui les sépare, et le client peut la lire — ce
 * qu'il ne faisait pas : il appliquait la carte du Prisme du NOUVEAU message
 * sur l'objet de l'ANCIEN, et la ligne servait un mélange des deux.
 */
function previewedLastMessage(
  raw: Record<string, unknown>,
  conversationId: string,
  cached: Message | undefined
): PreviewedLastMessage {
  if (!('lastMessageId' in raw)) return { decided: false };

  const id = raw.lastMessageId;
  if (id === null) return { decided: true, lastMessage: undefined };
  if (typeof id !== 'string' || id.length === 0) return { decided: false };

  if (cached?.id === id) {
    // MÊME message : seul son texte a pu changer. L'expéditeur, les pièces
    // jointes et les drapeaux restent vrais — les jeter serait le défaut
    // symétrique, et il frapperait le chemin le plus fréquenté, celui de
    // l'envoi (`message:new` pose l'objet COMPLET, le `conversation:updated`
    // jumeau arrive juste derrière avec le même id).
    const preview = raw.lastMessagePreview;
    if (typeof preview !== 'string' || preview === cached.content) return { decided: false };
    return { decided: true, lastMessage: { ...cached, content: preview } };
  }

  // AUTRE message. Sans horodatage lisible on ne compose rien : la ligne rend
  // `lastMessage.createdAt`, et une date fabriquée y afficherait « Invalid
  // Date ». Périmée et corrigible vaut mieux qu'affichée cassée — les deux
  // émetteurs portent toujours ce champ avec un id plein.
  const createdAt = toDate(raw.lastMessageAt);
  if (!createdAt) return { decided: false };

  return { decided: true, lastMessage: neutralLastMessage(raw, conversationId, id, createdAt) };
}

/**
 * Applique un `conversation:updated` à la conversation qu'il nomme.
 *
 * Point d'entrée du cache : la moitié du payload qui décrit la CONVERSATION
 * passe par `normalizeConversationPatch`, celle qui décrit son dernier MESSAGE
 * par `previewedLastMessage` — qui, elle, a besoin de savoir quel message la
 * ligne décrit déjà.
 */
export function mergeConversationUpdate(
  conversation: Conversation,
  raw: Record<string, unknown>
): Conversation {
  // La monotonie cède devant `previewRecalculated` : le serveur déclare alors
  // avoir RECALCULÉ l'aperçu depuis sa base, et un tel aperçu recule
  // LÉGITIMEMENT — supprimer pour tous le dernier message fait redescendre la
  // ligne sur le précédent, et masquer pour soi son dernier message visible
  // sert un remplaçant plus ancien par construction. Des deux, seul l'émetteur
  // peut dire lequel est lequel : du contenu, un recul légitime et une
  // diffusion arrivée en retard sont indiscernables.
  const stale =
    raw.previewRecalculated !== true &&
    rowDescribesNewerMessage(conversation, {
      id: typeof raw.lastMessageId === 'string' ? raw.lastMessageId : undefined,
      createdAt: raw.lastMessageAt,
    });

  // Un `conversation:updated` périmé ne l'est que sur son groupe d'aperçu : le
  // reste du payload — un renommage, un réglage — n'a pas d'ordre et s'applique.
  const source = stale
    ? Object.fromEntries(Object.entries(raw).filter(([key]) => !MONOTONE_GROUP_KEYS.has(key)))
    : raw;

  const previewed = stale
    ? ({ decided: false } as const)
    : previewedLastMessage(raw, conversation.id, conversation.lastMessage);
  const merged = { ...conversation, ...normalizeConversationPatch(source) };
  return previewed.decided ? { ...merged, lastMessage: previewed.lastMessage } : merged;
}

/**
 * Installe sur la ligne de liste le message qu'elle doit décrire — et périme,
 * dans la MÊME écriture, la carte du Prisme qui décrivait le précédent.
 *
 * La carte (`lastMessageTranslations` / `lastMessageOriginalLanguage`) vit au
 * niveau CONVERSATION, pas sur le message : le gateway l'y pose parce que sa
 * forme compacte `{ langue: aperçu }` n'est pas celle de `Message.translations`.
 * Elle n'est donc PAS emportée par un `{ ...conv, lastMessage }`, et
 * `formatLastMessage` la PRÉFÈRE à `lastMessage.content` — réécrire l'objet seul
 * laissait la ligne rendre l'auteur et l'horodatage du nouveau message avec le
 * TEXTE de l'ancien. C'est le défaut que le cycle 53 a fermé sur le chemin du
 * fan-out serveur ; ceci le ferme sur les six chemins LOCAUX, dont
 * `link:message:new`, le seul qui n'ait aucun jumeau serveur pour le rattraper.
 *
 * **L'identité décide**, jamais le contenu : quand la ligne décrit déjà ce
 * message, la carte reste vraie et la garder est le no-op qui borne le
 * correctif. Sans lui, le `conversation:updated` jumeau qui suit chaque
 * `message:new` — même id — dépouillerait sa propre ligne du Prisme qu'il vient
 * d'installer, sur le chemin le plus fréquenté du service.
 *
 * `textChanged` est la seule exception, et elle est DÉCLARÉE par l'écrivain :
 * une édition garde le même id tout en remettant `Message.translations` à `null`
 * côté serveur, ce que l'identité ne peut pas révéler.
 *
 * Ne décide ni du rang de la ligne (`lastMessageAt`) ni de sa date de mise à
 * jour : les appelants n'en font pas le même usage.
 *
 * Le sixième appelant vit dans `hooks/v2/use-conversations-v2.ts` — un SECOND
 * écouteur du même `message:new`, écrivant dans le MÊME cache. La règle
 * d'identité n'est sûre que si TOUS les écrivains y passent : sans cela l'ordre
 * des deux écouteurs déciderait du texte affiché. Un témoin de source le
 * verrouille.
 */
export function withPreviewMessage(params: {
  conversation: Conversation;
  message: Message;
  textChanged?: boolean;
}): Conversation {
  const { conversation, message, textChanged = false } = params;

  const stillDescribed = conversation.lastMessage?.id === message.id && !textChanged;
  if (stillDescribed) return { ...conversation, lastMessage: message };

  const originalLanguage =
    typeof message.originalLanguage === 'string' && message.originalLanguage !== ''
      ? message.originalLanguage
      : undefined;

  return {
    ...conversation,
    lastMessage: message,
    lastMessageTranslations: undefined,
    lastMessageOriginalLanguage: originalLanguage,
  };
}

function updateInfiniteConversationCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (conversations: Conversation[]) => Conversation[]
): void {
  queryClient.setQueryData(
    queryKeys.conversations.infinite(),
    (old: InfiniteConversationData | undefined) => {
      if (!old) return old;
      const allConversations = old.pages.flatMap(page => page.conversations);
      const updated = updater(allConversations);
      if (updated === allConversations) return old;
      return rebuildInfiniteConversationPages(old, updated);
    }
  );
}

// After a message is deleted, advance the conversation-list preview to the
// newest remaining message — but only for conversations whose `lastMessage`
// WAS the deleted message. Mirrors the lastMessage-update pattern used by the
// edited-message handler, across both the flat and infinite conversation
// caches.
function advanceConversationPreviewOnDelete(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  deletedMessageId: string,
  replacement: Message
): void {
  const replace = (conv: Conversation): Conversation =>
    conv.id === conversationId && conv.lastMessage?.id === deletedMessageId
      ? {
          ...withPreviewMessage({ conversation: conv, message: replacement }),
          lastMessageAt: replacement.createdAt,
        }
      : conv;

  updateInfiniteConversationCache(queryClient, (convs) => convs.map(replace));
}

interface UseSocketCacheSyncOptions {
  conversationId?: string | null;
  enabled?: boolean;
}

type InfiniteMessagesData = {
  pages: { messages: Message[]; hasMore: boolean; total: number }[];
  pageParams: number[];
};

/**
 * Every cached message list that belongs to `conversationId`.
 *
 * A conversation can be opened by its ObjectId (`/conversations/:id`) OR by its
 * identifier — the home page mounts the global conversation as `"meeshy"` — and
 * the cache key mirrors whichever the screen used. Socket payloads always carry
 * the resolved ObjectId, so keying the write on that alone silently skipped the
 * slug-keyed entry and left the global conversation frozen until a reload.
 * Alias entries are recognised by the `conversationId` their cached messages
 * carry, which is the resolved ObjectId in every case.
 *
 * Every handler that writes into a message list routes through this helper. A
 * direct `setQueryData(queryKeys.messages.infinite(id), …)` reaches the
 * ObjectId-keyed entry only, and with `staleTime: Infinity` the alias copy is
 * never re-read — the home-page bubble stays frozen on pre-event state until a
 * manual refresh. Writing to the exact key it already returns is unchanged
 * behaviour, so the helper is a strict superset, never a narrowing.
 */
/**
 * `attachment:status-updated` action → the attachment field it stamps. An action
 * outside this set is rejected before the name is used as a computed key, which
 * would otherwise write a literal `"undefined"` property onto the attachment.
 */
const CONSUMPTION_FIELD_BY_ACTION: Record<string, string> = {
  listened: 'listenedAt',
  watched: 'watchedAt',
  viewed: 'viewedAt',
  downloaded: 'downloadedAt',
};

function messageCacheKeysFor(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string
): unknown[][] {
  const keys: unknown[][] = [];
  for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.messages.lists() })) {
    const key = query.queryKey as unknown[];
    if (key[2] === conversationId) {
      keys.push(key);
      continue;
    }
    const data = query.state.data as InfiniteMessagesData | undefined;
    const belongsToConversation = data?.pages?.some((page) =>
      page.messages?.some((m) => m.conversationId === conversationId)
    );
    if (belongsToConversation) keys.push(key);
  }
  return keys;
}

/**
 * Le pendant INVALIDANT de `messageCacheKeysFor`.
 *
 * Trois handlers demandaient une relecture serveur en nommant la clé
 * ObjectId — `queryKeys.messages.infinite(<ObjectId>)` — alors que l'écran
 * d'accueil monte la conversation globale sous son SLUG (`"meeshy"`). Sur cet
 * écran, l'invalidation ne visait aucune requête existante : elle ne réparait
 * rien, en silence. Écrire par `messageCacheKeysFor` et invalider par la clé
 * ObjectId, c'est appliquer la résolution d'alias d'un côté et pas de l'autre.
 *
 * DEUX des trois sites y gagnent vraiment — `message:restored-for-me` et
 * `message:pending-delivered`, qui portent sur une liste DÉJÀ peuplée, donc
 * résoluble par le `conversationId` de ses messages. Le troisième, le filet
 * `!landedInCache`, ne peut par construction rien résoudre : son commentaire
 * en place le dit, et c'est la graine de `addMessage` qui ferme ce cas.
 *
 * La clé ObjectId est conservée dans le lot même quand aucune requête ne la
 * porte : c'est elle que montera un écran ouvert par `/conversations/:id`, et
 * marquer une requête encore inexistante est sans effet ni coût.
 */
function invalidateMessageListsFor(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string
): void {
  const aliasKeys = messageCacheKeysFor(queryClient, conversationId);
  const canonicalKey: unknown[] = [...queryKeys.messages.infinite(conversationId)];
  const canonical = JSON.stringify(canonicalKey);
  const targets = aliasKeys.some((key) => JSON.stringify(key) === canonical)
    ? aliasKeys
    : [...aliasKeys, canonicalKey];

  for (const queryKey of targets) {
    queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Une ligne de conversation lue au réseau n'a de valeur que s'il existe une
 * LISTE pour la recevoir : `updateInfiniteConversationCache` sort sur
 * `if (!old) return old;`, donc sans cache de liste le `GET /conversations/:id`
 * est intégralement jeté. Sur un écran qui ne monte aucune liste — la page
 * d'accueil, le fil partagé — cela faisait UNE requête par message reçu, sur la
 * conversation la plus bavarde du produit, pour rien.
 */
function hasConversationListCache(
  queryClient: ReturnType<typeof useQueryClient>
): boolean {
  return queryClient.getQueryData(queryKeys.conversations.infinite()) !== undefined;
}

export function useSocketCacheSync(options: UseSocketCacheSyncOptions = {}) {
  const { conversationId, enabled = true } = options;
  const queryClient = useQueryClient();

  // D-4 / R5-6 — le drapeau qui garde la consommation du broadcast de mode de
  // lecture (`applyReadingModePreferenceBroadcast`, point 3(c) du mandat).
  // Lu en ref : le `useEffect` ci-dessous ne dépend que de
  // `[conversationId, enabled, queryClient]` (inchangé) — la fermeture des
  // écouteurs socket lirait sinon une valeur figée au montage.
  const { active: isReadingModesFlagActive } = useReadingModesFlag();
  const isReadingModesFlagActiveRef = useRef(isReadingModesFlagActive);
  isReadingModesFlagActiveRef.current = isReadingModesFlagActive;

  useEffect(() => {
    if (!enabled) return;

    // Handler for new messages
    const handleNewMessage = (message: Message) => {
      const targetConversationId = message.conversationId;

      // Tracks whether the message actually landed in a cache entry. When the
      // conversation has no cached page yet (initial fetch still in flight, or
      // conversation never opened this session) the updater below bails out and
      // the message would be lost for good: the socket layer already marked its
      // id as "seen" for 5 minutes, so no re-delivery repairs the gap, and with
      // `staleTime: Infinity` nothing re-reads the server either.
      let landedInCache = false;

      // Update every cached message list of this conversation (ObjectId-keyed
      // and identifier-keyed alike).
      const updateMessagesCache = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
          if (!old) return old;
          landedInCache = true;

          // Single-pass: ID dedup + own-message optimistic replacement
          const currentUser = useAuthStore.getState().user;
          const isOwnMessage = currentUser && message.senderId === currentUser.id;
          let optimisticTempId: string | null = null;
          let bestTimeDiff = Infinity;

          for (const page of old.pages) {
            for (const m of page.messages) {
              if (m.id === message.id) return old; // already have this server message

              // Dédup par _serverMessageId : le ACK a stocké le messageId serveur
              // sur le message optimiste (sans changer son id/key React).
              // Quand le broadcast arrive, on remplace atomiquement.
              if (isOwnMessage && (m as any)._serverMessageId === message.id) {
                optimisticTempId = (m as any)._tempId ?? m.id;
                break;
              }

              // Fallback : dédup par timestamp pour tout optimiste NON encore
              // réconcilié (pas de `_serverMessageId`). Couvre le broadcast
              // arrivé AVANT le ACK (status 'sending') ET le cas où le ACK a
              // expiré (status 'failed', voir messaging.service `timedOut`) alors
              // que le serveur a bien persisté puis diffusé le message — typique
              // du replay de la delivery-queue au reconnect, bien après les 10 s.
              // Un broadcast qui matche (même auteur, < 5 s) prouve que l'envoi a
              // réussi : la bulle en échec est réconciliée, jamais dupliquée.
              if (isOwnMessage && isOptimisticMessage(m)) {
                const timeDiff = Math.abs(
                  new Date(message.createdAt).getTime() - new Date(m.createdAt).getTime()
                );
                if (timeDiff < 5000 && timeDiff < bestTimeDiff) {
                  bestTimeDiff = timeDiff;
                  optimisticTempId = m._tempId;
                }
              }
            }
            if (optimisticTempId) break;
          }

          // Replace optimistic if found (prevents duplicate)
          if (optimisticTempId) {
            const targetTempId = optimisticTempId;
            return {
              ...old,
              pages: old.pages.map(page => ({
                ...page,
                messages: page.messages.map(m => {
                  const mTempId = (m as any)._tempId ?? null;
                  const mServerId = (m as any)._serverMessageId ?? null;
                  if (mTempId === targetTempId || mServerId === message.id) {
                    return message;
                  }
                  return m;
                }),
              })),
            };
          }

          return {
            ...old,
            pages: old.pages.map((page, index) =>
              index === 0
                ? { ...page, messages: [message, ...page.messages] }
                : page
            ),
          };
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, updateMessagesCache);
      }

      // No cache entry to write into: mark the query stale so the in-flight
      // fetch is re-issued (and any later mount re-reads) from the server —
      // the only source able to close the gap this message would leave.
      //
      // CE FILET N'ATTEINT PAS UNE ENTRÉE ALIAS, ET NE LE PEUT PAS — à dire
      // explicitement pour que personne ne s'y fie. `landedInCache` reste faux
      // exactement quand AUCUNE liste ne contient de message de cette
      // conversation ; or c'est par ce contenu que `messageCacheKeysFor`
      // reconnaît une entrée clé-ée sur un SLUG. La condition qui déclenche le
      // filet est donc la même que celle qui rend la résolution d'alias
      // impossible. Passer par `invalidateMessageListsFor` n'y change rien : ce
      // n'est ici qu'un site d'invalidation unique.
      //
      // Ce que ce filet couvre : la lecture serveur d'une conversation dont
      // l'écran EST clé-é sur l'ObjectId. Ce qu'il ne couvre pas — le message
      // arrivé pendant la lecture initiale, que le serveur ne connaît pas
      // encore, quelle que soit la clé — est fermé côté écrivain, par la graine
      // de `addMessage` (`use-conversation-messages-rq.ts`).
      if (!landedInCache) {
        invalidateMessageListsFor(queryClient, targetConversationId);
      }

      // Update infinite conversations query (paginated cache used by ConversationList)
      let conversationFoundInCache = false;
      updateInfiniteConversationCache(queryClient, (convs) => {
        const idx = convs.findIndex((conv) => conv.id === targetConversationId);
        if (idx === -1) return convs;
        conversationFoundInCache = true;
        // Garde monotone (`withArrivedMessage`) : la ligne décrit peut-être
        // déjà un message plus RÉCENT que celui-ci, auquel cas ni son aperçu ni
        // son rang ne bougent — remonter la conversation en tête sur un message
        // périmé la trierait à contretemps autant que la ligne mentirait.
        const arrived = withArrivedMessage({ conversation: convs[idx], message });
        if (!arrived) return convs;
        const updated: Conversation = {
          ...arrived,
          lastMessageAt: message.createdAt,
          updatedAt: message.createdAt,
        };
        return [updated, ...convs.filter((_, i) => i !== idx)];
      });

      // First time this client sees the conversation (brand-new DM,
      // group invite the user just got added to, or a record missed
      // by the paginated initial query). Fetch the full row from the
      // API and prepend it so the list surfaces the new chat in real
      // time instead of waiting for the next manual refresh.
      //
      // `hasConversationListCache` : sans liste en cache, la ligne lue n'a
      // nulle part où atterrir (voir le helper). Cette garde est ce qui rend le
      // montage de ce hook sur la page d'accueil et le fil partagé gratuit —
      // sinon chaque message entrant y déclenchait un `GET /conversations/:id`
      // dont la réponse était jetée.
      if (
        !conversationFoundInCache &&
        /^[a-f\d]{24}$/i.test(targetConversationId) &&
        hasConversationListCache(queryClient)
      ) {
        if (typeof window === 'undefined' || window.location.pathname !== '/login') {
          apiService.get<Conversation>(`/conversations/${targetConversationId}`)
            .then((response) => {
              const fetched = response?.data;
              if (!fetched) return;
              updateInfiniteConversationCache(queryClient, (convs) => {
                // Defensive dedup: a concurrent fetch / socket event
                // might have inserted while we were awaiting the API.
                const filtered = convs.filter((c) => c.id !== targetConversationId);
                // La ligne fraîchement lue au serveur porte DÉJÀ son dernier
                // message, et il peut être plus récent que celui-ci : deux
                // messages rapides dans une conversation absente du cache
                // déclenchent DEUX `GET /conversations/:id`, et rien ne garantit
                // que le plus ancien résolve en premier. Estampiller le nôtre
                // par-dessus laissait la ligne décrire le premier message d'un
                // DM tout neuf, pour de bon.
                const arrived = withArrivedMessage({ conversation: fetched, message });
                const enriched: Conversation = arrived
                  ? { ...arrived, lastMessageAt: message.createdAt, updatedAt: message.createdAt }
                  : fetched;
                return [enriched, ...filtered];
              });
            })
            .catch((err: unknown) => {
              console.warn('[SOCKET_SYNC] Failed to fetch missing conversation:', err);
            });
        }
      }

      // DO NOT invalidate here - setQueryData already has the correct lastMessage
      // Invalidating would trigger a re-fetch that could return stale data from backend cache
      // The backend may not have processed the message yet when we re-fetch

      // L'accusé de RÉCEPTION n'est PAS posté ici, et ne l'était plus que par
      // redondance : le `POST /conversations/:id/mark-as-received` qui se
      // trouvait à cet endroit doublait celui de la couche TRANSPORT.
      //
      // La chaîne est fermée : `meeshySocketIOService.onNewMessage` →
      // `orchestrator.onNewMessage` → `messaging.service.messageListeners`. Le
      // MÊME `socket.on(MESSAGE_NEW)` qui sert ces auditeurs appelle
      // `markAsReceivedDebounced(message.conversationId)` juste après les avoir
      // servis — pour tout message d'un tiers, sur TOUTE page, débounce 500 ms
      // par conversation. Aucun message ne peut donc atteindre ce handler sans
      // que l'accusé soit déjà parti : un sur-ensemble strict de la condition
      // qui vivait ici.
      //
      // Le doublon était sans conséquence tant que ce hook n'était monté que
      // par `ConversationLayout`. Il en prend une dès qu'il est monté par
      // `BubbleStreamPage` : UNE requête par message reçu, non débouncée, sur
      // la conversation la plus bavarde du produit.
    };

    // Handler for edited messages
    const handleMessageEdited = (message: Message) => {
      const targetConversationId = message.conversationId;

      const applyEdit = (old: InfiniteMessagesData | undefined): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === message.id && !isStaleEdit(m, message) ? { ...m, ...message } : m
            ),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, applyEdit);
      }

      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.map((conv) =>
          conv.id === targetConversationId &&
          conv.lastMessage?.id === message.id &&
          !isStaleEdit(conv.lastMessage, message)
            ? withPreviewMessage({ conversation: conv, message, textChanged: true })
            : conv
        )
      );
    };

    // Handler for deleted messages.
    //
    // `message:deleted` reaches this hook as a BARE messageId: the gateway sends
    // `{ messageId, conversationId }` but the transport layer
    // (`messaging.service`) forwards only `data.messageId`. The removal used to
    // be scoped to the hook's ACTIVE conversation, which silently ignored a
    // delete in any other one — the socket is joined to every conversation room
    // the user belongs to, and with `staleTime: Infinity` the deleted bubble
    // stayed visible there until an unrelated refetch. Locating the message by
    // id across every cached message list is a strict superset of the active
    // conversation, and it also reaches an identifier-keyed alias entry (the
    // home page mounts the global conversation as "meeshy" while socket
    // payloads carry the resolved ObjectId) — where the previous single-key
    // write, and the `break` in the fallback scan, could only ever clean one of
    // the two copies.
    const handleMessageDeleted = (messageId: string) => {
      // Track the newest remaining message so the conversation-list preview can
      // advance when the deleted message WAS that preview. Without it the list
      // keeps showing the deleted message's content until a full refetch.
      const removeFromCache = (cacheKey: unknown[], owningConversationId: string | undefined) => {
        let newestRemaining: Message | null = null;
        queryClient.setQueryData(
          cacheKey,
          (old: InfiniteMessagesData | undefined) => {
            if (!old) return old;
            const next = {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages
                  .filter((m) => m.id !== messageId)
                  .map((m) =>
                    m.replyToId === messageId
                      ? { ...m, replyToId: undefined, replyTo: undefined }
                      : m
                  ),
              })),
            };
            for (const page of next.pages) {
              for (const m of page.messages) {
                if (
                  !newestRemaining ||
                  new Date(m.createdAt).getTime() > new Date(newestRemaining.createdAt).getTime()
                ) {
                  newestRemaining = m;
                }
              }
            }
            return next;
          }
        );

        // Only advance the preview when a replacement is present in cache.
        // If no message remains cached we cannot tell an empty conversation
        // from one whose older messages simply aren't loaded — leaving the
        // (stale) preview is strictly safer than blanking a non-empty chat.
        if (owningConversationId && newestRemaining) {
          advanceConversationPreviewOnDelete(queryClient, owningConversationId, messageId, newestRemaining);
        }
      };

      for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.messages.lists() })) {
        const data = query.state.data as InfiniteMessagesData | undefined;
        const deleted = data?.pages
          ?.flatMap((page) => page.messages ?? [])
          .find((m) => m.id === messageId);
        if (!deleted) continue;
        // The conversation the preview belongs to comes from the message ITSELF
        // (always the resolved ObjectId, which is what the conversation list is
        // keyed on), never from the query key — that can be an identifier alias
        // no conversation row matches.
        removeFromCache(query.queryKey as unknown[], deleted.conversationId ?? (query.queryKey[2] as string | undefined));
      }
    };

    // Handler for message translations — merges as Translation[] array (not Record).
    //
    // `TranslationEvent` carries only `messageId` (no conversationId), and the
    // socket is joined to EVERY conversation room the user belongs to — so a
    // translation can arrive for a message that lives in a conversation other
    // than the one currently open (e.g. a message received while viewing the
    // list or another chat, whose async translation completes moments later).
    // Scoping the write to the hook's active `conversationId` silently dropped
    // those, leaving the message stranded in its original language until a
    // window refocus / manual refetch (`staleTime: Infinity` never re-reads it)
    // — a direct Prisme Linguistique violation. Route the merge by `messageId`
    // across every cached message list, mirroring `handleMessageDeleted`'s scan.
    const handleTranslation = (data: TranslationEvent) => {
      const applyMerge = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        let changed = false;
        const pages = old.pages.map((page) => {
          let pageChanged = false;
          const messages = page.messages.map((m) => {
            if (m.id !== data.messageId) return m;
            pageChanged = true;

            // Merge translations as array, dedup by targetLanguage
            const existingTranslations = Array.isArray(m.translations) ? [...m.translations] : [];
            for (const t of data.translations) {
              const idx = existingTranslations.findIndex((et) => et.targetLanguage === t.targetLanguage);
              if (idx >= 0) existingTranslations[idx] = t;
              else existingTranslations.push(t);
            }

            return { ...m, translations: existingTranslations };
          });
          if (pageChanged) { changed = true; return { ...page, messages }; }
          return page;
        });
        return changed ? { ...old, pages } : old;
      };

      for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.messages.lists() })) {
        const cached = query.state.data as InfiniteMessagesData | undefined;
        if (!cached?.pages?.some((page) => page.messages?.some((m) => m.id === data.messageId))) continue;
        queryClient.setQueryData(query.queryKey, applyMerge);
      }
    };

    // Handler for unread count updates — applies to ALL conversation list variants (filtered, unfiltered)
    const handleUnreadUpdated = (data: ConversationUnreadUpdatedEventData) => {
      // Garde de conversation OUVERTE (miroir du gate iOS
      // `ConversationSyncEngine.handleUnreadUpdated`) : le gateway émet le
      // compteur à TOUS les destinataires, y compris celui qui regarde la
      // conversation. Sans clamp, le badge s'allume sur la conversation en
      // cours de lecture entre l'arrivée du message et l'aller-retour
      // mark-as-read (et indéfiniment si l'utilisateur est scrollé dans
      // l'historique). Un message postérieur à la fermeture ré-allumera le
      // badge normalement : la garde ne s'applique qu'à la conversation active.
      const activeConversationId = useNotificationStore.getState().activeConversationId;
      const effectiveUnread =
        data.conversationId === activeConversationId ? 0 : data.unreadCount;

      // Le pont ✦ voyage sur CE même événement (G-123,
      // `ConversationUnreadUpdatedEventData.bridge`). TROIS ÉTATS depuis le
      // cycle 63, et c'est la PRÉSENCE DE LA CLÉ qui les sépare — pas sa
      // valeur :
      //
      //   objet   → le serveur annonce un pont neuf : on remplace
      //   `null`  → le serveur a calculé, il n'y en a pas : on efface
      //   absent  → le serveur n'a PAS calculé : on ne touche à rien
      //
      // REV-5/B1 recopiait `data.bridge` inconditionnellement, `undefined`
      // compris, en revendiquant qu'« un pont ABSENT du payload wire DOIT
      // effacer un pont déjà en cache ». C'était vrai du seul émetteur qu'on
      // avait en tête — le fan-out d'envoi, qui calcule toujours — et faux des
      // trois autres : l'instantané de reconnexion effaçait ainsi le pont de
      // TOUTES les lignes à chaque retour de réseau (cycle 62).
      //
      // `in` plutôt qu'un test de valeur : `undefined` et l'absence sont
      // indiscernables à la lecture d'une propriété, et c'est exactement la
      // distinction à tenir. `null` est traduit en `undefined` au passage —
      // le cache ne stocke que « pont ou rien », le troisième état est une
      // grammaire de FIL, jamais un état de cache.
      //
      // La garde de conversation OUVERTE ci-dessus ne s'applique QU'AU
      // compteur, comme côté iOS : le rang ne rend jamais un pont sans non-lus
      // (`LentilleRow.hasBridge`).
      const bridgeAnnounced = 'bridge' in data;
      setConversationUnreadInCache(
        queryClient,
        data.conversationId,
        effectiveUnread,
        bridgeAnnounced ? { bridge: data.bridge ?? undefined } : undefined
      );
    };

    const handleParticipantRoleUpdated = (data: { conversationId: string; userId: string; newRole: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // W6: Handler for transcription results (`audio:transcription-ready`, stage 1
    // of the audio pipeline) — writes the transcription onto the attachment it
    // belongs to.
    //
    // Routed by the event's OWN `conversationId`, like `handleAudioTranslation`
    // and `handleTranslation`: the socket is joined to every conversation room
    // the user belongs to, so a voice note transcribed while they read another
    // chat — or read none at all (`ConversationLayout` passes
    // `effectiveSelectedId`, which is null on the conversation-list view) —
    // belongs to a cache entry that is not the hook's active conversation.
    // Writing to the active key dropped it silently, and `staleTime: Infinity`
    // never re-reads it: the bubble stayed untranscribed until a manual
    // refresh. Same Prisme Linguistique gap the two sibling handlers close, on
    // the one pipeline stage that had been left behind.
    //
    // `messageCacheKeysFor` (rather than a single `messages.infinite(id)` write)
    // also reaches an identifier-keyed alias entry — the home page mounts the
    // global conversation as "meeshy" while socket payloads carry the resolved
    // ObjectId.
    //
    // The attachment is picked by `data.attachmentId`, not by "first audio
    // attachment": a message can carry several voice notes, each transcribed by
    // its own event, and first-match stamped every one of them onto the first
    // note while the others stayed permanently untranscribed. The mimeType scan
    // remains only as the fallback for a payload that carries no attachmentId —
    // a named-but-unknown attachment is left alone, since mis-attributing a
    // transcription is worse than not showing it yet.
    const handleTranscription = (data: TranscriptionReadyEventData) => {
      const targetConversationId = data.conversationId ?? conversationId;
      if (!targetConversationId) return;

      const language = data.transcription?.language;

      const applyTranscription = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id !== data.messageId) return m;
              const attachments = Array.isArray(m.attachments) ? [...m.attachments] : [];
              const targetIdx = data.attachmentId
                ? attachments.findIndex((a) => a.id === data.attachmentId)
                : attachments.findIndex((a) => a.mimeType?.startsWith('audio/'));
              if (targetIdx >= 0) {
                attachments[targetIdx] = {
                  ...attachments[targetIdx],
                  transcription: data.transcription,
                  transcriptionLanguage: language,
                };
              }
              return { ...m, attachments, transcription: data.transcription, transcriptionLanguage: language };
            }),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, applyTranscription);
      }
    };

    // W6: Handler for audio translation ready — updates attachment with translated audio URL.
    //
    // The event carries its own `conversationId`, and the socket receives audio
    // translations for every joined conversation room — so route by
    // `data.conversationId` rather than the hook's active conversation, or an
    // audio translation completing for a background conversation is dropped
    // (same Prisme gap as `handleTranslation`).
    const handleAudioTranslation = (data: AudioTranslationReadyEventData) => {
      const targetConversationId = data.conversationId ?? conversationId;
      if (!targetConversationId) return;

      const targetLang = data.translatedAudio.targetLanguage;
      const applyAudioTranslation = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id !== data.messageId) return m;
              // Store translated audio metadata keyed by target language
              const translatedAudios = { ...((m as CachedMessage).translatedAudios || {}) };
              translatedAudios[targetLang] = data.translatedAudio as unknown as SocketIOTranslation;
              return { ...m, translatedAudios };
            }),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, applyAudioTranslation);
      }
    };

    // `conversation:joined` n'est PAS une adhésion : le gateway l'émet aussi —
    // même nom, même payload — comme l'ack self-only d'un socket qui REJOINT LA
    // ROOM (`ConversationHandler`), c'est-à-dire à CHAQUE ouverture de fil.
    // L'incrémentation qui vivait ici gonflait donc l'effectif de la ligne de
    // liste d'une unité par ouverture, indéfiniment. L'adhésion réelle passe
    // par `conversation:participant-joined` ci-dessous ; il ne reste ici que
    // l'invalidation, légitime dans les deux lectures.
    const handleConversationJoined = (data: { conversationId: string; userId: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Réécrit l'effectif d'UNE conversation dans les deux formes de cache de
    // liste, et invalide le roster paginé. Quatre handlers d'appartenance en
    // faisaient chacun une copie ; seul `resolve` les distingue.
    //
    // `resolve` reçoit l'effectif en cache et rend le nouveau. Les événements
    // du gateway portent désormais un `memberCount` ABSOLU : c'est lui qu'il
    // faut POSER. Le delta n'est plus qu'un repli pour un serveur antérieur au
    // contrat, et il ne converge pas — un événement manqué (hors ligne, trou de
    // reconnexion) laisse une dérive définitive dans un cache dont le
    // `staleTime: Infinity` interdit la relecture spontanée.
    const applyMemberCount = (
      conversationId: string,
      data: { memberCount?: number; memberCountCapped?: boolean },
      fallback: (current: number) => number
    ) => {
      const updater = (convs: Conversation[]) =>
        convs.map((conv) => {
          if (conv.id !== conversationId) return conv;
          if (typeof data.memberCount === 'number') {
            // L'effectif du serveur arrive avec son drapeau de cap 199+ : les
            // deux se POSENT ensemble — un drapeau absent dit « exact ».
            return { ...conv, memberCount: data.memberCount, memberCountCapped: data.memberCountCapped === true };
          }
          // Repli delta (serveur antérieur au contrat). Un compteur plafonné à
          // « 199+ » décrit un effectif AU-DELÀ du seuil : un ±1 ne peut pas le
          // faire bouger sans mentir — le vrai compte est inconnu du client.
          if (conv.memberCountCapped) return conv;
          return { ...conv, memberCount: fallback(conv.memberCount ?? 0) };
        });
      updateInfiniteConversationCache(queryClient, updater);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(conversationId),
      });
    };

    // Handler for participant joined — the symmetric counterpart of
    // `handleConversationParticipantLeft`, and the only unambiguous carrier of
    // an actual membership gain. The gateway leaves the new member OUT of this
    // fan-out: their own list gets the conversation from `conversation:new`,
    // whose member count already includes them.
    const handleConversationParticipantJoined = (data: { conversationId: string; userId: string; displayName: string; joinedAt: string; memberCount?: number; memberCountCapped?: boolean }) => {
      applyMemberCount(data.conversationId, data, (current) => current + 1);
    };

    // Le pendant EXACT de `conversation:joined` ci-dessus, et le même piège :
    // `conversation:left` n'a qu'un seul émetteur, `socket.emit` après
    // `socket.leave(room)` (`ConversationHandler.handleConversationLeave`). Il
    // dit « ce socket a quitté la ROOM » — ce que produit la fermeture d'un
    // fil — jamais « quelqu'un a quitté la conversation ». La décrémentation
    // qui vivait ici retirait donc un membre à chaque fermeture de fil.
    //
    // Les deux erreurs se compensaient EN PARTIE, ce qui les cachait, mais
    // jamais exactement : une reconnexion socket rejoint la room sans avoir
    // émis de `leave`, et l'appli fermée ne l'émet pas non plus, tandis que la
    // soustraction était bornée à 0 et l'addition ne l'était pas. Le départ
    // réel passe par `conversation:participant-left`.
    const handleConversationLeft = (data: { conversationId: string; userId: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Retire la conversation de la liste ET son détail. Le geste de « cette
    // conversation n'est plus la mienne », quelle que soit la manière dont
    // l'appartenance s'est arrêtée : suppression pour moi, départ, retrait par
    // un admin, bannissement. Les quatre sont déjà unifiées côté serveur — le
    // delta `updatedSince=` les rend dans un seul champ `deletedConversationIds`
    // (`delta-tombstones.ts`) — et seul le chemin TEMPS RÉEL les traitait
    // différemment.
    const dropConversationFromCache = (conversationId: string) => {
      if (!conversationId) return;
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.filter((c) => c.id !== conversationId)
      );
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
    };

    // Le geste INVERSE, et la même phrase par l'autre bout : « cette
    // conversation est (re)devenue mienne ». Une seule LECTURE BORNÉE
    // (`GET /conversations/:id`), jamais un rejeu de pages — la route de liste
    // pagine par OFFSET sur un tri `lastMessageAt` décroissant, et la rejouer
    // duplique une ligne à chaque frontière en en perdant une autre.
    //
    // Idempotent par construction : une ligne déjà en cache sort avant la
    // requête, et le second test à la résolution ferme la fenêtre où un
    // `conversation:new` et une levée de bannissement nommeraient la même
    // conversation à quelques millisecondes d'écart.
    //
    // Deux entrées y mènent — `conversation:new` et la levée d'un bannissement
    // qui me réintègre. Elles diffèrent par ce qu'elles savent, pas par ce
    // qu'elles ont à faire.
    const fetchConversationIntoCache = (conversationId: string) => {
      if (!conversationId || !/^[a-f\d]{24}$/i.test(conversationId)) return;
      if (typeof window === 'undefined' || window.location.pathname === '/login') return;
      if (!hasConversationListCache(queryClient)) return;

      let alreadyInCache = false;
      updateInfiniteConversationCache(queryClient, (convs) => {
        if (convs.some((c) => c.id === conversationId)) {
          alreadyInCache = true;
        }
        return convs;
      });
      if (alreadyInCache) return;

      apiService.get<Conversation>(`/conversations/${conversationId}`)
        .then((response) => {
          const fetched = response?.data;
          if (!fetched) return;
          updateInfiniteConversationCache(queryClient, (convs) => {
            if (convs.some((c) => c.id === conversationId)) return convs;
            return [fetched, ...convs];
          });
        })
        .catch(() => {
          // DERNIER RECOURS, délibérément conservé. C'est la seule des quatre
          // invalidations de ce préfixe qui reste, et la seule qui se justifie :
          // la lecture BORNÉE d'une ligne vient d'échouer, et sans elle la
          // conversation n'apparaît pas du tout. Rejouer les pages coûte cher et
          // peut dupliquer une frontière — mais une ligne manquante à vie coûte
          // plus. Ce chemin ne s'ouvre que sur un échec réseau, jamais sur le
          // cours normal des choses.
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
        });
    };

    // Handler for participant-left (room broadcast) — another member was removed/left
    //
    // Sauf quand ce membre est MOI : l'événement ne dit alors pas « l'effectif
    // a changé », il dit « cette conversation n'est plus la mienne ». Le cas
    // n'a rien d'exotique — quitter depuis un autre appareil, ou se faire
    // retirer par un admin — et le serveur adresse désormais la room
    // personnelle du partant justement pour qu'il arrive (`leave.ts`,
    // `participants.ts`). Décrémenter un compteur sur une ligne que
    // `GET /conversations` ne sert plus la laissait cliquable pour de bon :
    // `staleTime: Infinity` ne relit jamais de lui-même, et le seul rattrapage
    // était le tombstone du prochain delta.
    /**
     * L'événement nomme-t-il le lecteur ?
     *
     * Une identité porte un `User.id` pour un compte inscrit et un
     * `Participant.id` pour un visiteur venu par un lien partagé — qui n'a
     * aucune ligne `User`, donc dont le `userId` vaut `null` sur le fil.
     * `participantId` est la seule identité toujours servie.
     */
    const namesMe = (data: { userId?: string | null; participantId?: string }) => {
      const me = useAuthStore.getState().user?.id;
      if (!me) return false;
      return me === data.userId || me === data.participantId;
    };

    const handleConversationParticipantLeft = (data: { conversationId: string; userId: string | null; participantId?: string; displayName: string; leftAt: string; memberCount?: number; memberCountCapped?: boolean }) => {
      // `namesMe` et non `userId === me` : une identité porte un `User.id` pour
      // un compte, un `Participant.id` pour un visiteur venu par un lien
      // partagé, dont le `userId` vaut `null`. L'événement nomme les deux faces ;
      // ne comparer qu'à l'une rate systématiquement l'autre.
      if (namesMe(data)) {
        dropConversationFromCache(data.conversationId);
        return;
      }
      applyMemberCount(data.conversationId, data, (current) => Math.max(0, current - 1));
    };

    // Handler for participant-banned — member was banned from the conversation.
    // `membershipEnded: false` means the target had ALREADY left: banning an
    // ex-member is what keeps them from walking back in through a share link,
    // but it removes no membership, so the count must not move. Absent on
    // servers older than that contract, where a ban always removed one.
    const handleConversationParticipantBanned = (data: { conversationId: string; userId: string | null; participantId?: string; bannedBy: { id: string }; bannedAt: string; membershipEnded?: boolean; memberCount?: number; memberCountCapped?: boolean; closedShareLinkId?: string }) => {
      // Être banni est la troisième fin d'appartenance, et elle se traite comme
      // les deux autres. Le test d'identité passe AVANT le court-circuit
      // `membershipEnded === false` : celui-ci protège un COMPTEUR, or il n'y a
      // pas de compteur à protéger sur une ligne qui s'en va. Un ban qui suit
      // un départ non synchronisé porte précisément ce drapeau, et c'est le cas
      // où la ligne fantôme est encore là.
      if (namesMe(data)) {
        dropConversationFromCache(data.conversationId);
        return;
      }
      // L'effectif absolu tranche `membershipEnded` de lui-même — bannir un
      // ex-membre ne retire personne, donc le compte est simplement inchangé.
      // Le court-circuit ne subsiste que pour les serveurs qui ne l'envoient pas.
      if (typeof data.memberCount !== 'number' && data.membershipEnded === false) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.participants(data.conversationId),
        });
        return;
      }
      applyMemberCount(data.conversationId, data, (current) => Math.max(0, current - 1));
    };

    // Handler for participant-unbanned — member was unbanned and is an active
    // member again. Pose l'effectif du serveur, et à défaut incrémente comme
    // l'exact inverse du décrément de bannissement : sans cela, chaque
    // aller-retour ban/unban laissait le cache un cran sous la réalité, et la
    // dérive tenait jusqu'à un refetch complet sans rapport (`staleTime:
    // Infinity` ne relit jamais de lui-même).
    //
    // `membershipRestored: false` means the unban lifted the ban WITHOUT
    // re-admitting anyone — the person had left on their own before being
    // banned, so there is no ban-time decrement to undo here either.
    const handleConversationParticipantUnbanned = (data: { conversationId: string; userId: string; membershipRestored?: boolean; memberCount?: number; memberCountCapped?: boolean }) => {
      // La levée qui RESTAURE l'appartenance est l'inverse exact du
      // bannissement, et le bannissement de MOI ne touche pas un compteur : il
      // retire la LIGNE (`handleConversationParticipantBanned` ci-dessus). Le
      // pendant devait donc la remettre, et ne le faisait pas — `applyMemberCount`
      // mappait sur une liste où la conversation n'était plus, un no-op muet.
      //
      // Rien d'autre ne rattrapait la ligne : le delta `updatedSince=` est
      // upsert-only sur `Conversation.updatedAt`, que la levée ne touche pas
      // (elle écrit une ligne `Participant`), et `staleTime: Infinity` ne relit
      // jamais de lui-même. La conversation restait invisible jusqu'à la
      // réconciliation complète, bornée et rare — réintégré côté serveur,
      // rejoint à la room, recevant les messages, sans ligne où les lire.
      //
      // Le gateway adresse pourtant bien l'événement à ma room personnelle : dès
      // l'appartenance restaurée je figure dans les participants actifs qu'il
      // énumère, et son commentaire dit en toutes lettres que c'est ainsi que la
      // cible « apprend son retour sur sa propre ligne de liste »
      // (`routes/conversations/ban.ts`, chemin `unban`). L'émetteur tenait sa
      // part.
      //
      // `membershipRestored === false` dit que la levée n'a réadmis personne —
      // j'étais parti de moi-même avant d'être banni : aucune ligne à remettre.
      // Un serveur antérieur au champ ne l'envoie pas, et une levée y restaurait
      // TOUJOURS l'appartenance : l'absence se lit donc comme un retour, d'où
      // `!== false` et jamais `=== true`. Même lecture que le bannissement, qui
      // traite `membershipEnded` absent comme un retrait.
      //
      // Pas de `return` : la relecture est bornée et ASYNCHRONE, et l'effectif
      // comme l'invalidation du roster ci-dessous restent utiles — la première
      // no-ope sur une ligne absente, la seconde vaut dans les deux cas.
      if (data.userId === useAuthStore.getState().user?.id && data.membershipRestored !== false) {
        fetchConversationIntoCache(data.conversationId);
      }
      if (typeof data.memberCount !== 'number' && data.membershipRestored === false) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.participants(data.conversationId),
        });
        return;
      }
      applyMemberCount(data.conversationId, data, (current) => current + 1);
    };

    // Handler for conversation:closed — conversation permanently closed by admin
    const handleConversationClosed = (data: { conversationId: string; closedBy: string; closedAt: string }) => {
      const { conversationId: closedId } = data;
      if (!closedId) return;
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.filter((c) => c.id !== closedId)
      );
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(closedId) });
    };

    // Handler for message:restored-for-me — un message que j'avais masqué pour
    // moi est revenu en vue depuis un autre de mes appareils.
    //
    // Aucune donnée à fusionner : le masquage a RETIRÉ la bulle des caches, et
    // l'événement ne porte que l'adresse. Une apparition ne peut pas s'écrire
    // comme une tombstone inversée — il faut aller rechercher. On invalide donc
    // les FILS des conversations nommées, jamais tout le cache.
    //
    // La LIGNE DE LISTE, en revanche, n'a rien à demander ici. Le serveur l'a
    // déjà envoyée : `restoreMessageForUser` (gateway) appelle
    // `refreshPersonalConversationPreview`, qui émet un `conversation:updated`
    // portant l'aperçu PERSONNEL recalculé — le dernier message encore visible
    // POUR CE LECTEUR, filtré à son prisme, que seul le serveur connaît (il peut
    // être hors de la page chargée, ou masqué lui aussi) et borné à sa seule
    // audience (`onlyForReaderUserId`). `handleConversationUpdated` le fusionne
    // sans remplacer la page.
    //
    // L'invalidation qui se trouvait ici était donc PUREMENT redondante — et
    // destructrice : `queryKeys.conversations.all` est un PRÉFIXE de
    // `conversations.infinite()`, dont elle rejouait toutes les pages chargées.
    // Elle courait de surcroît contre la diffusion qu'elle doublait, sur une
    // route lourde, pour un résultat que la socket apportait déjà mieux.
    const handleMessagesRestoredForMe = (data: MessageRestoredForMeEventData) => {
      const affected = new Set((data?.messages ?? []).map((m) => m.conversationId).filter(Boolean));
      if (affected.size === 0) return;
      for (const convId of affected) {
        invalidateMessageListsFor(queryClient, convId);
      }
    };

    // Handler for category CRUD events — invalidate categories cache so sidebar reflects cross-device changes
    // Les quatre événements de catégorie, et ce que la liste en lit VRAIMENT.
    //
    // `queryKeys.preferences.categories()` n'a aucun observateur en production
    // (`useCategoriesQuery` n'est importé que par ses propres tests) : la
    // `ConversationList` lit ses catégories dans le store Zustand, via
    // `useConversationPreferences` → `useConversationCategories`. Invalider une
    // requête que personne ne monte ne déclenche aucun refetch et ne change rien
    // à l'écran — la liste des catégories restait donc figée sur l'unique
    // chargement d'`initialize()`, tant que l'onglet vivait. L'invalidation est
    // conservée : elle reste juste, et un futur lecteur React Query en
    // hériterait ; c'est le rafraîchissement du store qui manquait.
    const handleCategoryChanged = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences.categories() });
      // `void` DÉTACHE la promesse : le `.catch` est la seule garde qui reste,
      // et il appartient au site d'appel — que le collaborateur avale ou non ses
      // propres pannes est sa propriété, pas une garantie d'ici.
      void useConversationPreferencesStore
        .getState()
        .refreshCategories()
        .catch(() => undefined);
    };

    // Handler for message:pending-delivered — la file hors-ligne vient d'être
    // vidée au reconnect.
    //
    // Le gateway rejoue d'abord CHAQUE entrée de file comme son propre événement
    // (`_drainedEmissions`), PUIS annonce ce compte. Tout ce que ces rejeux
    // portent est donc déjà fusionné quand ce handler s'exécute :
    // `handleNewMessage` a écrit l'aperçu, le rang et la promotion en tête de la
    // ligne de liste — sans remplacer la page, et son commentaire l'écrit en
    // capitales (« DO NOT invalidate here »).
    //
    // Ce handler faisait exactement l'inverse, à vingt lignes de là et sur un
    // préfixe PLUS LARGE : `queryKeys.conversations.all` (`['conversations']`)
    // atteint `conversations.infinite()` (`['conversations','infinite']`), dont
    // il rejouait TOUTES les pages chargées en remplaçant le cache — effaçant
    // les écritures que le handler précédent venait de poser, et dupliquant une
    // ligne à chaque frontière de page (la route pagine par OFFSET sur un tri
    // `lastMessageAt` décroissant).
    //
    // Restait la PASTILLE, seule chose que la file ne rejoue pas — et ce handler
    // la lisait au réseau : N `GET /conversations/:id` PLAFONNÉS à 10, au-delà
    // desquels les compteurs étaient explicitement abandonnés, sur le lien le
    // plus contraint qui existe (un mobile qui vient de revenir).
    //
    // Ce n'était pas nécessaire, et ça ne l'a jamais été. Le gateway pousse le
    // compteur sur le MÊME chemin de connexion, par `_emitUnreadCountsSnapshot`
    // → `conversation:unread-updated`, pour TOUTES les conversations du lecteur
    // et sans plafond — donc un SUR-ENSEMBLE de ce que cette lecture couvrait.
    // Son unique angle mort était l'invité de lien partagé, que sa résolution de
    // participant ne savait pas retrouver ; c'est corrigé côté serveur, où le
    // trou était.
    //
    // `handleUnreadUpdated` porte déjà la garde de conversation OUVERTE que la
    // lecture REST devait dupliquer : router la pastille par l'événement, c'est
    // aussi ramener cette garde à UN seul site.
    const handlePendingMessagesDelivered = (data: { count: number; conversationIds: string[] }) => {
      const affected = data?.conversationIds ?? [];
      // Repli sur la conversation active pour les serveurs anciens, qui
      // n'envoyaient pas `conversationIds`.
      const targets = affected.length > 0 ? affected : conversationId ? [conversationId] : [];
      for (const convId of targets) {
        invalidateMessageListsFor(queryClient, convId);
      }
    };

    // Handler for message:attachment-updated — async enrichment (transcription/translation) completed for an attachment
    const handleMessageAttachmentUpdated = (data: { conversationId: string; messageId: string; attachment: unknown }) => {
      const { conversationId: attachConvId, messageId: attachMsgId, attachment } = data;
      if (!attachConvId || !attachMsgId || !attachment) return;
      const attachId = (attachment as { id?: string }).id;
      const applyAttachment = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id !== attachMsgId) return m;
              const attachments = Array.isArray((m as any).attachments)
                ? (m as any).attachments.map((a: { id?: string }) =>
                    attachId && a.id === attachId ? { ...a, ...attachment as object } : a
                  )
                : (m as any).attachments;
              return { ...m, attachments };
            }),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, attachConvId)) {
        queryClient.setQueryData(key, applyAttachment);
      }
    };

    // Handler for message:pinned — update message in cache with pin metadata
    const handleMessagePinned = (data: { messageId: string; conversationId: string; pinnedBy: string; pinnedAt: string }) => {
      const { conversationId: pinnedConvId, messageId: pinnedMsgId, pinnedBy, pinnedAt } = data;
      if (!pinnedConvId || !pinnedMsgId) return;
      const applyPin = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === pinnedMsgId
                ? ({ ...m, pinnedBy, pinnedAt } as Message & { pinnedBy: string; pinnedAt: string })
                : m
            ),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, pinnedConvId)) {
        queryClient.setQueryData(key, applyPin);
      }
    };

    // Handler for message:unpinned — clear pin metadata from message in cache
    const handleMessageUnpinned = (data: { messageId: string; conversationId: string }) => {
      const { conversationId: unpinnedConvId, messageId: unpinnedMsgId } = data;
      if (!unpinnedConvId || !unpinnedMsgId) return;
      const clearPin = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id !== unpinnedMsgId) return m;
              const { pinnedBy: _pb, pinnedAt: _pa, ...rest } = m as Message & { pinnedBy?: string; pinnedAt?: string };
              return rest as Message;
            }),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, unpinnedConvId)) {
        queryClient.setQueryData(key, clearPin);
      }
    };

    // Handler for link:message:new — a link preview message arrived; append to messages + bump conversation
    const handleLinkMessageNew = (data: { message: Record<string, unknown> }) => {
      const linkMsg = data.message;
      const linkConvId = linkMsg.conversationId as string | undefined;
      if (!linkConvId) return;
      const linkMsgId = linkMsg.id as string | undefined;

      // Même repli que `handleNewMessage` : sans entrée de cache (fetch initial
      // en vol, conversation jamais ouverte de la session), l'updater sort sur
      // `if (!old) return old` et le message est perdu pour de bon — `staleTime:
      // Infinity` ne relit jamais, et le serveur ne rediffuse pas.
      let landedInCache = false;

      const prependLinkMessage = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        landedInCache = true;
        if (linkMsgId && old.pages.some((p) => p.messages.some((m) => m.id === linkMsgId))) return old;
        return {
          ...old,
          pages: old.pages.map((page, i) =>
            i === 0 ? { ...page, messages: [linkMsg as unknown as Message, ...page.messages] } : page
          ),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, linkConvId)) {
        queryClient.setQueryData(key, prependLinkMessage);
      }

      if (!landedInCache) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.infinite(linkConvId),
        });
      }

      const linkLastMessage = linkMsg as unknown as Message;
      const linkLastMessageAt = toDate(linkMsg.createdAt) ?? new Date();

      updateInfiniteConversationCache(queryClient, (convs) => {
        const idx = convs.findIndex((c) => c.id === linkConvId);
        if (idx === -1) return convs;
        // Même garde monotone que `handleNewMessage` : ce chemin est le seul
        // sans jumeau `conversation:updated` côté serveur, donc le seul dont
        // un recul ne serait jamais recorrigé par un fan-out ultérieur.
        const arrivedLink = withArrivedMessage({ conversation: convs[idx], message: linkLastMessage });
        if (!arrivedLink) return convs;
        // Le seul des cinq écrivains sans jumeau serveur : `broadcastLinkMessage`
        // n'émet PAS de `conversation:updated`, délibérément, parce que « le
        // handler web applique déjà l'aperçu depuis cet événement ». Vrai de
        // l'objet, faux de la carte du Prisme — d'où une ligne durablement
        // fausse sur les conversations de lien partagé, que rien ne repassait
        // corriger.
        const updated: Conversation = {
          ...arrivedLink,
          lastMessageAt: linkLastMessageAt,
        };
        return [updated, ...convs.filter((_, i) => i !== idx)];
      });
    };

    // `conversation:join-error` — le serveur a refusé la jonction. Le motif
    // DÉCIDE : sur les sept qu'émet `ConversationHandler`, trois seulement
    // établissent la non-appartenance (`not_a_member`, `banned`,
    // `no_longer_member`) et autorisent à purger. Les quatre autres sont
    // transitoires — limite de débit (30 jonctions/min, qu'une tempête de
    // reconnexion franchit en rejoignant toutes les rooms d'un coup), erreur
    // serveur, authentification pas encore prête, requête malformée — et n'ont
    // RIEN à dire de l'appartenance.
    //
    // Ce gestionnaire les traitait tous pareil : la conversation disparaissait
    // de la liste et tout son historique en cache était jeté sur un incident
    // passager, alors que ce cache est précisément ce qui fait tenir la lecture
    // hors ligne. La règle est partagée (`isMembershipDeniedJoinError`) — le
    // consommateur iOS applique la même.
    //
    // Le CustomEvent, lui, part dans TOUS les cas : l'UI doit pouvoir dire
    // « réessaie » sur un transitoire. Seule la PURGE est conditionnelle.
    const handleConversationJoinError = (data: ConversationJoinErrorEventData) => {
      const { conversationId: rejectedId, reason } = data;
      if (!rejectedId) return;
      if (isMembershipDeniedJoinError(reason)) {
        updateInfiniteConversationCache(queryClient, (convs) => convs.filter((c) => c.id !== rejectedId));
        queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(rejectedId) });
        queryClient.removeQueries({ queryKey: queryKeys.messages.infinite(rejectedId) });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('meeshy:conversation-join-error', { detail: { conversationId: rejectedId, reason } }));
      }
    };

    // Handler for attachment status updated (listened, watched, viewed, downloaded)
    const handleAttachmentStatusUpdated = (data: { attachmentId: string; messageId: string; conversationId: string; userId: string; action: string }) => {
      const targetConversationId = data.conversationId;
      if (!targetConversationId) return;

      const field = CONSUMPTION_FIELD_BY_ACTION[data.action];
      if (!field) return;

      // Stamped once, outside the updater: the same event now writes to every
      // cache entry of the conversation, and a per-entry `new Date()` would give
      // the same consumption two different timestamps depending on which key the
      // screen happens to read.
      const consumedAt = new Date().toISOString();

      const applyConsumption = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id !== data.messageId) return m;
              const attachments = Array.isArray(m.attachments)
                ? m.attachments.map((a: any) =>
                    a.id === data.attachmentId ? { ...a, [field]: consumedAt } : a
                  )
                : m.attachments;
              return { ...m, attachments };
            }),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, applyConsumption);
      }
    };

    // Handler for conversation:deleted — user removed the conversation for themselves.
    const handleConversationDeleted = (data: { userId: string; conversationId: string }) => {
      const { conversationId: deletedId } = data;
      if (!deletedId) return;
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.filter((c) => c.id !== deletedId)
      );
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(deletedId) });
    };

    // Handler for conversation:updated — metadata changed (title, settings) or lastMessage bump.
    const handleConversationUpdated = (data: { conversationId: string; updatedBy: { id: string }; updatedAt: string; [key: string]: unknown }) => {
      const { conversationId: updatedId, updatedBy: _updatedBy, ...rest } = data;
      if (!updatedId) return;
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.map((c) => c.id === updatedId ? mergeConversationUpdate(c, rest) : c)
      );
    };

    // Handler for user:updated — a contact's profile changed (displayName,
    // avatar, banner, username). Invalidate the cached profile so any
    // currently-mounted `useUserProfileQuery(userId)` refetches instead of
    // showing a stale snapshot until the next manual refresh.
    const handleUserUpdated = (data: { userId: string; changes: Record<string, unknown> }) => {
      if (!data?.userId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(data.userId) });
    };

    // Handler for conversation:new — a group was created or the user was added to one.
    // The event carries only partial data, so the full conversation is read back.
    const handleConversationNew = (data: { conversationId: string }) => {
      fetchConversationIntoCache(data.conversationId);
    };

    // Register listeners
    const unsubscribeMessage = meeshySocketIOService.onNewMessage(handleNewMessage);
    const unsubscribeEdit = meeshySocketIOService.onMessageEdited(handleMessageEdited);
    const unsubscribeDelete = meeshySocketIOService.onMessageDeleted(handleMessageDeleted);
    const unsubscribeRestoredForMe = meeshySocketIOService.onMessageRestoredForMe(
      handleMessagesRestoredForMe
    );
    const unsubscribeTranslation = meeshySocketIOService.onTranslation(handleTranslation);
    const unsubscribeUnread = meeshySocketIOService.onUnreadUpdated(handleUnreadUpdated);
    const unsubscribeTranscription = meeshySocketIOService.onTranscription(handleTranscription);
    const unsubscribeAudioTranslation = meeshySocketIOService.onAudioTranslation(handleAudioTranslation);
    const unsubscribeAttachmentStatus = meeshySocketIOService.onAttachmentStatusUpdated(handleAttachmentStatusUpdated);
    const unsubscribePreferences = meeshySocketIOService.onPreferencesUpdated((data) => {
      // The event is a union: user-level (has `category`) vs conversation-scoped
      // (has `conversationId`) vs community-scoped (has `communityId`).
      //
      // Le scope conversation ne passe PAS par React Query : l'état pin/mute/
      // archive/réaction que la liste et l'en-tête lisent vit dans le store
      // Zustand `conversation-preferences-store`, alimenté jusqu'ici par le
      // seul REST et par ses propres écritures optimistes. La ligne étant par
      // UTILISATEUR et non par appareil, la diffusion est le seul chemin par
      // lequel un épinglage fait sur un autre appareil peut atteindre un
      // onglet ouvert. Le store arbitre lui-même sur `version`.
      if ('conversationId' in data) {
        useConversationPreferencesStore.getState().applyRemotePreferences(data);
        // D-4 / R5-6, point 3(c) — le pendant web de
        // `MeeshyApp.swift:onReadingModePreferenceChanged` : même événement,
        // un second magasin scopé à nourrir, gardé par le même drapeau du fil (`useReadingModesFlag`).
        applyReadingModePreferenceBroadcast(data, isReadingModesFlagActiveRef.current);
        return;
      }
      if ('category' in data) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.preferences.category(data.category),
        });
        // La clé ci-dessus n'a d'observateur que pendant que l'écran de
        // réglages de la catégorie est monté. Le bloc `privacy` que les BULLES
        // rendent (`DeliveryIndicator`, `FocalRow`) vit dans un second
        // exemplaire — le store Zustand — dont `initialize()`, appelé une fois
        // au montage, était l'unique source. Quelle catégorie est doublée et
        // comment se relit vit à un seul site, jamais ici.
        refreshMirroredPreferenceCategory(data.category);
        return;
      }
      if ('communityId' in data) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.communities.preferences.detail(data.communityId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.communities.preferences.list(),
        });
      }
    });
    // `user:preferences-reordered` — le glisser-déposer d'un autre appareil.
    //
    // `orderInCategory` est un critère de tri de la liste au même titre
    // qu'`isPinned` et `categoryId` (`useConversationSorting` les lit tous les
    // trois dans la même map du store), et c'est le SEUL que
    // `user:preferences-updated` n'annonce pas : le gateway émet un événement
    // par GESTE de réordonnancement, pas un par ligne déplacée. Le store
    // arbitre sans `version` — l'événement n'en porte pas, délibérément.
    const unsubscribePreferencesReordered = meeshySocketIOService.onPreferencesReordered((data) => {
      useConversationPreferencesStore.getState().applyRemoteReorder(data?.updates ?? []);
    });
    // `user:preferences-community-reordered` — le MÊME geste sur l'autre table.
    //
    // Les préférences de communauté n'ont pas de magasin Zustand : elles vivent
    // dans React Query, donc le levier est l'invalidation — comme pour le scope
    // communauté de `user:preferences-updated` ci-dessus. `orderInCategory`
    // appartenant aussi à la ligne de DÉTAIL, chaque communauté nommée est
    // invalidée en plus de la liste ; c'est ce qui rend la charge utile
    // nécessaire, et pas seulement le fait que l'événement ait eu lieu.
    //
    // Rien d'écrit ⇒ rien à relire : le gateway n'émet pas sur un lot vide, et
    // un lot vide venu d'une version voisine ne doit pas déclencher de refetch.
    const unsubscribeCommunityPreferencesReordered =
      meeshySocketIOService.onCommunityPreferencesReordered((data) => {
        const updates = data?.updates ?? [];
        if (updates.length === 0) return;

        queryClient.invalidateQueries({
          queryKey: queryKeys.communities.preferences.list(),
        });
        updates.forEach(({ communityId }) => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.communities.preferences.detail(communityId),
          });
        });
      });
    const unsubscribeJoined = meeshySocketIOService.onConversationJoined(handleConversationJoined);
    const unsubscribeLeft = meeshySocketIOService.onConversationLeft(handleConversationLeft);
    const unsubscribeParticipantRole = meeshySocketIOService.onParticipantRoleUpdated(handleParticipantRoleUpdated);
    const unsubscribeConversationNew = meeshySocketIOService.onConversationNew(handleConversationNew);
    const unsubscribeConversationDeleted = meeshySocketIOService.onConversationDeleted(handleConversationDeleted);
    const unsubscribeConversationUpdated = meeshySocketIOService.onConversationUpdated(handleConversationUpdated);
    const unsubscribeParticipantJoined = meeshySocketIOService.onConversationParticipantJoined(handleConversationParticipantJoined);
    const unsubscribeParticipantLeft = meeshySocketIOService.onConversationParticipantLeft(handleConversationParticipantLeft);
    const unsubscribeParticipantBanned = meeshySocketIOService.onConversationParticipantBanned(handleConversationParticipantBanned);
    const unsubscribeParticipantUnbanned = meeshySocketIOService.onConversationParticipantUnbanned(handleConversationParticipantUnbanned);
    const unsubscribeConversationClosed = meeshySocketIOService.onConversationClosed(handleConversationClosed);
    const unsubscribeCategoryChanged = meeshySocketIOService.onCategoryChanged(handleCategoryChanged);
    const unsubscribeMessageAttachmentUpdated = meeshySocketIOService.onMessageAttachmentUpdated(handleMessageAttachmentUpdated);
    const unsubscribePendingDelivered = meeshySocketIOService.onPendingMessagesDelivered(handlePendingMessagesDelivered);
    const unsubscribeLinkMessageNew = meeshySocketIOService.onLinkMessageNew(handleLinkMessageNew);
    const unsubscribeConversationJoinError = meeshySocketIOService.onConversationJoinError(handleConversationJoinError);
    const unsubscribeMessagePinned = meeshySocketIOService.onMessagePinned(handleMessagePinned);
    const unsubscribeMessageUnpinned = meeshySocketIOService.onMessageUnpinned(handleMessageUnpinned);
    const unsubscribeUserUpdated = meeshySocketIOService.onUserUpdated(handleUserUpdated);

    return () => {
      unsubscribeMessage?.();
      unsubscribeEdit?.();
      unsubscribeDelete?.();
      unsubscribeRestoredForMe?.();
      unsubscribeTranslation?.();
      unsubscribeUnread?.();
      unsubscribeTranscription?.();
      unsubscribeAudioTranslation?.();
      unsubscribeAttachmentStatus?.();
      unsubscribePreferences?.();
      unsubscribePreferencesReordered?.();
      unsubscribeCommunityPreferencesReordered?.();
      unsubscribeJoined?.();
      unsubscribeLeft?.();
      unsubscribeParticipantRole?.();
      unsubscribeConversationNew?.();
      unsubscribeConversationDeleted?.();
      unsubscribeConversationUpdated?.();
      unsubscribeParticipantJoined?.();
      unsubscribeParticipantLeft?.();
      unsubscribeParticipantBanned?.();
      unsubscribeParticipantUnbanned?.();
      unsubscribeConversationClosed?.();
      unsubscribeCategoryChanged?.();
      unsubscribeMessageAttachmentUpdated?.();
      unsubscribePendingDelivered?.();
      unsubscribeLinkMessageNew?.();
      unsubscribeConversationJoinError?.();
      unsubscribeMessagePinned?.();
      unsubscribeMessageUnpinned?.();
      unsubscribeUserUpdated?.();
    };
  }, [conversationId, enabled, queryClient]);
}

/*
 * RETIRÉ — `useInvalidateOnReconnect` (cycle 59).
 *
 * Il écoutait `window.online` et invalidait `['conversations']` +
 * `['notifications']` en bloc. Deux raisons de le retirer, pas une :
 *
 * 1. DESTRUCTEUR. `['conversations']` est un PRÉFIXE de
 *    `['conversations','infinite']` : sur cette query infinite, active dès que
 *    la sidebar est montée, l'invalidation rejoue TOUTES les pages chargées et
 *    remplace le cache — les trois dommages que l'en-tête de
 *    `use-conversations-delta-sync.ts` détaille, dont la ligne dupliquée à la
 *    frontière de page (la route pagine par OFFSET sur `lastMessageAt` DESC).
 * 2. REDONDANT sur ses deux clés. Les conversations sont rattrapées par le
 *    delta borné de `useConversationsDeltaSync` (Trigger 1, front `false → true`
 *    de la socket) ; les notifications par `onSyncDesync` du singleton socket →
 *    `scheduleResync`, plus `refetchOnMount: 'always'` sur la liste.
 *
 * Son propre commentaire s'appuyait sur `refetchOnReconnect: 'always'` — lequel
 * est précisément le second chemin destructeur, désarmé au même cycle sur
 * `useInfiniteConversationsQuery`. `window.online` ne prouve d'ailleurs aucune
 * reconnexion de SOCKET : un redémarrage gateway la tue sans bouger
 * `navigator.onLine`.
 */
