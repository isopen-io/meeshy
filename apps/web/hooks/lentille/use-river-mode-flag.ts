'use client';

/**
 * `useRiverModeFlag` — R-134 (workshop §5 V5).
 *
 * UNIQUE DÉCIDEUR du web pour le drapeau `riviere_mode`. Lit les trois entrées
 * brutes (searchParam, cookie, env), les passe au résolveur PUR
 * `resolveRiverModeFlag`, puis APPLIQUE l'effet cookie qu'il décrit dans un
 * `useEffect` séparé — jamais pendant le rendu (même discipline que WL-100/
 * WF-110).
 *
 * AUCUN appelant n'existe encore (garde `riviere-mode-flag-single-occurrence
 * .test.ts` : zéro occurrence de `useRiverModeFlag(` hors de ce fichier et des
 * tests) — R-134 livre la peau et son drapeau, R-135 branche le menu.
 */

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseCookieValue } from './resolve-lentille-flag';
import {
  resolveRiverModeFlag,
  RIVER_MODE_COOKIE_NAME,
  RIVER_MODE_SEARCH_PARAM,
  type RiverModeCookieEffect,
} from './resolve-river-mode-flag';

// Même horizon que les cookies des deux drapeaux sœurs (liste et fil) — un an, en secondes.
const RIVER_MODE_COOKIE_MAX_AGE_SECONDS = 31_536_000;

function readRiverModeCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return parseCookieValue(document.cookie, RIVER_MODE_COOKIE_NAME);
}

function applyRiverModeCookieEffect(effect: RiverModeCookieEffect): void {
  if (typeof document === 'undefined') return;
  if (effect === 'set') {
    document.cookie = `${RIVER_MODE_COOKIE_NAME}=1; path=/; max-age=${RIVER_MODE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } else if (effect === 'clear') {
    document.cookie = `${RIVER_MODE_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  }
}

export interface UseRiverModeFlagResult {
  readonly active: boolean;
}

export function useRiverModeFlag(): UseRiverModeFlagResult {
  const searchParams = useSearchParams();

  const resolution = useMemo(
    () =>
      resolveRiverModeFlag({
        searchParam: searchParams?.get(RIVER_MODE_SEARCH_PARAM) ?? null,
        cookie: readRiverModeCookie(),
        // Accès littéral requis (Next.js remplace `process.env.NEXT_PUBLIC_*`
        // à la compilation du bundle navigateur — voir WL-100, même remarque).
        env: process.env.NEXT_PUBLIC_RIVIERE_MODE_DEFAULT ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams comparé par référence côté Next, même idiome que use-feature-flags.ts
    [searchParams]
  );

  useEffect(() => {
    applyRiverModeCookieEffect(resolution.cookieEffect);
  }, [resolution.cookieEffect]);

  return { active: resolution.active };
}
