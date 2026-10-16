/**
 * LES ÉTINCELLES (#10846, #10847) — l'économie des points du Jeu Meeshy, décision du porteur du 2026-10-16.
 *
 * « Étincelle » est le NOM DES POINTS. La monnaie reste la Meesh.
 *
 * ## Trois nombres, un seul solde dépensable
 *
 *  - la **poche** (`User.engagementScore`, `sparks` sur le fil) : tout est convertible, la frappe
 *    dépense n'importe quelles étincelles en poche. Il n'y a plus de « points à convertir » ;
 *  - le **cycle** (`User.sparksSincePrestige`, `sparksCycle`) : les étincelles accumulées depuis le
 *    dernier prestige. C'est lui que le NIVEAU lit — la frappe ne le touche jamais, donc ne fait plus
 *    baisser le niveau ;
 *  - le **total à vie** (`User.sparksEarnedLifetime`, `sparksLifetime`) : monotone côté joueur. Il
 *    ne baisse ni à la frappe ni au prestige. Seule la reprise d'un contenu retiré le réduit, dans la
 *    limite de ce que ce contenu a rapporté (ferme la triche « publier puis supprimer »).
 *
 * Invariant : poche ≤ cycle ≤ total à vie (la frappe retire de la poche seule, le prestige vide la
 * poche et le cycle seuls). Un compte d'avant le rattrapage n'a pas les deux derniers champs : ils se
 * lisent alors sur la poche (`sparksOf`), jamais sous elle — le niveau ne baisse pas.
 *
 * ## Type numérique, et pourquoi
 *
 * `User.engagementScore` est un `Int` Prisma (32 bits relus : un `long` Mongo hors Int32 fait lever la
 * lecture). Le niveau est sans limite (`levelThreshold = 100 × N²` : 1,6 milliard au niveau 4000), le
 * total à vie encore plus : les deux champs neufs sont des `BigInt` (`long`). Sur le fil, ils partent en
 * NOMBRE JSON — jamais un BigInt (que `JSON.stringify` refuse) ni une chaîne : `sparkCount` les ramène
 * à un entier sûr et SATURE à `Number.MAX_SAFE_INTEGER` (9 007 199 254 740 991), qu'aucun compte
 * n'approche (le niveau 1 million n'en demande que 10¹⁴).
 *
 * ## Le coût d'une frappe selon le niveau ACTUEL (#10847)
 *
 * `prix(n)` (`mint.ts`) garde le numéro de la pièce ; un facteur de NIVEAU ACTUEL s'y applique,
 * quel que soit le niveau max historique :
 *
 *     facteur(niveau) = borné(0,5 + niveau ÷ 200 ; 0,5 ; 1)
 *
 * soit 50 % au niveau 0 et plein tarif dès le niveau 100. **Réglable** : tout vit dans les deux
 * constantes ci-dessous. Le serveur recalcule toujours le prix ; les clients le montrent d'après le
 * même calcul. Tout est en entiers (millièmes) : iOS rejoue la loi sans flottant.
 */

import { GLORY_POINTS, gloryStanding, levelCapForRank } from './glory.js';
import { levelStepGate, type LevelStepFacts } from './level-steps.js';
import { GAME_LEVEL_MIN, levelFromScore, tighterLevelCap, type LevelCap } from './levels.js';
import { meeshEdition, meeshPrice, type MintPreview } from './mint.js';
import { treasuryLockFor, type TreasuryLock } from './treasury.js';

// ---------------------------------------------------------------------------
// Les nombres sûrs
// ---------------------------------------------------------------------------

/**
 * Un entier sûr, positif ou nul, depuis ce que la base ou le fil rend : `number`, `bigint`
 * (colonne `BigInt`), ou chaîne entière. Tout le reste vaut 0. SATURE au lieu de perdre des chiffres.
 */
