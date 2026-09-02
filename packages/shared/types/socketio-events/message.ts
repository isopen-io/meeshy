/**
 * Le domaine MESSAGE : envoi, édition, suppression, épinglage, mentions,
 * visibilité personnelle, accusés de lecture, et le modèle transporté sur le
 * socket (`SocketIOMessage`).
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

// Import unified Participant types
import type { ParticipantType } from '../participant.js';
import type { MessageSticker } from '../message-sticker.js';

/**
 * Données pour l'événement de suppression de message
 */
export interface MessageDeletedEventData {
  readonly messageId: string;
  readonly conversationId: string;
}

/**
 * Résumé des statuts de lecture pour enrichir les événements temps réel
 */
export interface ReadStatusSummary {
  readonly totalMembers: number;
  readonly deliveredCount: number;
  readonly readCount: number;
}

/**
 * Données pour l'événement de mise à jour du statut de lecture
 */
export interface ReadStatusUpdatedEventData {
  readonly conversationId: string;
  readonly participantId: string;
  /**
   * `User.id` de l'acteur, ou `null` quand c'est un participant ANONYME — il
   * n'a pas de ligne `User`, et `participantId` est alors sa seule identité.
   * Le cas se produit sur l'accusé de livraison automatique d'une conversation
   * ouverte par lien de partage, où les anonymes sont la population dominante.
   *
   * Un consommateur qui compare cette valeur à sa propre identité (synchro
   * multi-appareils du curseur de lecture) n'a rien à changer : `null` ne
   * correspond à personne, ce qui est le comportement voulu. `summary`, lui,
   * est porté par `conversationId` seul et reste applicable.
   */
  readonly userId: string | null;
  readonly type: 'read' | 'received';
  readonly updatedAt: Date;
  readonly summary: ReadStatusSummary;
  /**
   * Read frontier of the ACTOR at broadcast time, read from
   * `ConversationReadCursor.lastReadAt`. It lets the actor's OTHER devices sync
   * their own read cursor (multi-device read sync); a peer reading does not
   * move your own cursor, so a recipient who is not the actor MUST ignore it.
   * Read receipts are monotone, so a client applies it only when strictly newer
   * than its local cursor. `null` when the actor has no read cursor yet.
   *
   * **Qui est « l'acteur » : `userId ?? participantId`, dans cet ordre.**
   * `userId` seul ne suffit plus depuis qu'il vaut légitimement `null` pour un
   * invité de lien partagé : un client sans compte qui ne comparerait que ce
   * champ ne pourrait JAMAIS reconnaître ses propres autres appareils, et
   * perdrait la synchro de curseur que ces deux champs existent pour porter.
   * `participantId` est la ligne d'appartenance de l'acteur — non nulle pour
   * TOUTE la population, et partagée par tous les appareils d'une même identité
   * (une seule ligne `Participant` par couple conversation/identité, pour un
   * inscrit comme pour un invité).
   *
   * C'est la MÊME règle que celle qui nomme la room personnelle
   * (`personalRoomKey`, `ROOMS.user(userId ?? id)`) — une seule règle
   * d'identité d'acteur dans tout le système, pas deux. Un client à compte
   * compare son `User.id` et n'a RIEN à changer : la seconde branche ne
   * s'ouvre que là où la première est nulle.
   *
   * Present ONLY on `type: 'read'` broadcasts — the sole action that advances
   * a read cursor. ABSENT (`undefined`) on `type: 'received'` (delivery never
   * moves `lastReadAt`) and on the bulk auto-deliver broadcast
   * (`MessageHandler._autoDeliverToOnlineRecipients`), which carries only the
   * aggregate `summary` for sender checkmarks. Travels paired with
   * `unreadCount`: a consumer applies them together or not at all.
   *
   * **Et présent seulement dans la copie ADRESSÉE À L'ACTEUR.** Ces deux champs
   * ne décrivent pas la conversation mais UNE personne : à quel point elle est
   * en retard sur ce fil, et quand elle l'a rattrapé pour la dernière fois. Le
   * serveur émet donc l'événement DEUX fois sur un `read` — une copie sans ces
   * champs à l'éventail de la conversation, une copie complète à la seule room
   * personnelle de l'acteur (`ROOMS.user(userId ?? participantId)`), dont
   * l'éventail est alors exclu pour qu'aucun socket ne reçoive les deux. Un
   * pair ne les recevait de toute façon que pour les jeter, puisque le seul
   * consommateur qui les lit conditionne leur usage à « l'acteur, c'est moi » ;
   * et la préférence d'accusés de lecture qui autorise la diffusion consent à
   * « j'ai lu ton message », pas à la publication d'un arriéré.
   *
   * Rien à changer côté client : un appareil de l'acteur les reçoit toujours,
   * par le canal que ses sessions rejoignent à l'authentification. Un client
   * qui les lirait SANS vérifier l'identité de l'acteur, en revanche, cessera
   * de voir passer l'arriéré des autres — c'était le défaut, pas le contrat.
   */
  readonly lastReadAt?: Date | null;
  /**
   * Server-authoritative unread count for the ACTOR in this conversation
   * after the read/receive action. Same `userId ?? participantId` scoping and
   * same present-on-dedicated-routes / absent-on-auto-deliver semantics as
   * `lastReadAt`; applied as-is by the actor's devices when accepted. Même
   * portée d'adressage : la copie de l'acteur, jamais l'éventail.
   */
  readonly unreadCount?: number;
}

