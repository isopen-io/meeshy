/**
 * LES BADGES D'ACCUMULATION À SEPT PALIERS (#9392) — matières et empreinte.
 * `docs/product/jeu-meeshy-conception.html` § II.8 et § XII.2.
 *
 * `BADGE_THRESHOLDS` (`types/engagement.ts`) passe de cinq à sept paliers : 1 000
 * (Obsidienne) et 5 000 (Prisme) s'ajoutent, les clés gravées des cinq premiers
 * ne bougent pas. Ce module dit ce qui s'ENSUIT :
 *
 *  - la MATIÈRE de chaque palier, clé stable que chaque client habille (cuivre,
 *    bronze, argent, or, platine, obsidienne, prisme) ; le ruban se pose à partir
 *    de l'Or ; le Prisme est l'émail irisé qui suit l'inclinaison du téléphone ;
 *  - l'EMPREINTE d'un badge ÉTEINT par une frappe : la même médaille en creux,
 *    sans métal, qui dit ce qu'il manque pour la rallumer. L'extinction elle-même
 *    est déjà juste pour les sept paliers : `clesNonCouvertes(BADGE_THRESHOLDS, …)`
 *    (`MeeshService`) lit la constante étendue ;
 *  - ce qu'on SERT à un client qui ne connaît pas les deux nouveaux : les cinq
 *    d'origine (`LEGACY_BADGE_THRESHOLDS`), jusqu'à zéro usage mesuré.
 */

import { BADGE_THRESHOLDS, LEGACY_BADGE_THRESHOLDS } from '../../types/engagement.js';

export const BADGE_MATERIAL_KEYS = ['cuivre', 'bronze', 'argent', 'or', 'platine', 'obsidienne', 'prisme'] as const;
export type BadgeMaterialKey = (typeof BADGE_MATERIAL_KEYS)[number];

export type BadgeMaterial = {
  readonly threshold: number;
  readonly key: BadgeMaterialKey;
  /** Un ruban à partir de l'Or. */
  readonly ribbon: boolean;
  /** L'émail irisé du Prisme suit l'inclinaison du téléphone. */
  readonly iridescent: boolean;
};

const material = (threshold: number, key: BadgeMaterialKey): BadgeMaterial => ({
  threshold,
  key,
  ribbon: BADGE_MATERIAL_KEYS.indexOf(key) >= BADGE_MATERIAL_KEYS.indexOf('or'),
  iridescent: key === 'prisme',
});

export const BADGE_MATERIALS: readonly BadgeMaterial[] = [
  material(1, 'cuivre'),
  material(10, 'bronze'),
  material(50, 'argent'),
  material(100, 'or'),
  material(500, 'platine'),
  material(1000, 'obsidienne'),
  material(5000, 'prisme'),
];

/** La matière du palier, `null` pour un seuil qui n'en est pas un. */
export const badgeMaterial = (threshold: number): BadgeMaterialKey | null =>
  BADGE_MATERIALS.find((m) => m.threshold === threshold)?.key ?? null;

/** La matière du plus haut palier que le compteur couvre, `null` en dessous du premier. */
export const badgeMaterialReached = (count: number): BadgeMaterialKey | null => {
  const n = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return BADGE_MATERIALS.filter((m) => n >= m.threshold).at(-1)?.key ?? null;
};

/** `true` pour 1 000 et 5 000 : les paliers qu'un ancien client ne connaît pas. */
export const isExtendedBadgeThreshold = (threshold: number): boolean =>
  !(LEGACY_BADGE_THRESHOLDS as readonly number[]).includes(threshold) && (BADGE_THRESHOLDS as readonly number[]).includes(threshold);

/** Les paliers à servir : les cinq d'origine à un client qui ignore les nouveaux. */
export const servedBadgeThresholds = (params: { readonly knowsExtendedTiers: boolean }): readonly number[] =>
  params.knowsExtendedTiers ? [...BADGE_THRESHOLDS] : [...LEGACY_BADGE_THRESHOLDS];

export type BadgeImprint = { readonly extinguished: boolean; readonly missing: number };

/** Ce qu'il manque pour rallumer un badge tenu à ce palier — « −37 » sur l'empreinte. */
export function badgeImprint(params: { readonly count: number; readonly threshold: number }): BadgeImprint {
  const count = Number.isFinite(params.count) ? Math.max(0, Math.trunc(params.count)) : 0;
  const missing = Math.max(0, params.threshold - count);
  return { extinguished: missing > 0, missing };
}
