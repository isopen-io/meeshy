/**
 * Types pour le messaging - Phase 2.1
 *
 * Interfaces de requête/réponse pour l'envoi de messages
 * Gateway WebSocket ↔ Frontend communication
 */

import type { ApiResponse } from './api-responses.js';
import type { ConversationStats } from './conversation.js';
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

/**
 * Modèle de traduction
 */
export type TranslationModelType = 'basic' | 'medium' | 'premium';

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

  // Champs optionnels avec defaults intelligents
  readonly originalLanguage?: string;        // Default: détection auto ou langue utilisateur
  readonly messageType?: string;             // Default: "text"
  readonly replyToId?: string;              // Pour les réponses/threads
  readonly forwardedFromId?: string;        // ID du message original (transfert)
  readonly forwardedFromConversationId?: string; // ID de la conversation source (transfert cross-conversation)

  // Mentions d'utilisateurs - envoyées depuis le frontend
  readonly mentionedUserIds?: readonly string[];  // IDs des utilisateurs mentionnés (@user)

  // Extensions pour messaging anonyme - DEPRECATED, utiliser authContext
  readonly isAnonymous?: boolean;           // Default: false
  readonly anonymousDisplayName?: string;   // Requis si isAnonymous = true

  // Metadata optionnelle
  readonly priority?: MessagePriority;
  readonly encrypted?: boolean;             // Default: false
  readonly attachments?: readonly MessageAttachment[];

  // End-to-end encryption payload (for E2EE mode)
  // When present, content field should be empty or ignored
  readonly encryptedPayload?: EncryptedPayload;

  // Preferences de traduction spécifiques à ce message
  readonly translationPreferences?: MessageTranslationPreferences;

  // Context d'authentification - NOUVEAU
  readonly authContext?: AuthenticationContext;

  // Metadata pour WebSocket/REST tracking
  readonly metadata?: MessageRequestMetadata;
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
 * Détails de livraison pour un destinataire
 */
export interface RecipientDeliveryDetail {
  readonly userId: string;
  readonly status: DeliveryStatusType;
  readonly timestamp: Date;
}

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
 * Statut de livraison pour un message
 */
export interface DeliveryStatus {
  readonly status: DeliveryStatusType;
  readonly sentAt: Date;
  readonly deliveredAt?: Date;
  readonly readAt?: Date;
  readonly failedAt?: Date;
  readonly recipientCount: number;           // Nombre de destinataires
  readonly deliveredCount: number;           // Nombre ayant reçu le message
  readonly readCount: number;                // Nombre ayant lu le message
  readonly recipientDetails?: readonly RecipientDeliveryDetail[];
}

/**
 * Métriques de performance d'une requête
 */
export interface PerformanceMetrics {
  readonly processingTime: number;         // Temps total de traitement en ms
  readonly dbQueryTime: number;           // Temps des requêtes DB en ms
  readonly translationQueueTime: number;  // Temps ajout à queue traduction en ms
  readonly validationTime: number;        // Temps de validation en ms
}

/**
 * Contexte d'un message
 */
export interface MessageContext {
  readonly isFirstMessage: boolean;       // Premier message de la conversation
  readonly triggerNotifications: boolean; // Déclenche des notifications push
  readonly mentionedUsers: readonly string[];      // IDs utilisateurs mentionnés (@user)
  readonly containsLinks: boolean;        // Message contient des liens
  readonly spamScore?: number;           // Score anti-spam (0-1)
}

/**
 * Informations de debugging (development only)
 */
export interface DebugInfo {
  readonly requestId: string;
  readonly serverTime: Date;
  readonly userId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly error?: string;
  readonly stack?: string;
  readonly socketId?: string;
  readonly source?: string;
  // Note: Pour des champs additionnels de debug, utiliser un objet séparé 'extra'
  readonly extra?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Metadata complète pour une réponse de message
 */
export interface MessageResponseMetadata {
  // Stats de conversation mises à jour
  readonly conversationStats?: ConversationStats;
  
  // Statut de traduction
  readonly translationStatus?: TranslationStatus;
  
  // Statut de livraison
  readonly deliveryStatus?: DeliveryStatus;
  
  // Performance metrics
  readonly performance?: PerformanceMetrics;
  
  // Informations contextuelles
  readonly context?: MessageContext;
  
  // Debugging info (development only)
  readonly debug?: DebugInfo;
}

/**
 * Réponse pour l'envoi de messages
 * Étend ApiResponse avec metadata complète
 */
export interface MessageResponse extends ApiResponse<SocketIOMessage> {
  // Message complet avec toutes les relations
  readonly data: SocketIOMessage;  // Includes sender, translations, replyTo, etc.
  
  // Metadata enrichie
  readonly metadata: MessageResponseMetadata;
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

/**
 * Payload pour l'événement de diffusion
 */
export interface MessageBroadcastPayload {
  readonly message: SocketIOMessage;
  readonly conversationId: string;
  readonly targetLanguage: string;        // Langue pour ce destinataire spécifique
  readonly metadata: Omit<MessageResponseMetadata, 'debug'>;
}

/**
 * Événement de diffusion temps réel vers autres clients
 */
export interface MessageBroadcastEvent {
  readonly type: MessageBroadcastEventType;
  readonly payload: MessageBroadcastPayload;
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
