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

/** Un point et, quand l'appelant veut aussi jouer le changement de taille, la boîte mesurée. */
export type FlipBox = FlipPoint & { readonly width?: number; readonly height?: number };

/** Les seules propriétés qu'une image clé de FLIP peut porter. */
export const FLIP_PROPERTIES: readonly string[] = ['transform', 'opacity'];

/** En deçà, le déplacement est un arrondi de mesure, pas un mouvement. */
const FLIP_EPSILON_PX = 0.5;

/** Le rapport des deux tailles, quand l'appelant a déclaré une origine et que la boîte a changé de taille. */
const scaleOf = (first: FlipBox, last: FlipBox): { readonly sx: number; readonly sy: number } | null => {
  const sizes = [first.width, first.height, last.width, last.height];
  if (sizes.some((size) => size === undefined || size <= 0)) return null;
  const sx = (first.width ?? 1) / (last.width ?? 1);
  const sy = (first.height ?? 1) / (last.height ?? 1);
  return Math.abs((first.width ?? 0) - (last.width ?? 0)) < FLIP_EPSILON_PX && Math.abs((first.height ?? 0) - (last.height ?? 0)) < FLIP_EPSILON_PX ? null : { sx, sy };
};

/** Une échelle portée nulle, négative ou absente ne divise rien. */
const carriedFactor = (value: number | undefined): number => (value !== undefined && Number.isFinite(value) && value > 0 ? value : 1);

export function flipKeyframes({
  first,
  last,
  reducedMotion,
  fadeFrom,
  origin,
  carried,
}: {
  readonly first: FlipBox;
  readonly last: FlipBox;
  readonly reducedMotion: boolean;
  /** Où la boîte s'ancre, en fractions de sa taille (0 = bord haut/gauche, 1 = bas/droite) : déclarée, le changement de taille se joue en échelle autour d'elle. */
  readonly origin?: FlipPoint;
  /** L'échelle que l'élément porte HORS du FLIP (sa propriété `scale`) : la transformation jouée se compose SOUS elle, sa translation s'y divise. */
  readonly carried?: FlipPoint;
  /** Opacité de départ d'un fondu d'entrée, qui accompagne ou remplace le déplacement. */
  readonly fadeFrom?: number;
}): readonly Keyframe[] | null {
  const scale = origin === undefined ? null : scaleOf(first, last);
  if (reducedMotion) return scale === null ? null : [{ opacity: 0 }, { opacity: 1 }];
  const dx = (first.x - last.x - (scale === null || origin === undefined ? 0 : origin.x * (last.width ?? 0) * (1 - scale.sx))) / carriedFactor(carried?.x);
  const dy = (first.y - last.y - (scale === null || origin === undefined ? 0 : origin.y * (last.height ?? 0) * (1 - scale.sy))) / carriedFactor(carried?.y);
  const moved = Math.abs(dx) >= FLIP_EPSILON_PX || Math.abs(dy) >= FLIP_EPSILON_PX || scale !== null;
  if (!moved && fadeFrom === undefined) return null;
  const from = moved ? { transform: `translate(${dx}px, ${dy}px)${scale === null ? '' : ` scale(${scale.sx}, ${scale.sy})`}` } : {};
  const to = moved ? { transform: 'none' } : {};
  return fadeFrom === undefined ? [from, to] : [{ ...from, opacity: fadeFrom }, { ...to, opacity: 1 }];
}
