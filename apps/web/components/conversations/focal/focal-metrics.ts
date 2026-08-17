/**
 * Constantes propres au fil (Focal) qui n'ont PAS de miroir dans le noyau
 * gelé `packages/shared/utils/focus-curve.ts` — WF-110/111.
 *
 * RE-PREUVE (§0) : `focus-curve.ts` porte `FOCUS_CURVE_CONSTANTS`,
 * `FOCUS_BAND_OFFSET`/`FOCUS_BAND_HALF_HEIGHT` — RIEN d'équivalent à
 * `FocalMetrics.optimisticAlphaCeiling` (0.7, contrat Focal §3.11 /
 * §4.4 : « alphaCeiling vaut 0.7 pour une rangée optimiste »). Ce chiffre
 * n'appartient pas à la LOI de perspective elle-même (`focusCurve` ne le
 * connaît pas — il reste `min(alphaCeiling, courbe)`, appliqué par
 * l'APPELANT, exactement comme le contrat le décrit : « le plafond vit dans
 * le descripteur fourni par WS-6, pas dans la rangée »). C'est une métrique
 * de PEAU Focal, donc centralisée ICI (fichier possédé par WF-110/111/112,
 * `components/conversations/focal/`) plutôt qu'ajoutée au noyau partagé gelé
 * — étendre `packages/shared` est hors périmètre de cette vague (le GELÉ se
 * CONSOMME, §4 de la mission).
 *
 * Nommée plutôt qu'écrite en dur dans les composants : garde R15 dans son
 * ESPRIT (une constante de loi vit dans un seul endroit nommé), même si
 * `0.7` n'apparaît pas dans la liste des littéraux bannis énumérés par le
 * contrat (`520/380/0.45/0.82/900/25/24` — ce sont les constantes de
 * `focus-curve.ts`/`scroll-activity.ts` ; `0.7` n'en fait pas partie).
 */

/** Plafond d'opacité d'une rangée optimiste (contrat Focal §3.11/§4.4). */
export const FOCAL_OPTIMISTIC_ALPHA_CEILING = 0.7;

/** Opacité pleine — rangée confirmée, hors envoi optimiste. */
export const FOCAL_CONFIRMED_ALPHA = 1;

/**
 * `alpha = min(alphaCeiling, alphaPerspective)` — §4.4 du contrat Focal, mot
 * pour mot. `alphaCeiling` vaut `FOCAL_OPTIMISTIC_ALPHA_CEILING` pour une
 * rangée optimiste, `FOCAL_CONFIRMED_ALPHA` sinon.
 */
export function applyOptimisticAlphaCeiling(
  perspectiveAlpha: number,
  isOptimistic: boolean
): number {
  const ceiling = isOptimistic ? FOCAL_OPTIMISTIC_ALPHA_CEILING : FOCAL_CONFIRMED_ALPHA;
  return Math.min(ceiling, perspectiveAlpha);
}
