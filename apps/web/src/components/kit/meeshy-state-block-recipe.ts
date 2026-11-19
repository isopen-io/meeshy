import type { CSSProperties } from 'react';

/**
 * K38 · MeeshyStateBlock — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * Vide, erreur, refus, hors ligne et réussite ont UNE forme : une image fantôme, un titre,
 * une phrase, une sortie. Le bloc dessine l'absence, il ne la décide pas : l'hôte lit son
 * état, choisit le genre et passe les mots et l'action. Jamais d'erreur sans « Réessayer »,
 * jamais de vide plein écran sans issue. Le squelette (`MeeshySkeleton`) est l'atome voisin.
 */
export type MeeshyStateBlockKind = 'empty' | 'error' | 'denied' | 'offline' | 'success';
export type MeeshyStateBlockSize = 'regular' | 'compact';
export type MeeshyStateBlockTone = 'accent' | 'err' | 'warn' | 'neutral' | 'ok';
export type MeeshyStateGhostTemplate = 'line' | 'ticket' | 'row' | 'tile' | 'pin';
export type MeeshyStateArt = { readonly ghost: MeeshyStateGhostTemplate; readonly count?: number | undefined } | 'glyph' | 'none';

export const MEESHY_STATE_BLOCK_MEASURE = {
  glyphDisc: 60,
  glyphIcon: 28,
  ghostMaxHeight: 160,
  titleSize: 22,
  compactTitleSize: 15,
  messageSize: 14.5,
  messageMax: 310,
  primaryHeight: 50,
  secondaryHeight: 44,
  rowHeight: 60,
  enterShake: 7,
  floatPeriodMs: 4600,
  consequenceMin: 2,
  consequenceMax: 4,
  ghostCountMax: 4,
} as const;

const TONE: Readonly<Record<MeeshyStateBlockKind, MeeshyStateBlockTone>> = { empty: 'accent', error: 'err', denied: 'warn', offline: 'neutral', success: 'ok' };

export type MeeshyStateBlockRecipeInput = {
  readonly kind: MeeshyStateBlockKind;
  readonly size?: MeeshyStateBlockSize | undefined;
  readonly hasPrimary: boolean;
  readonly hasSecondary?: boolean | undefined;
  readonly hasMessage?: boolean | undefined;
  readonly isPending?: boolean | undefined;
  readonly isOverContent?: boolean | undefined;
  readonly tint?: string | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyStateBlockRecipe = {
  readonly isResolvable: boolean;
  readonly reason: 'error-needs-primary' | 'empty-needs-exit' | null;
  readonly kind: MeeshyStateBlockKind;
  readonly size: MeeshyStateBlockSize;
  readonly role: 'alert' | 'status';
  readonly glyphTone: MeeshyStateBlockTone;
  readonly tint: string | undefined;
  readonly hasGhost: boolean;
  readonly hasHalo: boolean;
  readonly rowHeight: number | null;
  readonly titleSize: number;
  readonly shakes: boolean;
  readonly breathes: boolean;
  readonly hapticOnEnter: boolean;
};

const refusal = (input: MeeshyStateBlockRecipeInput, size: MeeshyStateBlockSize): MeeshyStateBlockRecipe['reason'] => {
  if (input.kind === 'error' && !input.hasPrimary) return 'error-needs-primary';
  if (input.kind === 'empty' && size === 'regular' && !input.hasPrimary && input.hasSecondary !== true) return 'empty-needs-exit';
  return null;
};

export const meeshyStateBlockRecipe = (input: MeeshyStateBlockRecipeInput): MeeshyStateBlockRecipe => {
  const size = input.size ?? 'regular';
  const reason = refusal(input, size);
  const isRegular = size === 'regular';
  const showsImage = isRegular && input.isOverContent !== true;
  const reduce = input.reduceMotion === true;
  return {
    isResolvable: reason === null,
    reason,
    kind: input.kind,
    size,
    role: input.kind === 'error' ? 'alert' : 'status',
    glyphTone: TONE[input.kind],
    tint: input.kind === 'empty' ? input.tint : undefined,
    hasGhost: showsImage && input.kind !== 'success',
    hasHalo: showsImage && !reduce,
    rowHeight: isRegular ? null : MEESHY_STATE_BLOCK_MEASURE.rowHeight,
    titleSize: isRegular ? MEESHY_STATE_BLOCK_MEASURE.titleSize : MEESHY_STATE_BLOCK_MEASURE.compactTitleSize,
    shakes: input.kind === 'error' && !reduce,
    breathes: !reduce,
    hapticOnEnter: input.kind === 'error',
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyStateBlockStyle = (recipe: MeeshyStateBlockRecipe): CSSProperties =>
  ({
    '--kit-state-disc': rem(MEESHY_STATE_BLOCK_MEASURE.glyphDisc),
    '--kit-state-icon': rem(MEESHY_STATE_BLOCK_MEASURE.glyphIcon),
    '--kit-state-ghost-max': rem(MEESHY_STATE_BLOCK_MEASURE.ghostMaxHeight),
    '--kit-state-title': rem(recipe.titleSize),
    '--kit-state-message': rem(MEESHY_STATE_BLOCK_MEASURE.messageSize),
    '--kit-state-message-max': rem(MEESHY_STATE_BLOCK_MEASURE.messageMax),
    '--kit-state-primary': rem(MEESHY_STATE_BLOCK_MEASURE.primaryHeight),
    '--kit-state-secondary': rem(MEESHY_STATE_BLOCK_MEASURE.secondaryHeight),
    '--kit-state-shake': rem(MEESHY_STATE_BLOCK_MEASURE.enterShake),
    ...(recipe.rowHeight === null ? {} : { '--kit-state-row': rem(recipe.rowHeight) }),
    ...(recipe.tint === undefined ? {} : { '--kit-state-tint': recipe.tint }),
  }) as CSSProperties;

export const meeshyStateGhostCount = (count: number | undefined): number =>
  Math.min(Math.max(Math.trunc(count ?? 3), 1), MEESHY_STATE_BLOCK_MEASURE.ghostCountMax);
