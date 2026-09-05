/**
 * Types pour le messaging - Phase 2.1
 *
 * Interfaces de requête/réponse pour l'envoi de messages
 * Gateway WebSocket ↔ Frontend communication
 */

import type { ApiResponse } from './api-responses.js';
import type { SocketIOMessage } from './socketio-events.js';
import type { EncryptedPayload } from './encryption.js';

// Import des types canoniques normalisés
import type {
  ProcessStatus,
  DeliveryStatus as CanonicalDeliveryStatus,
} from './status-types.js';

// ===== TYPES D'AUTHENTIFICATION =====

/**
 * Types d'authentification supportés
 */
export type AuthenticationType = 'jwt' | 'session' | 'anonymous';

/**
 * Context d'authentification pour une requête
 */
export interface AuthenticationContext {
  readonly type: AuthenticationType;
  readonly userId?: string;           // ID User (pour JWT)
  readonly sessionToken?: string;     // Session token (pour anonymes)
  readonly jwtToken?: string;         // JWT Token complet
  readonly isAnonymous: boolean;      // Dérivé du type
}

// ===== REQUÊTE DE MESSAGE =====

/**
 * Priorité d'un message
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Transport/source mechanism of a message request
 * Note: Different from MessageSource in conversation.ts which represents the origin (user, system, app, etc.)
 */
export type MessageTransport = 'websocket' | 'rest' | 'api';

/**
 * Type d'attachement de message
 */
export type MessageAttachmentType = 'image' | 'file' | 'audio' | 'video' | 'link';

// TranslationModelType replaced by TranslationModel from message-types.ts
import type { TranslationModel } from './message-types.js';

/**
 * @deprecated Use TranslationModel from message-types.ts instead
 */
export type TranslationModelType = TranslationModel;

/**
 * Préférences de traduction pour un message
 */
export interface MessageTranslationPreferences {
  readonly disableAutoTranslation?: boolean;
  readonly targetLanguages?: readonly string[];
  readonly modelType?: TranslationModelType;
}

/**
 * Métadonnées d'une requête de message
 */
export interface MessageRequestMetadata {
  readonly source?: MessageTransport;
  readonly socketId?: string;
  readonly clientTimestamp?: number;
  readonly requestId?: string;
  readonly userAgent?: string;
}

/**
 * Pièce jointe de message
 */
export interface MessageAttachment {
  readonly id: string;
  readonly type: MessageAttachmentType;
  readonly url: string;
  readonly filename?: string;
  readonly size?: number;
  readonly mimeType?: string;
  readonly thumbnail?: string;
}

/**
 * Format pour toutes les requêtes d'envoi de message
 * Remplace les formats séparés REST/WebSocket
 */
export interface MessageRequest {
  // Champs requis
  readonly conversationId: string;
  readonly content: string;

  /**
   * Phase 4 §6.2 — client-generated idempotency key, format
   * `cid_<uuid v4 lowercase>`. Optional on the type for backward
   * compatibility during the transition; the gateway routes / socket
   * schemas validate it as mandatory at the wire boundary, and the
   * `MessageProcessor.saveMessage` catch-P2002 path uses it to dedup
   * concurrent retries against the
   * `(conversationId, clientMessageId)` unique index on `Message`.
   */
  readonly clientMessageId?: string;

  // Champs optionnels avec defaults intelligents
  readonly originalLanguage?: string;        // Default: détection auto ou langue utilisateur
  readonly messageType?: string;             // Default: "text"
  readonly replyToId?: string;              // Pour les réponses/threads
  readonly storyReplyToId?: string;        // ID de la story pour réponse privée (DM avec contexte story)
  readonly forwardedFromId?: string;        // ID du message original (transfert)
  readonly forwardedFromConversationId?: string; // ID de la conversation source (transfert cross-conversation)

  /**
   * Diffusion à plusieurs destinataires (PAS un transfert) : copie côté
   * serveur des pièces jointes du message désigné vers le message en cours
   * de création, mêmes fichiers, sans `forwardedFromId` ni marque de
   * transfert sur les copies. Voir `services/messaging/copyAttachments.ts`.
   */
  readonly copyAttachmentsFromMessageId?: string;

  // Mentions d'utilisateurs - envoyées depuis le frontend
  readonly mentionedUserIds?: readonly string[];  // IDs des utilisateurs mentionnés (@user)

  // Extensions pour messaging anonyme - DEPRECATED, utiliser authContext
  readonly isAnonymous?: boolean;           // Default: false
  readonly anonymousDisplayName?: string;   // Requis si isAnonymous = true

  // Metadata optionnelle
  readonly priority?: MessagePriority;
  readonly encrypted?: boolean;             // Default: false
  readonly attachments?: readonly MessageAttachment[];
  readonly attachmentIds?: readonly string[];

  // Effets de message — flou (BLURRED), éphémère (EPHEMERAL), vue unique
  // (VIEW_ONCE). Portés à l'identique par REST (POST /messages) et WebSocket
  // (message:send). `effectFlags` est le bitfield canonique ;
  // `MessageProcessor.saveMessage` recompose les bits BLURRED / EPHEMERAL /
  // VIEW_ONCE depuis `isBlurred` / `expiresAt` / `isViewOnce`.
  readonly isBlurred?: boolean;
  readonly expiresAt?: Date;
  readonly effectFlags?: number;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;

  // End-to-end encryption payload (for E2EE mode)
  // When present, content field should be empty or ignored
  readonly encryptedPayload?: EncryptedPayload;

