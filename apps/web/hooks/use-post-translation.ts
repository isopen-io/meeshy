'use client';

import { useMemo } from 'react';
import { useLanguageStore } from '@/stores/language-store';

interface TranslationEntry {
  readonly text: string;
  readonly translationModel?: string;
  readonly confidenceScore?: number;
  readonly createdAt?: string;
}

type TranslationsMap = Record<string, TranslationEntry>;

interface UsePostTranslationResult {
  preferredLanguage: string;
  displayContent: string;
  isTranslated: boolean;
  originalLanguage: string | null;
}

function resolvePreferredLanguage(config: {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
}): string {
  if (config.systemLanguage) return config.systemLanguage;
  if (config.regionalLanguage) return config.regionalLanguage;
  if (config.customDestinationLanguage) return config.customDestinationLanguage;
  return 'fr';
}

function findTranslation(
  translations: unknown,
  preferredLanguage: string,
  regionalLanguage?: string,
): TranslationEntry | null {
  if (!translations || typeof translations !== 'object') return null;
  const map = translations as TranslationsMap;

  if (map[preferredLanguage]?.text) return map[preferredLanguage];
  if (regionalLanguage && map[regionalLanguage]?.text) return map[regionalLanguage];
  return null;
}

export function usePostTranslation(
  content: string | null | undefined,
  originalLanguage: string | null | undefined,
  translations: unknown,
): UsePostTranslationResult {
  const config = useLanguageStore((s) => s.userLanguageConfig);

  return useMemo(() => {
    const preferredLanguage = resolvePreferredLanguage(config);
    const original = content ?? '';
    const origLang = originalLanguage ?? null;

    if (origLang === preferredLanguage) {
      return {
        preferredLanguage,
        displayContent: original,
        isTranslated: false,
        originalLanguage: origLang,
      };
    }

    const match = findTranslation(translations, preferredLanguage, config.regionalLanguage);

    if (match) {
      return {
        preferredLanguage,
        displayContent: match.text,
        isTranslated: true,
        originalLanguage: origLang,
      };
    }

    return {
      preferredLanguage,
      displayContent: original,
      isTranslated: false,
      originalLanguage: origLang,
    };
  }, [content, originalLanguage, translations, config]);
}

export function usePreferredLanguage(): string {
  const config = useLanguageStore((s) => s.userLanguageConfig);
  return useMemo(() => resolvePreferredLanguage(config), [config]);
}
