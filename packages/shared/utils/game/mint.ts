/**
 * LA RARETÉ CROISSANTE DES MEESHES (#9373) — le prix monte avec le nombre de
 * Meeshes déjà frappées. `docs/product/jeu-meeshy-conception.html` § II.3.
 *
 *     prix(n) = round(1221 × 1,3 ^ ⌊(n − 1) ÷ 10⌋), plafonné à 16 556
 *
 * +30 % toutes les dix frappes (porteur, 2026-10-10, #10011) : 1 221 pour les dix premières, 1 587 de la 11e à
 * la 20e, 12 948 pour la 100e (or), et le plafond de 16 556 dès la 101e. L'ancienne loi (+6 %, plafond 4 884)
 * aurait mis 451 frappes à l'atteindre.
 *
 * `MEESH_MINT_COST` (`utils/meesh.ts`) reste la BASE — le prix des dix
 * premières — et le défaut de `computeMeeshMintPlan`. Le prix d'une frappe est
 * RECALCULÉ par le serveur (`MeeshService.mint`) : aucun client ne l'envoie, un
 * ancien client qui croit encore à l'ancien prix est refusé SANS débit quand ses
 * points ne couvrent pas le nouveau.
 */

import { MEESH_MINT_COST } from '../meesh.js';
import { MEESH_FRAGMENTS_PER_MEESH } from './chest.js';
import { GLORY_POINTS, gloryStanding, levelCapForRank } from './glory.js';
import { levelStepGate, type LevelStepFacts } from './level-steps.js';
import { levelFromScore, tighterLevelCap, type LevelCap } from './levels.js';

export const MEESH_PRICE_STEP_EVERY = 10;
export const MEESH_PRICE_GROWTH = 1.3;
/** Le plafond du prix (porteur, 2026-10-10) : atteint à la 101e frappe. */
export const MEESH_PRICE_CAP = 16_556;

export type MeeshEdition = 'silver' | 'gold' | 'prism';

const sanitizeCount = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/** Le prix de la n-ième Meesh frappée (n commence à 1 ; une valeur illisible vaut 1). */
export function meeshPrice(n: number): number {
  const rank = Math.max(1, sanitizeCount(n));
  const raw = Math.round(MEESH_MINT_COST * Math.pow(MEESH_PRICE_GROWTH, Math.floor((rank - 1) / MEESH_PRICE_STEP_EVERY)));
  return Math.min(raw, MEESH_PRICE_CAP);
}

/** Argent ; or à chaque centième ; prisme à chaque millième. Aucun avantage de jeu. */
export const meeshEdition = (n: number): MeeshEdition => {
  const rank = sanitizeCount(n);
  if (rank > 0 && rank % 1000 === 0) return 'prism';
  if (rank > 0 && rank % 100 === 0) return 'gold';
  return 'silver';
};

export type MintPreview = {
  /** Le numéro que porterait la pièce. */
  readonly number: number;
  readonly price: number;
  readonly edition: MeeshEdition;
  readonly canMint: boolean;
  readonly missingPoints: number;
  readonly levelBefore: number;
  /** Égal à `levelBefore` quand la frappe n'est pas possible. Peut MONTER : la frappe fait une étape (#9706). */
  readonly levelAfter: number;
  /** Jamais négatif : une frappe qui fait monter (étape faite) ne perd rien. */
  readonly levelsLost: number;
  /** `0` quand la frappe n'est pas possible. */
  readonly gloryGained: number;
};

/**
 * Les faits des étapes APRÈS la frappe (#9706) : une Meesh de plus, et sa Gloire — qui peut faire passer
 * un rang. Le Mythe, servi par le serveur, reste le Mythe.
 */
const stepsAfterMint = (steps: LevelStepFacts): LevelStepFacts => {
  const glory = sanitizeCount(steps.glory) + GLORY_POINTS.mint;
  return {
    ...steps,
    minted: sanitizeCount(steps.minted) + 1,
    glory,
    rank: steps.rank === 'mythe' ? 'mythe' : gloryStanding({ glory }).rank,
  };
};

/**
 * Ce que la frappe coûterait et rapporterait, avant confirmation. Pur : le
 * serveur le rejoue à l'écriture, les clients le montrent avant.
 *
 * Avec les étapes (#9706, `steps`), la frappe peut FAIRE une étape (frapper une Meesh, cinq Meeshes, ou
 * passer un rang par sa Gloire) : le niveau d'après se lit sous le plafond d'après, et peut monter.
 */
