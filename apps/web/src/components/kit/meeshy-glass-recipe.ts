export type MeeshyGlassTone = 'plain' | 'deep' | 'onLight' | 'theme';
export type MeeshyGlassDensity = 'regular' | 'dense';
export type MeeshyGlassMaterial = 'drawn' | 'opaque';
export type MeeshyGlassTint = 'accent' | 'card';
export type MeeshyGlassFill = 'clear' | 'light' | 'dark' | 'system';

export const MEESHY_GLASS_TONES: readonly MeeshyGlassTone[] = ['plain', 'deep', 'onLight', 'theme'];

const PLAIN_CEILING = 0.118;
const DEEP_CEILING = 0.613;
const HYSTERESIS = 0.03;

const band = (luminance: number): MeeshyGlassTone => {
  if (luminance < PLAIN_CEILING) return 'plain';
  if (luminance < DEEP_CEILING) return 'deep';
  return 'onLight';
};

const holds = (tone: MeeshyGlassTone, luminance: number): boolean => {
  if (tone === 'plain') return luminance < PLAIN_CEILING + HYSTERESIS;
  if (tone === 'deep') return luminance >= PLAIN_CEILING - HYSTERESIS && luminance < DEEP_CEILING + HYSTERESIS;
  if (tone === 'onLight') return luminance >= DEEP_CEILING - HYSTERESIS;
  return false;
};

export const resolveMeeshyGlassTone = (luminance: number | null | undefined, previous?: MeeshyGlassTone | null): MeeshyGlassTone => {
  if (luminance === null || luminance === undefined) return 'deep';
  if (previous !== null && previous !== undefined && holds(previous, luminance)) return previous;
  return band(luminance);
};

const MEASURE = {
  blurRadius: 24,
  saturation: 1.8,
  topLight: 0.38,
  plainFill: 0.14,
  deepFill: 0.46,
  denseFill: 0.66,
  onLightFill: 0.62,
  themeFill: 0.8,
  themeDenseFill: 0.94,
  plainRim: 0.24,
  rim: 0.2,
  opaqueRim: 0.18,
  shadowOpacity: 0.28,
  shadowRadius: 14,
  shadowY: 10,
  pressScale: 1.04,
  pressSheenFactor: 2,
  hoverSheenFactor: 1.5,
  tintWashDark: 0.22,
  tintWashLight: 0.16,
  themeSheenDark: 0.1,
  themeSheenLight: 0.32,
} as const;

export type MeeshyGlassRecipe = {
  readonly material: MeeshyGlassMaterial;
  readonly fill: MeeshyGlassFill;
  readonly fillOpacity: number;
  readonly blurRadius: number;
  readonly saturation: number;
  readonly tintWash: number;
  readonly topLight: number;
  readonly glowPeak: number;
  readonly glow: number;
  readonly rim: number;
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly shadowY: number;
  readonly scale: number;
  readonly className: string;
  readonly attributes: Readonly<Record<string, string>>;
};

export type MeeshyGlassRecipeInput = {
  readonly tone: MeeshyGlassTone;
  readonly density?: MeeshyGlassDensity;
  readonly tint?: MeeshyGlassTint | null;
  readonly isTinted?: boolean;
  readonly isInteractive?: boolean;
  readonly isPressed?: boolean;
  readonly isHovered?: boolean;
  readonly isNested?: boolean;
  readonly isDark?: boolean;
  readonly material?: MeeshyGlassMaterial;
  readonly reduceMotion?: boolean;
};

type Resting = Omit<MeeshyGlassRecipe, 'className' | 'attributes' | 'glow' | 'scale'>;

const fillOf = (tone: MeeshyGlassTone, density: MeeshyGlassDensity): number => {
  if (tone === 'plain') return MEASURE.plainFill;
  if (tone === 'deep') return density === 'dense' ? MEASURE.denseFill : MEASURE.deepFill;
  if (tone === 'onLight') return MEASURE.onLightFill;
  return density === 'dense' ? MEASURE.themeDenseFill : MEASURE.themeFill;
};

const rimOf = (tone: MeeshyGlassTone): number => {
  if (tone === 'theme') return 0;
  return tone === 'plain' ? MEASURE.plainRim : MEASURE.rim;
};

const NONE: Resting = {
  material: 'drawn',
  fill: 'clear',
  fillOpacity: 0,
  blurRadius: 0,
  saturation: 1,
  tintWash: 0,
  topLight: 0,
  glowPeak: 0,
  rim: 0,
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowY: 0,
};