/**
 * Données pour l'événement de consommation d'un message view-once
 */
export interface MessageConsumedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly viewOnceCount: number;
  readonly maxViewOnceCount: number;
  readonly isFullyConsumed: boolean;
}

/**
 * One message named by a personal-visibility event, with the conversation it
 * belongs to.
 *
 * `conversationId` is not decoration: every client cache in this repo is keyed
 * by conversation, so a bare `messageId` would force a scan of every cached
 * list to find the one page holding it.
 */
export interface PersonalMessageVisibilityRef {
  readonly messageId: string;
  readonly conversationId: string;
}

/**
 * Payload of `MESSAGE_HIDDEN_FOR_ME`.
 *
 * A list, not a single id: the bulk route hides up to 100 messages in one
 * request, and one event per message would make a "clear these 100" gesture
 * cost 100 broadcasts. The single-message route emits a one-element list, so
 * clients have exactly one shape to handle.
 */
export interface MessageHiddenForMeEventData {
  readonly userId: string;
  readonly messages: readonly PersonalMessageVisibilityRef[];
  /** ISO-8601 instant the hiding was recorded. */
  readonly hiddenAt: string;
}

/** Payload of `MESSAGE_RESTORED_FOR_ME`. Same shape, opposite direction. */
export interface MessageRestoredForMeEventData {
  readonly userId: string;
  readonly messages: readonly PersonalMessageVisibilityRef[];
  /** ISO-8601 instant the restore was recorded. */
  readonly restoredAt: string;
}

/**
 * Données pour l'événement d'épinglage d'un message
 */
export interface MessagePinnedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly pinnedBy: string;
  readonly pinnedAt: string;
}

/**
 * Données pour l'événement de désépinglage d'un message
 */
export interface MessageUnpinnedEventData {
  readonly messageId: string;
  readonly conversationId: string;
}

export interface MentionCreatedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly mentionedUserId: string;
  readonly content: string;
  readonly timestamp: string;
}

/**
 * Données pour l'envoi de message
 *
 * `clientMessageId` est OBLIGATOIRE — format `cid_<UUID v4 lowercase>`.
 * Validé contre `CLIENT_MESSAGE_ID_REGEX` exporté depuis
 * `@meeshy/shared/utils/client-message-id`. Sert d'identifiant
 * d'idempotence cross-device pour le dedup gateway/MongoDB.
 */
