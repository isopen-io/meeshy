import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { AttachmentUpdatedEventData } from '@meeshy/shared/types/socketio-events/attachment';
import type {
  ConversationUnreadUpdatedEventData,
  ConversationUpdatedEventData,
  LastMessagePreviewAttachment,
} from '@meeshy/shared/types/socketio-events/conversation';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';
import { buildTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import type { ConversationStoreState } from '@/lib/conversation-store';
import type { OutboxState } from '@/lib/send/outbox-store';

import { patchConversation } from './conversations';
import { cachedThreadConversationIds, findCachedThreadMessage, patchThreadMessages, upsertThreadMessage } from './messages';
import type { Attachment, Conversation, Message, Participant } from './types';

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

  /* `upsertThreadMessage` (#6972, étape 1) — le SITE UNIQUE qui porte la loi
     « remplace par id OU clientMessageId, sinon append » (`api/messages.ts`) :
     elle était écrite ICI et dans `upsertConfirmed` (`send/perform-send.ts`),
     deux copies que leurs doc-comments déclaraient déjà identiques. */
  upsertThreadMessage(queryClient, raw.conversationId, message);

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
 * (`cachedThreadConversationIds`, `api/messages.ts` — #6972 étape 1 : le
 * prédicat de clé vit LÀ, avec la forme qu'il énumère) — un message dont le
 * fil n'est jamais ouvert n'a rien à peindre localement, motif
 * `applyMessageNew` § `page === undefined` (le prochain `GET …/messages` sert
 * la traduction).
 */
export function applyMessageTranslation(queryClient: QueryClient, data: TranslationEvent): void {
  const incoming = buildTranslationRecord(data.translations);
  if (Object.keys(incoming).length === 0) return;

  for (const conversationId of cachedThreadConversationIds(queryClient)) {
    const existing = findCachedThreadMessage(queryClient, conversationId, data.messageId);
    if (existing === undefined) continue;

    const merged = mergeMessageTranslations(existing, data.translations);
    patchThreadMessages(queryClient, conversationId, (messages) =>
      messages.map((m) => (m.id === data.messageId ? merged : m)),
    );

    patchConversation(queryClient, conversationId, (c) => {
      if (c.lastMessage?.id !== data.messageId) return c;
      const { lastMessageTranslations: _existing, ...rest } = c;
      return { ...rest, lastMessageTranslations: { ..._existing, ...incoming } };
    });
  }
}

/**
 * `attachmentIdOf` — LE SEUL SITE QUI SAIT ADRESSER UNE PIÈCE dans la charge
 * de `message:attachment-updated` : la garde de forme et le puits l'appellent
 * tous les deux, jamais chacun sa relecture. Sans `id`, la pièce n'est PAS
 * adressable et l'évènement est REJETÉ — remplacer « la première pièce audio »
 * écraserait une AUTRE pièce du même message, un message pouvant en porter
 * plusieurs, chacune enrichie par son propre passage Whisper (c'est la raison
 * pour laquelle l'éventail serveur déduplique sa file hors-ligne sur
 * `attachmentId`, `emitAttachmentUpdated.ts:100-104`).
 */
const attachmentIdOf = (attachment: unknown): string | undefined => {
  if (typeof attachment !== 'object' || attachment === null) return undefined;
  const id = (attachment as Record<string, unknown>).id;
  return typeof id === 'string' ? id : undefined;
};

/** Garde de FORME pour `message:attachment-updated`, FAIL-CLOSED — motif
 * `isSocketMessage` : une charge qui ne nomme pas SA conversation, SON message
 * et SA pièce est rejetée plutôt que devinée. */
export function isAttachmentUpdated(payload: unknown): payload is AttachmentUpdatedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.conversationId !== 'string' || typeof p.messageId !== 'string') return false;
  return attachmentIdOf(p.attachment) !== undefined;
}

/** Les trois colonnes que `maskedAttachment` (@meeshy/shared) interroge.
 * `effectFlags` n'est PAS déclaré sur `Attachment` — il voyage sur le fil sans
 * figurer au type partagé — d'où la lecture par cette clé plutôt que par une
 * propriété typée.
 *
 * JUMELLE ASSUMÉE, ET TEMPORAIRE. #7014, livré en parallèle, pose l'inventaire
 * de ces mêmes trois champs à sa place définitive —
 * `ATTACHMENT_PROTECTION_FIELDS` (`@meeshy/shared/utils/attachment-protection`)
 * — avec un cliquet de compilation qui oblige un quatrième canal à s'y
 * déclarer. Cette constante doit DISPARAÎTRE au profit de cet import dès que
 * les deux branches sont fusionnées : deux inventaires du même secret sont
 * exactement ce que #7014 existe pour empêcher. Suivi : #7029. */
const PROTECTION_KEYS = ['isViewOnce', 'isBlurred', 'effectFlags'] as const;

