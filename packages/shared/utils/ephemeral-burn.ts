/**
 * LA COMBUSTION D'UN ÉPHÉMÈRE (#17938) — la loi, écrite UNE fois.
 *
 * Directive porteur 2026-11-13 : « une animation de message qui s'enflamme
 * lorsque les messages éphémères disparaissent après un compteur — un vrai
 * effet en utilisant la carte graphique si disponible pour brûler les lettres,
 * faire disparaître comme des étincelles et les flammes autour, et un vent qui
 * fait disparaître à gauche ou à droite selon la direction de mouvement de
 * l'appareil ».
 *
 * Ce module ne peint rien : il rend ce sur quoi les TROIS clients doivent
 * s'accorder pour que la même destruction se lise pareil partout.
 *
 *   - la DURÉE — l'hôte qui retire la ligne et la vue qui brûle la lisent au
 *     même endroit, sans quoi la ligne part au milieu de sa combustion ou
 *     laisse un trou après elle (#7467) ;
 *   - le VENT — ce que l'appareil dit (roulis, accélération latérale), ce qu'on
 *     en fait quand il ne dit rien (le bord extérieur de la bulle), et sa zone
 *     morte : un téléphone tenu en main n'est jamais à zéro, et un roulis de
 *     quelques degrés n'est pas un geste ;
 *   - le SENS DU FRONT — le feu s'allume du côté D'OÙ vient le vent et avance
 *     avec lui. Il est figé à l'allumage : un vent qui change de signe à
 *     mi-combustion ne fait pas renaître des lettres déjà brûlées. La DÉRIVE,
 *     elle, suit le vent en direct — c'est elle qui couche les flammes ;
 *   - les TROIS TEMPS — ignition, propagation, cendres — que les shaders
 *     parcourent avec le même `progress`.
 *
 * Miroirs : `EphemeralBurnLaw` (`packages/MeeshySDK/.../Models/EphemeralBurnLaw.swift`)
 * et `EphemeralBurnLaw.kt` (`apps/android/core/model`). Toute évolution touche
 * les trois, et les vecteurs de `ephemeral-burn.test.ts` se rejouent chez eux.
 *
 * Conception : `docs/superpowers/specs/2026-11-13-combustion-des-ephemeres-design.md`.
 */

/** La combustion complète — assez longue pour être lue, assez courte pour ne pas retenir le fil. */
export const EPHEMERAL_BURN_FULL_MS = 1200;

/** Le fondu servi sous « Réduire les animations » : le mouvement part, l'annonce reste. */
export const EPHEMERAL_BURN_FADE_MS = 250;

/** Sous cette valeur absolue, le geste n'en est pas un : le vent par défaut joue. */
export const EPHEMERAL_BURN_WIND_DEAD_ZONE = 0.08;

/** Le vent sans geste, vers le bord extérieur de la bulle. */
export const EPHEMERAL_BURN_DEFAULT_WIND = 0.35;

/** Fin de l'ignition (la braise s'allume au bord) et fin de la propagation (le front traverse). */
export const EPHEMERAL_BURN_IGNITION_END = 0.15;
export const EPHEMERAL_BURN_SPREAD_END = 0.8;

const ROLL_WEIGHT = 4;
const LATERAL_WEIGHT = 2;

/** De quel côté de l'écran la bulle vit : `mine` à droite, `theirs` à gauche. */
export type EphemeralBurnSide = 'mine' | 'theirs';

export type EphemeralBurnPhase = 'ignition' | 'spread' | 'ashes';

export function ephemeralBurnDurationMs(reduceMotion: boolean): number {
  return reduceMotion ? EPHEMERAL_BURN_FADE_MS : EPHEMERAL_BURN_FULL_MS;
}

const finiteOrZero = (value: number | null): number => (value !== null && Number.isFinite(value) ? value : 0);

const hasReading = (value: number | null): boolean => value !== null && Number.isFinite(value);

/**
 * Le vent BRUT lu de l'appareil, `+1` = vers la droite de l'écran, borné à ±1.
 * `null` quand aucun capteur ne parle, ou que le geste est sous la zone morte.
 *
 * @param rollTurns le roulis en TOURS (±0,5 au plus, 0 à plat), × 4
 * @param lateralG l'accélération latérale en g, déjà lissée par l'hôte, × 2
 */
export function ephemeralBurnRawWind(input: {
  readonly rollTurns: number | null;
  readonly lateralG: number | null;
}): number | null {
  if (!hasReading(input.rollTurns) && !hasReading(input.lateralG)) return null;
  const raw = finiteOrZero(input.rollTurns) * ROLL_WEIGHT + finiteOrZero(input.lateralG) * LATERAL_WEIGHT;
  if (Math.abs(raw) < EPHEMERAL_BURN_WIND_DEAD_ZONE) return null;
  return Math.max(-1, Math.min(1, raw));
}

/** Le vent EFFECTIF : le geste quand il existe, sinon ±0,35 vers le bord extérieur. Jamais nul. */
export function ephemeralBurnWind(raw: number | null, side: EphemeralBurnSide): number {
  if (raw !== null) return raw;
  return side === 'mine' ? EPHEMERAL_BURN_DEFAULT_WIND : -EPHEMERAL_BURN_DEFAULT_WIND;
}

/** Le sens du front : `+1` quand le feu part du bord gauche et avance vers la droite. */
export function ephemeralBurnFrontDirection(wind: number): 1 | -1 {
  return wind >= 0 ? 1 : -1;
}

export function ephemeralBurnPhaseOf(progress: number): EphemeralBurnPhase {
  if (progress < EPHEMERAL_BURN_IGNITION_END) return 'ignition';
  if (progress < EPHEMERAL_BURN_SPREAD_END) return 'spread';
  return 'ashes';
}