const fillColorOf = (tone: MeeshyGlassTone): MeeshyGlassFill => {
  if (tone === 'theme') return 'system';
  return tone === 'plain' ? 'light' : 'dark';
};

const drawn = (tone: MeeshyGlassTone, density: MeeshyGlassDensity, tintWash: number, isDark: boolean): Resting => {
  const isTheme = tone === 'theme';
  return {
    material: 'drawn',
    fill: fillColorOf(tone),
    fillOpacity: fillOf(tone, density),
    blurRadius: MEASURE.blurRadius,
    saturation: isTheme ? 1 : MEASURE.saturation,
    tintWash,
    topLight: isTheme ? 0 : MEASURE.topLight,
    glowPeak: isTheme ? (isDark ? MEASURE.themeSheenDark : MEASURE.themeSheenLight) : MEASURE.topLight,
    rim: rimOf(tone),
    shadowOpacity: isTheme ? 0 : MEASURE.shadowOpacity,
    shadowRadius: isTheme ? 0 : MEASURE.shadowRadius,
    shadowY: isTheme ? 0 : MEASURE.shadowY,
  };
};

const opaque = (tone: MeeshyGlassTone, tintWash: number): Resting => ({
  ...NONE,
  material: 'opaque',
  fill: tone === 'theme' ? 'system' : 'dark',
  fillOpacity: 1,
  tintWash,
  rim: tone === 'theme' ? 0 : MEASURE.opaqueRim,
});

const restingOf = (input: Required<Pick<MeeshyGlassRecipeInput, 'tone' | 'density' | 'material' | 'isNested' | 'isDark'>> & { readonly tintWash: number }): Resting => {
  const { tone, density, material, isNested, isDark, tintWash } = input;
  if (isNested && tone !== 'theme') return { ...NONE, material, tintWash };
  if (material === 'opaque') return opaque(tone, tintWash);
  return drawn(tone, density, tintWash, isDark);
};

const classesOf = (isInteractive: boolean): string => (isInteractive ? 'glass-tone glass-touch' : 'glass-tone');

const attributesOf = (input: {
  readonly tone: MeeshyGlassTone;
  readonly density: MeeshyGlassDensity;
  readonly tint: MeeshyGlassTint | null;
  readonly material: MeeshyGlassMaterial;
  readonly isNested: boolean;
  readonly isPressed: boolean;
}): Readonly<Record<string, string>> => ({
  'data-glass-tone': input.tone,
  'data-glass-density': input.density,
  ...(input.tint === null ? {} : { 'data-glass-tint': input.tint }),
  ...(input.material === 'opaque' ? { 'data-glass-material': 'opaque' } : {}),
  ...(input.isNested && input.tone !== 'theme' ? { 'data-glass-nested': '' } : {}),
  ...(input.isPressed ? { 'data-pressed': '' } : {}),
});

export const meeshyGlassRecipe = (input: MeeshyGlassRecipeInput): MeeshyGlassRecipe => {
  const density = input.density ?? 'regular';
  const material = input.material ?? 'drawn';
  const tint = input.tint ?? null;
  const isNested = input.isNested ?? false;
  const isDark = input.isDark ?? false;
  const isInteractive = input.isInteractive ?? false;
  const isPressed = isInteractive && (input.isPressed ?? false);
  const isHovered = isInteractive && !isPressed && (input.isHovered ?? false);
  const isTinted = (input.isTinted ?? false) || tint !== null;
  const tintWash = isTinted ? (isDark ? MEASURE.tintWashDark : MEASURE.tintWashLight) : 0;
  const resting = restingOf({ tone: input.tone, density, material, isNested, isDark, tintWash });
  const glows = isInteractive && resting.material === 'drawn' && !(isNested && input.tone !== 'theme');
  const factor = isPressed ? MEASURE.pressSheenFactor : isHovered ? MEASURE.hoverSheenFactor : 1;
  const response = { glow: glows ? factor - 1 : 0, scale: isPressed && !(input.reduceMotion ?? false) ? MEASURE.pressScale : 1 };
  const lit = glows ? Math.min(1, resting.topLight * factor) : resting.topLight;
  return {
    ...resting,
    topLight: lit,
    ...response,
    className: classesOf(isInteractive),
    attributes: attributesOf({ tone: input.tone, density, tint, material: resting.material, isNested, isPressed }),
  };
};
