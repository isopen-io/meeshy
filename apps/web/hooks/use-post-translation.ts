'use client';

import { useMemo } from 'react';
import { useLanguageStore } from '@/stores/language-store';
import {
  resolveUserLanguage,
  resolveUserLanguagesOrdered,
  resolvePrismTranslation,
} from '@meeshy/shared/utils/conversation-helpers';
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

/**
 * Descend le prisme ORDONNÉ du lecteur et rend la première langue SERVIE — par
 * une traduction, ou parce que le contenu est déjà écrit dedans (auquel cas on
 * rend `null` : afficher l'original).
 *
 * Jumeaux à tenir en phase (toute évolution touche les TROIS) :
 *  - iOS     `APIPost.resolveTranslation` (packages/MeeshySDK/.../Models/PostModels.swift)
 *  - Android `LanguageResolver.preferredTranslation` (apps/android/core/model/.../lang/)
 *
 * L'ancienne implémentation ne consultait que le rang 1 (`resolveUserLanguage`)
 * puis retombait à la main sur `regionalLanguage` : les rangs 3
 * (`customDestinationLanguage`) et 4 (`deviceLocale`) n'étaient jamais
 * consultés pour CHERCHER une traduction. Un francophone dont le navigateur est
 * en anglais — cas nominal, puisque la règle 2 du Prisme fait entrer la locale
 * appareil au rang 4 — voyait donc les posts espagnols en espagnol alors qu'une
 * traduction anglaise existait, tandis qu'iOS et Android la servaient.
 *
 * La DESCENTE elle-même n'est plus réécrite ici : elle délègue à
 * `resolvePrismTranslation` (`@meeshy/shared`), la SSOT du Prisme de contenu
 * (CLAUDE.md § « La descente elle-même est UNE fonction »). Adapter la seule
 * FORME — la carte des posts est un `Record<string, { text }>`, quand le
 * résolveur attend `Record<string, string>` — suffit ; on n'y recopie ni
 * l'ordre, ni la règle « la langue d'origine gagne à son rang », ni la
 * normalisation. Cette dernière est le gain mesuré : `resolvePrismTranslation`
 * canonicalise les trois sources (langues du lecteur, langue d'origine, clés de
 * la carte) via `normalizeLanguageForDedup` — casse repliée ET région strippée
 * (`'en-US'`/`'pt-BR'` → `'en'`/`'pt'`). L'ancien `.trim().toLowerCase()`
 * rapprochait `'en-us'` de `'en'` par l'échec : un post dont la langue d'origine
 * ou la clé de traduction était région-taguée ratait son rang et servait une
 * traduction d'un rang inférieur — la violation exacte du Prisme #3 que ce hook
 * était censé combattre.
 */
function findTranslation(
  translations: unknown,
  orderedLanguages: readonly string[],
  originalLanguage: string | null,
): string | null {
  if (!translations || typeof translations !== 'object') return null;
  const record: Record<string, string> = {};
  for (const [code, entry] of Object.entries(translations as TranslationsMap)) {
    if (entry && typeof entry.text === 'string') record[code] = entry.text;
  }
  const resolved = resolvePrismTranslation({
    translations: record,
    originalLanguage,
    preferredLanguages: orderedLanguages,
  });
  return resolved ? resolved.text : null;
}

export function usePostTranslation(
  content: string | null | undefined,
  originalLanguage: string | null | undefined,
  translations: unknown,
): UsePostTranslationResult {
  const config = useLanguageStore((s) => s.userLanguageConfig);

  return useMemo(() => {
    const preferredLanguage = resolvePreferredLanguage(config);
    // `resolveUserLanguagesOrdered` ne porte PAS le fallback 'fr' (il rend une
    // liste vide si rien n'est configuré) ; on l'ajoute pour rester en phase
    // avec `resolveUserLanguage` (rang 5) et avec `preferredContentLanguages`
    // d'Android (repli `["fr"]`).
    const ordered = resolveUserLanguagesOrdered(config, {
      deviceLocale: getDeviceLocale() ?? undefined,
    });
    const orderedLanguages = ordered.length > 0 ? ordered : [preferredLanguage];
    const original = content ?? '';
    const origLang = originalLanguage ?? null;

    const match = findTranslation(translations, orderedLanguages, origLang);

    if (match !== null) {
      return {
        preferredLanguage,
        displayContent: match,
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

/**
 * Liste ORDONNÉE des langues préférées du lecteur (rangs 1→4 + fallback), pour
 * les surfaces qui doivent DESCENDRE le prisme afin de servir une traduction —
 * `TranslationToggle` (posts, commentaires, stories). `usePreferredLanguage`
 * (singulier) ne rend que le rang 1 et convient aux surfaces qui n'ont besoin
 * que de « ma langue » (ex. cible d'une demande de traduction manuelle).
 *
 * Parité avec iOS `APIPost.resolveTranslation` et Android
 * `LanguageResolver.preferredTranslation`, qui walk tous deux la liste
 * ordonnée. Sans fallback 'fr' de `resolveUserLanguagesOrdered`, on rétablit le
 * rang 5 pour rester en phase avec ces deux jumeaux.
 */
export function usePreferredLanguages(): string[] {
  const config = useLanguageStore((s) => s.userLanguageConfig);
  return useMemo(() => {
    const preferred = resolvePreferredLanguage(config);
    const ordered = resolveUserLanguagesOrdered(config, {
      deviceLocale: getDeviceLocale() ?? undefined,
    });
    return ordered.length > 0 ? ordered : [preferred];
  }, [config]);
}
