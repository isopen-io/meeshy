/**
 * LES NIVEAUX du Jeu Meeshy (#9373, ouverts par le rang depuis #9688) — seuil(N) = 100 × N² (#9706).
 *
 * `docs/product/jeu-meeshy-conception.html` § II.2. Le niveau se lit sur le
 * score EN POCHE (`User.engagementScore`), celui que la frappe d'une Meesh
 * débite : il peut donc redescendre. Le niveau RECORD, lui, ne redescend
 * jamais ; il règle le Vent arrière et la Gloire du premier passage.
 *
 * ## Un million de points pour le niveau 100, une étape tous les dix niveaux (#9706, porteur 2026-10-08)
 *
 * La courbe vaut 100 × N² : le niveau 10 demande 10 000 points, le 50 en
 * demande 250 000, le 100 un million. Et de 10 à 100, chaque dizaine demande
 * une ÉTAPE simple (`level-steps.ts`) : sans elle, le niveau attend au palier
 * précédent, puis monte d'un coup dès qu'elle est faite. Le niveau servi est
 * donc le plus petit de trois : celui des points, le plafond du rang, et le
 * palier des étapes (`levelProgress(score, cap, gate)`).
 *
 * Les étapes ne se défont jamais (une Meesh frappée le reste, une mission faite
 * aussi, le record de Flamme et le rang ne redescendent pas) : le palier qu'elles
 * ouvrent ne se referme pas. D'où la lecture SANS relire les étapes
 * (`levelForUnlocks`) : un record gravé au-delà d'une dizaine prouve que son
 * étape est faite, et sous le record, le niveau ne passe pas la dizaine suivante.
 *
 * ## La courbe ne s'arrête plus à 100 (#9688, porteur 2026-10-08)
 *
 * La formule continue sans fin ; c'est le RANG de Gloire qui ouvre les niveaux
 * (`levelCapForRank`, `glory.ts`) : 499 au plus sous Ambassadeur, 1000 pour
 * Ambassadeur et Orateur, sans limite à partir d'Oracle. Un compte qui porte
 * plus de points que son plafond lit son plafond, et monte dès que son rang
 * l'ouvre — le rang ne redescend jamais, un plafond levé ne se referme pas.
 * Le niveau 100 n'est plus un maximum : c'est le seuil du Prestige, facultatif.
 *
 * Le niveau minimum est 1 : le score le plus bas lit déjà « niveau 1 », dont
 * la barre part de 0. `LEVEL_THRESHOLDS` (`types/engagement.ts`, six seuils)
 * reste intact et servi aux anciens clients jusqu'à zéro usage mesuré.
 *
 * ## Rétrocompatibilité du fil (#9223)
 *
 * Les clients publiés bornent le niveau à 100 et décodent STRICTEMENT les dix
 * premiers paliers (web : `isInt(v, 1, 100)` ; iOS : `LevelTierKey` à dix cas,
 * qui fait tomber le bloc entier sur une clé inconnue). Le fil garde donc ses
 * champs d'hier sous l'ANCIENNE loi — `legacyLevelProgress` : le niveau borné
 * à 100, le palier parmi les dix premiers — et porte la nouvelle lecture dans
 * un objet NEUF (`ladder`), comme `division` / `division5` pour les rangs.
 *
 * Tout est en entiers : iOS rejoue ces lois sur `game.vectors.json`.
 */

export const GAME_LEVEL_MIN = 1;
/** Le niveau où le Prestige s'offre — un seuil, plus un maximum (#9688). */
export const GAME_PRESTIGE_LEVEL = 100;
/** Le plafond de l'ANCIENNE loi : la borne des champs que lisent les clients publiés. */
export const LEGACY_LEVEL_MAX = 100;
/** Le Prestige remet le niveau à 1 et ajoute une étoile ; cinq au plus. */
export const GAME_PRESTIGE_MAX = 5;

/** Le plafond d'un compte sous Ambassadeur. */
export const LEVEL_CAP_BASE = 499;
/** Le plafond d'Ambassadeur et d'Orateur ; Oracle et au-delà n'en ont plus. */
export const LEVEL_CAP_AMBASSADOR = 1000;

/** Le plus haut niveau lisible — `null` : sans limite. */
export type LevelCap = number | null;
/** Aucune limite : la lecture brute de la courbe (Oracle et au-delà). */
export const NO_LEVEL_CAP: LevelCap = null;

