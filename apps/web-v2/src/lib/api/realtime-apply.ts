import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { AttachmentUpdatedEventData } from '@meeshy/shared/types/socketio-events/attachment';
import type { ConversationUnreadUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';
import type {
  MessageConsumedEventData,
  ReadStatusUpdatedEventData,
  SocketIOMessage,
} from '@meeshy/shared/types/socketio-events/message';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';
import { maskedAttachment, raisedAttachmentProtection } from '@meeshy/shared/utils/attachment-protection';
import { buildTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import type { ConversationStoreState } from '@/lib/conversation-store';
import type { OutboxState } from '@/lib/send/outbox-store';

import { patchConversation } from './conversations';
import { mergeLastMessageCard, offerLastMessage } from './list-preview';
import {
  cachedThreadConversationIds,
  findCachedThreadMessage,
  latestCachedThreadMessage,
  patchThreadMessages,
  upsertThreadMessage,
} from './messages';
import { messageReceiptsPeopleQueryKey } from './receipts';
import type { Attachment, Message, Participant } from './types';
import { sealViewOnceIn } from './view-once-seal';

/* Le puits de `conversation:updated` vit chez lui (#7547, budget de taille) ;
   ses importeurs historiques le lisent toujours ici. */
export {
  acceptsLastMessageAt,
  applyConversationUpdated,
  isConversationUpdated,
  neutralLastMessageFromPreview,
} from './realtime-conversation-updated';

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
  /* `postReplyTo` n'est pas déclaré sur `SocketIOMessage` alors que la
     passerelle le sert hissé — même écart que `Message.location` côté
     `@meeshy/shared` (§ « ce qui reste », #7328). Lu comme la donnée non typée
     qu'il est, jamais redéclaré. */
  const rawPostReplyTo = (raw as { readonly postReplyTo?: unknown }).postReplyTo;
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
    ...(raw.ephemeralDuration !== undefined ? { ephemeralDuration: raw.ephemeralDuration } : {}),
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
    /**
     * LES TROIS CHAMPS HISSÉS (#7328) — `location`, `sticker`, `postReplyTo`.
     *
     * `HoistedFields` (`lib/view/message-body.ts`) les nomme tous les trois et
     * `placeOf`/`stickerOf`/`storyCitationOf` les lisent À LA RACINE D'ABORD,
     * précisément parce que la charge `message:new` NE PORTE PAS `metadata`
     * (le doc-comment de ce type le dit, lu ligne à ligne sur
     * `messageNewPayload.ts`). Cette énumération, elle, les JETAIT : trois lois
     * justes rendues inatteignables une couche plus haut, par le décodeur qui
     * les alimente.
     *
     * Le lieu était le plus visible des trois — son EXPÉDITEUR ne le voyait
     * jamais apparaître, l'écho socket de son propre envoi (celui qui PROMEUT
     * la rangée optimiste, D-11/D-28) arrivant amputé. « Qui AFFICHE ce qu'on
     * élit » a une jumelle : qui ALIMENTE ce qu'on affiche.
     *
     * AUCUNE VALIDATION ICI, et c'est délibéré : les trois lois de lecture
     * portent déjà leurs bornes (coordonnées, énumération d'animation, forme
     * de l'instantané) et rejettent ce qui n'en est pas. Une seconde garde ici
     * serait une jumelle qui dériverait.
     */
    ...(raw.location === undefined || raw.location === null ? {} : { location: raw.location }),
    ...(raw.sticker === undefined || raw.sticker === null ? {} : { sticker: raw.sticker }),
    ...(rawPostReplyTo === undefined || rawPostReplyTo === null ? {} : { postReplyTo: rawPostReplyTo }),
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

  /* `offerLastMessage` (`list-preview.ts`, #7547) — garde d'ordre ET
     masquage : un `message:new` plus ancien que l'aperçu en place ne le
     remplace jamais, et un message protégé n'entre dans la ligne (cache
     PERSISTÉ) que par son identité et ses drapeaux. */
  offerLastMessage(queryClient, raw.conversationId, message, buildTranslationRecord(raw.translations));
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
  const byLanguage = new Map((message.translations ?? []).map((t) => [t.targetLanguage, t]));
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
  }

  /* LA LIGNE SUIT MÊME FIL FERMÉ (#7547) — elle se retrouve par son DERNIER
     message, jamais par le cache du fil : la traduction n'atteignait la liste
     que si la conversation avait été ouverte. */
  mergeLastMessageCard(queryClient, data.messageId, incoming);
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
 * ET LA PROTECTION NE PEUT QUE MONTER, CANAL PAR CANAL. `maskedAttachment`
 * rend `false` sur une charge qui ne DÉCLARE rien (« une pièce sans
 * déclaration est une pièce ordinaire » — son fail-closed vit chez
 * l'appelant). Une pièce à VUE UNIQUE connue du cache par le REST verrait donc
 * son voile tomber au moment PRÉCIS où le pipeline finit son travail dès qu'un
 * `select` amont cesse de charger les drapeaux — la fuite du cycle 125,
 * rouverte par un chemin neuf et sans qu'aucun gate ne rougisse. La charge peut
 * AJOUTER une protection (elle en sait alors plus que le cache) ; elle ne peut
 * en RETIRER aucune — et « aucune » se vérifie sur CHAQUE canal, pas sur leur
 * OU : demander seulement « la pièce fusionnée est-elle encore masquée ? »
 * laissait tomber un canal tant qu'un autre tenait debout (revue adversariale
 * #7017).
 *
 * LE PLANCHER EST CELUI DE `@meeshy/shared`, jamais une copie (#7029). Ce site
 * portait son propre `PROTECTION_KEYS` et son propre masque d'`effectFlags` —
 * une jumelle assumée le temps que #7014 publie l'inventaire, et un fail-OPEN
 * dès qu'elle survivait : le cliquet de compilation de #7014
 * (`AttachmentProtectionInventoryCoversTheLaw`) oblige un quatrième canal à
 * rejoindre `ATTACHMENT_PROTECTION_FIELDS`, d'où il atteint le `select` Prisma
 * du gateway et la projection du fil — mais il n'aurait PAS atteint la copie
 * locale, et ce puits aurait alors laissé la charge socket retirer ce canal-là.
 * `raisedAttachmentProtection` est DÉRIVÉE de l'inventaire : un quatrième canal
 * y est retenu sans qu'une ligne d'ici ne change.
 */
function mergedAttachment(cached: Attachment, incoming: Record<string, unknown>): Attachment {
  /* Le cast est le motif documenté de `rawMessageFromSocket` ci-dessus : la
     charge socket est un `Record<string, unknown>` dont le type ne dit rien,
     et le cache tient la FORME DU FIL (D-26) — c'est `decodeMessagesPage`,
     posé en `select`, qui dénullifie chaque pièce à la lecture
     (`decode.ts` § `decodeAttachment`), jamais ce puits. */
  const merged = { ...cached, ...incoming } as unknown as Attachment;
  if (!maskedAttachment(cached)) return merged;

  return {
    ...merged,
    ...raisedAttachmentProtection(
      cached as unknown as Record<string, unknown>,
      merged as unknown as Record<string, unknown>,
    ),
  };
}

/**
 * `applyMessageAttachmentUpdated` — LE PUITS DE `message:attachment-updated`
 * (#7017), l'évènement par lequel la transcription Whisper puis les traductions
 * NLLB + les pistes TTS rejoignent un message DÉJÀ reçu
 * (`emitAttachmentUpdated.ts:77`).
 *
 * Le RENDU de la transcription était déjà en place — widget, descente du Prisme
 * par la fonction partagée (`servedTranscript`, `api/prism.ts`), piste
 * traduite, karaoké ; son `lang=`, lui, ne l'était pas et le premier jet de ce
 * lot l'a écrit « déjà juste » à tort (revue-correction #7017, corrigé dans
 * `attachment-blocks.tsx`). **C'est l'ALIMENTATION qui
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

/**
 * Garde de FORME pour `read-status:updated` (#7223, #7348), motif
 * `isConversationUnreadUpdated` : ne valide QUE les champs qu'
 * `applyReadStatusUpdated` consomme — `conversationId` et les compteurs
 * RÉELS de `ReadStatusSummary` (`packages/shared/types/socketio-events/
 * message.ts` — `totalMembers`/`deliveredCount`/`readCount`, PAS les
 * noms du libellé du lot). `participantId`/`userId`/`type`/`updatedAt` ne
 * sont pas vérifiés ici : ce puits les ignore, et les DEUX audiences de
 * `broadcastReadStatus` (l'éventail de la conversation, la room personnelle
 * de l'acteur) partagent `conversationId` + `summary` (doc-comment
 * `services/gateway/src/socketio/broadcastReadStatus.ts:98-118`).
 *
 * `summary.messageId` (#7348, contrat G-5/#7347 anticipé) est OPTIONNEL —
 * la passerelle actuelle ne le pose pas encore — mais quand IL EST PRÉSENT,
 * une forme mal typée est rejetée FAIL-CLOSED comme le reste de la garde,
 * jamais laissée traverser en silence.
 *
 * `summary.readByAllAt` (#7347, G-5) — de même OPTIONNEL (repli legacy sans
 * lot exact), et validé dès qu'il est CONSOMMÉ par `applyReadStatusUpdated`
 * ci-dessous : `null` (pas encore tout le monde) ou une chaîne (l'ISO 8601
 * réelle du fil — `updatedAt` voyage de la même façon) sont acceptées ; toute
 * AUTRE forme (un nombre, un objet) est rejetée, même motif que `messageId`.
 *
 * **Et la CHAÎNE VIDE est une forme mal typée** (revue-correction W2) : aucun
 * `Message.id` n'est vide, et `''` ne retombe PAS dans le repli « la charge
 * ne nomme aucun message » — `applyReadStatusUpdated` distingue le repli par
 * `=== undefined`, donc `''` prenait la branche NOMMÉE, n'appariait aucune
 * rangée et se taisait. Un événement cassé devenait un no-op silencieux, ce
 * que cette garde existe précisément pour empêcher.
 */
export function isReadStatusUpdated(payload: unknown): payload is ReadStatusUpdatedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.conversationId !== 'string') return false;
  const summary = p.summary;
  if (typeof summary !== 'object' || summary === null) return false;
  const s = summary as Record<string, unknown>;
  return (
    typeof s.totalMembers === 'number' &&
    typeof s.deliveredCount === 'number' &&
    typeof s.readCount === 'number' &&
    (s.messageId === undefined || (typeof s.messageId === 'string' && s.messageId.length > 0)) &&
    (s.readByAllAt === undefined || s.readByAllAt === null || typeof s.readByAllAt === 'string')
  );
}

/**
 * `applyReadStatusUpdated` — LE PUITS DE `read-status:updated` (#7223,
 * #7348) : LES COCHES ✓✓ D'UN MESSAGE ENVOYÉ BOUGENT EN DIRECT.
 *
 * **`summary.messageId` PRÉSENT (#7348, contrat G-5/#7347 anticipé)** : la
 * charge nomme désormais LE message qu'elle décrit — cette fonction cible
 * `findCachedThreadMessage` par cet id, qu'il soit ou non le plus récent du
 * fil. C'est la correction du défaut relevé le 2026-09-21 : dans une rafale
 * de lecture sur trois messages de trois auteurs (M1, M2, M3), la passerelle
 * émettra un résumé PAR message — trois événements, chacun ne devant patcher
 * QUE sa ligne, jamais rétrograder les deux autres au silence.
 *
 * **`summary.messageId` ABSENT (repli — passerelle pré-G5)** : la charge ne
 * nomme encore aucun message — `summary` décrit alors le DERNIER message NON
 * SUPPRIMÉ de la conversation
 * (`MessageReadStatusService.getLatestMessageSummary`,
 * `services/gateway/src/services/MessageReadStatusService.ts:2530-2560`) —
 * et cette fonction retombe sur `latestCachedThreadMessage`, le comportement
 * `#7223` d'origine, motif `applyMessageAttachmentUpdated` ci-dessus
 * (« le fil n'est pas OUVERT ⇒ rien à peindre localement, le prochain
 * `GET …/messages` sert le résumé exact »). Un `messageId` qui ne correspond
 * à AUCUNE rangée en cache (fil partiellement chargé) est un NO-OP, même
 * motif — jamais un repli silencieux sur un AUTRE message.
 *
 * `deliveredToAllAt` — l'horodatage FIGÉ que `deliveryOf` (`lib/view/message.ts`)
 * consulte au palier LIVRÉ — n'est PAS posé ici : la charge ne le porte pas
 * (`ReadStatusSummary` n'a que `readByAllAt`, cf. #7347/G-5), et l'inventer
 * depuis un événement qui ne l'affirme pas serait une horloge fabriquée. C'est
 * un COMPTEUR (`deliveredCount`) que ce puits rafraîchit pour ce palier, et
 * `deliveryOf` le tranche palier par palier (#7223, revue-correction W2 :
 * l'horloge « distribué à tous » ne court-circuite plus le palier LU).
 * TOUS-OU-RIEN EN GROUPE conservé — la règle vit dans `view/message.ts`, ce
 * puits ne la réécrit pas.
 *
 * `readByAllAt` (#7347, G-5), lui, EST posé ici quand le résumé l'AFFIRME —
 * même moteur que le REST (`MessageReadStatusService.getConversationReadStatuses`,
 * celui que `GET …/receipts` sert déjà) : `summary.readByAllAt` PRÉSENT
 * (`Date` ou `null`) remplace la valeur connue, `undefined` (repli legacy —
 * gateway pré-G5, ou résumé agrégé sans lot exact) ne la touche pas. Un
 * `null` EFFACE une date déjà connue plutôt que de la préserver : le
 * dénominateur peut grandir (nouveau participant) après que « tous ont lu »
 * a été vrai, et ce résumé est SERVEUR-AUTORITATIF sur ce point précis, comme
 * il l'est déjà pour `deliveredCount`/`readCount` ci-dessus.
 *
 * **LA FICHE « INFOS DU MESSAGE » SUIT LE MÊME DIRECT (#7352, V4)** — ce
 * puits ne PATCHAIT que les compteurs agrégés ci-dessus ; il n'invalidait
 * jamais `messageReceiptsPeopleQueryKey` (`receipts.ts:122-123`), la query
 * de la LISTE NOMINATIVE que `MessageReceiptsSheet` lit. Une fiche ouverte
 * pendant qu'un accusé arrive ne bougeait donc pas. Même idiome
 * qu'`onAttachmentStatusUpdated` (`socket.ts:365`) : INVALIDER `target.id`
 * (déjà résolu, AVEC ou SANS `summary.messageId`), jamais PATCHER — la forme
 * paginée par participant ne se fusionne pas champ à champ sans risquer de
 * désynchroniser une ligne encore en vol.
 */
export function applyReadStatusUpdated(queryClient: QueryClient, data: ReadStatusUpdatedEventData): void {
  const { summary } = data;
  /* UN RÉSUMÉ SANS DESTINATAIRE N'AFFIRME RIEN (revue-correction W2).
     `getLatestMessageSummary` rend `{0, 0, 0}` sur son chemin d'ERREUR comme
     sur une conversation vide (`MessageReadStatusService.ts`, `catch`) —
     appliquer ces zéros écraserait les compteurs servis par
     `GET …/messages` et ferait RÉGRESSER la coche d'un cran. Le cas
     LÉGITIME du dénominateur nul (tous les destinataires ont tu leurs
     accusés) porte de toute façon les mêmes zéros que la liste : ne rien
     peindre ne perd aucune information. */
  if (summary.totalMembers <= 0) return;

  const target =
    summary.messageId !== undefined
      ? findCachedThreadMessage(queryClient, data.conversationId, summary.messageId)
      : latestCachedThreadMessage(queryClient, data.conversationId);
  if (target === undefined) return;

  const counters: Message = {
    ...target,
    deliveredCount: summary.deliveredCount,
    readCount: summary.readCount,
    recipientCount: summary.totalMembers,
  };
  // `exactOptionalPropertyTypes` refuse `{ readByAllAt: undefined }` — un
  // `null` de la charge EFFACE la date connue en RETIRANT la clé, jamais en
  // lui assignant `undefined`.
  let next: Message = counters;
  if (summary.readByAllAt !== undefined) {
    if (summary.readByAllAt === null) {
      const { readByAllAt: _drop, ...rest } = counters;
      next = rest;
    } else {
      next = { ...counters, readByAllAt: summary.readByAllAt };
    }
  }

  patchThreadMessages(queryClient, data.conversationId, (messages) =>
    messages.map((m) => (m.id === target.id ? next : m)),
  );

  void queryClient.invalidateQueries({ queryKey: messageReceiptsPeopleQueryKey(data.conversationId, target.id) });
}

/**
 * Garde de FORME pour `message:consumed` (#7354, puis #7580) — FAIL-CLOSED :
 * une charge qui ne nomme pas SON message, SA conversation et QUI l'a ouvert
 * est rejetée plutôt que devinée. `userId` est désormais le champ qui décide
 * (la consommation est par personne, #7578).
 */
export function isMessageConsumedEvent(payload: unknown): payload is MessageConsumedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.messageId === 'string' && typeof p.conversationId === 'string' && typeof p.userId === 'string';
}

/**
 * `applyMessageConsumed` — LE PUITS DE `message:consumed` (#7354, puis #7580).
 *
 * **LA VUE UNIQUE SE CONSOMME PAR PERSONNE** (#7578, règle porteur du
 * 2026-09-23) : ce qu'un AUTRE participant ouvre ne change RIEN chez moi — ni
 * « déjà ouvert », ni retrait. Seule MA consommation, faite sur un autre de
 * mes appareils, atteint ce cache : la rangée passe « déjà ouverte » et son
 * contenu est purgé (`sealViewOnceIn`, le même site que l'ouverture locale).
 *
 * `viewOnceCount` n'est plus recopié depuis l'événement : c'était le compteur
 * GLOBAL, et le lire comme « ouvert par moi » est exactement le défaut que
 * #7578 retire. `patchThreadMessages` est un NO-OP silencieux si le fil n'a
 * pas de cache ou si le message n'y figure pas.
 */
export function applyMessageConsumed(queryClient: QueryClient, data: MessageConsumedEventData, viewerId: string): void {
  if (viewerId === '' || data.userId !== viewerId) return;
  patchThreadMessages(queryClient, data.conversationId, (messages) => sealViewOnceIn(messages, data.messageId));
}

