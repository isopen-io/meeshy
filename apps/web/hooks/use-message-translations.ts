import { useState, useCallback, useMemo } from 'react';
import type { BubbleTranslation, User, Message, TranslationModel } from '@meeshy/shared/types';

interface BubbleStreamMessage extends Omit<Message, 'translations'> {
  location?: string;
  originalLanguage: string;
  isTranslated: boolean;
  translatedFrom?: string;
  translations: BubbleTranslation[];
  originalContent: string; // Nouveau : contenu original de l'auteur
}

interface UseMessageTranslationsProps {
  currentUser: User;
}

interface UseMessageTranslationsReturn {
  processMessageWithTranslations: (message: any) => BubbleStreamMessage;
  getPreferredLanguageContent: (message: BubbleStreamMessage) => {
    content: string;
    isTranslated: boolean;
    translatedFrom?: string;
  };
  getUserLanguagePreferences: () => string[];
  resolveUserPreferredLanguage: () => string;
  shouldRequestTranslation: (message: BubbleStreamMessage, targetLanguage?: string) => boolean;
  getRequiredTranslations: (message: BubbleStreamMessage) => string[];
}

/**
 * Hook personnalisé pour gérer les traductions des messages
 * Selon les instructions Copilot pour Meeshy
 */
export function useMessageTranslations({ 
  currentUser 
}: UseMessageTranslationsProps): UseMessageTranslationsReturn {
  
  /**
   * Résout la langue préférée de l'utilisateur selon la logique Meeshy
   */
  const resolveUserPreferredLanguage = useCallback((): string => {
    if (currentUser.useCustomDestination && currentUser.customDestinationLanguage) {
      return currentUser.customDestinationLanguage;
    }
    
    if (currentUser.translateToSystemLanguage) {
      return currentUser.systemLanguage;
    }
    
    if (currentUser.translateToRegionalLanguage) {
      return currentUser.regionalLanguage;
    }
    
    return currentUser.systemLanguage; // fallback
  }, [currentUser]);

  /**
   * Obtient toutes les langues configurées par l'utilisateur
   */
  const getUserLanguagePreferences = useCallback((): string[] => {
    const languages = new Set<string>();
    
    // Langue système (toujours incluse)
    languages.add(currentUser.systemLanguage);
    
    // Langue régionale si différente et activée
    if (currentUser.translateToRegionalLanguage && 
        currentUser.regionalLanguage !== currentUser.systemLanguage) {
      languages.add(currentUser.regionalLanguage);
    }
    
    // Langue personnalisée si différente et activée
    if (currentUser.useCustomDestination && 
        currentUser.customDestinationLanguage &&
        currentUser.customDestinationLanguage !== currentUser.systemLanguage &&
        currentUser.customDestinationLanguage !== currentUser.regionalLanguage) {
      languages.add(currentUser.customDestinationLanguage);
    }
    
    return Array.from(languages);
  }, [currentUser]);

  /**
   * Traite un message brut et le convertit en BubbleStreamMessage avec traductions
   */
  const processMessageWithTranslations = useCallback((message: any): BubbleStreamMessage => {
    // Convertir les traductions backend vers le format BubbleTranslation
    // CORRECTION: Déduplication des traductions par langue pour éviter les doublons
    const translationsMap = new Map<string, BubbleTranslation>();
    
    const validTranslations = (message.translations || [])
      .filter((t: any) => {
        // Support des deux formats possibles: targetLanguage/translatedContent OU language/content
        const hasValidStructure = t && (
          (t.targetLanguage && t.translatedContent) || 
          (t.language && t.content)
        );
        
        if (!hasValidStructure) {
          return false;
        }
        
        // Vérifier si le contenu traduit n'est pas vide
        const translatedContent = t.translatedContent || t.content;
        if (!translatedContent || translatedContent.trim() === '') {
          return false;
        }
        
        return true;
      });
    
    validTranslations.forEach((t: any) => {
        // Support des deux formats de propriétés
        const language = t.targetLanguage || t.language;
        const content = t.translatedContent || t.content;
        const currentTimestamp = new Date(t.createdAt || message.createdAt);
        
        // CORRECTION: Améliorer la logique de déduplication des traductions
        const existingTranslation = translationsMap.get(language);
        const shouldReplace = !existingTranslation || 
          currentTimestamp > new Date(existingTranslation.timestamp) ||
          (t.translationModel === 'premium' && existingTranslation.confidence < 0.95);
        
        if (shouldReplace) {
          const translation: BubbleTranslation = {
            language: language,
            content: content,
            status: 'completed' as const,
            timestamp: currentTimestamp,
            confidence: t.confidenceScore || t.confidence || 0.9,
            translationModel: t.translationModel as TranslationModel | undefined,
            cached: t.cached || false
          };

          translationsMap.set(language, translation);
        }
      });
    
    const translations: BubbleTranslation[] = Array.from(translationsMap.values());

    const originalLanguage = message.originalLanguage || 'fr';
    const preferredLanguage = resolveUserPreferredLanguage();
    
    // Déterminer le contenu à afficher selon les préférences utilisateur
    let displayContent = message.content;
    let isTranslated = false;
    let translatedFrom: string | undefined;
    
    // Si le message n'est pas dans la langue préférée de l'utilisateur
    if (originalLanguage !== preferredLanguage) {
      // Chercher une traduction dans la langue préférée
      const preferredTranslation = translations.find(t => 
        t.language === preferredLanguage && t.status === 'completed'
      );
      
      if (preferredTranslation) {
        displayContent = preferredTranslation.content;
        isTranslated = true;
        translatedFrom = originalLanguage;
      } else {
        // Pas de traduction disponible, marquer comme nécessitant une traduction
        isTranslated = false;
        translatedFrom = originalLanguage;
      }
    }

    const result: BubbleStreamMessage = {
      ...message,
      content: displayContent, // Contenu d'affichage (peut être traduit)
      originalContent: message.originalContent || message.content, // CORRECTION: Préserver le contenu original de l'auteur
      originalLanguage,
      isTranslated,
      translatedFrom,
      location: message.location || 'Paris',
      translations
    };

    return result;
  }, [resolveUserPreferredLanguage]);

  /**
   * Obtient le contenu dans la langue préférée de l'utilisateur
   */
  const getPreferredLanguageContent = useCallback((message: BubbleStreamMessage) => {
    const preferredLanguage = resolveUserPreferredLanguage();
    
    // Si c'est déjà dans la langue préférée
    if (message.originalLanguage === preferredLanguage) {
      return {
        content: message.content,
        isTranslated: false
      };
    }
    
    // Chercher une traduction dans la langue préférée
    const preferredTranslation = message.translations?.find(t => 
      t.language === preferredLanguage && t.status === 'completed'
    );
    
    if (preferredTranslation) {
      return {
        content: preferredTranslation.content,
        isTranslated: true,
        translatedFrom: message.originalLanguage
      };
    }
    
    // Pas de traduction disponible
    return {
      content: message.content,
      isTranslated: false,
      translatedFrom: message.originalLanguage
    };
  }, [resolveUserPreferredLanguage]);

  /**
   * Vérifie si une traduction est nécessaire pour un message
   */
  const shouldRequestTranslation = useCallback((message: BubbleStreamMessage, targetLanguage?: string): boolean => {
    const targetLang = targetLanguage || resolveUserPreferredLanguage();
    
    // Pas besoin de traduire si c'est déjà dans la langue cible
    if (message.originalLanguage === targetLang) {
      return false;
    }
    
    // Vérifier si la traduction existe déjà
    const existingTranslation = message.translations?.find(t => 
      t.language === targetLang && t.status === 'completed'
    );
    
    return !existingTranslation;
  }, [resolveUserPreferredLanguage]);

  /**
   * Obtient la liste des langues pour lesquelles des traductions sont nécessaires
   */
  const getRequiredTranslations = useCallback((message: BubbleStreamMessage): string[] => {
    const userLanguagePrefs = getUserLanguagePreferences();
    const missingTranslations: string[] = [];
    
    userLanguagePrefs.forEach(lang => {
      if (shouldRequestTranslation(message, lang)) {
        missingTranslations.push(lang);
      }
    });
    
    return missingTranslations;
  }, [getUserLanguagePreferences, shouldRequestTranslation]);

  return {
    processMessageWithTranslations,
    getPreferredLanguageContent,
    getUserLanguagePreferences,
    resolveUserPreferredLanguage,
    shouldRequestTranslation,
    getRequiredTranslations
  };
}