export function sparkCount(value: unknown): number {
  if (typeof value === 'bigint') {
    if (value <= 0n) return 0;
    return value >= BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
  }
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value.trim())) return 0;
    return sparkCount(BigInt(value.trim()));
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  if (value >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return Math.trunc(value);
}

export type SparksFacts = {
  /** Les étincelles en poche — ce que la frappe dépense. */
  readonly pocket: number;
  /** Accumulées depuis le dernier prestige — ce que le niveau lit. */
  readonly cycle: number;
  /** Accumulées à vie. */
  readonly lifetime: number;
};

/** Les colonnes du compte que la loi lit — toutes optionnelles : un compte d'avant le rattrapage ne les a pas. */
export type SparksRow = {
  readonly engagementScore?: unknown;
  readonly sparksSincePrestige?: unknown;
  readonly sparksEarnedLifetime?: unknown;
};

/**
 * Poche, cycle et total à vie d'un compte. Le cycle n'est jamais sous la poche, le total à vie jamais
 * sous le cycle : un champ absent, ou en retard sur un écrivain concurrent, se lit sur le plus bas
 * minorant sûr — le niveau ne baisse donc jamais faute d'un champ.
 */
export function sparksOf(row: SparksRow | null | undefined): SparksFacts {
  const pocket = sparkCount(row?.engagementScore);
  const cycle = Math.max(pocket, sparkCount(row?.sparksSincePrestige));
  const lifetime = Math.max(cycle, sparkCount(row?.sparksEarnedLifetime));
  return { pocket, cycle, lifetime };
}

// ---------------------------------------------------------------------------
// Le coût selon le niveau actuel
// ---------------------------------------------------------------------------

/** Le facteur au niveau 0, en millièmes : 50 %. RÉGLABLE (#10847). */
export const MINT_COST_FACTOR_AT_LEVEL_ZERO_PERMILLE = 500;
/** Le niveau à partir duquel la frappe est au plein tarif. RÉGLABLE (#10847). */
export const MINT_COST_FULL_PRICE_LEVEL = 100;

const FULL_PERMILLE = 1000;

/**
 * Le facteur de coût en MILLIÈMES entiers (500 à 1000) pour ce niveau ACTUEL. Linéaire de
 * `MINT_COST_FACTOR_AT_LEVEL_ZERO_PERMILLE` (niveau 0) à 1000 (niveau `MINT_COST_FULL_PRICE_LEVEL`).
 * FAIL-CLOSED : un niveau illisible paie le plein tarif ; un niveau négatif, le plancher.
 */
export function mintCostFactorPermille(level: number): number {
  if (typeof level !== 'number' || !Number.isFinite(level)) return FULL_PERMILLE;
  const bounded = Math.min(MINT_COST_FULL_PRICE_LEVEL, Math.max(0, Math.trunc(level)));
  const span = FULL_PERMILLE - MINT_COST_FACTOR_AT_LEVEL_ZERO_PERMILLE;
  return MINT_COST_FACTOR_AT_LEVEL_ZERO_PERMILLE + Math.floor((span * bounded) / MINT_COST_FULL_PRICE_LEVEL);
}

/** Le facteur de coût, de 0,5 à 1 — `mintCostFactorPermille ÷ 1000`, exact à trois décimales. */
export const mintCostFactor = (level: number): number => mintCostFactorPermille(level) / FULL_PERMILLE;

/** Le prix de la n-ième Meesh pour un compte à ce niveau ACTUEL : `prix(n)` × le facteur, arrondi, au moins 1. */
export function effectiveMeeshPrice(n: number, level: number): number {
  return Math.max(1, Math.round((meeshPrice(n) * mintCostFactorPermille(level)) / FULL_PERMILLE));
}

// ---------------------------------------------------------------------------
// L'aperçu de frappe
// ---------------------------------------------------------------------------