/**
 * LA FUSION D'UNE PIÈCE ENRICHIE — et sa garde de masquage (#7017, dépendance
 * croisée #7014).
 *
 * FUSION, jamais remplacement sec : `SocketAttachment`
 * (`services/gateway/src/socketio/serializeAttachmentForSocket.ts`) est une
 * PROJECTION du rang, pas le rang entier — `currentUserConsumption`, servi par
 * le REST, n'en fait pas partie. Un `attachments[i] = charge` ferait disparaître
 * la barre de consommation d'un vocal déjà écouté à l'instant exact où sa
 * transcription arrive.
 *
 * ET LA PROTECTION NE PEUT QUE MONTER. `maskedAttachment` rend `false` sur une
 * charge qui ne DÉCLARE rien (« une pièce sans déclaration est une pièce
 * ordinaire » — son fail-closed vit chez l'appelant), et le sérialiseur socket
 * ne sert PAS les trois drapeaux tant que #7014 n'a pas atterri. Une pièce à
 * VUE UNIQUE connue du cache par le REST verrait donc son voile tomber au
 * moment PRÉCIS où le pipeline finit son travail — la fuite du cycle 125,
 * rouverte par un chemin neuf et sans qu'aucun gate ne rougisse. La charge
 * peut AJOUTER une protection (elle en sait alors plus que le cache) ; elle ne
 * peut pas en retirer une.
 */
function mergedAttachment(cached: Attachment, incoming: Record<string, unknown>): Attachment {
  /* Le cast est le motif documenté de `rawMessageFromSocket` ci-dessus : la
     charge socket est un `Record<string, unknown>` dont le type ne dit rien,
     et le cache tient la FORME DU FIL (D-26) — c'est `decodeMessagesPage`,
     posé en `select`, qui dénullifie chaque pièce à la lecture
     (`decode.ts` § `decodeAttachment`), jamais ce puits. */
  const merged = { ...cached, ...incoming } as unknown as Attachment;
  if (!maskedAttachment(cached) || maskedAttachment(merged)) return merged;

  const kept = Object.fromEntries(
    PROTECTION_KEYS.filter((key) => key in cached).map((key) => [key, (cached as unknown as Record<string, unknown>)[key]]),
  );
  return { ...merged, ...kept };
}

/**
 * `applyMessageAttachmentUpdated` — LE PUITS DE `message:attachment-updated`
 * (#7017), l'évènement par lequel la transcription Whisper puis les traductions
 * NLLB + les pistes TTS rejoignent un message DÉJÀ reçu
 * (`emitAttachmentUpdated.ts:77`).
 *
 * Le RENDU de la transcription était déjà juste — widget, descente du Prisme
 * par la fonction partagée (`servedTranscript`, `api/prism.ts`), `lang=` porté
 * par la langue servie, piste traduite, karaoké. **C'est l'ALIMENTATION qui
 * manquait** : web-v2 n'écoutait pas l'évènement, si bien qu'un vocal reçu
 * restait sans transcription ET sans drapeau de langue
 * (`translatedLanguagesOf` lit `attachment.translations`, `view/message.ts`)
 * jusqu'à ce qu'on quitte et rouvre le fil. C'est la jumelle de la question
 * « qui AFFICHE ce que tu résous ? » (CLAUDE.md § Prisme, cycle 122) — ici :
 * **qui l'ALIMENTE, et quand ?**
 *
 * TROIS REFUS, tous fail-closed, et chacun pour sa raison :
 *  - le fil n'est pas OUVERT ⇒ rien à peindre localement, motif
 *    `applyMessageNew` § `page === undefined` (le prochain `GET …/messages`
 *    sert la pièce enrichie) ;
 *  - le message est inconnu de la fenêtre chargée ⇒ idem ;
 *  - **la pièce est inconnue du message ⇒ JAMAIS UN AJOUT.** L'évènement dit
 *    « cette pièce a été ENRICHIE », jamais « voici une pièce de plus » :
 *    ajouter une pièce inconnue ferait entrer dans le fil un média dont le
 *    cache n'a rien pour juger la protection.
 *
 * UN SITE LIT, UN SITE PATCHE (#6972) : `findCachedThreadMessage` et
 * `patchThreadMessages` (`api/messages.ts`) — ce puits ne connaît pas la forme
 * de la page.
 */
export function applyMessageAttachmentUpdated(queryClient: QueryClient, data: AttachmentUpdatedEventData): void {
  const attachmentId = attachmentIdOf(data.attachment);
  if (attachmentId === undefined) return;

  const existing = findCachedThreadMessage(queryClient, data.conversationId, data.messageId);
  if (existing === undefined) return;
  const attachments = existing.attachments;
  if (attachments === undefined || !attachments.some((a) => a.id === attachmentId)) return;

  const incoming = data.attachment as Record<string, unknown>;
  const next: Message = {
    ...existing,
    attachments: attachments.map((a) => (a.id === attachmentId ? mergedAttachment(a, incoming) : a)),
  };

  patchThreadMessages(queryClient, data.conversationId, (messages) =>
    messages.map((m) => (m.id === data.messageId ? next : m)),
  );
}
