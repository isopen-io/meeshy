/**
 * `useReadingModesFlag` — WF-110 (workshop §5 V4).
 *
 * UNIQUE DÉCIDEUR du web pour le drapeau `reading_modes` (le fil / Focal) —
 * pendant du décideur de la conversation LIST dans `useFeatureFlags`, pour
 * la MÊME raison documentée dans `resolve-reading-modes-flag.ts` :
 * `use-feature-flags.ts` est un fichier WL-100, hors périmètre d'édition de
 * ce chantier.
 *
 * Lit les trois entrées brutes (searchParam, cookie, env), les passe au
 * résolveur PUR `resolveReadingModesFlag`, puis APPLIQUE l'effet cookie
 * qu'il décrit dans un `useEffect` séparé — jamais pendant le rendu (même
 * discipline que WL-100).
 *
 * `parseCookieValue` est IMPORTÉ (lecture seule) depuis `resolve-lentille-
 * flag.ts` plutôt que redupliqué : c'est un analyseur de cookie générique,
 * sans rapport avec le nom d'aucun drapeau — l'importer ne touche ni ne
 * risque la garde « une seule occurrence » du drapeau de la liste
 * (WL-100/101, sa propre constante `LENTILLE_FLAG_NAME`).
 */
'use client';

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseCookieValue } from './resolve-lentille-flag';
import {
  resolveReadingModesFlag,
  READING_MODES_COOKIE_NAME,
  READING_MODES_SEARCH_PARAM,
  type ReadingModesCookieEffect,
} from './resolve-reading-modes-flag';

// Même horizon que le cookie `meeshy_lentille` (WL-100) — un an, en secondes.
const READING_MODES_COOKIE_MAX_AGE_SECONDS = 31_536_000;

function readReadingModesCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return parseCookieValue(document.cookie, READING_MODES_COOKIE_NAME);
}

function applyReadingModesCookieEffect(effect: ReadingModesCookieEffect): void {
  if (typeof document === 'undefined') return;
  if (effect === 'set') {
    document.cookie = `${READING_MODES_COOKIE_NAME}=1; path=/; max-age=${READING_MODES_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } else if (effect === 'clear') {
    document.cookie = `${READING_MODES_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  }
}

export interface UseReadingModesFlagResult {
  readonly active: boolean;
}

export function useReadingModesFlag(): UseReadingModesFlagResult {
  const searchParams = useSearchParams();

  const resolution = useMemo(
    () =>
      resolveReadingModesFlag({
        searchParam: searchParams?.get(READING_MODES_SEARCH_PARAM) ?? null,
        cookie: readReadingModesCookie(),
        // Accès littéral requis (Next.js remplace `process.env.NEXT_PUBLIC_*`
        // à la compilation du bundle navigateur — voir WL-100, même remarque).
        env: process.env.NEXT_PUBLIC_READING_MODES_DEFAULT ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams comparé par référence côté Next, même idiome que use-feature-flags.ts
    [searchParams]
  );

  useEffect(() => {
    applyReadingModesCookieEffect(resolution.cookieEffect);
  }, [resolution.cookieEffect]);

  return { active: resolution.active };
}
