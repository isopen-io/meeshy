'use client';

import { useMemo } from 'react';
import type { BubbleTranslation } from '@meeshy/shared/types';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';
import { mentionsToLinks } from '@meeshy/shared/types/mention';
import { isSameLanguage } from '@meeshy/shared/utils/language-normalize';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { buildTranslationRecord } from '@/utils/translation-record';

interface UseMessageDisplayProps {
  message: {
    id: string;
    content: string;
    originalContent?: string;
    originalLanguage?: string;
    translations?: BubbleTranslation[];
    validatedMentions?: string[];
    replyTo?: {
      id: string;
      content: string;
      originalContent?: string;
      originalLanguage?: string;
      translations?: BubbleTranslation[];
    };
  };
  currentDisplayLanguage: string;
  /**
   * Prisme ORDONNÉ du lecteur (rangs 1→4, dont la locale appareil), utilisé pour
   * descendre l'aperçu de réponse (`replyToContent`) — un contenu DISTINCT du
   * principal, avec ses propres traductions. Optionnel : défaut
   * `[currentDisplayLanguage]` reproduit l'ancien comportement rang-1 pour tout
   * appelant qui ne le passe pas.
   */
  usedLanguages?: readonly string[];
}

export function useMessageDisplay({
  message,
  currentDisplayLanguage,
  usedLanguages,
}: UseMessageDisplayProps) {
  // Contenu traduit du message principal
  const displayContent = useMemo(() => {
    if (isSameLanguage(currentDisplayLanguage, message.originalLanguage || 'fr')) {
      return message.originalContent || message.content;
    }

    const translation = message.translations?.find((t: any) =>
      isSameLanguage(t.language || t.targetLanguage, currentDisplayLanguage)
    );

    if (translation) {
      return (translation as any).content || (translation as any).translatedContent || message.content;
    }

    return message.content;
  }, [currentDisplayLanguage, message.originalLanguage, message.originalContent, message.content, message.translations]);

  // Contenu avec mentions converties en liens
  const displayContentWithMentions = useMemo(() => {
    const validUsernames = message.validatedMentions || [];
    return mentionsToLinks(displayContent, '/u/{username}', [...validUsernames]);
  }, [displayContent, message.validatedMentions]);

  // Contenu traduit du message de réponse (replyTo). C'est un contenu DISTINCT du
  // principal : ses propres traductions, sa propre langue d'origine. On descend le
  // prisme ORDONNÉ du lecteur contre SES traductions (SSOT `resolvePrismTranslation`,
  // comme le corps du message dans `messages-display.tsx`), plutôt que la seule
  // langue élue pour le parent — sinon une traduction d'un rang inférieur du lecteur
  // (ex. `en` rang 2 quand le rang 1 `fr` manque) était ignorée au profit de
  // l'original. `currentDisplayLanguage` est placé en TÊTE du prisme pour qu'un
  // toggle manuel du parent reste prioritaire ; le résolveur déduplique. `null` ⇒
  // aucune traduction préférée ⇒ servir l'original.
  const replyToContent = useMemo(() => {
    if (!message.replyTo) return null;

    const preferredLanguages = [currentDisplayLanguage, ...(usedLanguages ?? [])];
    const resolved = resolvePrismTranslation({
      translations: buildTranslationRecord(message.replyTo.translations),
      originalLanguage: message.replyTo.originalLanguage || 'fr',
      preferredLanguages,
    });

    if (resolved) return resolved.text;

    return (message.replyTo as any).originalContent || message.replyTo.content;
  }, [currentDisplayLanguage, usedLanguages, message.replyTo]);

  // Versions disponibles (original + traductions)
  const availableVersions = useMemo(() => {
    const translationsArray = Array.isArray(message.translations) ? message.translations : [];

    return [
      {
        language: message.originalLanguage || 'fr',
        content: message.originalContent || message.content,
        isOriginal: true,
        confidence: 1,
        model: 'original' as const,
      },
      ...translationsArray.map((t: any) => ({
        language: t.language || t.targetLanguage,
        content: t.content || t.translatedContent,
        isOriginal: false,
        confidence: t.confidence || t.confidenceScore || 0.9,
        model: (t.model || t.translationModel || 'basic') as 'basic' | 'advanced' | 'premium',
      })),
    ];
  }, [message.originalLanguage, message.originalContent, message.content, message.translations]);

  // Langues manquantes (non traduites)
  const missingLanguages = useMemo(() => {
    const translatedLanguages = new Set([
      message.originalLanguage || 'fr',
      ...(Array.isArray(message.translations) ? message.translations : [])
        .map((t: any) => t?.language || t?.targetLanguage)
        .filter(Boolean),
    ]);

    return SUPPORTED_LANGUAGES.filter(lang => !translatedLanguages.has(lang.code));
  }, [message.originalLanguage, message.translations]);

  return {
    displayContent,
    displayContentWithMentions,
    replyToContent,
    availableVersions,
    missingLanguages,
  };
}
