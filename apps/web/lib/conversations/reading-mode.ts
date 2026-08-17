/**
 * Les lentilles retenues par le verdict des modes.
 *
 * Source : `docs/design/2026-08-15-conversation-modes-verdict.html` (vol. 3).
 * Dix propositions, trois survivantes, une en sursis. Côté lecture d'un fil il
 * reste DEUX crans de zoom sémantique :
 *
 * - `focal`  — mode par défaut. Rangées plates, perspective au défilement, une
 *              seule carte : le message au point.
 * - `script` — la MÊME rangée plate, densité uniforme, sans perspective. C'est
 *              une typographie, pas un mode : le bouton `Aa` du volume 4.
 * - `bubble` — la vue à bulles historique. Ce n'est pas un mode non plus :
 *              c'est l'ancien rendu, gardé à un tap le temps de la transition.
 *
 * `resume` (Résumé Vivant), `riviere` et `scene` n'entrent PAS ici : le Résumé
 * attend l'API observer `assist:*` côté gateway, la Rivière doit gagner son
 * procès sur prototype, et la Scène est une couche live au-dessus de tout mode
 * — c'est la couche d'appel, pas une lentille de lecture.
 *
 * REV-4bis/B2 — ces trois valeurs ne sont plus un ÉTAT MÉMORISÉ. Elles
 * décrivent ce que `MessagesDisplay` sait dessiner ; la mémoire, elle, vit
 * dans le magasin du contrat, en `ReadingModePreference`. Le pont entre les
 * deux est en bas de ce fichier (`preferenceFromReadingMode` /
 * `readingModeFromPreference`) et nulle part ailleurs.
 */
import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';

export const READING_MODES = ['focal', 'script', 'bubble'] as const;

export type ReadingMode = (typeof READING_MODES)[number];

export const DEFAULT_READING_MODE: ReadingMode = 'focal';

/** Les deux densités de la rangée plate — ce que bascule le bouton `Aa`. */
export const FLAT_READING_MODES: readonly ReadingMode[] = ['focal', 'script'];

export function isReadingMode(value: unknown): value is ReadingMode {
  return typeof value === 'string' && (READING_MODES as readonly string[]).includes(value);
}

export function isFlatReadingMode(mode: ReadingMode): boolean {
  return FLAT_READING_MODES.includes(mode);
}

/**
 * `Aa` : Focal ↔ Script. Depuis la vue bulles héritée, on rentre dans les
 * densités plates par Focal plutôt que de laisser l'utilisateur hors des deux.
 */
export function nextDensity(mode: ReadingMode): ReadingMode {
  return mode === 'focal' ? 'script' : 'focal';
}

// =============================================================================
// La traduction préférence ⇄ lentille — REV-4bis/B2
// =============================================================================

/**
 * Ces trois lentilles ne sont PAS un second vocabulaire de préférence : ce
 * sont les modes que `MessagesDisplay` sait effectivement DESSINER. Depuis la
 * façade REV-4bis/B2, le seul état MÉMORISÉ est une `ReadingModePreference`
 * (magasin du contrat) ; les deux fonctions ci-dessous sont l'unique pont
 * entre ce que le lecteur choisit et ce que ce rendu-là sait montrer.
 *
 * Elles vivent ICI, à côté de l'énumération qu'elles traduisent, et nulle part
 * ailleurs — même discipline que `ReadingModePreferenceMapping` côté iOS,
 * « l'unique table de traduction de l'app » (REV-3/B2).
 */
const PREFERENCE_BY_READING_MODE: Readonly<Record<ReadingMode, ReadingModePreference>> = {
  focal: 'focal',
  script: 'script',
  // AMENDEMENT S1 (REV-4bis/B2) — sans ce mot, « Bulles » n'aurait eu aucune
  // adresse dans le magasin du contrat, et le second magasin aurait dû
  // survivre pour lui seul. Voir `packages/shared/types/reading-modes.ts`.
  bubble: 'bulles',
};

/**
 * Lentille du rendu historique ⇒ préférence mémorisable. TOTALE : les trois
 * entrées du sélecteur ont chacune leur mot, l'aller-retour est exact.
 */
export function preferenceFromReadingMode(mode: ReadingMode): ReadingModePreference {
  return PREFERENCE_BY_READING_MODE[mode];
}

/**
 * Préférence mémorisée ⇒ lentille que `MessagesDisplay` sait dessiner.
 *
 * NON bijective, et il faut le dire plutôt que le cacher : le vocabulaire de
 * préférence est plus riche que ce rendu-là.
 *
 * - `auto` ⇒ `focal`. C'est le DÉFAUT du chemin drapeau-éteint, identique au
 *   `DEFAULT_READING_MODE` d'avant la façade — la promesse « drapeau OFF,
 *   rendu bit-à-bit identique » passe précisément par cette ligne. C'est
 *   aussi pourquoi « Bulles » n'a PAS pu être rabattu sur `auto` : une valeur
 *   ne peut pas signifier à la fois « focal par défaut » et « bulles ».
 * - `resume` / `riviere` ⇒ `focal`. Ni le Résumé Vivant ni la Rivière ne sont
 *   montés dans ce rendu ; les rabattre sur `focal` REPRODUIT exactement ce
 *   que la loi ferait d'eux (`clampToCapabilities`, repli `'focal'`) plutôt
 *   que d'inventer un troisième comportement. Le fil sous drapeau ON, lui,
 *   passe par la loi elle-même et porte la RAISON du rabat.
 */
export function readingModeFromPreference(preference: ReadingModePreference): ReadingMode {
  switch (preference) {
    case 'focal':
      return 'focal';
    case 'script':
      return 'script';
    case 'bulles':
      return 'bubble';
    case 'auto':
    case 'resume':
    case 'riviere':
      return DEFAULT_READING_MODE;
  }
}
