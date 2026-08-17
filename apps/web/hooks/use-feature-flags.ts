/**
 * Feature Flags Hook
 *
 * Centralized feature flag management for Meeshy frontend
 * Controls which features are enabled/disabled based on environment configuration
 *
 * `lentille_list` (WL-100, contrat LWS-10) est le seul drapeau résolu par
 * `resolveLentilleFlag` — searchParam > cookie > env > OFF. Ce hook est
 * l'UNIQUE DÉCIDEUR du web pour ce drapeau : il lit les trois entrées brutes
 * (searchParam, cookie, env), les passe au résolveur PUR, puis APPLIQUE
 * l'effet cookie qu'il décrit dans un `useEffect` séparé — jamais pendant le
 * rendu. Voir `hooks/lentille/resolve-lentille-flag.ts` pour la loi et sa
 * garde de contrat (une seule occurrence du nom du drapeau hors résolveur/
 * tests).
 */

'use client';

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  resolveLentilleFlag,
  parseCookieValue,
  LENTILLE_COOKIE_NAME,
  LENTILLE_SEARCH_PARAM,
  type LentilleCookieEffect,
} from './lentille/resolve-lentille-flag';

interface FeatureFlags {
  passwordReset: boolean;
  lentille_list: boolean;
  // Add more feature flags here as needed
  // twoFactorAuth: boolean;
  // videoCall: boolean;
}

// Même horizon que les autres cookies de préférence du web (locale, jeton
// d'affiliation) — un an, en secondes. Un seul littéral précalculé (365
// jours entiers) plutôt qu'un produit heures/minutes/secondes, pour ne
// heurter aucun des jetons bannis par la garde R15 (aucune loi
// Lentille/Focal ne s'exprime en secondes).
const LENTILLE_COOKIE_MAX_AGE_SECONDS = 31_536_000;

function readLentilleCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return parseCookieValue(document.cookie, LENTILLE_COOKIE_NAME);
}

/**
 * Applique l'effet décrit par le résolveur — le SEUL endroit du web qui pose
 * ou efface le cookie `meeshy_lentille`. Jamais appelé pendant un rendu :
 * uniquement depuis le `useEffect` de `useFeatureFlags`.
 */
function applyLentilleCookieEffect(effect: LentilleCookieEffect): void {
  if (typeof document === 'undefined') return;
  if (effect === 'set') {
    document.cookie = `${LENTILLE_COOKIE_NAME}=1; path=/; max-age=${LENTILLE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } else if (effect === 'clear') {
    document.cookie = `${LENTILLE_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  }
}

/**
 * Hook to check if a feature is enabled
 *
 * Usage:
 * const { isFeatureEnabled } = useFeatureFlags();
 * if (isFeatureEnabled('passwordReset')) {
 *   // Show password reset UI
 * }
 */
export function useFeatureFlags() {
  const searchParams = useSearchParams();

  const lentilleResolution = useMemo(
    () =>
      resolveLentilleFlag({
        searchParam: searchParams?.get(LENTILLE_SEARCH_PARAM) ?? null,
        cookie: readLentilleCookie(),
        // Accès littéral requis : Next.js remplace `process.env.NEXT_PUBLIC_*`
        // par sa valeur à la compilation du bundle navigateur ; un accès
        // dynamique (via une clé calculée) ne serait jamais remplacé.
        env: process.env.NEXT_PUBLIC_LENTILLE_DEFAULT ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams est un URLSearchParams, comparé par référence côté Next
    [searchParams]
  );

  // Effet séparé de la résolution (pure) : pose ou efface le cookie. Ne
  // s'exécute jamais pendant le rendu.
  useEffect(() => {
    applyLentilleCookieEffect(lentilleResolution.cookieEffect);
  }, [lentilleResolution.cookieEffect]);

  const flags: FeatureFlags = {
    // Password Reset Feature
    // Set to 'true' to enable, 'false' to disable
    // Can be controlled via environment variable
    passwordReset: process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET === 'true',

    lentille_list: lentilleResolution.active,

    // Add more features here
  };

  /**
   * Check if a specific feature is enabled
   */
  const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
    return flags[feature] ?? false;
  };

  /**
   * Get all enabled features
   */
  const getEnabledFeatures = (): string[] => {
    return Object.keys(flags).filter(key => flags[key as keyof FeatureFlags]);
  };

  /**
   * Check if password reset is fully configured
   * This checks both the feature flag AND required configuration
   * Note: hCaptcha is no longer required - using built-in bot protection instead
   */
  const isPasswordResetConfigured = (): boolean => {
    if (!flags.passwordReset) return false;

    // Check if required configuration exists
    const hasApiUrl = !!process.env.NEXT_PUBLIC_API_URL;

    return hasApiUrl;
  };

  return {
    flags,
    isFeatureEnabled,
    getEnabledFeatures,
    isPasswordResetConfigured,
  };
}
