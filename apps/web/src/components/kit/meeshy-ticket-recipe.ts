import type { CSSProperties } from 'react';

import { inkOn, parseHex } from './kit-color';

/**
 * K30 · MeeshyTicket — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Il présente, il ne sait pas ce qu'il présente. UNE forme : une carte de rayon 22, deux
 * encoches de 18 découpées sur la coupe (le fond de l'hôte passe au travers, quel qu'il
 * soit), un pointillé qui sépare le corps du talon. Il range un glyphe, un titre, un code
 * en chasse fixe, un grand chiffre et deux emplacements, se retourne quand l'hôte le dit,
 * tient en quatre tailles et dit son état — fantôme, barré, sélectionné, déplacé. Le verre
 * des boutons du talon (K02, K32), le QR du verso (K31), la courbe (K34) et le menu (K18)
 * sont à d'autres. Copier, partager, ouvrir, expirer : l'app.
 */
export type MeeshyTicketSize = 'hero' | 'row' | 'compact' | 'mini';
export type MeeshyTicketKind = 'normal' | 'draft' | 'ghost' | 'struck' | 'loading';

export const MEESHY_TICKET_MEASURE = {
  radius: 22,
  notch: 18,
  dash: 1.5,
  dashMargin: 16,
  cut: { hero: 125, row: 77, compact: 61, mini: 0 },
  codeSize: { hero: 20, row: 12, compact: 11.5, mini: 0 },
  titleSize: { hero: 11, row: 17, compact: 17, mini: 17 },
  badge: { hero: 0, row: 44, compact: 36, mini: 36 },
  width: { mini: 104 },
  scale: { pressed: 0.97, dragging: 1.03, flipLift: 1.05 },
  lift: 4,
  tilt: 2.5,
  selectionRule: 2,
  flipMidpointMs: 250,
} as const;

export type MeeshyTicketRecipeInput = {
  readonly size?: MeeshyTicketSize | undefined;
  readonly kind?: MeeshyTicketKind | undefined;
  readonly tint?: string | undefined;
  readonly isSelected?: boolean | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isHovered?: boolean | undefined;
  readonly isDragging?: boolean | undefined;
  readonly isFlipped?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyTicketRecipe = {
  readonly size: MeeshyTicketSize;
  readonly kind: MeeshyTicketKind;
  readonly radius: number;
  readonly notch: number;
  readonly dash: number;
  readonly dashMargin: number;
  readonly cut: number;
  readonly codeSize: number;
  readonly titleSize: number;
  readonly badge: number;
  readonly badgeFill: string;
  readonly badgeInk: string;
  readonly badgeOff: boolean;
  readonly width: number | null;
  readonly isVertical: boolean;
  readonly showsCode: boolean;
  readonly showsTrailing: boolean;
  readonly showsFigure: boolean;
  readonly fill: 'raised' | 'field' | 'none';
  readonly borderStyle: 'solid' | 'dashed';
  readonly strikesText: boolean;
  readonly scale: number;
  readonly lift: number;
  readonly tilt: number;
  readonly selectionRule: number;
  readonly flip: 'none' | 'rotate' | 'crossfade';
  readonly rotation: 0 | 180;
  readonly mask: string;
};

/** Les deux encoches, découpées par un masque : deux demi-disques centrés sur la coupe, aux deux bords. */
export const meeshyTicketMask = ({ cut, notch }: { readonly cut: number; readonly notch: number }): string => {
  const radius = notch / 2;
  const hole = (side: 'left' | 'right'): string => `radial-gradient(circle ${radius}px at ${side} ${cut}px, transparent ${radius - 0.5}px, currentcolor ${radius}px)`;
  return `${hole('left')}, ${hole('right')}`;
};

/** La recette d'un billet : taille, variante et état deviennent des nombres. */
export const meeshyTicketRecipe = (input: MeeshyTicketRecipeInput): MeeshyTicketRecipe => {
  const m = MEESHY_TICKET_MEASURE;
  const size = input.size ?? 'row';
  const kind = input.kind ?? 'normal';
  const reduce = input.reduceMotion === true;
  const isPressed = input.isPressed === true && !reduce;
  const isDragging = input.isDragging === true;
  const parsed = input.tint !== undefined && parseHex(input.tint) !== null;
  const isVertical = size === 'mini';
  return {
    size,
    kind,
    radius: m.radius,
    notch: m.notch,
    dash: m.dash,
    dashMargin: m.dashMargin,
    cut: m.cut[size],
    codeSize: m.codeSize[size],
    titleSize: m.titleSize[size],
    badge: m.badge[size],
    badgeFill: input.tint ?? 'var(--color-ios-brand)',
    badgeInk: input.tint === undefined ? 'var(--color-ios-on-brand)' : parsed ? inkOn(input.tint) : 'var(--color-ios-on-brand)',
    badgeOff: kind === 'struck',
    width: isVertical ? m.width.mini : null,
    isVertical,
    showsCode: !isVertical,
    showsTrailing: size === 'hero' || size === 'row',
    showsFigure: size === 'hero' || size === 'row',
    fill: kind === 'ghost' ? 'none' : input.isPressed === true ? 'field' : 'raised',
    borderStyle: kind === 'ghost' ? 'dashed' : 'solid',
    strikesText: kind === 'struck',
    scale: isDragging ? m.scale.dragging : isPressed ? m.scale.pressed : 1,
    lift: input.isHovered === true && !isPressed && !isDragging ? m.lift : 0,
    tilt: isDragging && !reduce ? m.tilt : 0,
    selectionRule: input.isSelected === true ? m.selectionRule : 0,
    flip: input.isFlipped !== true ? 'none' : reduce ? 'crossfade' : 'rotate',
    rotation: input.isFlipped === true && !reduce ? 180 : 0,
    mask: meeshyTicketMask({ cut: m.cut[size], notch: m.notch }),
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyTicketStyle = (recipe: MeeshyTicketRecipe): CSSProperties =>
  ({
    '--kit-ticket-radius': rem(recipe.radius),
    '--kit-ticket-notch': rem(recipe.notch),
    '--kit-ticket-dash': `${recipe.dash}px`,
    '--kit-ticket-dash-margin': rem(recipe.dashMargin),
    '--kit-ticket-cut': rem(recipe.cut),
    '--kit-ticket-code': rem(recipe.codeSize),
    '--kit-ticket-title': rem(recipe.titleSize),
    '--kit-ticket-badge': rem(recipe.badge),
    '--kit-ticket-badge-fill': recipe.badgeFill,
    '--kit-ticket-badge-ink': recipe.badgeInk,
    '--kit-ticket-width': recipe.width === null ? undefined : rem(recipe.width),
    '--kit-ticket-scale': recipe.scale,
    '--kit-ticket-lift': rem(recipe.lift),
    '--kit-ticket-tilt': `${recipe.tilt}deg`,
    '--kit-ticket-rule': `${recipe.selectionRule}px`,
    '--kit-ticket-mask': recipe.mask,
  }) as CSSProperties;
