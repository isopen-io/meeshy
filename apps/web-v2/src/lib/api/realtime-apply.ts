import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type {
  ConversationUnreadUpdatedEventData,
  ConversationUpdatedEventData,
  LastMessagePreviewAttachment,
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
 * `messageTypeOf` — le SEUL champ de la ligne neutre que le contrat ne
 * transporte pas directement (question 9.4 de la spécification #6171) :
 * dérivé du `mimeType` de la PREMIÈRE pièce jointe (`image/*` ⇒ `'image'`,
 * `audio/*` ⇒ `'audio'`, `video/*` ⇒ `'video'`, sinon `'file'` ; aucune pièce
 * ⇒ `'text'`). La Lentille ne LIT PAS ce champ sur son aperçu — elle lit
 * `lastMessageAttachments` pour choisir son glyphe (`lens-row.tsx` §
 * `MEDIA_PREVIEW`) — donc cette valeur ne gouverne aucun rendu aujourd'hui ;
 * elle est posée pour que la forme du `Message` reste COMPLÈTE, documentée
 * comme telle.
 */
function messageTypeOf(attachments: readonly LastMessagePreviewAttachment[]): Message['messageType'] {
  const first = attachments[0];
  if (first === undefined) return 'text';
  if (first.mimeType.startsWith('image/')) return 'image';
  if (first.mimeType.startsWith('audio/')) return 'audio';
  if (first.mimeType.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * `neutralLastMessageFromPreview` — LA LIGNE NEUTRE (#6171, G3) que
 * `applyConversationUpdated` compose quand `lastMessageId` nomme un AUTRE
 * message que celui que la ligne connaît déjà : miroir `LastMessageFacet
 * .adoptLastMessage` (iOS, `:170-184`). Exportée pour le témoin (T5).
 *
 * CE N'EST PAS « inventer ce que la source ne porte pas » (leçon « un
 * instantané qui RECOPIE invente ce que la source ne porte pas ») : chaque
 * champ vient soit de la charge, soit d'un défaut que le CONTRAT lui-même
 * déclare — « clé absente = un FAIT » (doc-comment de
 * `ConversationUpdatedEventData` : pas de pièce jointe déclarée ⇒ pas de
 * pièce jointe, pas flouté déclaré ⇒ pas flouté).
 *
 * `sender` — SEUL le `displayName` (motif `rawMessageFromSocket`, § doc-
 * comment ci-dessus : le cast est justifié par les deux seuls lecteurs de
 * `message.sender` sur une rangée de liste, `displayName` et `avatar` — ici
 * seul le premier est transporté). Absent si `lastMessageSenderName` ne l'est
 * pas (tri-état, jamais un nom fabriqué).
 *
 * `createdAt`/`timestamp` — `lastMessageAt`, chaîne ISO gardée TELLE QUELLE
 * (D-26) ; repli sur `updatedAt` (le SEUL horodatage que le contrat garantit
 * toujours) si `lastMessageAt` est absent ou `null` dans cette branche.
 */
export function neutralLastMessageFromPreview(data: ConversationUpdatedEventData): Message {
  const attachments = data.lastMessageAttachments ?? [];
  const at = data.lastMessageAt ?? data.updatedAt;
  return {
    id: data.lastMessageId as string,
    conversationId: data.conversationId,
    senderId: data.senderId ?? '',
    content: data.lastMessagePreview ?? '',
    originalLanguage: data.lastMessageOriginalLanguage ?? '',
    messageType: messageTypeOf(attachments),
    messageSource: 'user',
    isEdited: false,
    isViewOnce: data.lastMessageIsViewOnce ?? false,
    viewOnceCount: 0,
    isBlurred: data.lastMessageIsBlurred ?? false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: at as unknown as Date,
    timestamp: at as unknown as Date,
    translations: [],
    ...(data.lastMessageExpiresAt === undefined || data.lastMessageExpiresAt === null
      ? {}
      : { expiresAt: data.lastMessageExpiresAt as unknown as Date }),
    ...(data.lastMessageSenderName === undefined || data.lastMessageSenderName === null
      ? {}
      : { sender: { displayName: data.lastMessageSenderName } as unknown as Participant }),
    ...(attachments.length === 0 ? {} : { attachments: attachments as unknown as Message['attachments'] }),
  } as unknown as Message;
}

/**
 * `acceptsLastMessageAt` — LA GARDE MONOTONE DU RANG (revue-correction #6171),
 * exigée par le contrat lui-même : « Les clients tiennent une garde monotone sur
 * le groupe d'aperçu — un `lastMessageAt` plus ancien y désigne un message
 * périmé … Posé par `emitConversationPreviewUpdate` et par LUI SEUL. Les
 * émetteurs message-driven (`MessageHandler`, `MeeshySocketIOManager`)
 * l'omettent délibérément : **ce sont eux que la garde monotone protège** »
 * (doc-comment de `previewRecalculated`, `packages/shared/types/socketio-events/
 * conversation.ts`). Miroir EXACT d'iOS : le `>` strict du bump
 * (`ConversationListViewModel.swift:1100`) et son unique exception
 * (`:1214-1216`, « Réservé au drapeau : sans lui, un horodatage qui recule
 * décrit un message périmé (diffusion arrivée dans le désordre) et doit rester
 * ignoré »).
 *
 * `lastMessageAt` est le RANG de la ligne (la liste trie dessus) : l'écrire sans
 * garde faisait redescendre une conversation vivante dès que deux `message:new`
 * arrivaient dans le désordre. Le défaut PRÉEXISTAIT à l'adoption (G3), qui l'a
 * rendu visible : la ligne adopte désormais aussi le CONTENU du message nommé.
 *
 * `known` arrive en DEUX formes — chaîne ISO du cache brut (D-26) ou `Date`
 * décodée : `new Date()` accepte les deux, et un horodatage connu ILLISIBLE
 * laisse passer (fail-open sur le rang, jamais une ligne figée pour toujours).
 */
export function acceptsLastMessageAt(params: {
  readonly known: Conversation['lastMessageAt'];
  readonly incoming: string;
  readonly previewRecalculated?: boolean | undefined;
}): boolean {
  if (params.previewRecalculated === true) return true;
  if (params.known === undefined) return true;
  const knownMs = new Date(params.known as unknown as string).getTime();
  if (Number.isNaN(knownMs)) return true;
  return new Date(params.incoming).getTime() > knownMs;
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
 * **UN AUTRE `lastMessageId` ADOPTE une ligne NEUVE** (#6171, G3, revue de
 * #5793) — miroir `LastMessageFacet.adoptLastMessage` (iOS, `:170-184` :
 * « Nommer un AUTRE message, c'est cesser de décrire le précédent … sans ce
 * geste, une suppression pour tous du dernier message laissait la ligne
 * rendre l'aperçu du remplaçant sous la vignette, l'auteur et le “Vue
 * unique” du message supprimé »). `neutralLastMessageFromPreview` compose
 * cette ligne AVANT la fusion champ par champ ci-dessous — ce n'est PAS
 * « inventer ce que la source ne porte pas » : chaque champ vient de la
 * charge, ou d'un défaut que le CONTRAT lui-même déclare (« clé absente = un
 * FAIT », doc-comment de `ConversationUpdatedEventData`).
 */
export function applyConversationUpdated(queryClient: QueryClient, data: ConversationUpdatedEventData): void {
  if (!('lastMessageId' in data)) return;

  patchConversation(queryClient, data.conversationId, (c) => {
    if (data.lastMessageId === null) {
      const { lastMessage: _m, lastMessageAt: _at, lastMessageTranslations: _tr, lastMessageOriginalLanguage: _lang, ...rest } = c;
      return rest;
    }

    let next: Conversation = c;

    if (next.lastMessage?.id !== data.lastMessageId) {
      /* ADOPTER, C'EST CESSER DE DÉCRIRE LE PRÉCÉDENT — *Y COMPRIS SA CARTE*
         (revue-correction #6171). `adoptLastMessage` (iOS,
         `LastMessageFacet.swift:170-182`) remet à neutre les TREIZE champs de la
         facette, `lastMessageTranslations`/`lastMessageOriginalLanguage`
         comprises, et laisse les blocs tri-état ci-dessous les reposer depuis la
         charge. Sans ce retrait, un évènement qui nomme un AUTRE message sans
         porter le groupe Prisme laissait la ligne servir la traduction de
         l'ANCIEN message par-dessus l'original du NOUVEAU — exactement ce que le
         contrat décrit (« poser l'un sans les autres laisse la ligne rendre
         l'ANCIEN texte traduit », doc-comment de `lastMessageTranslations`).
         Les trois émetteurs réels posent toujours les trois clés (à `null` quand
         il n'y a pas de carte, `resolveLastMessagePreviewPrism:135-147`), donc
         ceci ne les change pas : c'est la dépendance à l'ORDRE des blocs qui
         disparaît, et elle est ce que trente écrans recopieraient. */
      const { lastMessageTranslations: _card, lastMessageOriginalLanguage: _cardLang, ...adopted } = next;
      next = { ...adopted, lastMessage: neutralLastMessageFromPreview(data) };
    }

    if (data.lastMessageAt !== undefined) {
      if (data.lastMessageAt === null) {
        const { lastMessageAt: _at, ...rest } = next;
        next = rest;
      } else if (
        acceptsLastMessageAt({
          known: c.lastMessageAt,
          incoming: data.lastMessageAt,
          previewRecalculated: data.previewRecalculated,
        })
      ) {
        // Chaîne ISO conservée TELLE QUELLE (D-26, « cache = forme du fil ») —
        // `decodeConversation` (le `select`) la revit en `Date`, motif exact de
        // `applyMessageNew` ci-dessus. Cast vers `Date` (jamais
        // `Conversation['lastMessageAt']`, qui inclut `undefined` — une valeur
        // ainsi typée resterait REFUSÉE par `exactOptionalPropertyTypes`).
        //
        // `c` et non `next` : le rang se compare à celui que la ligne portait
        // AVANT cet évènement — l'adoption ci-dessus ne touche pas
        // `lastMessageAt`, mais s'appuyer sur `next` ferait dépendre la garde
        // de l'ordre des blocs plutôt que de la donnée.
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
