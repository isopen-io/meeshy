 /**
 * Types de messages unifiés pour Meeshy
 * Architecture simplifiée avec 2 types principaux :
 * 1. GatewayMessage - Messages retournés par la Gateway
 * 2. UIMessage - Messages avec détails visuels pour BubbleMessage
 */

import type { SocketIOUser as User, MessageType } from './socketio-events.js';
import type { AnonymousParticipant } from './anonymous.js';

// ===== 1. MESSAGES GATEWAY (API/Backend) =====

/**
 * Modèles de traduction supportés
 */
export type TranslationModel = 'basic' | 'medium' | 'premium';

/**
 * Statuts de traduction dans l'UI
 */
export type TranslationStatus = 'pending' | 'translating' | 'completed' | 'failed';

/**
 * Type de base pour toutes les réponses de traduction
 */
export interface MessageTranslation {
  readonly id: string;
  readonly messageId: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: TranslationModel;
  readonly cacheKey: string;
  readonly confidenceScore?: number;
  readonly createdAt: Date;
  readonly cached: boolean;
}

/**
 * Message retourné par la Gateway
 * Utilisé pour :
 * - Réception de nouveaux messages via Socket.IO
 * - Chargement de messages d'une conversation
 * - Réponses API
 */
export interface GatewayMessage {
  // Identifiants
  readonly id: string;
  readonly conversationId: string;
  readonly senderId?: string;
  readonly anonymousSenderId?: string;
  
  // Contenu
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  
  // Métadonnées
  readonly isEdited: boolean;
  readonly editedAt?: Date;
  readonly isDeleted: boolean;
  readonly deletedAt?: Date;
  readonly replyToId?: string;
  
  // Timestamps
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  
  // Sender résolu (authentifié ou anonyme)
  readonly sender?: User | AnonymousParticipant;
  
  // Traductions disponibles (peut être vide pour nouveaux messages)
  readonly translations: readonly MessageTranslation[];
  
  // Message de réponse référencé
  readonly replyTo?: GatewayMessage;
}

// ===== 2. MESSAGES UI (Interface utilisateur) =====

/**
 * État de traduction pour l'interface utilisateur
 */
export interface UITranslationState {
  readonly language: string;           // Langue cible
  readonly content: string;           // Contenu traduit
  readonly status: TranslationStatus;
  readonly timestamp: Date;
  readonly confidence?: number;       // Score de confiance 0-1
  readonly model?: TranslationModel;
  readonly error?: string;           // Message d'erreur si échec
  readonly fromCache: boolean;       // Indique si traduit depuis le cache
}

/**
 * Statut de lecture pour un utilisateur
 */
export interface ReadStatus {
  readonly userId: string;
  readonly readAt?: Date;
  readonly receivedAt?: Date;
}

/**
 * Permissions disponibles pour un message
 */
export interface MessagePermissions {
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canTranslate: boolean;
  readonly canReply: boolean;
}

/**
 * Message enrichi pour l'interface utilisateur
 * Utilisé par BubbleMessage pour affichage avec états visuels
 */
export interface UIMessage extends GatewayMessage {
  // ===== ÉTATS VISUELS =====
  
  // Traductions avec états UI
  readonly uiTranslations: readonly UITranslationState[];
  
  // États de traduction en cours par langue
  readonly translatingLanguages: Set<string>;
  
  // Affichage actuel
  readonly currentDisplayLanguage: string;
  readonly showingOriginal: boolean;
  
  // ===== MÉTADONNÉES UI =====
  
  // Contenu original conservé
  readonly originalContent: string;
  
  // Statuts de lecture (pour conversations de groupe)
  readonly readStatus?: readonly ReadStatus[];
  
  // Localisation (pour messages géolocalisés)
  readonly location?: string;
  
  // ===== ACTIONS DISPONIBLES =====
  
  // Actions possibles selon les permissions
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canTranslate: boolean;
  readonly canReply: boolean;
}

// ===== UTILITAIRES DE CONVERSION =====

/**
 * Convertit un GatewayMessage en UIMessage
 */
