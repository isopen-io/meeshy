/**
 * LES 100 NIVEAUX du Jeu Meeshy (#9373) — seuil(N) = 10 × N².
 *
 * `docs/product/jeu-meeshy-conception.html` § II.2. Le niveau se lit sur le
 * score EN POCHE (`User.engagementScore`), celui que la frappe d'une Meesh
 * débite : il peut donc redescendre. Le niveau RECORD, lui, ne redescend
 * jamais ; il règle le Vent arrière et la Gloire du premier passage.
 *
 * Le niveau minimum est 1 : le score le plus bas lit déjà « niveau 1 », dont
 * la barre part de 0. `LEVEL_THRESHOLDS` (`types/engagement.ts`, six seuils)
 * reste intact et servi aux anciens clients jusqu'à zéro usage mesuré.
 *
 * Tout est en entiers : iOS rejoue ces lois sur `game.vectors.json`.
 */

export const GAME_LEVEL_MIN = 1;
export const GAME_LEVEL_MAX = 100;
/** Le Prestige remet le niveau à 1 et ajoute une étoile ; cinq au plus. */
export const GAME_PRESTIGE_MAX = 5;

export const LEVEL_TIER_KEYS = [
  'etincelle',
  'lueur',
  'lumiere',
  'eclat',
  'rayon',
  'aurore',
  'comete',
  'etoile',
  'constellation',
  'galaxie',
] as const;

export type LevelTierKey = (typeof LEVEL_TIER_KEYS)[number];

/** Score minimal du niveau N : 10 × N². */
export const levelThreshold = (level: number): number => 10 * level * level;

const sanitizeScore = (score: number): number => (Number.isFinite(score) ? Math.max(0, Math.trunc(score)) : 0);

/** Le niveau (1 à 100) que porte ce score. */
export function levelFromScore(score: number): number {
  const s = sanitizeScore(score);
  const guess = Math.floor(Math.sqrt(s / 10));
  const exact = [guess - 1, guess, guess + 1]
    .filter((candidate) => candidate >= 0 && levelThreshold(candidate) <= s)
    .reduce((best, candidate) => Math.max(best, candidate), 0);
  return Math.min(GAME_LEVEL_MAX, Math.max(GAME_LEVEL_MIN, exact));
}

/** L'indice du palier (0 à 9) : 1–9 → 0, 10–19 → 1 … 90–100 → 9. */
export const levelTierIndex = (level: number): number =>
  Math.min(LEVEL_TIER_KEYS.length - 1, Math.floor(Math.max(0, level) / 10));

export const levelTierKey = (level: number): LevelTierKey => LEVEL_TIER_KEYS[levelTierIndex(level)] ?? 'etincelle';

export type LevelProgress = {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly score: number;
  /** Score où la barre du niveau commence — 0 au niveau 1, sinon le seuil du niveau. */
  readonly floorScore: number;
  /** Seuil du niveau suivant, `null` au niveau 100. */
  readonly nextThreshold: number | null;
  readonly pointsToNext: number;
  /** Fraction de la barre du niveau, de 0 à 1 ; `1` au niveau 100. */
  readonly progress: number;
  readonly isMax: boolean;
};

export function levelProgress(score: number): LevelProgress {
  const s = sanitizeScore(score);
  const level = levelFromScore(s);
  const floorScore = level === GAME_LEVEL_MIN ? 0 : levelThreshold(level);
  const isMax = level >= GAME_LEVEL_MAX;
  const nextThreshold = isMax ? null : levelThreshold(level + 1);
  return {
    level,
    tier: levelTierKey(level),
    score: s,
    floorScore,
    nextThreshold,
    pointsToNext: nextThreshold === null ? 0 : nextThreshold - s,
    progress: nextThreshold === null ? 1 : (s - floorScore) / (nextThreshold - floorScore),
    isMax,
  };
}

/** Le plus haut niveau atteint — `null` pour un compte qui n'en a pas encore gravé. */
export const recordLevel = (params: { readonly level: number; readonly previousRecord: number | null }): number =>
  Math.max(params.level, params.previousRecord ?? GAME_LEVEL_MIN);

/**
 * Les niveaux franchis POUR LA PREMIÈRE FOIS (Gloire du premier passage).
 * Le niveau 1 est acquis d'office : le premier niveau « gagné » est le 2.
 */
export function newLevelsReached(params: { readonly level: number; readonly previousRecord: number | null }): {
  readonly from: number;
  readonly to: number;
  readonly count: number;
} {
  const record = params.previousRecord ?? GAME_LEVEL_MIN;
  return params.level > record
    ? { from: record + 1, to: params.level, count: params.level - record }
    : { from: 0, to: 0, count: 0 };
}

/** Le Prestige s'offre au niveau 100, tant qu'il reste une étoile à poser. */
export const canPrestige = (params: { readonly level: number; readonly prestige: number }): boolean =>
  params.level >= GAME_LEVEL_MAX && params.prestige < GAME_PRESTIGE_MAX;
