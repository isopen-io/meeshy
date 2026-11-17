import type { CSSProperties } from 'react';

/**
 * K39 · MeeshyPersonRow — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Une personne, une rangée, une phrase. Elle range cinq parties (avatar, nom, ligne
 * secondaire, pastille de niveau, accessoire de fin) à des écarts et une hauteur fixes,
 * porte trois tenues (normale, atténuée, fantôme) et se touche, se coche, se balaie.
 * Elle ne dessine ni l'avatar ni la présence — l'emplacement `avatar` est rempli par
 * l'hôte, qui seul sait qui a le droit de voir un point vert — et ne connaît ni cercle,
 * ni rôle, ni distance : elle reçoit des mots et des glyphes.
 */
export type MeeshyPersonRowState = 'normal' | 'muted' | 'ghost' | 'highlighted';
export type MeeshyPersonRowSize = 'inline' | 'compact' | 'regular' | 'large' | 'header';
export type MeeshyPersonRowSelection = { readonly single: boolean } | { readonly multiple: boolean };
export type MeeshyPersonRowSwipeRole = 'default' | 'destructive';
export type MeeshyPersonRowSwipeAction = {
  readonly title: string;
  readonly glyph: unknown;
  readonly role?: MeeshyPersonRowSwipeRole | undefined;
  readonly perform: () => void;
};

export const MEESHY_PERSON_ROW_MEASURE = {
  height: { inline: 32, compact: 52, regular: 60, large: 72, header: 84 },
  avatar: { inline: 26, compact: 36, regular: 44, large: 56, header: 56 },
  titleSize: 15,
  headerTitleSize: 22,
  subtitleSize: 12.5,
  metaSize: 16,
  metaDetailSize: 11.5,
  inset: { start: 18, end: 18 },
  avatarGap: 14,
  dividerInset: 76,
  target: 44,
  mutedOpacity: 0.55,
  pendingFill: 0.08,
  swipeThreshold: 40,
  swipeAction: 76,
  maxActions: 2,
} as const;

export type MeeshyPersonRowRecipeInput = {
  readonly size?: MeeshyPersonRowSize | undefined;
  readonly state?: MeeshyPersonRowState | undefined;
  readonly selection?: MeeshyPersonRowSelection | undefined;
  readonly hasSubtitle?: boolean | undefined;
  readonly hasMeta?: boolean | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly isPending?: boolean | undefined;
  readonly hasOnPress?: boolean | undefined;
  readonly dividerInset?: number | undefined;
  readonly divider?: boolean | undefined;
};

export type MeeshyPersonRowRecipe = {
  readonly size: MeeshyPersonRowSize;
  readonly state: MeeshyPersonRowState;
  readonly height: number;
  readonly avatarSize: number;
  readonly avatar: 'slot' | 'ghost-disc';
  readonly titleSize: number;
  readonly subtitleSize: number;
  readonly metaSize: number;
  readonly metaDetailSize: number;
  readonly inset: { readonly start: number; readonly end: number };
  readonly avatarGap: number;
  readonly dividerInset: number;
  readonly hasDivider: boolean;
  readonly targetSize: number;
  readonly contentOpacity: number;
  readonly pendingFill: number;
  readonly isPressable: boolean;
  readonly pressVeil: number;
  readonly centersTitle: boolean;
};

/** La recette d'une rangée : taille, tenue et sélection deviennent des nombres. */
export const meeshyPersonRowRecipe = (input: MeeshyPersonRowRecipeInput): MeeshyPersonRowRecipe => {
  const size = input.size ?? 'regular';
  const state = input.state ?? 'normal';
  const isHeader = size === 'header';
  return {
    size,
    state,
    height: MEESHY_PERSON_ROW_MEASURE.height[size],
    avatarSize: MEESHY_PERSON_ROW_MEASURE.avatar[size],
    avatar: state === 'ghost' ? 'ghost-disc' : 'slot',
    titleSize: isHeader ? MEESHY_PERSON_ROW_MEASURE.headerTitleSize : MEESHY_PERSON_ROW_MEASURE.titleSize,
    subtitleSize: MEESHY_PERSON_ROW_MEASURE.subtitleSize,
    metaSize: MEESHY_PERSON_ROW_MEASURE.metaSize,
    metaDetailSize: MEESHY_PERSON_ROW_MEASURE.metaDetailSize,
    inset: MEESHY_PERSON_ROW_MEASURE.inset,
    avatarGap: MEESHY_PERSON_ROW_MEASURE.avatarGap,
    dividerInset: input.dividerInset ?? MEESHY_PERSON_ROW_MEASURE.dividerInset,
    hasDivider: !isHeader && input.divider !== false,
    targetSize: MEESHY_PERSON_ROW_MEASURE.target,
    contentOpacity: state === 'muted' ? MEESHY_PERSON_ROW_MEASURE.mutedOpacity : 1,
    pendingFill: input.isPending === true ? MEESHY_PERSON_ROW_MEASURE.pendingFill : 0,
    isPressable: !isHeader && input.hasOnPress !== false && input.isEnabled !== false,
    pressVeil: input.isPressed === true ? 0.06 : 0,
    centersTitle: input.hasSubtitle !== true,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyPersonRowStyle = (recipe: MeeshyPersonRowRecipe): CSSProperties =>
  ({
    '--kit-person-h': rem(recipe.height),
    '--kit-person-avatar': rem(recipe.avatarSize),
    '--kit-person-avatar-gap': rem(recipe.avatarGap),
    '--kit-person-title': rem(recipe.titleSize),
    '--kit-person-subtitle': rem(recipe.subtitleSize),
    '--kit-person-meta': rem(recipe.metaSize),
    '--kit-person-meta-detail': rem(recipe.metaDetailSize),
    '--kit-person-pad-start': rem(recipe.inset.start),
    '--kit-person-pad-end': rem(recipe.inset.end),
    '--kit-person-divider-inset': rem(recipe.dividerInset),
    '--kit-person-target': rem(recipe.targetSize),
    '--kit-person-opacity': recipe.contentOpacity,
    '--kit-person-pending': recipe.pendingFill,
  }) as CSSProperties;
