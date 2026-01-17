/**
 * useTranslationState - Gère l'état des traductions en cours
 *
 * Suit les Vercel React Best Practices:
 * - rerender-lazy-state-init: initialisation lazy du Map
 * - rerender-functional-setstate: mises à jour fonctionnelles
 * - js-set-map-lookups: utilisation de Map/Set pour O(1)
 *
 * @module hooks/conversations/use-translation-state
 */

import { useState, useCallback } from 'react';

interface UseTranslationStateReturn {
  /**
   * Ajoute un état de traduction en cours
   */
  addTranslatingState: (messageId: string, targetLanguage: string) => void;

  /**
   * Supprime un état de traduction
   */
  removeTranslatingState: (messageId: string, targetLanguage: string) => void;

  /**
   * Vérifie si une traduction est en cours
   */
  isTranslating: (messageId: string, targetLanguage: string) => boolean;

  /**
   * Liste des langues utilisées dans les traductions
   */
  usedLanguages: string[];

  /**
   * Ajoute une langue à la liste des langues utilisées
   */
  addUsedLanguage: (language: string) => void;

  /**
   * Ajoute plusieurs langues à la liste des langues utilisées
   */
  addUsedLanguages: (languages: string[]) => void;
}

/**
 * Hook pour gérer l'état des traductions en cours
 */
export function useTranslationState(): UseTranslationStateReturn {
  // Lazy initialization du Map (rerender-lazy-state-init)
  const [translatingMessages, setTranslatingMessages] = useState(
    () => new Map<string, Set<string>>()
  );

  const [usedLanguages, setUsedLanguages] = useState<string[]>([]);

  /**
   * Ajoute un état de traduction en cours
   */
  const addTranslatingState = useCallback((messageId: string, targetLanguage: string) => {
    // Mise à jour fonctionnelle (rerender-functional-setstate)
    setTranslatingMessages(prev => {
      const newMap = new Map(prev);
      const currentLanguages = newMap.get(messageId) || new Set<string>();
      const updatedLanguages = new Set(currentLanguages);
      updatedLanguages.add(targetLanguage);
      newMap.set(messageId, updatedLanguages);
      return newMap;
    });
  }, []);

  /**
   * Supprime un état de traduction
   */
  const removeTranslatingState = useCallback((messageId: string, targetLanguage: string) => {
    setTranslatingMessages(prev => {
      const newMap = new Map(prev);
      const currentLanguages = newMap.get(messageId);

      if (currentLanguages) {
        const updatedLanguages = new Set(currentLanguages);
        updatedLanguages.delete(targetLanguage);

        if (updatedLanguages.size === 0) {
          newMap.delete(messageId);
        } else {
          newMap.set(messageId, updatedLanguages);
        }
      }

      return newMap;
    });
  }, []);

  /**
   * Vérifie si une traduction est en cours (O(1) lookup)
   */
  const isTranslating = useCallback((messageId: string, targetLanguage: string): boolean => {
    const currentLanguages = translatingMessages.get(messageId);
    return currentLanguages ? currentLanguages.has(targetLanguage) : false;
  }, [translatingMessages]);

  /**
   * Ajoute une langue à la liste des langues utilisées
   */
  const addUsedLanguage = useCallback((language: string) => {
    setUsedLanguages(prev => {
      if (prev.includes(language)) return prev;
      return [...prev, language];
    });
  }, []);

  /**
   * Ajoute plusieurs langues à la liste des langues utilisées
   */
  const addUsedLanguages = useCallback((languages: string[]) => {
    setUsedLanguages(prev => {
      const newLanguages = languages.filter(
        (lang): lang is string => Boolean(lang) && !prev.includes(lang)
      );
      return newLanguages.length > 0 ? [...prev, ...newLanguages] : prev;
    });
  }, []);

  return {
    addTranslatingState,
    removeTranslatingState,
    isTranslating,
    usedLanguages,
    addUsedLanguage,
    addUsedLanguages,
  };
}