export type SparksMintPreview = MintPreview & {
  /** Le prix de rang de la pièce, avant le facteur de niveau (`meeshPrice(number)`). */
  readonly basePrice: number;
  /** Le facteur de niveau actuel appliqué, de 0,5 à 1. */
  readonly costFactor: number;
  /** Le niveau ACTUEL dont le facteur est lu. */
  readonly costLevel: number;
  /** La réserve du trésor que la rang ne rouvre pas et qui barre la pièce — `null` : libre. */
  readonly locked: TreasuryLock | null;
};

const count = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/** Les faits des étapes APRÈS la frappe : une Meesh de plus, et sa Gloire (qui peut faire passer un rang). */
const stepsAfterMint = (steps: LevelStepFacts): LevelStepFacts => {
  const glory = count(steps.glory) + GLORY_POINTS.mint;
  return {
    ...steps,
    minted: count(steps.minted) + 1,
    glory,
    rank: steps.rank === 'mythe' ? 'mythe' : gloryStanding({ glory }).rank,
  };
};

/**
 * Ce que la frappe coûterait et rapporterait, avant confirmation — la loi des étincelles. Pur : le
 * serveur le rejoue à l'écriture, les clients le montrent avant.
 *
 *  - la poche paie (`sparks`), le niveau se lit sur le CYCLE (`cycle`) que la frappe ne touche pas :
 *    `levelsLost` vaut toujours 0 (champ conservé pour les clients publiés) ;
 *  - le niveau d'après peut MONTER (la frappe fait une étape, #9706) ;
 *  - le numéro de la pièce est `mintedLifetime + 1`, indépendamment du solde de la bourse ou des coffres ;
 *  - une pièce qui ferait entrer dans une réserve fermée par le rang n'est pas frappable (`locked`).
 */
export function previewSparksMint(params: {
  /** La poche. */
  readonly sparks: number;
  /** Les étincelles du cycle — la base du niveau. */
  readonly cycle: number;
  readonly mintedLifetime: number;
  /** Les Meeshes gardées (le trésor) — jugent la réserve d'arrivée. */
  readonly held: number;
  readonly glory: number;
  readonly mythic?: boolean;
  /** Le plafond de niveau que le rang ouvre (#9688). */
  readonly levelCap: LevelCap;
  /** Les faits des étapes (#9706), le compte de Meeshes lu sur `mintedLifetime` — `null` : sans étapes. */
  readonly steps: Omit<LevelStepFacts, 'minted'> | null;
}): SparksMintPreview {
  const pocket = count(params.sparks);
  const cycle = count(params.cycle);
  const number = count(params.mintedLifetime) + 1;
  const steps = params.steps === null ? null : { ...params.steps, minted: count(params.mintedLifetime) };
  const after = steps === null ? null : stepsAfterMint(steps);
  const capBefore = tighterLevelCap(params.levelCap, levelStepGate(steps));
  const capAfter = after === null ? capBefore : tighterLevelCap(levelCapForRank(after.rank), levelStepGate(after));

  const levelBefore = levelFromScore(cycle, capBefore);
  const costLevel = Math.max(GAME_LEVEL_MIN, levelBefore);
  const price = effectiveMeeshPrice(number, costLevel);
  const locked = treasuryLockFor({ held: params.held, glory: params.glory, ...(params.mythic === true ? { mythic: true } : {}) });
  const affordable = pocket >= price;
  const canMint = affordable && locked === null;
  return {
    number,
    price,
    basePrice: meeshPrice(number),
    costFactor: mintCostFactor(costLevel),
    costLevel,
    edition: meeshEdition(number),
    canMint,
    missingPoints: affordable ? 0 : price - pocket,
    levelBefore,
    // La frappe ne retire rien au cycle : le niveau ne baisse jamais ; il monte si l'étape qu'elle fait l'ouvre.
    levelAfter: canMint ? levelFromScore(cycle, capAfter) : levelBefore,
    levelsLost: 0,
    gloryGained: canMint ? GLORY_POINTS.mint : 0,
    locked,
  };
}
