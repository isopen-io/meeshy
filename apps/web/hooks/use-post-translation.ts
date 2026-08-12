'use client';

import { useMemo } from 'react';
import { useLanguageStore } from '@/stores/language-store';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { getDeviceLocale } from '@/lib/device-locale';

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

/**
 * Résout la langue préférée pour les posts/commentaires via la source de
 * vérité unique du Prisme Linguistique (`resolveUserLanguage` de `@meeshy/shared`).
 *
 * Injecte la `deviceLocale` du navigateur en 4e priorité (Prisme étendu
 * 2026-05-26) pour rester aligné avec la résolution des messages
 * (`resolveUserPreferredLanguage`). L'ancienne implémentation locale dupliquait
 * l'ordre system > regional > custom > 'fr' en OMETTANT la `deviceLocale`, ce
 * qui faisait diverger l'affichage des posts de celui des messages.
 */
function resolvePreferredLanguage(config: {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
}): string {
  return resolveUserLanguage(config, { deviceLocale: getDeviceLocale() ?? undefined });
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