  // Preferences de traduction spécifiques à ce message
  readonly translationPreferences?: MessageTranslationPreferences;

  // Context d'authentification - NOUVEAU
  readonly authContext?: AuthenticationContext;

  // Metadata pour WebSocket/REST tracking
  readonly metadata?: MessageRequestMetadata;

  /**
   * Lieu partagé (position figée + POI enrichi), champ dédié — jamais
   * fusionné dans `metadata` côté client. Le serveur seul le valide
   * (`parseSharedPlace`) et l'écrit dans `Message.metadata.location`.
   * Forme non typée ici volontairement : la validation stricte (bornes des
   * coordonnées, longueur des chaînes) vit côté gateway
   * (`services/location/sharedPlace.ts`), pas dans ce type partagé.
   */
  readonly location?: unknown;

  /**
   * Sticker (décoration de story ou emoji), champ dédié — même doctrine que
   * `location` : jamais fusionné dans `metadata` côté client, validé et écrit
   * dans `Message.metadata.sticker` par la seule passerelle
   * (`services/stickers/messageSticker.ts`). Forme non typée ici pour la
   * même raison : la validation stricte vit côté gateway.
   */
  readonly sticker?: unknown;
}

// ===== RÉPONSE UNIFIÉE =====

/**
 * Statut du processus de traduction
 * @see status-types.ts ProcessStatus pour le type canonique
 */
export type TranslationProcessStatus = ProcessStatus | 'cached';

/**
 * Statut de livraison d'un message
 * Alias vers le type canonique pour rétrocompatibilité
 * @see status-types.ts DeliveryStatus
 */
export type DeliveryStatusType = CanonicalDeliveryStatus;

/**
 * Statut de traduction pour un message
 */
export interface TranslationStatus {
  readonly status: TranslationProcessStatus;
  readonly languagesRequested: readonly string[];     // Langues demandées pour traduction
  readonly languagesCompleted: readonly string[];     // Langues avec traduction terminée
  readonly languagesFailed: readonly string[];        // Langues avec traduction échouée
  readonly estimatedCompletionTime?: number; // Temps estimé en ms
  readonly cacheHitRate?: number;           // % de traductions venant du cache
  readonly model?: TranslationModelType;
}

/**
 * Réponse pour l'envoi de messages
 *
 * L'ACK d'envoi porte le message persisté, et RIEN d'autre. Il a longtemps
 * traîné un bloc `metadata` — statut de livraison, métriques de performance,
 * contexte du contenu, debug — qu'AUCUN des trois appelants de
 * `MessagingService.handleMessage` ne lisait : le transport Socket.IO le
 * remplace par `buildMessageAckData(data)` avant de rappeler le client, et les
 * deux autres n'utilisent que `success` / `data` / `error`.
 *
 * Ce bloc ne mesurait rien : `deliveryStatus` valait `{recipientCount: 1,
 * deliveredCount: 1, readCount: 1}` en dur, et les sous-temps de `performance`
 * étaient des FRACTIONS du temps total (0,6 / 0,2 / 0,1), pas des mesures. Le
 * compte réel des accusés se calcule — `MessageReadStatusService
 * .getConversationReadStatuses` — et se sert par les routes de messages ; s'il
 * doit un jour accompagner l'ACK, c'est de là qu'il devra venir, jamais d'une
 * constante.
 */
export interface MessageResponse extends ApiResponse<SocketIOMessage> {
  // Message complet avec toutes les relations
  readonly data: SocketIOMessage;  // Includes sender, translations, replyTo, etc.
}

// ===== ÉVÉNEMENTS WEBSOCKET UNIFIÉS =====

/**
 * Type d'événement WebSocket pour l'envoi
 */
export type MessageSendEventType = 'message:send';

/**
 * Type d'événement WebSocket pour la diffusion
 */
export type MessageBroadcastEventType = 'message:new';

/**
 * Format d'événement WebSocket pour l'envoi de message
 */
export interface MessageSendEvent {
  readonly type: MessageSendEventType;
  readonly payload: MessageRequest;
  readonly requestId?: string;              // Pour traçabilité
}

/**
 * Format de callback/ACK WebSocket 
 */
export interface MessageSendCallback {
  (response: MessageResponse): void;
}

// ===== VALIDATION TYPES =====

/**
 * Erreur de validation (mutable pour construction)
 */
export interface ValidationError {
  field: keyof MessageRequest;
  message: string;
  code: string;
}

/**
 * Avertissement de validation (mutable pour construction)
 */
export interface ValidationWarning {
  field: keyof MessageRequest;
  message: string;
  code: string;
}

/**
 * Résultat de validation pour une requête de message
 */
export interface MessageValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

/**
 * Restrictions d'envoi de message
 */
export interface MessageSendRestrictions {
  readonly maxContentLength?: number;
  readonly maxAttachments?: number;
  readonly allowedAttachmentTypes?: readonly string[];
  readonly rateLimitRemaining?: number;
}

/**
 * Résultat de vérification des permissions
 */
export interface MessagePermissionResult {
  readonly canSend: boolean;
  readonly canSendAnonymous?: boolean;
  readonly canAttachFiles?: boolean;
  readonly canMentionUsers?: boolean;
  readonly canUseHighPriority?: boolean;
  readonly restrictions?: MessageSendRestrictions;
  readonly reason?: string;                 // Raison si canSend = false
}
