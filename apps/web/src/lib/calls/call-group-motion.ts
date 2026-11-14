/**
 * **LE MOUVEMENT D'UNE VIGNETTE DONT LA CASE CHANGE** (grille ↔ à la une, P14.10 ; `GroupCallStageGeometry.between`
 * d'Android) — la loi pure que `stage-flip-engine.ts` joue.
 */

export type SlotBox = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** En deçà, l'écart est un arrondi de mesure, pas un mouvement. */
const EPSILON_PX = 0.5;

/**
 * Le mouvement d'une vignette qui a changé de case : l'ancienne case vue comme une transformation de
 * la nouvelle (FLIP — la mise en page est déjà à son état final, origine en haut à gauche), rejouée
 * vers zéro. Transformation seule : le compositeur la porte, aucune mise en page par image. Sous
 * « Réduire les animations », un fondu court à la place du déplacement. `null` : rien ne bouge, ou
 * une case sans mesure.
 */
export function slotFlipKeyframes({ first, last, reducedMotion }: { readonly first: SlotBox; readonly last: SlotBox; readonly reducedMotion: boolean }): readonly Keyframe[] | null {
  if (first.width <= 0 || first.height <= 0 || last.width <= 0 || last.height <= 0) return null;
  const dx = first.x - last.x;
  const dy = first.y - last.y;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  const moved = Math.abs(dx) >= EPSILON_PX || Math.abs(dy) >= EPSILON_PX || Math.abs(first.width - last.width) >= EPSILON_PX || Math.abs(first.height - last.height) >= EPSILON_PX;
  if (!moved) return null;
  return reducedMotion ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }];
}
