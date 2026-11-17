import type { CSSProperties } from 'react';

/**
 * K55 · MeeshyKeyHint — LA LOI ET LA RECETTE EN VALEURS (#18874).
 *
 * Une touche de raccourci montre la touche, elle ne l'écoute pas : le composant
 * n'installe AUCUN écouteur de clavier, et ne décide pas quelle frappe appartient à
 * qui — la table des raccourcis reste à l'app. Une touche affichée est une promesse :
 * le raccourci marche ici, maintenant, sur cette machine. Pas de touche sans clavier
 * matériel, pas de touche sur une commande désactivée. L'hôte écrit `primary`, jamais
 * « Commande » ni « Ctrl » : la loi choisit selon la machine.
 */
export type MeeshyKeyPlatform = 'apple' | 'other';
export type MeeshyNamedKey = 'primary' | 'shift' | 'option' | 'control' | 'enter' | 'escape' | 'space' | 'tab' | 'delete' | 'up' | 'down' | 'left' | 'right';
export type MeeshyKey = MeeshyNamedKey | { readonly character: string };
export type MeeshyKeyCombo = readonly MeeshyKey[];
export type MeeshyKeyHintContext = 'free' | 'inset' | 'legend';
export type MeeshyKeyHintSize = 'regular' | 'compact';
export type MeeshyKeyHintSurface = 'auto' | 'onFill' | 'onAccent' | 'onGlass';

export const MEESHY_KEY_COMBO_MAX = 3;

type Naming = { readonly glyph: string; readonly name: string; readonly shortcut: string };

const APPLE: Readonly<Record<'primary' | 'option', Naming>> = {
  primary: { glyph: '⌘', name: 'Commande', shortcut: 'Meta' },
  option: { glyph: '⌥', name: 'Option', shortcut: 'Alt' },
};

const OTHER: Readonly<Record<'primary' | 'option', Naming>> = {
  primary: { glyph: 'Ctrl', name: 'Ctrl', shortcut: 'Control' },
  option: { glyph: 'Alt', name: 'Alt', shortcut: 'Alt' },
};

const COMMON: Readonly<Record<Exclude<MeeshyNamedKey, 'primary' | 'option'>, Naming>> = {
  shift: { glyph: '⇧', name: 'Majuscule', shortcut: 'Shift' },
  control: { glyph: 'Ctrl', name: 'Contrôle', shortcut: 'Control' },
  enter: { glyph: '↵', name: 'Entrée', shortcut: 'Enter' },
  escape: { glyph: 'Échap', name: 'Échap', shortcut: 'Escape' },
  space: { glyph: 'Espace', name: 'Espace', shortcut: 'Space' },
  tab: { glyph: '⇥', name: 'Tab', shortcut: 'Tab' },
  delete: { glyph: '⌫', name: 'Retour arrière', shortcut: 'Backspace' },
  up: { glyph: '↑', name: 'flèche haut', shortcut: 'ArrowUp' },
  down: { glyph: '↓', name: 'flèche bas', shortcut: 'ArrowDown' },
  left: { glyph: '←', name: 'flèche gauche', shortcut: 'ArrowLeft' },
  right: { glyph: '→', name: 'flèche droite', shortcut: 'ArrowRight' },
};

const MIRRORED: Readonly<Record<string, string>> = { '←': '→', '→': '←' };

const namingOf = (key: MeeshyKey, platform: MeeshyKeyPlatform): Naming => {
  if (typeof key === 'object') {
    const character = key.character.toUpperCase();
    return { glyph: character, name: character, shortcut: character };
  }
  if (key === 'primary' || key === 'option') return (platform === 'apple' ? APPLE : OTHER)[key];
  return COMMON[key];
};

const combo = (keys: MeeshyKeyCombo): MeeshyKeyCombo => keys.slice(0, MEESHY_KEY_COMBO_MAX);

/** Les glyphes à dessiner, dans l'ordre de frappe (jamais inversé), gauche et droite échangés en RTL. */
export const meeshyKeyHintGlyphs = (keys: MeeshyKeyCombo, platform: MeeshyKeyPlatform, options: { readonly isRtl?: boolean } = {}): readonly string[] =>
  combo(keys).map((key) => {
    const { glyph } = namingOf(key, platform);
    return options.isRtl === true ? (MIRRORED[glyph] ?? glyph) : glyph;
  });

/** Ce que la voix dit : « raccourci : Commande M ». */
export const meeshyKeyHintSpoken = (keys: MeeshyKeyCombo, platform: MeeshyKeyPlatform, options: { readonly prefix?: string } = {}): string =>
  `${options.prefix ?? 'raccourci'} : ${combo(keys)
    .map((key) => namingOf(key, platform).name)
    .join(' ')}`;

