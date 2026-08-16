/**
 * Résolveur pur du drapeau `reading_modes` — WF-110 (workshop §5 V4, Focal web).
 *
 * RE-PREUVE (avant d'écrire ce fichier, §0 du protocole) : `resolveLentilleFlag`
 * (`resolve-lentille-flag.ts`, WL-100) ne résout QUE le drapeau de la
 * conversation LIST (sa propre constante `LENTILLE_FLAG_NAME`). Aucun
 * résolveur web n'existe pour `reading_modes`, le
 * drapeau du FIL (`apps/ios/Meeshy/Features/Main/Lentille/Core/
 * LentilleFeatureFlag.swift:26` → `meeshy.flag.reading_modes` ;
 * `tasks/lentille-focal-workshop.md:422` ; `tasks/lentille-workshop-execution.md`
 * M-046 : « idem drapeau Focal `reading_modes` »). Ce fichier le crée, sur
 * EXACTEMENT le même patron que WL-100 — précédence, cinq branches, effet
 * cookie DÉCRIT jamais APPLIQUÉ ici — délibérément un second fichier
 * INDÉPENDANT plutôt qu'une extension de `resolve-lentille-flag.ts` ou de
 * `use-feature-flags.ts` : les deux sont des fichiers WL-100/101, hors
 * périmètre de ce chantier (règle d'or des contrats, §2 point 3 du workshop).
 *
 *   ?reading_modes=1 → actif pour ce navigateur + pose le cookie meeshy_reading_modes=1
 *   ?reading_modes=0 → efface le cookie
 *   cookie           → persiste entre les visites
 *   env              → NEXT_PUBLIC_READING_MODES_DEFAULT, le jour de l'activation générale
 *   défaut           → OFF (rendu bulle historique, bit-à-bit identique — R20/R8)
 *
 * PUR par construction : ni `document`, ni `window`, ni `process.env` lus ici.
 *
 * GARDE DE CONTRAT (vérifiée en CI, `__tests__/focal/reading-modes-flag-
 * single-occurrence.test.ts`, MÊME patron que la garde LWS-10) : hors de ce
 * fichier, de `use-reading-modes-flag.ts` et des fichiers de test, le nom du
 * drapeau (`READING_MODES_FLAG_NAME`, la chaîne `'reading_modes'`) n'apparaît
 * qu'UNE fois — au point de mux (`ConversationMessages.tsx`, WF-110).
 */

/** Le nom du drapeau au sens du contrat — clé exposée par `useReadingModesFlag`. */
export const READING_MODES_FLAG_NAME = 'reading_modes' as const;

/** Nom du cookie qui persiste le choix entre deux visites. */
export const READING_MODES_COOKIE_NAME = 'meeshy_reading_modes' as const;

/** Nom du paramètre de requête qui modifie le rendu (`/conversations/:id?reading_modes=1`). */
export const READING_MODES_SEARCH_PARAM = 'reading_modes' as const;

/**
 * Nom de la variable d'environnement de bascule générale. Documentaire
 * seulement (même remarque que `LENTILLE_ENV_VAR_NAME`, WL-100) : Next.js
 * remplace `process.env.NEXT_PUBLIC_*` à la COMPILATION webpack — l'accès
 * réel doit rester un membre littéral dans `use-reading-modes-flag.ts`.
 */
export const READING_MODES_ENV_VAR_NAME = 'NEXT_PUBLIC_READING_MODES_DEFAULT' as const;

export type ReadingModesCookieEffect = 'set' | 'clear' | 'none';

export interface ResolveReadingModesFlagInput {
  /** Valeur brute de `?reading_modes=` — `null`/`undefined` si absent. */
  readonly searchParam: string | null | undefined;
  /** Valeur brute du cookie `meeshy_reading_modes` — `undefined` si absent. */
  readonly cookie: string | null | undefined;
  /** Valeur brute de `NEXT_PUBLIC_READING_MODES_DEFAULT`. */
  readonly env: string | null | undefined;
}

export interface ResolveReadingModesFlagResult {
  /** Le drapeau est-il actif pour ce rendu ? */
  readonly active: boolean;
  /** L'effet cookie à appliquer — décrit ici, jamais exécuté ici. */
  readonly cookieEffect: ReadingModesCookieEffect;
}

/**
 * Résout le drapeau `reading_modes`. Cinq branches, précédence stricte,
 * chacune retourne immédiatement — IDENTIQUE à `resolveLentilleFlag` (WL-100),
 * appliqué à un second drapeau indépendant.
 */
export function resolveReadingModesFlag({
  searchParam,
  cookie,
  env,
}: ResolveReadingModesFlagInput): ResolveReadingModesFlagResult {
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
