/**
 * LA RARETÉ CROISSANTE DES MEESHES (#9373) — le prix monte avec le nombre de
 * Meeshes déjà frappées. `docs/product/jeu-meeshy-conception.html` § II.3.
 *
 *     prix(n) = round(1221 × 1,06 ^ ⌊(n − 1) ÷ 10⌋), plafonné à 4 884
 *
 * `MEESH_MINT_COST` (`utils/meesh.ts`) reste la BASE — le prix des dix
 * premières — et le défaut de `computeMeeshMintPlan`. Un ancien client qui croit
 * encore au prix de 1 221 est refusé SANS débit par le serveur, qui recalcule.
 */

import { MEESH_MINT_COST } from '../meesh.js';
import { GLORY_POINTS, gloryStanding, levelCapForRank } from './glory.js';
import { levelStepGate, type LevelStepFacts } from './level-steps.js';
import { levelFromScore, tighterLevelCap, type LevelCap } from './levels.js';

export const MEESH_PRICE_STEP_EVERY = 10;
export const MEESH_PRICE_GROWTH = 1.06;
/** Quatre fois la base. */
export const MEESH_PRICE_CAP = MEESH_MINT_COST * 4;

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
