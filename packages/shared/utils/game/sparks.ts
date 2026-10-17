/**
 * LES ÉTINCELLES (#10846, #10847) — l'économie des points du Jeu Meeshy, décision du porteur du 2026-10-16.
 *
 * « Étincelle » est le NOM DES POINTS. La monnaie reste la Meesh.
 *
 * ## Trois nombres, un seul solde dépensable — et c'est lui qui fait le niveau
 *
 *  - la **poche** (`User.engagementScore`, `sparks` sur le fil) : tout est convertible, la frappe
 *    dépense n'importe quelles étincelles en poche. C'est elle que le NIVEAU lit (porteur 2026-10-17,
 *    #10892) : la frappe fait donc baisser le niveau du montant dépensé ;
 *  - le **cycle** (`User.sparksSincePrestige`, `sparksCycle`) : les étincelles accumulées depuis le
 *    dernier prestige. INDICATIF, comme le total à vie : le potentiel du profil, quel que soit le niveau ;
 *  - le **total à vie** (`User.sparksEarnedLifetime`, `sparksLifetime`) : monotone côté joueur. Il
 *    ne baisse ni à la frappe ni au prestige. Seule la reprise d'un contenu retiré le réduit, dans la
 *    limite de ce que ce contenu a rapporté (ferme la triche « publier puis supprimer »).
 *
 * Invariant : poche ≤ cycle ≤ total à vie (la frappe retire de la poche seule, le prestige vide la
 * poche et le cycle seuls). Un compte d'avant le rattrapage n'a pas les deux derniers champs : ils se
 * lisent alors sur la poche (`sparksOf`), jamais sous elle.
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
import { GAME_LEVEL_MIN, levelForUnlocks, levelFromScore, tighterLevelCap, type LevelCap } from './levels.js';
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
  /** Les étincelles en poche — ce que la frappe dépense, et ce que le niveau lit. */
  readonly pocket: number;
  /** Accumulées depuis le dernier prestige — indicatif. */
  readonly cycle: number;
  /** Accumulées à vie — indicatif. */
  readonly lifetime: number;
  /**
   * La DETTE (porteur, 2026-10-16) : ce qu'une reprise de contenu supprimé n'a pas pu prélever sur la poche, déjà dépensée.
   * Elle se déduit des prochaines étincelles gagnées ; tant qu'elle existe, on ne frappe pas.
   */
  readonly debt: number;
};

/** Les colonnes du compte que la loi lit — toutes optionnelles : un compte d'avant le rattrapage ne les a pas. */
export type SparksRow = {
  readonly engagementScore?: unknown;
  readonly sparksSincePrestige?: unknown;
  readonly sparksEarnedLifetime?: unknown;
  readonly sparksDebt?: unknown;
};

/**
 * Poche, cycle et total à vie d'un compte. Le cycle n'est jamais sous la poche, le total à vie jamais
 * sous le cycle : un champ absent, ou en retard sur un écrivain concurrent, se lit sur le plus bas
 * minorant sûr.
 */
export function sparksOf(row: SparksRow | null | undefined): SparksFacts {
  const pocket = sparkCount(row?.engagementScore);
  const cycle = Math.max(pocket, sparkCount(row?.sparksSincePrestige));
  const lifetime = Math.max(cycle, sparkCount(row?.sparksEarnedLifetime));
  return { pocket, cycle, lifetime, debt: sparkCount(row?.sparksDebt) };
}

/**
 * La BASE DU NIVEAU (porteur 2026-10-17, #10892) : les étincelles en POCHE. Le cycle et le total à vie ne sont
 * qu'indicatifs. Le seul site qui le dit : tout lecteur du niveau passe par ici, jamais par `.cycle`.
 */
export const levelSparksOf = (sparks: SparksFacts): number => sparks.pocket;

/** Les colonnes du compte que lisent les décisions de niveau : les étincelles, le record du cycle, le max à vie. */
export type LevelFactsRow = SparksRow & {
  readonly levelRecord?: number | null;
  readonly levelMaxLifetime?: number | null;
};

const levelColumn = (value: number | null | undefined): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/**
 * Le niveau ACTUEL d'un compte, pour une décision (ouverture des missions, effort, duo, Prestige) : la courbe lue sur la
 * POCHE (`levelSparksOf`) — la frappe le fait baisser. Les étapes (#9706) ne se défont jamais :
 * le plus haut des deux records, du cycle et à vie, prouve les étapes faites — un prestige ne les referme pas.
 */
export function currentLevelOf(row: LevelFactsRow | null | undefined): number {
  const proof = Math.max(levelColumn(row?.levelRecord), levelColumn(row?.levelMaxLifetime));
  return levelForUnlocks({ score: levelSparksOf(sparksOf(row)), levelRecord: proof === 0 ? null : proof });
}

/**
 * Le niveau qui OUVRE les accès (ligues au 10, duo au 20) : le plus haut du niveau actuel, du record du cycle et du
 * niveau MAX À VIE. Le max à vie survit au prestige (décision du porteur, 2026-10-16) : un prestige ne ferme plus rien.
 */
