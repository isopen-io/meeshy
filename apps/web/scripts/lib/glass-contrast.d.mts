/**
 * Les types du module voisin — même motif que `glass-site.d.mts` : bun et
 * node consomment le `.mjs`, seul `tsc` lit ces déclarations.
 */
export type RGBA = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
export type Scheme = 'light' | 'dark';
export type GlassDensityKey = 'glass' | 'glass-prominent' | 'glass-call' | 'glass-call-prominent';
export type GlassContrastKind = 'text' | 'non-text';

export type GlassContrastEntry = {
  readonly site: string;
  readonly tone: string;
  readonly ink: string;
  readonly density: GlassDensityKey;
  /** Le fond du pire cas quand la surface a le sien (le verre d'appel, #8391 : le blanc) — sinon l'extrême du schéma. */
  readonly canvas?: string;
  /** Le disque de verre posé SUR ce verre (#17345) : son voile blanc éclaircit le fond sous l'encre. */
  readonly veil?: 'glass-call-disc';
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
export declare const GLASS_KIT_CSS_PATH: string;
export declare const IOS_ALIAS_PATH: string;
export declare const WORST_CASE_CANVAS: Readonly<Record<Scheme, RGBA>>;
export declare const GLASS_CONTRAST_INVENTORY: readonly GlassContrastEntry[];
export declare const MIN_RATIO: Readonly<Record<GlassContrastKind, number>>;

export declare function resolveColor(rawValue: string, vars: Readonly<Record<string, string>>, seen?: ReadonlySet<string>): RGBA;
export declare function loadIosSchemes(): { readonly dark: Record<string, string>; readonly light: Record<string, string> };
export declare function loadGlassDensities(): Readonly<Record<GlassDensityKey, number>>;
export declare function loadGlassDiscVeil(): number;
export declare function loadColorAliasMap(): Readonly<Record<string, string>>;
export declare function wcagContrastRatio(a: RGBA, b: RGBA): number;
export declare function glassWorstCaseBackground(args: { readonly tone: RGBA; readonly densityPercent: number; readonly scheme: Scheme; readonly canvas?: RGBA }): RGBA;
export declare function glassWorstCaseContrast(args: {
  readonly tone: RGBA;
  readonly ink: RGBA;
  readonly densityPercent: number;
  readonly scheme: Scheme;
  readonly canvas?: RGBA;
  readonly veilPercent?: number;
}): number;
export declare function glassContrastAudit(inventory?: readonly GlassContrastEntry[]): readonly GlassContrastResult[];
export declare function glassInkUsages(text: string): readonly GlassInkUsage[];
export declare function derivedGlassInkPairs(sources: readonly GlassInkSource[]): readonly DerivedGlassInkPair[];
export declare function glassContrastCoverage(
  sources: readonly GlassInkSource[],
  inventory?: readonly GlassContrastEntry[],
): readonly DerivedGlassInkPair[];

export type KitGlassToneName = 'plain' | 'deep' | 'onLight' | 'theme';
export type KitGlassToneDensity = 'regular' | 'dense';
export type KitGlassToneValues = { readonly fill: 'light' | 'dark' | 'system'; readonly alpha: number; readonly rim: number };
export type KitGlassTones = Readonly<Record<KitGlassToneName, Readonly<Record<KitGlassToneDensity, KitGlassToneValues>>>> & {
  readonly blur: number;
  readonly saturate: number;
  readonly topLight: number;
  readonly shadowAlpha: number;
  readonly shadowOffsetY: number;
  readonly pressScale: number;
  readonly toneFadeMs: number;
  readonly hoverGlow: number;
  readonly pressGlow: number;
};
export type KitGlassToneContrastResult = {
  readonly tone: 'plain' | 'deep' | 'onLight';
  readonly density: KitGlassToneDensity;
  readonly kind: GlassContrastKind;
  readonly ratio: number;
  readonly minRatio: number;
  readonly passes: boolean;
};

export declare const PLAIN_WORST_LUMINANCE: number;
export declare function loadKitGlassTones(): KitGlassTones;
export declare function kitGlassToneContrast(): readonly KitGlassToneContrastResult[];

export type KitGlassFocusRingContrastResult = {
  readonly tone: 'plain' | 'deep' | 'onLight';
  readonly ring: RGBA;
  readonly ratio: number;
  readonly minRatio: number;
  readonly passes: boolean;
};

export declare const DEEP_WORST_LUMINANCE: number;
export declare function kitGlassFocusRingContrast(): readonly KitGlassFocusRingContrastResult[];
