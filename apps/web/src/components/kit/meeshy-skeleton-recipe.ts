import type { CSSProperties } from 'react';

/**
 * K38 · MeeshySkeleton — l'atome du squelette (#18875, #18857). Le bloc d'état
 * (`MeeshyStateBlock`) est un autre lot ; seul ce qui tient la place pendant l'attente
 * vit ici : un aplat aux mesures EXACTES du composant attendu, avec un reflet qui passe.
 *
 * LA LOI. Un cache, même périmé, se peint tout de suite : le squelette n'existe qu'au
 * tout premier chargement, jamais par-dessus un contenu (`meeshySkeletonShows`).
 * Le squelette ne porte ni texte, ni icône, ni anneau, ni point de présence.
 */
export type MeeshySkeletonShape =
  | { readonly kind: 'line'; readonly widthRatio?: number | undefined; readonly height?: number | undefined }
  | { readonly kind: 'pill'; readonly width: number; readonly height?: number | undefined }
  | { readonly kind: 'ticket'; readonly height: number; readonly cut: number; readonly widthRatio?: number | undefined }
  | { readonly kind: 'circle'; readonly diameter: number }
  | { readonly kind: 'card'; readonly aspect: number; readonly radius: number };

export type MeeshySkeletonRecipe = {
  readonly kind: MeeshySkeletonShape['kind'];
  readonly width: number | null;
  readonly widthRatio: number | null;
  readonly height: number | null;
  readonly aspect: number | null;
  readonly radius: 'full' | number;
  readonly cut: number | null;
};

export const MEESHY_SKELETON_MEASURE = {
  lineHeight: 13,
  pillHeight: 28,
  glintPeriodMs: 1600,
  glintShare: 0.4,
  ticketRadius: 20,
} as const;

const LINE_RATIOS: readonly number[] = [0.7, 0.55, 0.62, 0.4, 0.5, 0.66, 0.45];

/** La largeur d'une ligne vient d'une suite fixe de 40 à 70 % : deux écrans voisins ne se ressemblent pas, un même écran ne saute jamais. */
export const meeshySkeletonLineRatio = (index: number): number => LINE_RATIOS[Math.abs(Math.trunc(index)) % LINE_RATIOS.length] ?? 0.5;

export const meeshySkeletonShows = ({ isLoading, hasCachedData }: { readonly isLoading: boolean; readonly hasCachedData: boolean }): boolean => isLoading && !hasCachedData;

/** Une seule horloge pour tout l'écran : le décalage ne dépend que de l'instant, donc les reflets passent ensemble. */
export const meeshySkeletonClockOffset = (now: number): number => 0 - (Math.trunc(now) % MEESHY_SKELETON_MEASURE.glintPeriodMs);

const BLANK: MeeshySkeletonRecipe = { kind: 'line', width: null, widthRatio: null, height: null, aspect: null, radius: 'full', cut: null };

export const meeshySkeletonRecipe = (shape: MeeshySkeletonShape): MeeshySkeletonRecipe => {
  switch (shape.kind) {
    case 'line':
      return { ...BLANK, widthRatio: shape.widthRatio ?? 1, height: shape.height ?? MEESHY_SKELETON_MEASURE.lineHeight };
    case 'pill':
      return { ...BLANK, kind: 'pill', width: shape.width, height: shape.height ?? MEESHY_SKELETON_MEASURE.pillHeight };
    case 'circle':
      return { ...BLANK, kind: 'circle', width: shape.diameter, height: shape.diameter };
    case 'card':
      return { ...BLANK, kind: 'card', widthRatio: 1, aspect: shape.aspect, radius: shape.radius };
    case 'ticket':
      return { ...BLANK, kind: 'ticket', widthRatio: shape.widthRatio ?? 1, height: shape.height, cut: shape.cut, radius: MEESHY_SKELETON_MEASURE.ticketRadius };
  }
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshySkeletonStyle = (recipe: MeeshySkeletonRecipe, offsetMs: number): CSSProperties =>
  ({
    '--kit-skeleton-w': recipe.width !== null ? rem(recipe.width) : `${(recipe.widthRatio ?? 1) * 100}%`,
    '--kit-skeleton-h': recipe.height !== null ? rem(recipe.height) : 'auto',
    '--kit-skeleton-aspect': recipe.aspect !== null ? String(recipe.aspect) : 'auto',
    '--kit-skeleton-radius': recipe.radius === 'full' ? '999px' : rem(recipe.radius),
    '--kit-skeleton-cut': recipe.cut !== null ? rem(recipe.cut) : '0px',
    '--kit-skeleton-delay': `${offsetMs}ms`,
  }) as CSSProperties;