export function gatewayToUIMessage(
  gatewayMessage: GatewayMessage,
  userLanguage: string,
  userPermissions?: {
    canEdit?: boolean;
    canDelete?: boolean;
    canTranslate?: boolean;
    canReply?: boolean;
  }
): UIMessage {
  // Convertir les traductions Gateway en états UI
  const uiTranslations: UITranslationState[] = gatewayMessage.translations.map(t => ({
    language: t.targetLanguage,
    content: t.translatedContent,
    status: 'completed' as const,
    timestamp: t.createdAt,
    confidence: t.confidenceScore,
    model: t.translationModel,
    fromCache: t.cached
  }));

  return {
    ...gatewayMessage,
    uiTranslations,
    translatingLanguages: new Set(),
    currentDisplayLanguage: userLanguage,
    showingOriginal: gatewayMessage.originalLanguage === userLanguage,
    originalContent: gatewayMessage.content,
    canEdit: userPermissions?.canEdit ?? false,
    canDelete: userPermissions?.canDelete ?? false,
    canTranslate: userPermissions?.canTranslate ?? true,
    canReply: userPermissions?.canReply ?? true
  };
}

/**
 * Ajoute un état de traduction en cours à un UIMessage
 */
export function addTranslatingState(
  message: UIMessage,
  targetLanguage: string
): UIMessage {
  const translatingLanguages = new Set(message.translatingLanguages);
  translatingLanguages.add(targetLanguage);

  // Ajouter ou mettre à jour l'état UI
  const uiTranslations = [...message.uiTranslations];
  const existingIndex = uiTranslations.findIndex(t => t.language === targetLanguage);
  
  if (existingIndex >= 0) {
    const existing = uiTranslations[existingIndex];
    if (existing) {
      uiTranslations[existingIndex] = {
        language: existing.language,
        content: existing.content,
        timestamp: existing.timestamp,
        fromCache: existing.fromCache,
        status: 'translating',
        confidence: existing.confidence,
        model: existing.model,
        error: existing.error
      };
    }
  } else {
    uiTranslations.push({
      language: targetLanguage,
      content: '',
      status: 'translating',
      timestamp: new Date(),
      fromCache: false
    });
  }

  return {
    ...message,
    translatingLanguages,
    uiTranslations
  };
}

/**
 * Résultat de traduction
 */
export interface TranslationResult {
  readonly content?: string;
  readonly status: 'completed' | 'failed';
  readonly error?: string;
  readonly confidence?: number;
  readonly model?: TranslationModel;
  readonly fromCache?: boolean;
}

/**
 * Met à jour le résultat d'une traduction dans un UIMessage
 */
export function updateTranslationResult(
  message: UIMessage,
  targetLanguage: string,
  result: TranslationResult
): UIMessage {
  const translatingLanguages = new Set(message.translatingLanguages);
  translatingLanguages.delete(targetLanguage);

  const uiTranslations = message.uiTranslations.map(t => {
    if (t.language === targetLanguage) {
      return {
        language: t.language,
        content: result.content || t.content,
        status: result.status,
        timestamp: new Date(),
        fromCache: result.fromCache ?? false,
        confidence: result.confidence ?? t.confidence,
        model: result.model ?? t.model,
        error: result.error
      };
    }
    return t;
  });

  return {
    ...message,
    translatingLanguages,
    uiTranslations
  };
}

/**
 * Obtient le contenu à afficher selon la langue
 */
export function getDisplayContent(message: UIMessage): string {
  if (message.showingOriginal) {
    return message.originalContent;
  }

  const translation = message.uiTranslations.find(
    t => t.language === message.currentDisplayLanguage && t.status === 'completed'
  );

  return translation?.content || message.originalContent;
}

/**
 * Vérifie si une traduction est en cours pour une langue
 */
export function isTranslating(message: UIMessage, targetLanguage: string): boolean {
  return message.translatingLanguages.has(targetLanguage);
}

/**
 * Vérifie si une traduction est disponible pour une langue
 */
export function hasTranslation(message: UIMessage, targetLanguage: string): boolean {
  return message.uiTranslations.some(
    t => t.language === targetLanguage && t.status === 'completed'
  );
}

// ===== TYPES D'EXPORT =====

// Types legacy pour compatibilité (à supprimer progressivement)
export type Message = GatewayMessage;
export type MessageWithTranslations = GatewayMessage;
export type BubbleStreamMessage = UIMessage;