export interface MessageSendData {
  readonly conversationId: string;
  readonly content: string;
  readonly originalLanguage?: string;
  readonly messageType?: string;
  readonly replyToId?: string;
  readonly clientMessageId: string;
  /** Réponse privée à une story — DM porteur du contexte de la story. */
  readonly storyReplyToId?: string;
  /** Transfert : le message source, et sa conversation si elle diffère. */
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;
  /**
   * Diffusion à plusieurs destinataires (PAS un transfert) : la passerelle
   * copie CÔTÉ SERVEUR les pièces jointes du message désigné, si bien que
   * l'émetteur n'envoie ni texte ni `attachmentIds`.
   */
  readonly copyAttachmentsFromMessageId?: string;
  readonly isBlurred?: boolean;
  /** ISO 8601 — la passerelle en recompose le bit EPHEMERAL. */
  readonly expiresAt?: string;
  readonly effectFlags?: number;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;
  /**
   * Lieu partagé — champ dédié, JAMAIS un `metadata` brut. La forme n'est pas
   * contrainte ici : la validation stricte vit côté passerelle
   * (`services/location/sharedPlace.ts`).
   */
  readonly location?: unknown;
  /**
   * Sticker — champ dédié, même contrat que `location` : la forme est validée
   * côté passerelle (`services/stickers/messageSticker.ts`), jamais ici.
   */
  readonly sticker?: unknown;
  /**
   * Les mentionnés que l'ÉMETTEUR nomme, plutôt que ceux que la passerelle
   * déduit du texte.
   *
   * Ce n'est pas une commodité : c'est le seul canal qui survit au chiffrement.
   * La passerelle retombe sur l'extraction des `@username` du CONTENU quand la
   * liste est absente — mais en mode `e2ee` le client remplace `content` par le
   * littéral `[Encrypted]` avant d'émettre, si bien qu'il n'y a plus rien à
   * extraire. La liste explicite est alors la seule chose qui rattache un
   * message à ceux qu'il nomme.
   */
  readonly mentionedUserIds?: readonly string[];
  readonly encryptedContent?: string;
  readonly encryptionMode?: EncryptionModeOnWire;
  readonly encryptionMetadata?: Readonly<Record<string, unknown>>;
  readonly isEncrypted?: boolean;
}

/**
 * Le mode de chiffrement TEL QU'IL VOYAGE. La passerelle normalise la casse à
 * l'entrée (iOS émet « E2EE »), mais le jeu de valeurs est FERMÉ : ce sont les
 * trois que le schéma accepte, ni plus ni moins.
 */
export type EncryptionModeOnWire = 'e2ee' | 'server' | 'hybrid';

/**
 * Réponse d'envoi de message
 */
export interface MessageSendResponseData {
  readonly messageId: string;
}

/**
 * Données pour l'envoi de message avec attachements
 *
 * `clientMessageId` est OBLIGATOIRE — format `cid_<UUID v4 lowercase>`.
 * Validé contre `CLIENT_MESSAGE_ID_REGEX` exporté depuis
 * `@meeshy/shared/utils/client-message-id`. Sert d'identifiant
 * d'idempotence cross-device pour le dedup gateway/MongoDB.
 */
export interface MessageSendWithAttachmentsData {
  readonly conversationId: string;
  readonly content: string;
  readonly originalLanguage?: string;
  readonly attachmentIds: readonly string[];
  readonly replyToId?: string;
  readonly clientMessageId: string;
  readonly storyReplyToId?: string;
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;
  readonly isBlurred?: boolean;
  readonly expiresAt?: string;
  readonly effectFlags?: number;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;
  readonly location?: unknown;
  /** Même contrat que `MessageSendData.sticker` ci-dessus. */
  readonly sticker?: unknown;
  /** Même contrat que `MessageSendData.mentionedUserIds` ci-dessus. */
  readonly mentionedUserIds?: readonly string[];
  readonly encryptedContent?: string;
  readonly encryptionMode?: EncryptionModeOnWire;
  readonly encryptionMetadata?: Readonly<Record<string, unknown>>;
  readonly isEncrypted?: boolean;
}

/**
 * Données pour l'édition de message
 */
export interface MessageEditData {
  readonly messageId: string;
  readonly content: string;
}

/**
 * Données pour la suppression de message
 */
export interface MessageDeleteData {
  readonly messageId: string;
}

// ===== TYPES DE BASE =====

/**
 * Types de messages supportés dans l'architecture Meeshy
 * Défini une fois, réutilisé partout
 */
export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'system';

// ===== STRUCTURES DE DONNÉES =====

/**
 * Lightweight sender shape for Socket.IO message broadcasts.
 * A subset of Participant — only the fields needed for display.
 */
export interface SocketIOMessageSender {
  readonly id: string;
  readonly displayName: string;
  readonly avatar?: string;
  readonly type?: ParticipantType;
  readonly userId?: string;
  readonly username?: string;
  readonly firstName?: string;
  readonly lastName?: string;
}