export const unlockLevelOf = (row: LevelFactsRow | null | undefined): number =>
  Math.max(currentLevelOf(row), levelColumn(row?.levelRecord), levelColumn(row?.levelMaxLifetime), GAME_LEVEL_MIN);

// ---------------------------------------------------------------------------
// Ce qu'un gain et un Prestige font aux étincelles
// ---------------------------------------------------------------------------

/**
 * Un GAIN de `points` étincelles (#10846) — la loi que `writeEngagementScore` écrit en une commande Mongo, ici en pur pour
 * que les clients la rejouent en optimiste (#10902). La dette se rembourse d'abord : seul le reste va en poche, alors que le
 * cycle et le total à vie montent du gain ENTIER. Ni l'un ni l'autre ne repart sous la poche (compte d'avant le rattrapage).
 */
export function sparksAfterCredit(facts: SparksFacts, points: number): SparksFacts {
  const gained = sparkCount(points);
  const debt = sparkCount(facts.debt);
  const repaid = Math.min(debt, gained);
  const pocket = sparkCount(facts.pocket);
  const cycle = Math.max(sparkCount(facts.cycle), pocket);
  return {
    pocket: pocket + gained - repaid,
    cycle: cycle + gained,
    lifetime: Math.max(sparkCount(facts.lifetime), cycle) + gained,
    debt: debt - repaid,
  };
}

/**
 * Le PASSAGE en Prestige (#10846) : la poche et le cycle repartent de zéro ; le total à vie, indicatif et monotone, et la
 * dette, qui n'est pas remboursée par un passage, restent — ce que `PrestigeService.pass` écrit.
 */
export function sparksAfterPrestige(facts: SparksFacts): SparksFacts {
  const pocket = sparkCount(facts.pocket);
  return {
    pocket: 0,
    cycle: 0,
    lifetime: Math.max(sparkCount(facts.lifetime), sparkCount(facts.cycle), pocket),
    debt: sparkCount(facts.debt),
  };
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
  /** Ce qui empêche la frappe en dehors du prix et du rang : `'debt'` tant qu'une dette d'étincelles existe. */
  readonly blockedBy: 'debt' | null;
  /** La dette d'étincelles à rembourser avant de frapper (0 : aucune). */
  readonly sparksDebt: number;
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
 *  - la poche paie (`sparks`) et fait le niveau (#10892) : le niveau d'après se lit sur la poche moins le prix,
 *    `levelsLost` dit ce que la frappe fait perdre ;
 *  - l'étape que la frappe fait (#9706) peut relever le plafond du niveau d'après ;
 *  - le numéro de la pièce est `mintedLifetime + 1`, indépendamment du solde de la bourse ou des coffres ;
 *  - une pièce qui ferait entrer dans une réserve fermée par le rang n'est pas frappable (`locked`).
 */
export function previewSparksMint(params: {
  /** La poche — ce que la frappe dépense, et la base du niveau. */
  readonly sparks: number;
  readonly mintedLifetime: number;
  /** Les Meeshes gardées (le trésor) — jugent la réserve d'arrivée. */
  readonly held: number;
  readonly glory: number;
  readonly mythic?: boolean;
  /** Le plafond de niveau que le rang ouvre (#9688). */
  readonly levelCap: LevelCap;
  /** Les faits des étapes (#9706), le compte de Meeshes lu sur `mintedLifetime` — `null` : sans étapes. */
  readonly steps: Omit<LevelStepFacts, 'minted'> | null;
  /** La dette d'étincelles (porteur, 2026-10-16) : tant qu'elle dure, aucune frappe. Absente : aucune dette. */
  readonly debt?: number;
}): SparksMintPreview {
  const pocket = count(params.sparks);
  const number = count(params.mintedLifetime) + 1;
  const steps = params.steps === null ? null : { ...params.steps, minted: count(params.mintedLifetime) };
  const after = steps === null ? null : stepsAfterMint(steps);
  const capBefore = tighterLevelCap(params.levelCap, levelStepGate(steps));
  const capAfter = after === null ? capBefore : tighterLevelCap(levelCapForRank(after.rank), levelStepGate(after));

  const levelBefore = levelFromScore(pocket, capBefore);
  const costLevel = Math.max(GAME_LEVEL_MIN, levelBefore);
  const price = effectiveMeeshPrice(number, costLevel);
  const locked = treasuryLockFor({ held: params.held, glory: params.glory, ...(params.mythic === true ? { mythic: true } : {}) });
  const debt = count(params.debt ?? 0);
  const affordable = pocket >= price;
  const canMint = affordable && locked === null && debt === 0;
  const levelAfter = canMint ? levelFromScore(pocket - price, capAfter) : levelBefore;
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
    levelAfter,
    levelsLost: Math.max(0, levelBefore - levelAfter),
    gloryGained: canMint ? GLORY_POINTS.mint : 0,
    locked,
    blockedBy: debt > 0 ? 'debt' : null,
    sparksDebt: debt,
  };
}
