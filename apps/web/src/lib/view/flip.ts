/**
 * **FLIP : UN DÉPLACEMENT SE JOUE EN `transform`, JAMAIS EN `left` / `top` /
 * `height`** (#11314). La mise en page passe d'un coup à son état final ; le
 * mouvement est l'inverse du déplacement mesuré (First − Last), rejoué vers
 * zéro. Le compositeur seul le porte : aucune mise en page par image, là où
 * animer une géométrie en recalcule une à chaque image.
 *
 * Pur : `use-flip.ts` mesure et joue, cette loi décide ce qui se joue.
 */
export type FlipPoint = { readonly x: number; readonly y: number };

/** Les seules propriétés qu'une image clé de FLIP peut porter. */
export const FLIP_PROPERTIES: readonly string[] = ['transform', 'opacity'];

/** En deçà, le déplacement est un arrondi de mesure, pas un mouvement. */
const FLIP_EPSILON_PX = 0.5;

export function flipKeyframes({
  first,
  last,
  reducedMotion,
  fadeFrom,
}: {
  readonly first: FlipPoint;
  readonly last: FlipPoint;
  readonly reducedMotion: boolean;
  /** Opacité de départ d'un fondu d'entrée, qui accompagne ou remplace le déplacement. */
  readonly fadeFrom?: number;
}): readonly Keyframe[] | null {
  if (reducedMotion) return null;
  const dx = first.x - last.x;
  const dy = first.y - last.y;
  const moved = Math.abs(dx) >= FLIP_EPSILON_PX || Math.abs(dy) >= FLIP_EPSILON_PX;
  if (!moved && fadeFrom === undefined) return null;
  const from = moved ? { transform: `translate(${dx}px, ${dy}px)` } : {};
  const to = moved ? { transform: 'none' } : {};
  return fadeFrom === undefined ? [from, to] : [{ ...from, opacity: fadeFrom }, { ...to, opacity: 1 }];
}
