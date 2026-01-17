'use client';

import { useMemo } from 'react';
import type { BubbleTranslation } from '@meeshy/shared/types';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';
import { mentionsToLinks } from '@meeshy/shared/types/mention';

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
}

export function useMessageDisplay({
  message,
  currentDisplayLanguage,
}: UseMessageDisplayProps) {
  // Contenu traduit du message principal
  const displayContent = useMemo(() => {
    if (currentDisplayLanguage === (message.originalLanguage || 'fr')) {
      return message.originalContent || message.content;
    }

    const translation = message.translations?.find((t: any) =>
      (t.language || t.targetLanguage) === currentDisplayLanguage
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

  // Contenu traduit du message de réponse (replyTo)
  const replyToContent = useMemo(() => {
    if (!message.replyTo) return null;

    if (currentDisplayLanguage === (message.replyTo.originalLanguage || 'fr')) {
      return (message.replyTo as any).originalContent || message.replyTo.content;
    }

    const translation = message.replyTo.translations?.find((t: any) =>
      (t?.language || t?.targetLanguage) === currentDisplayLanguage
    );

    if (translation) {
      // BubbleTranslation et MessageTranslation ont des champs différents
      const content = (translation as any).translatedContent || (translation as any).content;
      return content || message.replyTo.content;
    }

    return message.replyTo.content;
  }, [currentDisplayLanguage, message.replyTo]);

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
