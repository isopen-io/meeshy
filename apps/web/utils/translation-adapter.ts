/**
 * Utilitaires pour gérer les traductions
 */

import type { TranslationData, User } from '@/types';
import { resolveUserPreferredLanguage } from './user-language-preferences';

/**
 * Structure pour une traduction formatée pour l'affichage
 */
export interface BubbleTranslation {
  id: string;
  messageId: string;
  targetLanguage: string;
  translatedContent: string;
  translationModel: string;
  fromCache: boolean;
  processingTimeMs: number;
  createdAt: Date;
  isOriginal: boolean;
}

/**
 * Convertit TranslationData en BubbleTranslation pour l'affichage
 */
export function translationDataToBubbleTranslation(
  translation: TranslationData,
  isOriginal: boolean = false
): BubbleTranslation {
  return {
    id: `${translation.messageId}_${translation.targetLanguage}`,
    messageId: translation.messageId,
    targetLanguage: translation.targetLanguage,
    translatedContent: translation.translatedContent,
    translationModel: translation.translationModel,
    fromCache: translation.cached,
    processingTimeMs: 0, // Non disponible dans TranslationData
    createdAt: new Date(), // Non disponible dans TranslationData
    isOriginal
  };
}

/**
 * Trouve la traduction pour la langue d'un utilisateur
 */
export function getUserTranslation(
  translations: TranslationData[],
  user: User,
  originalLanguage: string
): BubbleTranslation | null {
  const targetLanguage = resolveUserPreferredLanguage(user);

  if (targetLanguage === originalLanguage) {
    return null;
  }

  const translation = translations.find(t => t.targetLanguage === targetLanguage);

  if (!translation) {
    return null;
  }

  return translationDataToBubbleTranslation(translation);
}

/**
 * Filtre les traductions valides
 */
export function filterValidTranslations(translations: TranslationData[]): TranslationData[] {
  // S'assurer que translations est un tableau
  if (!Array.isArray(translations)) {
    return [];
  }
  
  return translations.filter(t => 
    t.translatedContent && 
    t.targetLanguage && 
    t.messageId
  );
}

/**
 * Groupe les traductions par langue
 */
export function groupTranslationsByLanguage(translations: TranslationData[]): Record<string, TranslationData> {
  return translations.reduce((acc, translation) => {
    acc[translation.targetLanguage] = translation;
    return acc;
  }, {} as Record<string, TranslationData>);
}
