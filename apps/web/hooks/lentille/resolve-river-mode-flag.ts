/**
 * Résolveur pur du drapeau `riviere_mode` — R-134 (workshop §5 V5, §7/§7bis/
 * §7ter).
 *
 * RE-PREUVE (§0) : `resolve-reading-modes-flag.ts` (WF-110) crée le drapeau du
 * fil sur le patron de `resolve-lentille-flag.ts` (WL-100). `resolveCapabilities`
 * (`packages/shared/utils/reading-modes.ts`) attend un TROISIÈME drapeau,
 * `isRiverFlagEnabled` — « propre à la Rivière … distinct de `isFlagEnabled`
 * (la Lentille) : la Rivière s'allume APRÈS, sur son propre calendrier »
 * (commentaire de tête de `ResolveCapabilitiesInput`). Aucun résolveur web
 * n'existait pour lui (iOS le porte déjà : `LentilleFeatureFlag.riviereMode`,
 * `meeshy.flag.riviere_mode` / `MEESHY_FLAG_RIVIERE_MODE`). Ce fichier le crée
 * sur EXACTEMENT le même patron que `resolve-reading-modes-flag.ts` — un
 * troisième fichier INDÉPENDANT, jamais une extension de WL-100/WF-110 (hors
 * périmètre d'édition de ce chantier).
 *
 *   ?riviere_mode=1 → actif pour ce navigateur + pose le cookie meeshy_riviere_mode=1
 *   ?riviere_mode=0 → efface le cookie
 *   cookie          → persiste entre les visites
 *   env             → NEXT_PUBLIC_RIVIERE_MODE_DEFAULT, le jour de l'activation générale
 *   défaut          → OFF (aucune peau Rivière montée — R-135)
 *
 * PUR par construction : ni `document`, ni `window`, ni `process.env` lus ici.
 *
 * GARDE DE CONTRAT (vérifiée en CI, `__tests__/lentille/riviere-mode-flag-
 * single-occurrence.test.ts`, MÊME patron que les deux gardes sœurs) : hors de
 * ce fichier, de `use-river-mode-flag.ts` et des fichiers de test, le nom du
 * drapeau (`RIVER_MODE_FLAG_NAME`, la chaîne `'riviere_mode'`) n'apparaît
 * NULLE PART — ce lot livre le résolveur et son drapeau (R-134 : la peau),
 * jamais son point de branchement (R-135, le dégrisage du menu).
 */

/** Le nom du drapeau au sens du contrat — clé exposée par `useRiverModeFlag`. */
export const RIVER_MODE_FLAG_NAME = 'riviere_mode' as const;

/** Nom du cookie qui persiste le choix entre deux visites. */
export const RIVER_MODE_COOKIE_NAME = 'meeshy_riviere_mode' as const;

/** Nom du paramètre de requête qui modifie le rendu (`/conversations/:id?riviere_mode=1`). */
export const RIVER_MODE_SEARCH_PARAM = 'riviere_mode' as const;

/**
 * Nom de la variable d'environnement de bascule générale. Documentaire
 * seulement (même remarque que `READING_MODES_ENV_VAR_NAME`) : Next.js
 * remplace `process.env.NEXT_PUBLIC_*` à la COMPILATION webpack — l'accès réel
 * doit rester un membre littéral dans `use-river-mode-flag.ts`.
 */
export const RIVER_MODE_ENV_VAR_NAME = 'NEXT_PUBLIC_RIVIERE_MODE_DEFAULT' as const;

export type RiverModeCookieEffect = 'set' | 'clear' | 'none';

export interface ResolveRiverModeFlagInput {
  /** Valeur brute de `?riviere_mode=` — `null`/`undefined` si absent. */
  readonly searchParam: string | null | undefined;
  /** Valeur brute du cookie `meeshy_riviere_mode` — `undefined` si absent. */
  readonly cookie: string | null | undefined;
  /** Valeur brute de `NEXT_PUBLIC_RIVIERE_MODE_DEFAULT`. */
  readonly env: string | null | undefined;
}

export interface ResolveRiverModeFlagResult {
  /** Le drapeau est-il actif pour ce rendu ? */
  readonly active: boolean;
  /** L'effet cookie à appliquer — décrit ici, jamais exécuté ici. */
  readonly cookieEffect: RiverModeCookieEffect;
}

/**
 * Résout le drapeau `riviere_mode`. Cinq branches, précédence stricte, chacune
 * retourne immédiatement — IDENTIQUE à `resolveReadingModesFlag` (WF-110),
 * appliqué à un troisième drapeau indépendant.
 */
export function resolveRiverModeFlag({
  searchParam,
  cookie,
  env,
}: ResolveRiverModeFlagInput): ResolveRiverModeFlagResult {
  if (searchParam === '1') {
    return { active: true, cookieEffect: 'set' };
  }

  if (searchParam === '0') {
    return { active: false, cookieEffect: 'clear' };
  }

  if (cookie === '1') {
    return { active: true, cookieEffect: 'none' };
  }

  if (env === 'true') {
    return { active: true, cookieEffect: 'none' };
  }

  return { active: false, cookieEffect: 'none' };
}
