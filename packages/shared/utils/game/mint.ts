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
import { GLORY_POINTS } from './glory.js';
import { levelFromScore } from './levels.js';

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
  /** Égal à `levelBefore` quand la frappe n'est pas possible. */
  readonly levelAfter: number;
  readonly levelsLost: number;
  /** `0` quand la frappe n'est pas possible. */
  readonly gloryGained: number;
};

/**
 * Ce que la frappe coûterait et rapporterait, avant confirmation. Pur : le
 * serveur le rejoue à l'écriture, les clients le montrent avant.
 */
export function previewMint(params: {
  readonly score: number;
  readonly mintedLifetime: number;
  readonly debitablePoints: number;
}): MintPreview {
  const score = sanitizeCount(params.score);
  const number = sanitizeCount(params.mintedLifetime) + 1;
  const price = meeshPrice(number);
  const debitable = sanitizeCount(params.debitablePoints);
  const canMint = debitable >= price;
  const levelBefore = levelFromScore(score);
  const levelAfter = canMint ? levelFromScore(Math.max(0, score - price)) : levelBefore;
  return {
    number,
    price,
    edition: meeshEdition(number),
    canMint,
    missingPoints: canMint ? 0 : price - debitable,
    levelBefore,
    levelAfter,
    levelsLost: levelBefore - levelAfter,
    gloryGained: canMint ? GLORY_POINTS.mint : 0,
  };
}
