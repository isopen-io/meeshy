/**
 * Hook useStreamTranslation - Gestion traductions temps réel pour BubbleStream
 *
 * Extrait de bubble-stream-page.tsx pour responsabilité unique.
 * Gère l'état des traductions en cours et le traitement des traductions reçues.
 *
 * @module hooks/use-stream-translation
 */

'use client';

import { useState, useCallback } from 'react';
import { useMessageTranslation } from '@/hooks/useMessageTranslation';
import { getLanguageInfo } from '@meeshy/shared/types';
import type { User } from '@meeshy/shared/types';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';

/**
 * Égalité de langue conforme au Prisme : `targetLanguage` (traductions reçues) et
 * les préférences du lecteur sont verbatim et peuvent être région-tagués (`fr-FR`),
 * 3-lettres (`fra`) ou legacy (`iw`). Sans canonicalisation, `fr` et `fr-FR` sont
 * dédupliqués comme deux traductions distinctes (doublons en cache) et une
 * traduction pertinente pour le lecteur n'est jamais détectée.
 * SSOT : normalizeLanguageForDedup (packages/shared/utils/language-normalize.ts).
 */
const sameLanguage = (a?: string, b?: string): boolean =>
  !!a && !!b && normalizeLanguageForDedup(a) === normalizeLanguageForDedup(b);

interface UseStreamTranslationOptions {
  user: User;
  updateMessage: (messageId: string, updater: (prevMessage: any) => any) => void;
}

interface UseStreamTranslationReturn {
  // État des traductions
  addTranslatingState: (messageId: string, targetLanguage: string) => void;
  removeTranslatingState: (messageId: string, targetLanguage: string) => void;
  isTranslating: (messageId: string, targetLanguage: string) => boolean;

  // Handler pour les traductions reçues
  handleTranslation: (messageId: string, translations: any[]) => void;

  // Statistiques de traduction
  stats: any;
  incrementTranslationCount: (sourceLanguage: string, targetLanguage: string) => void;
}

/**
 * Hook pour gérer les traductions temps réel du BubbleStream
 */
export function useStreamTranslation({
  user,
  updateMessage,
}: UseStreamTranslationOptions): UseStreamTranslationReturn {

  // État pour les traductions en cours
  const [translatingMessages, setTranslatingMessages] = useState<Map<string, Set<string>>>(new Map());

  // Hook pour les statistiques de traduction
  const { stats, incrementTranslationCount } = useMessageTranslation();

  // Ajouter un état de traduction en cours
  const addTranslatingState = useCallback((messageId: string, targetLanguage: string) => {
    setTranslatingMessages(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(messageId)) {
        newMap.set(messageId, new Set());
      }
      newMap.get(messageId)!.add(targetLanguage);
      return newMap;
    });
  }, []);

  // Retirer un état de traduction en cours
  const removeTranslatingState = useCallback((messageId: string, targetLanguage: string) => {
    setTranslatingMessages(prev => {
      const newMap = new Map(prev);
      if (newMap.has(messageId)) {
        newMap.get(messageId)!.delete(targetLanguage);
        if (newMap.get(messageId)!.size === 0) {
          newMap.delete(messageId);
        }
      }
      return newMap;
    });
  }, []);

  // Vérifier si une traduction est en cours
  const isTranslating = useCallback((messageId: string, targetLanguage: string) => {
    return translatingMessages.get(messageId)?.has(targetLanguage) || false;
  }, [translatingMessages]);

  // Handler pour les traductions reçues via WebSocket
  const handleTranslation = useCallback((messageId: string, translations: any[]) => {

    // Mettre à jour le message avec les nouvelles traductions
    updateMessage(messageId, (prevMessage) => {
      if (!prevMessage) {
        console.warn('⚠️ [useStreamTranslation] Message introuvable:', messageId);
        return prevMessage;
      }

      // Fusionner les nouvelles traductions avec les existantes
      const existingTranslations = prevMessage.translations || [];
      const updatedTranslations = [...existingTranslations];

      translations.forEach(newTranslation => {
        const targetLang = newTranslation.targetLanguage || newTranslation.language;
        const content = newTranslation.translatedContent || newTranslation.content;

        if (!targetLang || !content) {
          console.warn('🚫 [useStreamTranslation] Traduction invalide:', newTranslation);
          return;
        }

        // Chercher si une traduction existe déjà
        const existingIndex = updatedTranslations.findIndex(
          t => sameLanguage(t.targetLanguage, targetLang)
        );

        const translationObject = {
          id: newTranslation.id || `${messageId}_${targetLang}`,
          messageId: messageId,
          sourceLanguage: newTranslation.sourceLanguage || prevMessage.originalLanguage || 'fr',
          targetLanguage: targetLang,
          translatedContent: content,
          translationModel: newTranslation.translationModel || newTranslation.model || 'basic',
          cacheKey: newTranslation.cacheKey || `${messageId}_${targetLang}`,
          cached: newTranslation.cached || newTranslation.fromCache || false,
          confidenceScore: newTranslation.confidenceScore || newTranslation.confidence || 0.9,
          createdAt: newTranslation.createdAt ? new Date(newTranslation.createdAt) : new Date(),
        };

        if (existingIndex >= 0) {
          updatedTranslations[existingIndex] = translationObject;
        } else {
          updatedTranslations.push(translationObject);
        }
      });

      return {
        ...prevMessage,
        translations: updatedTranslations
      };
    });

    // Vérifier si on a des traductions pertinentes pour cet utilisateur.
    // Le prisme du lecteur descend jusqu'au RANG 4 (locale appareil) : la SSOT
    // getUserLanguagePreferences ordonne et déduplique system > regional > custom
    // > deviceLocale. La liste bâtie à la main s'arrêtait au rang 3 — un lecteur
    // dont le seul signal est la locale appareil ne voyait aucune statistique
    // incrémentée. § Device Locale, apps/web/CLAUDE.md.
    const userLanguages = getUserLanguagePreferences(user);

    const relevantTranslation = translations.find(t =>
      userLanguages.some(lang => sameLanguage(lang, t.targetLanguage))
    );

    if (relevantTranslation) {
      const langInfo = getLanguageInfo(relevantTranslation.targetLanguage);

      // Incrémenter les statistiques de traduction
      incrementTranslationCount(
        relevantTranslation.sourceLanguage || 'fr',
        relevantTranslation.targetLanguage
      );
    }
  }, [updateMessage, user, incrementTranslationCount]);

  return {
    addTranslatingState,
    removeTranslatingState,
    isTranslating,
    handleTranslation,
    stats,
    incrementTranslationCount,
  };
}
