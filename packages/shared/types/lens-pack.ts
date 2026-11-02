/**
 * UNE LENS PROPOSÉE PAR UN PARTENAIRE (#11271) — ce que la passerelle exige
 * d'une proposition avant qu'elle n'atteigne la modération, en plus de ce que
 * le format lui-même exige (`parseLens`, #11270) :
 *
 *  - un COÛT MESURÉ : la passerelle pèse chaque primitive (barème ci-dessous,
 *    calé sur les vecteurs du format) et refuse une lens qui déclare moins
 *    qu'elle ne coûte — le coût déclaré choisit le palier de rendu des
 *    clients, il ne se croit pas sur parole ;
 *  - des FICHIERS exacts : ceux que les couches nomment, chacun fourni, aucun
 *    en trop, chacun sous son plafond ;
 *  - des plafonds de taille (document, fichiers, file d'attente par auteur).
 *
 * Le barème est une MESURE STATIQUE du graphe déclaré, pas un rendu : le
 * rendu headless sur fixtures reste à outiller (voir la PR de #11271).
 */
import { PACK_LIMITS } from './content-pack.js';
import { LENS_COSTS, type Lens, type LensLayer } from './lens-format.js';

export type LensCost = (typeof LENS_COSTS)[number];

export const LENS_PACK_LIMITS = {
  maxDocumentBytes: 65_536,
  maxAssets: 12,
  maxAssetBytes: 524_288,
  maxTotalAssetBytes: 3_145_728,
  maxPendingPerAuthor: 3,
  maxReviewNoteLength: PACK_LIMITS.maxReviewNoteLength,
} as const;

/** Le poids de chaque primitive : une LUT relit chaque pixel, des particules denses animent des centaines de points. */
const LAYER_WEIGHT = { lut: 2, frame: 1, sticker: 1, text: 1 } as const;
const PARTICLE_WEIGHT = { low: 1, mid: 2, high: 4 } as const;

/** Au plus `light` points : léger ; au plus `standard` : standard ; au-delà : riche. */
export const LENS_COST_THRESHOLDS = { light: 3, standard: 12 } as const;

const weightOf = (layer: LensLayer): number => (layer.kind === 'particles' ? PARTICLE_WEIGHT[layer.density] : LAYER_WEIGHT[layer.kind]);

export function measureLensCost(lens: Pick<Lens, 'layers'>): LensCost {
  const points = lens.layers.reduce((sum, layer) => sum + weightOf(layer), 0);
  if (points <= LENS_COST_THRESHOLDS.light) return 'light';
  return points <= LENS_COST_THRESHOLDS.standard ? 'standard' : 'rich';
}

const costRank = (cost: LensCost): number => LENS_COSTS.indexOf(cost);

/** Déclarer au moins ce qui est mesuré : un client qui prévoit « riche » pour une lens « standard » ne perd rien, l'inverse fait chauffer l'appareil. */
export const isLensCostDeclaredHonestly = (declared: LensCost, measured: LensCost): boolean => costRank(declared) >= costRank(measured);

const assetOf = (layer: LensLayer): string | undefined => (layer.kind === 'lut' || layer.kind === 'sticker' ? layer.asset : undefined);

/** Les fichiers que les couches nomment, une fois chacun, dans l'ordre des couches. */
export const lensAssetRefs = (lens: Pick<Lens, 'layers'>): readonly string[] =>
  [...new Set(lens.layers.map(assetOf).filter((asset): asset is string => asset !== undefined))];

/** La même lens, ses fichiers renommés (après ré-encodage) ; un fichier absent de la carte garde son adresse. */
export const withLensAssets = <L extends Pick<Lens, 'layers'>>(lens: L, renamed: ReadonlyMap<string, string>): L => ({
  ...lens,
  layers: lens.layers.map((layer) => (layer.kind === 'lut' || layer.kind === 'sticker' ? { ...layer, asset: renamed.get(layer.asset) ?? layer.asset } : layer)),
});
