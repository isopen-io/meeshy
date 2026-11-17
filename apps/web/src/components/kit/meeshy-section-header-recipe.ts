import type { CSSProperties } from 'react';

/**
 * K44 · MeeshySectionHeader — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Un titre, un nombre, un seul geste de fin. L'en-tête annonce ce qui suit et ne le
 * contient pas : ni le corps de la section, ni son repli (la hauteur est l'affaire de
 * l'hôte), ni ses accessoires (K41, K45, K04, K40, K02, K55). Cinq formes : titre de
 * section, sur-titre de groupe, séparateur, étape numérotée, bandeau de colonne.
 * L'hôte donne un texte déjà traduit et un entier : l'en-tête ne compte rien.
 */
export type MeeshySectionHeaderForm = 'title' | 'overline' | 'divider' | 'step' | 'column';
export type MeeshySectionHeaderSize = 'compact' | 'regular' | 'large';
export type MeeshySectionHeaderStep = 'todo' | 'current' | 'done';
export type MeeshySectionHeaderRule = 'centered' | 'leading';

export const MEESHY_SECTION_HEADER_MEASURE = {
  minHeight: 44,
  titleSize: { compact: 19, regular: 22, large: 26 },
  overlineSize: 11,
  countSize: 16,
  countGap: 8,
  lead: { title: 32, column: 44, step: 26 },
  leadGap: 10,
  liveDot: 8,
  liveGap: 10,
  ruleGap: 12,
  linkSize: 13.5,
} as const;

export type MeeshySectionHeaderRecipeInput = {
  readonly form?: MeeshySectionHeaderForm | undefined;
  readonly size?: MeeshySectionHeaderSize | undefined;
  readonly step?: MeeshySectionHeaderStep | undefined;
  readonly rule?: MeeshySectionHeaderRule | undefined;
  readonly tint?: string | undefined;
  readonly isExpanded?: boolean | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isSticky?: boolean | undefined;
};

export type MeeshySectionHeaderRecipe = {
  readonly form: MeeshySectionHeaderForm;
  readonly size: MeeshySectionHeaderSize;
  readonly step: MeeshySectionHeaderStep;
  readonly rule: MeeshySectionHeaderRule;
  readonly titleSize: number;
  readonly titleWeight: number;
  readonly isUppercase: boolean;
  readonly countSize: number;
  readonly countGap: number;
  readonly minHeight: number;
  readonly leadSize: number;
  readonly leadGap: number;
  readonly liveDot: number;
  readonly liveGap: number;
  readonly ruleGap: number;
  readonly linkSize: number;
  readonly showsCount: boolean;
  readonly showsLead: boolean;
  readonly showsRules: boolean;
  readonly hasGlass: boolean;
  readonly chevronTurns: number;
  readonly pressedVeil: number;
};

/** La recette d'un en-tête : forme, taille et étape deviennent des nombres. */
export const meeshySectionHeaderRecipe = (input: MeeshySectionHeaderRecipeInput): MeeshySectionHeaderRecipe => {
  const form = input.form ?? 'title';
  const size = input.size ?? 'regular';
  const { titleSize, lead } = MEESHY_SECTION_HEADER_MEASURE;
  const isLabel = form === 'overline' || form === 'divider';
  const leadSize = form === 'column' ? lead.column : form === 'step' ? lead.step : lead.title;
  return {
    form,
    size,
    step: input.step ?? 'current',
    rule: input.rule ?? 'centered',
    titleSize: isLabel ? MEESHY_SECTION_HEADER_MEASURE.overlineSize : titleSize[size],
    titleWeight: isLabel ? 700 : 800,
    isUppercase: isLabel,
    countSize: MEESHY_SECTION_HEADER_MEASURE.countSize,
    countGap: MEESHY_SECTION_HEADER_MEASURE.countGap,
    minHeight: MEESHY_SECTION_HEADER_MEASURE.minHeight,
    leadSize,
    leadGap: MEESHY_SECTION_HEADER_MEASURE.leadGap,
    liveDot: MEESHY_SECTION_HEADER_MEASURE.liveDot,
    liveGap: MEESHY_SECTION_HEADER_MEASURE.liveGap,
    ruleGap: MEESHY_SECTION_HEADER_MEASURE.ruleGap,
    linkSize: MEESHY_SECTION_HEADER_MEASURE.linkSize,
    showsCount: !isLabel,
    showsLead: !isLabel,
    showsRules: form === 'divider',
    hasGlass: form === 'column' && input.isSticky === true,
    chevronTurns: input.isExpanded === true ? 0.25 : 0,
    pressedVeil: input.isPressed === true ? 0.08 : 0,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshySectionHeaderStyle = (recipe: MeeshySectionHeaderRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-section-min-h': rem(recipe.minHeight),
    '--kit-section-title': rem(recipe.titleSize),
    '--kit-section-weight': recipe.titleWeight,
    '--kit-section-count': rem(recipe.countSize),
    '--kit-section-count-gap': rem(recipe.countGap),
    '--kit-section-lead': rem(recipe.leadSize),
    '--kit-section-lead-gap': rem(recipe.leadGap),
    '--kit-section-dot': rem(recipe.liveDot),
    '--kit-section-live-gap': rem(recipe.liveGap),
    '--kit-section-rule-gap': rem(recipe.ruleGap),
    '--kit-section-link': rem(recipe.linkSize),
    '--kit-section-chevron-turns': `${recipe.chevronTurns}turn`,
    '--kit-section-tint': tint ?? 'var(--accent, var(--color-ios-brand))',
  }) as CSSProperties;