/** La valeur d'`aria-keyshortcuts`, tirée de la même entrée que le dessin. */
export const meeshyKeyHintShortcut = (keys: MeeshyKeyCombo, platform: MeeshyKeyPlatform): string =>
  combo(keys)
    .map((key) => namingOf(key, platform).shortcut)
    .join('+');

/** Rien sans clavier matériel, rien sur une commande désactivée : aucune place réservée. */
export const meeshyKeyHintShown = ({ hasKeyboard, isEnabled }: { readonly hasKeyboard: boolean; readonly isEnabled: boolean }): boolean => hasKeyboard && isEnabled;

const state: { platform: MeeshyKeyPlatform | null; keyboard: boolean | null } = { platform: null, keyboard: null };

/** La plateforme, lue une fois de l'environnement. */
export const meeshyKeyHintPlatform = (): MeeshyKeyPlatform => {
  if (state.platform !== null) return state.platform;
  const host = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { readonly userAgentData?: { readonly platform?: string } });
  const name = host?.userAgentData?.platform ?? host?.platform ?? '';
  state.platform = /mac|iphone|ipad|ipod/i.test(name) ? 'apple' : 'other';
  return state.platform;
};

/** Un clavier matériel : un pointeur fin qui survole, lu une fois de l'environnement. */
export const meeshyKeyHintHasKeyboard = (): boolean => {
  if (state.keyboard !== null) return state.keyboard;
  state.keyboard = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  return state.keyboard;
};

export const MEESHY_KEY_HINT_MEASURE = {
  regular: { side: 26, radius: 8, lip: 2.5, fontSize: 12.5, gap: 4, glyphSize: 12 },
  compact: { side: 20, radius: 6, lip: 2, fontSize: 10.5, gap: 3, glyphSize: 10 },
  padding: 6,
  borderWidth: 1,
  legend: { rule: { width: 1, height: 18, gap: 10 }, pairGap: 6, labelSize: 13, labelWeight: 600, barHeight: 44, barRadius: 14 },
} as const;

export type MeeshyKeyHintRecipeInput = {
  readonly context?: MeeshyKeyHintContext | undefined;
  readonly size?: MeeshyKeyHintSize | undefined;
  readonly surface?: MeeshyKeyHintSurface | undefined;
  readonly isPressed?: boolean | undefined;
};

export type MeeshyKeyHintRecipe = {
  readonly context: MeeshyKeyHintContext;
  readonly surface: MeeshyKeyHintSurface;
  readonly side: number;
  readonly radius: number;
  readonly padding: number;
  readonly lip: number;
  readonly glyphSize: number;
  readonly fontSize: number;
  readonly gap: number;
  readonly borderWidth: number;
  readonly shade: 'rest' | 'pressed';
  readonly translate: number;
  readonly targetSide: 0;
  readonly isInteractive: false;
  readonly legend: typeof MEESHY_KEY_HINT_MEASURE.legend;
};

/** La recette d'une touche : taille, surface et état enfoncé deviennent des nombres. */
export const meeshyKeyHintRecipe = (input: MeeshyKeyHintRecipeInput): MeeshyKeyHintRecipe => {
  const measure = MEESHY_KEY_HINT_MEASURE[input.size ?? 'regular'];
  return {
    context: input.context ?? 'free',
    surface: input.surface ?? 'auto',
    side: measure.side,
    radius: measure.radius,
    padding: MEESHY_KEY_HINT_MEASURE.padding,
    lip: measure.lip,
    glyphSize: measure.glyphSize,
    fontSize: measure.fontSize,
    gap: measure.gap,
    borderWidth: MEESHY_KEY_HINT_MEASURE.borderWidth,
    shade: input.isPressed === true ? 'pressed' : 'rest',
    translate: 0,
    targetSide: 0,
    isInteractive: false,
    legend: MEESHY_KEY_HINT_MEASURE.legend,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyKeyHintStyle = (recipe: MeeshyKeyHintRecipe): CSSProperties => {
  const { rule } = recipe.legend;
  return {
    '--kit-key-side': rem(recipe.side),
    '--kit-key-radius': rem(recipe.radius),
    '--kit-key-pad': rem(recipe.padding),
    '--kit-key-lip': rem(recipe.lip),
    '--kit-key-glyph': rem(recipe.glyphSize),
    '--kit-key-font': rem(recipe.fontSize),
    '--kit-key-gap': rem(recipe.gap),
    '--kit-key-border': rem(recipe.borderWidth),
    '--kit-key-rule-w': rem(rule.width),
    '--kit-key-rule-h': rem(rule.height),
    '--kit-key-rule-gap': rem(rule.gap),
    '--kit-key-pair-gap': rem(recipe.legend.pairGap),
    '--kit-key-label': rem(recipe.legend.labelSize),
    '--kit-key-label-weight': recipe.legend.labelWeight,
    '--kit-key-bar-h': rem(recipe.legend.barHeight),
    '--kit-key-bar-radius': rem(recipe.legend.barRadius),
  } as CSSProperties;
};
