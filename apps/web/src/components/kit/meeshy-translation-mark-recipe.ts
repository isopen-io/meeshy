import type { CSSProperties } from 'react';

/**
 * K51 · MeeshyTranslationMark — LES TEXTES ET LA RECETTE (#18875, #18857).
 *
 * Tout contenu traduit porte la même marque discrète, qui dit d'où il vient et rend
 * l'original d'un geste. Elle ne décide de rien : elle dit ce que l'hôte lui remet — un
 * nom de langue déjà accordé, un booléen, un geste, des mots déjà traduits. Elle ne
 * connaît ni code de langue, ni résolveur du Prisme, ni message : le même booléen choisit
 * le texte de l'hôte ET le libellé de la marque, dans la même image.
 */
export type MeeshyTranslationMarkDensity = 'icon' | 'line' | 'legend';
export type MeeshyTranslationMarkMode = 'translated' | 'original' | 'announce';

export type MeeshyTranslationMarkWords = {
  readonly translated: string;
  readonly original: string;
  readonly showOriginal: string;
  readonly showTranslation: string;
};

export const MEESHY_TRANSLATION_MARK_MEASURE = {
  glyph: 16,
  fontSize: 12.5,
  announceFontSize: 13,
  tapTarget: 44,
  separatorGap: 7,
  pressedScale: 0.94,
  pressedOpacity: 0.62,
  pendingOpacity: 0.5,
  legendRadius: 13,
  legendPadding: [9, 10],
  legendGap: 7,
} as const;

/** Les deux phrases de la marque : la mention (« Traduit de l'italien ») et le verbe de la bascule. */
export const meeshyTranslationMarkTexts = (input: {
  readonly mode: MeeshyTranslationMarkMode;
  readonly sourceLanguageName?: string | undefined;
  readonly originalLanguageName?: string | undefined;
  readonly words: MeeshyTranslationMarkWords;
}): { readonly mention: string; readonly toggle: string } => {
  const { mode, words } = input;
  const named = (head: string, name: string | undefined): string => (name === undefined || name === '' ? head : `${head} ${name}`);
  return mode === 'original'
    ? { mention: named(words.original, input.originalLanguageName), toggle: words.showTranslation }
    : { mention: named(words.translated, input.sourceLanguageName), toggle: words.showOriginal };
};

export type MeeshyTranslationMarkRecipeInput = {
  readonly density: MeeshyTranslationMarkDensity;
  readonly mode: MeeshyTranslationMarkMode;
  readonly hasToggle: boolean;
  readonly isPressed?: boolean | undefined;
  readonly isPending?: boolean | undefined;
};

export type MeeshyTranslationMarkRecipe = {
  readonly glyph: number;
  readonly fontSize: number;
  readonly tapTarget: number;
  readonly separatorGap: number;
  readonly showsMention: boolean;
  readonly showsToggle: boolean;
  readonly showsSeparator: boolean;
  readonly glyphTone: 'accent' | 'ink3';
  readonly pressedScale: number;
  readonly pressedOpacity: number;
  readonly toggleOpacity: number;
  readonly legendRadius: number;
  readonly legendPadding: readonly number[];
  readonly legendGap: number;
};

export const meeshyTranslationMarkRecipe = ({ density, mode, hasToggle, isPending }: MeeshyTranslationMarkRecipeInput): MeeshyTranslationMarkRecipe => {
  const measure = MEESHY_TRANSLATION_MARK_MEASURE;
  const showsToggle = hasToggle && density === 'line' && mode !== 'announce';
  return {
    glyph: measure.glyph,
    fontSize: mode === 'announce' ? measure.announceFontSize : measure.fontSize,
    tapTarget: measure.tapTarget,
    separatorGap: measure.separatorGap,
    showsMention: density === 'line' && mode !== 'announce',
    showsToggle,
    showsSeparator: showsToggle,
    glyphTone: mode === 'original' ? 'ink3' : 'accent',
    pressedScale: measure.pressedScale,
    pressedOpacity: measure.pressedOpacity,
    toggleOpacity: isPending === true ? measure.pendingOpacity : 1,
    legendRadius: measure.legendRadius,
    legendPadding: measure.legendPadding,
    legendGap: measure.legendGap,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyTranslationMarkStyle = (recipe: MeeshyTranslationMarkRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-translation-glyph': rem(recipe.glyph),
    '--kit-translation-font': `${recipe.fontSize / REM}rem`,
    '--kit-translation-target': rem(recipe.tapTarget),
    '--kit-translation-sep': rem(recipe.separatorGap),
    '--kit-translation-pressed': recipe.pressedScale,
    '--kit-translation-pressed-opacity': recipe.pressedOpacity,
    '--kit-translation-toggle-opacity': recipe.toggleOpacity,
    '--kit-translation-legend-radius': rem(recipe.legendRadius),
    '--kit-translation-legend-pad': recipe.legendPadding.map(rem).join(' '),
    '--kit-translation-legend-gap': rem(recipe.legendGap),
    ...(tint === undefined ? {} : { '--kit-translation-tint': tint }),
  }) as CSSProperties;