/**
 * La charge utile de `message:new` et de `message:edited`, TELLE QUE LES
 * PRODUCTEURS L'ÉMETTENT.
 *
 * Elle a longtemps déclaré quatorze champs quand les producteurs en servaient
 * une trentaine. Ce n'est pas une imprécision sans suite : les décodeurs iOS,
 * Android et web sont écrits CONTRE ce contrat, et un champ qui n'y figure pas
 * doit être transcrit indépendamment par chacun des trois — c'est exactement
 * ainsi que `conversation:join-error` a vécu huit sites d'émission et deux
 * transcriptions client divergentes sans jamais être déclaré (cycle 99).
 *
 * Ce qui est déclaré `unknown` l'est PAR DÉCISION, pas par paresse : `replyTo`,
 * `attachments`, `translations` et `metadata` ont une forme DÉLIBÉRÉMENT
 * différente d'un transport à l'autre (cf. l'en-tête de
 * `services/gateway/src/socketio/messageNewPayload.ts`, qui énumère les écarts
 * et leur raison). Entre deux producteurs qui se contredisent, ne rien affirmer
 * est plus honnête que d'en couronner un.
 *
 * Portée de la garde, pour ne pas la surestimer : la passerelle compile en
 * `strict: false` / `strictNullChecks: false`. Déclarer un champ ici fait donc
 * tomber une émission dont la clé MANQUE ou dont le TYPE est incompatible —
 * jamais une qui sert `undefined` là où le contrat promet une valeur.
 */
export interface SocketIOMessage {
  readonly id: string;
  readonly conversationId: string;
  /**
   * `User.id` de l'expéditeur — et non son `Participant.id`, contrairement à ce
   * que cette ligne a déclaré pendant toute la vie du contrat. Les clients
   * comparent ce champ à leur propre `User.id` pour reconnaître leurs messages
   * et réconcilier la bulle optimiste entre appareils ; les producteurs le
   * résolvent par `resolveWireSenderId`, qui ne replie sur le `Participant.id`
   * que pour un expéditeur ANONYME, lequel n'en a pas d'autre.
   */
  readonly senderId: string;
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  readonly messageSource?: string;
  /**
   * Ne voyage QUE vers les appareils de l'expéditeur — `stripClientMessageId`
   * le retire de la charge utile des pairs juste avant l'émission.
   */
  readonly clientMessageId?: string;
  readonly isEdited?: boolean;
  readonly editedAt?: Date;
  readonly deletedAt?: Date;
  readonly expiresAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  readonly sender?: SocketIOMessageSender;

  /** Vue unique, flou, effets de bulle. */
  readonly isBlurred?: boolean;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;
  readonly effectFlags?: number;

  /** Réponses, citations de post, transferts. */
  readonly replyToId?: string;
  readonly replyTo?: unknown;
  readonly storyReplyToId?: string;
  readonly postReplyTo?: unknown;
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;
  readonly forwardedFrom?: unknown;
  readonly forwardedFromConversation?: unknown;

  /** Prisme Linguistique et pièces jointes — formes propres au transport. */
  readonly translations?: unknown;
  readonly attachments?: unknown;

  /** Mentions : les pseudos validés en base, et leur résolution enrichie. */
  readonly validatedMentions?: readonly string[];
  readonly mentionedUsers?: readonly unknown[];

  /** Hissés depuis `metadata` par les producteurs, pour être lisibles en direct. */
  readonly location?: unknown;
  readonly sticker?: MessageSticker;
  readonly trackingLinks?: readonly unknown[];

  /**
   * Enveloppe E2EE. Le FAIT du chiffrement, c'est la présence du chiffré ; le
   * chiffré sans le MODE ne dit pas sous quel régime déchiffrer.
   */
  readonly isEncrypted?: boolean;
  readonly encryptionMode?: string;
  readonly encryptedContent?: string;
  readonly encryptionMetadata?: unknown;
  readonly encryptedPayload?: unknown;

  /** Servis par le seul transport REST/ZMQ (cf. `messageNewPayload.ts`). */
  readonly originalContent?: string;
  readonly metadata?: unknown;
}