export function previewMint(params: {
  readonly score: number;
  readonly mintedLifetime: number;
  readonly debitablePoints: number;
  /** Le plafond de niveau que le rang ouvre (#9688) — `null` : sans limite. */
  readonly levelCap: LevelCap;
  /** Les faits des étapes (#9706), le compte de Meeshes lu sur `mintedLifetime` — `null` : sans étapes. */
  readonly steps: Omit<LevelStepFacts, 'minted'> | null;
}): MintPreview {
  const score = sanitizeCount(params.score);
  const number = sanitizeCount(params.mintedLifetime) + 1;
  const price = meeshPrice(number);
  const debitable = sanitizeCount(params.debitablePoints);
  const canMint = debitable >= price;
  const steps = params.steps === null ? null : { ...params.steps, minted: sanitizeCount(params.mintedLifetime) };
  const after = steps === null ? null : stepsAfterMint(steps);
  const capBefore = tighterLevelCap(params.levelCap, levelStepGate(steps));
  const capAfter = after === null ? capBefore : tighterLevelCap(levelCapForRank(after.rank), levelStepGate(after));
  const levelBefore = levelFromScore(score, capBefore);
  const levelAfter = canMint ? levelFromScore(Math.max(0, score - price), capAfter) : levelBefore;
  return {
    number,
    price,
    edition: meeshEdition(number),
    canMint,
    missingPoints: canMint ? 0 : price - debitable,
    levelBefore,
    levelAfter,
    levelsLost: Math.max(0, levelBefore - levelAfter),
    gloryGained: canMint ? GLORY_POINTS.mint : 0,
  };
}

/** Une frappe GRATUITE consomme cinq fragments de Meesh, au lieu des points (porteur, 2026-10-10, #10011). */
export const MEESH_FRAGMENT_MINT_COST = MEESH_FRAGMENTS_PER_MEESH;

export type FragmentMintPreview = {
  /** Le numéro que porterait la pièce — une frappe par fragments en est une : elle compte, et renchérit la suivante. */
  readonly number: number;
  readonly edition: MeeshEdition;
  /** Les fragments que la frappe consomme : cinq. */
  readonly cost: number;
  /** Les fragments en poche. */
  readonly held: number;
  readonly canMint: boolean;
  readonly missingFragments: number;
  readonly levelBefore: number;
  /** Aucun point débité : le niveau ne perd rien, et peut MONTER si la frappe fait une étape (#9706). */
  readonly levelAfter: number;
  /** `0` quand la frappe n'est pas possible. */
  readonly gloryGained: number;
};

/**
 * La frappe PAR FRAGMENTS (#10011) : cinq fragments, au prix courant IGNORÉ — aucun point débité, aucun niveau
 * perdu. Elle reste une frappe : numéro, édition, Gloire de frappe, et elle compte dans les frappes à vie (la
 * suivante, payée en points, coûte le prix de son rang). Pur : le serveur le rejoue à l'écriture.
 */
export function previewFragmentMint(params: {
  readonly score: number;
  readonly mintedLifetime: number;
  readonly fragmentsHeld: number;
  readonly levelCap: LevelCap;
  readonly steps: Omit<LevelStepFacts, 'minted'> | null;
}): FragmentMintPreview {
  const score = sanitizeCount(params.score);
  const number = sanitizeCount(params.mintedLifetime) + 1;
  const held = sanitizeCount(params.fragmentsHeld);
  const canMint = held >= MEESH_FRAGMENT_MINT_COST;
  const steps = params.steps === null ? null : { ...params.steps, minted: sanitizeCount(params.mintedLifetime) };
  const after = steps === null ? null : stepsAfterMint(steps);
  const capBefore = tighterLevelCap(params.levelCap, levelStepGate(steps));
  const capAfter = after === null ? capBefore : tighterLevelCap(levelCapForRank(after.rank), levelStepGate(after));
  const levelBefore = levelFromScore(score, capBefore);
  return {
    number,
    edition: meeshEdition(number),
    cost: MEESH_FRAGMENT_MINT_COST,
    held,
    canMint,
    missingFragments: canMint ? 0 : MEESH_FRAGMENT_MINT_COST - held,
    levelBefore,
    levelAfter: canMint ? Math.max(levelBefore, levelFromScore(score, capAfter)) : levelBefore,
    gloryGained: canMint ? GLORY_POINTS.mint : 0,
  };
}
