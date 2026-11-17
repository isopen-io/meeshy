import type { CSSProperties } from 'react';

import { desaturateHex, hueShiftHex, inkOn, mixHex } from './kit-color';

/**
 * K27 · MeeshyLivingBanner — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Une bannière vit (orbes, parallaxe, couleur d'accent) partout où une entité se présente.
 * Un dégradé tiré d'UNE teinte, deux orbes qui flottent, une parallaxe, un fondu vers le
 * fond. C'est un décor qui porte, jamais un écran : il ne connaît ni réglages, ni niveau, ni
 * rang, et trois emplacements (haut début, haut fin, bas) reçoivent n'importe quoi. Le repli
 * au défilement (K28), l'avatar (K29), le verre des commandes (K01, K02) et les durées (K26)
 * ne sont pas ici. L'hôte charge l'image, choisit la teinte, sait qui est bloqué.
 */
export type MeeshyLivingBannerMode = 'banner' | 'ambient' | 'veil' | 'fill';
export type MeeshyLivingBannerMotion = 'on' | 'reduced' | 'off';
export type MeeshyLivingBannerScheme = 'dark' | 'light';

export const MEESHY_LIVING_BANNER_HEIGHT = { bar: 96, card: 130, hero: 318 } as const;

export const MEESHY_LIVING_BANNER_MEASURE = {
  angle: 165,
  stops: { dark: [0.72, 0.34], light: [0.52, 0.2] },
  near: { diameter: 220, blur: 28, opacity: { dark: 0.75, light: 0.5 }, parallax: 12 },
  far: { diameter: 180, opacity: { dark: 0.7, light: 0.4 }, parallax: 6, hueShift: -30 },
  fade: 0.38,
  veil: 0.42,
  tiltRange: 15,
  floatMs: 9000,
  // harmony-exempt: fonds de CALCUL du contraste de l'encre ; l'écran réel peint `--color-ios-surface`
  ground: { dark: '#0b0b14', light: '#ffffff' },
} as const;

export type MeeshyLivingBannerRecipeInput = {
  readonly tint: string;
  readonly mode?: MeeshyLivingBannerMode | undefined;
  readonly scheme?: MeeshyLivingBannerScheme | undefined;
  readonly hasImage?: boolean | undefined;
  readonly isMuted?: boolean | undefined;
  readonly motion?: MeeshyLivingBannerMotion | undefined;
  readonly reducedMotion?: boolean | undefined;
  readonly height?: number | undefined;
  readonly collapse?: number | undefined;
};

export type MeeshyBannerOrb = { readonly color: string; readonly diameter: number; readonly blur: number; readonly opacity: number; readonly parallax: number };

