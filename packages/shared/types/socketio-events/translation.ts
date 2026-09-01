/**
 * Le domaine TRANSLATION : la charge d'une traduction de message, son cache
 * client, la demande explicite et la traduction d'une story.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Données pour l'événement de mise à jour des traductions d'un textObject de story.
 * Émis après que le pipeline ZMQ a traduit un textObject de storyEffects.
 */
export interface StoryTranslationUpdatedEventData {
  readonly postId: string;
  readonly textObjectIndex: number;
  readonly translations: Record<string, string>;
}

/**
 * Données pour la requête de traduction
 */
export interface RequestTranslationData {
  readonly messageId: string;
  readonly targetLanguage: string;
}

export interface TranslationEvent {
  readonly messageId: string;
  readonly translations: readonly TranslationData[];
}

export interface TranslationData {
  readonly id: string; // ID de la traduction en base de données
  readonly messageId: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: string;
  readonly cacheKey: string;
  readonly cached: boolean;
  readonly confidenceScore?: number;
  readonly createdAt?: Date; // Ajouté pour la gestion des traductions
}

// ===== HELPERS POUR LA GESTION DES TRADUCTIONS =====

export interface MessageTranslationCache {
  readonly messageId: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: 'basic' | 'medium' | 'premium';
  readonly cacheKey: string;
  readonly cached: boolean;
  readonly createdAt: Date;
  readonly confidenceScore?: number;
}