/** Les dix paliers d'hier — 1 à 100 —, les seuls que lisent les clients publiés. */
export const LEGACY_LEVEL_TIER_KEYS = [
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

/**
 * Les vingt paliers : les dix d'hier (1–100), neuf de cent niveaux (101–199,
 * 200–299 … 900–999), puis Singularité à partir de 1000, sans borne haute.
 */
export const LEVEL_TIER_KEYS = [
  ...LEGACY_LEVEL_TIER_KEYS,
  'nebuleuse',
  'pulsar',
  'quasar',
  'supernova',
  'magnetar',
  'amas',
  'superamas',
  'cosmos',
  'infini',
  'singularite',
] as const;

export type LevelTierKey = (typeof LEVEL_TIER_KEYS)[number];
export type LegacyLevelTierKey = (typeof LEGACY_LEVEL_TIER_KEYS)[number];

/** Score minimal du niveau N : 100 × N² (#9706) — un million pour le niveau 100. */
export const levelThreshold = (level: number): number => 100 * level * level;

/** Une étape tous les dix niveaux (#9706)… */
export const LEVEL_STEP_INTERVAL = 10;
/** …jusqu'au niveau 100 : au-delà, seuls les plafonds du rang (#9688). */
export const LEVEL_STEP_LAST = 100;

const sanitizeScore = (score: number): number => (Number.isFinite(score) ? Math.max(0, Math.trunc(score)) : 0);

/**
 * FAIL-CLOSED : seul un `null` EXPLICITE vaut « sans limite ». Un plafond illisible — NaN, infini, absent,
 * pas un nombre — retombe sur le plus bas (499) : une Gloire illisible n'ouvre jamais les niveaux.
 */
const sanitizeCap = (cap: LevelCap): LevelCap => {
  if (cap === null) return null;
  return typeof cap === 'number' && Number.isFinite(cap) ? Math.max(GAME_LEVEL_MIN, Math.trunc(cap)) : LEVEL_CAP_BASE;
};

/** FAIL-CLOSED aussi : un palier d'étapes illisible retient au plus bas, sous la première étape (9). */
const sanitizeGate = (gate: LevelCap): LevelCap => {
  if (gate === null) return null;
  return typeof gate === 'number' && Number.isFinite(gate) ? Math.max(GAME_LEVEL_MIN, Math.trunc(gate)) : LEVEL_STEP_INTERVAL - 1;
};

/** Le plus serré de deux plafonds — `null` ne borne rien. */
export const tighterLevelCap = (a: LevelCap, b: LevelCap): LevelCap => {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
};

/**
 * Le plus haut niveau qu'on lit sans relire les étapes, depuis le record (#9706) : la dizaine qui suit le
 * record, moins un — `null` au-delà de la dernière étape. Le record ne franchit une dizaine qu'étape faite ;
 * une étape faite ne se défait pas.
 */
export const levelStepCeiling = (levelRecord: number | null): LevelCap => {
  const record = levelRecord !== null && Number.isFinite(levelRecord) ? Math.max(GAME_LEVEL_MIN, Math.trunc(levelRecord)) : GAME_LEVEL_MIN;
  if (record >= LEVEL_STEP_LAST) return null;
  return (Math.floor(record / LEVEL_STEP_INTERVAL) + 1) * LEVEL_STEP_INTERVAL - 1;
};

/** Le niveau que porte ce score, borné par le plafond (`null` : sans limite). */
export function levelFromScore(score: number, cap: LevelCap): number {
  const s = sanitizeScore(score);
  const guess = Math.floor(Math.sqrt(s / 100));
  const exact = [guess - 1, guess, guess + 1]
    .filter((candidate) => candidate >= 0 && levelThreshold(candidate) <= s)
    .reduce((best, candidate) => Math.max(best, candidate), 0);
  const bound = sanitizeCap(cap);
  return Math.max(GAME_LEVEL_MIN, bound === null ? exact : Math.min(bound, exact));
}

/**
 * Le niveau lu sur le score et le RECORD seuls, pour une décision qui ne le compare qu'à un seuil de 100 au
 * plus : l'ouverture des missions, de la ligue, du duo et du Prestige, l'effort des missions, le Vent arrière.
 * Tout plafond de rang vaut au moins 499 : il ne change rien sous 100. Les étapes, si (#9706) : le niveau ne
 * passe pas la dizaine qui suit le record (`levelStepCeiling`) — c'est le record, gravé étape faite, qui en
 * porte la preuve, sans relire les Meeshes, les missions, la Flamme ni la Gloire.
 */
export const levelForUnlocks = (params: { readonly score: number; readonly levelRecord: number | null }): number =>
  levelFromScore(params.score, levelStepCeiling(params.levelRecord));

const SINGULARITY_LEVEL = 1000;
const LEGACY_TIER_COUNT = LEGACY_LEVEL_TIER_KEYS.length;

/**
 * L'indice du palier (0 à 19) : 1–9 → 0, 10–19 → 1 … 90–100 → 9, puis
 * 101–199 → 10, 200–299 → 11 … 900–999 → 18, et 1000 ou plus → 19.
 */
export const levelTierIndex = (level: number): number => {
  const n = Number.isFinite(level) ? Math.max(0, Math.trunc(level)) : 0;
  if (n <= LEGACY_LEVEL_MAX) return Math.min(LEGACY_TIER_COUNT - 1, Math.floor(n / 10));
  if (n >= SINGULARITY_LEVEL) return LEVEL_TIER_KEYS.length - 1;
  return LEGACY_TIER_COUNT - 1 + Math.floor(n / 100);
};

export const levelTierKey = (level: number): LevelTierKey => LEVEL_TIER_KEYS[levelTierIndex(level)] ?? 'etincelle';

/** Le premier niveau d'un palier : 1, 10, 20 … 90, puis 101, 200, 300 … 900, et 1000. */
export const levelTierStart = (tier: LevelTierKey): number => {
  const index = LEVEL_TIER_KEYS.indexOf(tier);
  if (index <= 0) return GAME_LEVEL_MIN;
  if (index < LEGACY_TIER_COUNT) return index * 10;
  if (index === LEGACY_TIER_COUNT) return LEGACY_LEVEL_MAX + 1;
  if (index === LEVEL_TIER_KEYS.length - 1) return SINGULARITY_LEVEL;
  return (index - LEGACY_TIER_COUNT + 1) * 100;
};

/** Le niveau tel que l'ancienne loi le lit : borné à 100. */
export const legacyLevel = (level: number): number => Math.min(LEGACY_LEVEL_MAX, Math.max(GAME_LEVEL_MIN, Math.trunc(level)));

/** Le palier tel que l'ancienne loi le lit : l'un des dix premiers, Galaxie au-delà de 90. */
export const legacyLevelTierKey = (level: number): LegacyLevelTierKey =>
  LEGACY_LEVEL_TIER_KEYS[levelTierIndex(legacyLevel(level))] ?? 'etincelle';

export type LevelProgress = {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly score: number;
  /** Score où la barre du niveau commence — 0 au niveau 1, sinon le seuil du niveau. */
  readonly floorScore: number;
  /** Seuil du niveau suivant, `null` au plafond. */
  readonly nextThreshold: number | null;
  readonly pointsToNext: number;
  /** Fraction de la barre du niveau, de 0 à 1 ; `1` au plafond. */
  readonly progress: number;
  /** Le niveau est au plafond que le rang lui ouvre : il ne monte plus tant que le rang ne change pas. */
  readonly isMax: boolean;
  /** Le plafond appliqué — `null` : sans limite. */
  readonly cap: LevelCap;
  /**
   * Les points sont là, une ÉTAPE manque (#9706) : le niveau attend au palier précédent, la barre est
   * pleine sans plus rien à gagner, et il monte d'un coup dès que l'étape est faite.
   */
  readonly held: boolean;
};

/**
 * Où se tient ce score sur la courbe, sous le plafond du rang (`cap`) et le palier des étapes (`gate`, #9706) —
 * `null` : sans limite. Au plafond du rang, la barre est pleine et sans suite (`isMax`) ; retenu par une
 * étape, elle est pleine et la suite reste dite (`held`, `pointsToNext` à 0).
 */
export function levelProgress(score: number, cap: LevelCap, gate: LevelCap = NO_LEVEL_CAP): LevelProgress {
  const s = sanitizeScore(score);
  const bound = sanitizeCap(cap);
  const hold = sanitizeGate(gate);
  const level = levelFromScore(s, tighterLevelCap(bound, hold));
  const floorScore = level === GAME_LEVEL_MIN ? 0 : levelThreshold(level);
  const isMax = bound !== null && level >= bound;
  const held = !isMax && hold !== null && level >= hold && levelFromScore(s, bound) > level;
  const nextThreshold = isMax ? null : levelThreshold(level + 1);
  return {
    level,
    tier: levelTierKey(level),
    score: s,
    floorScore,
    nextThreshold,
    pointsToNext: nextThreshold === null ? 0 : Math.max(0, nextThreshold - s),
    progress: nextThreshold === null ? 1 : Math.min(1, (s - floorScore) / (nextThreshold - floorScore)),
    isMax,
    cap: bound,
    held,
  };
}

/**
 * La lecture de l'ANCIENNE loi — celle que portent les champs d'hier du fil :
 * le niveau borné à 100 (plein, sans suite, au-delà), le palier parmi les dix
 * premiers. Tout plafond de rang vaut au moins 499 : il ne change rien sous 100.
 * Le palier des étapes, si (#9706) : un ancien client lit le même niveau que
 * les autres, jamais celui des seuls points.
 */
export const legacyLevelProgress = (score: number, gate: LevelCap = NO_LEVEL_CAP): LevelProgress & { readonly tier: LegacyLevelTierKey } => {
  const p = levelProgress(score, LEGACY_LEVEL_MAX, gate);
  return { ...p, tier: legacyLevelTierKey(p.level) };
};

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

/** Le Prestige s'offre à partir du niveau 100, tant qu'il reste une étoile à poser — il reste facultatif. */
export const canPrestige = (params: { readonly level: number; readonly prestige: number }): boolean =>
  params.level >= GAME_PRESTIGE_LEVEL && params.prestige < GAME_PRESTIGE_MAX;
