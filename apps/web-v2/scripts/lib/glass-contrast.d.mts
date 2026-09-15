/**
 * Les types du module voisin — même motif que `glass-site.d.mts` : bun et
 * node consomment le `.mjs`, seul `tsc` lit ces déclarations.
 */
export type RGBA = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
export type Scheme = 'light' | 'dark';
export type GlassDensityKey = 'glass' | 'glass-prominent';
export type GlassContrastKind = 'text' | 'non-text';

export type GlassContrastEntry = {
  readonly site: string;
  readonly tone: string;
  readonly ink: string;
  readonly density: GlassDensityKey;
  readonly kind: GlassContrastKind;
};

export type GlassContrastResult = GlassContrastEntry & {
  readonly scheme: Scheme;
  readonly densityPercent: number;
  readonly ratio: number;
  readonly minRatio: number;
  readonly passes: boolean;
};

export type GlassInkSource = { readonly path: string; readonly text: string };
export type GlassInkUsage = { readonly toneAlias: string; readonly inkAlias: string; readonly density: GlassDensityKey };
export type DerivedGlassInkPair = {
  readonly tone: string;
  readonly ink: string;
  readonly density: GlassDensityKey;
  readonly sites: readonly string[];
};

export declare const IOS_TOKENS_PATH: string;
export declare const GLASS_CSS_PATH: string;
export declare const IOS_ALIAS_PATH: string;
export declare const WORST_CASE_CANVAS: Readonly<Record<Scheme, RGBA>>;
export declare const GLASS_CONTRAST_INVENTORY: readonly GlassContrastEntry[];
export declare const MIN_RATIO: Readonly<Record<GlassContrastKind, number>>;

export declare function resolveColor(rawValue: string, vars: Readonly<Record<string, string>>, seen?: ReadonlySet<string>): RGBA;
export declare function loadIosSchemes(): { readonly dark: Record<string, string>; readonly light: Record<string, string> };
export declare function loadGlassDensities(): Readonly<Record<GlassDensityKey, number>>;
export declare function loadColorAliasMap(): Readonly<Record<string, string>>;
export declare function wcagContrastRatio(a: RGBA, b: RGBA): number;
export declare function glassWorstCaseBackground(args: { readonly tone: RGBA; readonly densityPercent: number; readonly scheme: Scheme }): RGBA;
export declare function glassWorstCaseContrast(args: {
  readonly tone: RGBA;
  readonly ink: RGBA;
  readonly densityPercent: number;
  readonly scheme: Scheme;
}): number;
export declare function glassContrastAudit(inventory?: readonly GlassContrastEntry[]): readonly GlassContrastResult[];
export declare function glassInkUsages(text: string): readonly GlassInkUsage[];
export declare function derivedGlassInkPairs(sources: readonly GlassInkSource[]): readonly DerivedGlassInkPair[];
export declare function glassContrastCoverage(
  sources: readonly GlassInkSource[],
  inventory?: readonly GlassContrastEntry[],
): readonly DerivedGlassInkPair[];