export type MeeshyLivingBannerRecipe = {
  readonly mode: MeeshyLivingBannerMode;
  readonly scheme: MeeshyLivingBannerScheme;
  readonly tint: string;
  readonly gradient: { readonly angle: number; readonly stops: readonly { readonly color: 'tint' | 'ground'; readonly share: number }[] };
  readonly orbs: { readonly near: MeeshyBannerOrb; readonly far: MeeshyBannerOrb };
  readonly orbCount: 1 | 2;
  readonly orbsVisible: boolean;
  readonly height: number;
  readonly fadeHeight: number;
  readonly fadeToTransparent: boolean;
  readonly veilOpacity: number;
  readonly isDesaturated: boolean;
  readonly floats: boolean;
  readonly sensorRuns: boolean;
  readonly topColor: string;
  readonly inkOnTop: string;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Le capteur ne tourne que si motion = on, la bannière se voit, n'est pas atténuée et le système n'a pas demandé moins de mouvement. */
export const meeshyBannerSensorRuns = (input: { readonly motion: MeeshyLivingBannerMotion; readonly isVisible: boolean; readonly isMuted: boolean; readonly reducedMotion: boolean }): boolean =>
  input.motion === 'on' && input.isVisible && !input.isMuted && !input.reducedMotion;

/** ±15° donnent ±12 px à l'orbe proche et ±6 px à l'orbe lointaine, à contresens ; au-delà, ça plafonne ; à plat, rien. */
export const meeshyBannerParallax = (tiltDegrees: number): { readonly near: number; readonly far: number } => {
  const unit = Math.min(1, Math.max(-1, tiltDegrees / MEESHY_LIVING_BANNER_MEASURE.tiltRange));
  return { near: unit * MEESHY_LIVING_BANNER_MEASURE.near.parallax, far: -(unit * MEESHY_LIVING_BANNER_MEASURE.far.parallax) };
};

/** La recette d'une bannière : teinte, thème, image et avancée deviennent des nombres. */
export const meeshyLivingBannerRecipe = (input: MeeshyLivingBannerRecipeInput): MeeshyLivingBannerRecipe => {
  const m = MEESHY_LIVING_BANNER_MEASURE;
  const mode = input.mode ?? 'banner';
  const scheme = input.scheme ?? 'dark';
  const isMuted = input.isMuted === true;
  const motion = input.motion ?? 'on';
  const collapse = clamp01(input.collapse ?? 0);
  const base = input.height ?? MEESHY_LIVING_BANNER_HEIGHT.hero;
  const height = base + (MEESHY_LIVING_BANNER_HEIGHT.bar - base) * collapse;
  const tint = isMuted ? desaturateHex(input.tint) : input.tint;
  const [first = 0, second = 0] = m.stops[scheme];
  const hasFade = mode === 'banner' || mode === 'veil';
  const hasImage = input.hasImage === true;
  const reduced = input.reducedMotion === true;
  const topColor = mixHex(tint, m.ground[scheme], first);
  const orb = (share: 'near' | 'far'): MeeshyBannerOrb =>
    share === 'near'
      ? { color: tint, diameter: m.near.diameter, blur: m.near.blur, opacity: m.near.opacity[scheme], parallax: m.near.parallax }
      : { color: hueShiftHex(tint, m.far.hueShift), diameter: m.far.diameter, blur: 0, opacity: m.far.opacity[scheme] * (1 - collapse), parallax: -m.far.parallax };
  return {
    mode,
    scheme,
    tint,
    gradient: { angle: m.angle, stops: [{ color: 'tint', share: first }, { color: 'tint', share: second }, { color: 'ground', share: 0 }] },
    orbs: { near: orb('near'), far: orb('far') },
    orbCount: mode === 'fill' ? 1 : 2,
    orbsVisible: !hasImage,
    height,
    fadeHeight: hasFade ? height * m.fade * (1 - collapse) : 0,
    fadeToTransparent: mode === 'veil',
    veilOpacity: hasImage ? m.veil : 0,
    isDesaturated: isMuted,
    floats: motion !== 'off' && !isMuted && !reduced && collapse < 1,
    sensorRuns: meeshyBannerSensorRuns({ motion, isVisible: true, isMuted, reducedMotion: reduced }),
    topColor,
    inkOnTop: inkOn(topColor),
  };
};

const px = (value: number): string => `${value}px`;

export const meeshyLivingBannerStyle = (recipe: MeeshyLivingBannerRecipe): CSSProperties => {
  const [first, second] = recipe.gradient.stops;
  return {
    '--kit-banner-tint': recipe.tint,
    '--kit-banner-angle': `${recipe.gradient.angle}deg`,
    '--kit-banner-s1': `${Math.round((first?.share ?? 0) * 100)}%`,
    '--kit-banner-s2': `${Math.round((second?.share ?? 0) * 100)}%`,
    '--kit-banner-h': px(recipe.height),
    '--kit-banner-fade': px(recipe.fadeHeight),
    '--kit-banner-veil': recipe.veilOpacity,
    '--kit-banner-near-d': px(recipe.orbs.near.diameter),
    '--kit-banner-near-o': recipe.orbs.near.opacity,
    '--kit-banner-far-d': px(recipe.orbs.far.diameter),
    '--kit-banner-far-o': recipe.orbs.far.opacity,
    '--kit-banner-far-color': recipe.orbs.far.color,
    '--kit-banner-near-x': '0px',
    '--kit-banner-far-x': '0px',
  } as CSSProperties;
};
