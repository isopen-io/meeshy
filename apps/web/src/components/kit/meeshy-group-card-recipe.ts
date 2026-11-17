import type { CSSProperties } from 'react';

/**
 * K43 · MeeshyGroupCard — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Une carte, une idée, jamais une carte dans une carte. Elle pose une surface arrondie
 * qui rogne ce qu'elle contient, range cinq emplacements (en-tête, média de tête,
 * emblème, contenu, pied) et trace elle-même les filets entre ses enfants. Elle ne
 * décide de rien : ni le verre (K01), ni les actions du pied (K40), ni la rangée (K06,
 * K39, K37). Le rouge de `danger` annonce une conséquence, il ne décore pas.
 */
export type MeeshyGroupCardSurface = 'raised' | 'ground' | 'glass' | 'accent' | 'danger' | 'dashed' | 'solid';
export type MeeshyGroupCardLayout = 'group' | 'content' | 'prompt' | 'preview' | 'action';
export type MeeshyGroupCardSize = 'compact' | 'regular' | 'large';
export type MeeshyGroupCardTail = 'none' | 'leading' | 'trailing';

export const MEESHY_GROUP_CARD_MEASURE = {
  radius: { compact: 24, regular: 26, large: 30 },
  border: 1,
  dividerInset: 18,
  tailRadius: 8,
  lockedOpacity: 0.42,
  halo: 4,
  header: { height: 44, inset: 18 },
  media: { min: 62, max: 140 },
  emblem: { min: 40, max: 76, cutout: 4 },
  footer: { top: 14, inline: 16, bottom: 16, gap: 8 },
} as const;

export type MeeshyGroupCardRecipeInput = {
  readonly surface?: MeeshyGroupCardSurface | undefined;
  readonly layout?: MeeshyGroupCardLayout | undefined;
  readonly size?: MeeshyGroupCardSize | undefined;
  readonly tail?: MeeshyGroupCardTail | undefined;
  readonly tint?: string | undefined;
  readonly dividerInset?: number | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isHighlighted?: boolean | undefined;
  readonly isLocked?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
};

export type MeeshyGroupCardRecipe = {
  readonly surface: MeeshyGroupCardSurface;
  readonly layout: MeeshyGroupCardLayout;
  readonly radius: number;
  readonly borderWidth: number;
  readonly borderStyle: 'solid' | 'dashed';
  readonly fill: 'raised' | 'ground' | 'glass' | 'accent' | 'danger' | 'solid' | 'none';
  readonly border: 'line' | 'accent' | 'danger';
  readonly rule: 'line' | 'danger';
  readonly ink: 'default' | 'dark';
  readonly tracesDividers: boolean;
  readonly dividerInset: number;
  readonly usesGlass: boolean;
  readonly tailRadius: number | null;
  readonly tailSide: MeeshyGroupCardTail;
  readonly contentOpacity: number;
  readonly haloWidth: number;
  readonly pressedScale: number;
  readonly isActionable: boolean;
};

const FILL: Readonly<Record<MeeshyGroupCardSurface, MeeshyGroupCardRecipe['fill']>> = {
  raised: 'raised',
  ground: 'ground',
  glass: 'glass',
  accent: 'accent',
  danger: 'danger',
  dashed: 'none',
  solid: 'solid',
};

/** La recette d'une carte : fond, gabarit et taille deviennent des nombres. */
export const meeshyGroupCardRecipe = (input: MeeshyGroupCardRecipeInput): MeeshyGroupCardRecipe => {
  const surface = input.surface ?? 'raised';
  const layout = input.layout ?? 'group';
  const size = input.size ?? 'regular';
  const tail = input.tail ?? 'none';
  const isLocked = input.isLocked === true;
  return {
    surface,
    layout,
    radius: MEESHY_GROUP_CARD_MEASURE.radius[size],
    borderWidth: MEESHY_GROUP_CARD_MEASURE.border,
    borderStyle: surface === 'dashed' ? 'dashed' : 'solid',
    fill: FILL[surface],
    border: surface === 'danger' ? 'danger' : input.isHighlighted === true ? 'accent' : 'line',
    rule: surface === 'danger' ? 'danger' : 'line',
    ink: surface === 'solid' ? 'dark' : 'default',
    tracesDividers: layout === 'group',
    dividerInset: input.dividerInset ?? MEESHY_GROUP_CARD_MEASURE.dividerInset,
    usesGlass: surface === 'glass',
    tailRadius: tail === 'none' ? null : MEESHY_GROUP_CARD_MEASURE.tailRadius,
    tailSide: tail,
    contentOpacity: isLocked ? MEESHY_GROUP_CARD_MEASURE.lockedOpacity : 1,
    haloWidth: input.isHighlighted === true ? MEESHY_GROUP_CARD_MEASURE.halo : 0,
    pressedScale: input.isPressed === true && input.isEnabled !== false && !isLocked ? 0.985 : 1,
    isActionable: input.isEnabled !== false && !isLocked,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyGroupCardStyle = (recipe: MeeshyGroupCardRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-group-radius': rem(recipe.radius),
    '--kit-group-border': rem(recipe.borderWidth),
    '--kit-group-inset': rem(recipe.dividerInset),
    '--kit-group-opacity': recipe.contentOpacity,
    '--kit-group-halo': rem(recipe.haloWidth),
    '--kit-group-tail': recipe.tailRadius === null ? undefined : rem(recipe.tailRadius),
    '--kit-group-tint': tint ?? 'var(--accent, var(--color-ios-brand))',
    '--kit-group-header-h': rem(MEESHY_GROUP_CARD_MEASURE.header.height),
    '--kit-group-header-inset': rem(MEESHY_GROUP_CARD_MEASURE.header.inset),
    '--kit-group-footer-pad': `${rem(MEESHY_GROUP_CARD_MEASURE.footer.top)} ${rem(MEESHY_GROUP_CARD_MEASURE.footer.inline)} ${rem(MEESHY_GROUP_CARD_MEASURE.footer.bottom)}`,
    '--kit-group-footer-gap': rem(MEESHY_GROUP_CARD_MEASURE.footer.gap),
    '--kit-group-emblem-cutout': rem(MEESHY_GROUP_CARD_MEASURE.emblem.cutout),
  }) as CSSProperties;
