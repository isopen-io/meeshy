import type { CSSProperties } from 'react';

/**
 * K28 · MeeshyCollapsingHero — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Un en-tête immersif se replie en barre de verre au défilement, sans image perdue. Un seul
 * nombre mène la danse : `progress`, de 0 à 1 (négatif quand on tire vers le bas). Il range
 * un héros de 318 dans une barre épinglée de 96, fait voyager l'avatar (112 → 36) et le
 * titre (36 → 17) — UN avatar, UN titre, du début à la fin — et dit qui porte l'identité :
 * le héros sous 50 %, la barre au-delà. Le décor (K27), le verre (K01), les boutons ronds
 * (K02), le voyage de l'avatar ailleurs (K29), le défilement et les onglets épinglés sont
 * à d'autres : l'hôte, et l'app pour ce qui entre dans les emplacements.
 */
export type MeeshyCollapsingHeroVariant = 'hero' | 'bar' | 'capsule';
export type MeeshyCollapsingHeroAlignment = 'leading' | 'center' | 'compact';
export type MeeshyCollapsingHeroSnap = 'nearest' | 'none';

export const MEESHY_COLLAPSING_HERO_MEASURE = {
  expanded: 318,
  collapsed: 96,
  identityOverflow: 132,
  avatar: { expanded: 112, collapsed: 36, overlap: 86 },
  title: { expanded: 36, collapsed: 17, gap: 12 },
  subtitle: { expanded: 15, collapsed: 12 },
  travelEnd: 0.55,
  barFrom: 0.5,
  discEnd: 0.7,
  controls: { target: 44, inset: 16, restInset: 12, safeTop: 54 },
  inset: 16,
  avatarStart: 66,
  titleGap: 10,
  radius: 28,
  snapThreshold: 0.5,
} as const;

export type MeeshyCollapsingHeroRecipeInput = {
  readonly progress: number;
  readonly expandedHeight?: number | undefined;
  readonly collapsedHeight?: number | undefined;
  readonly alignment?: MeeshyCollapsingHeroAlignment | undefined;
  readonly hasAvatar?: boolean | undefined;
  readonly hasSubtitle?: boolean | undefined;
};

export type MeeshyCollapsingHeroRecipe = {
  readonly progress: number;
  readonly height: number;
  readonly bannerStretch: number;
  readonly bannerOpacity: number;
  readonly glassOpacity: number;
  readonly radius: number;
  readonly avatar: { readonly size: number; readonly start: number; readonly top: number };
  readonly title: { readonly size: number; readonly start: number; readonly top: number };
  readonly subtitle: { readonly size: number };
  readonly controls: { readonly target: number; readonly shift: number };
  readonly controlsDiscOpacity: number;
  readonly barOwnsIdentity: boolean;
  readonly scrollDistance: number;
  readonly expandedWithIdentity: number;
  readonly isCentered: boolean;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

/** La recette du héros à une avancée : hauteur, avatar, titre, bannière et verre deviennent des nombres. */
export const meeshyCollapsingHeroRecipe = (input: MeeshyCollapsingHeroRecipeInput): MeeshyCollapsingHeroRecipe => {
  const m = MEESHY_COLLAPSING_HERO_MEASURE;
  const expanded = input.expandedHeight ?? m.expanded;
  const collapsed = input.collapsedHeight ?? m.collapsed;
  const p = clamp01(input.progress);
  const q = clamp01(p / m.travelEnd);
  const hasAvatar = input.hasAvatar !== false;
  const avatarTopOpen = expanded - m.avatar.overlap;
  const titleStartClosed = hasAvatar ? m.avatarStart + m.avatar.collapsed + m.titleGap : m.avatarStart;
  const titleTopOpen = hasAvatar ? avatarTopOpen + m.avatar.expanded + m.title.gap : expanded - m.title.expanded - m.inset;
  const barTop = m.controls.safeTop + (collapsed - m.controls.safeTop - m.title.collapsed) / 2;
  return {
    progress: p,
    height: lerp(expanded, collapsed, p),
    bannerStretch: Math.max(0, -input.progress) * expanded,
    bannerOpacity: clamp01((1 - p) / 0.5),
    glassOpacity: clamp01((p - m.barFrom) / 0.5),
    radius: m.radius * clamp01((p - m.barFrom) / 0.5),
    avatar: {
      size: lerp(m.avatar.expanded, m.avatar.collapsed, q),
      start: lerp(m.inset, m.avatarStart, q),
      top: lerp(avatarTopOpen, m.controls.safeTop + (collapsed - m.controls.safeTop - m.avatar.collapsed) / 2, q),
    },
    title: {
      size: lerp(m.title.expanded, m.title.collapsed, q),
      start: lerp(m.inset, titleStartClosed, q),
      top: lerp(titleTopOpen, barTop, q),
    },
    subtitle: { size: lerp(m.subtitle.expanded, m.subtitle.collapsed, q) },
    controls: { target: m.controls.target, shift: (m.controls.restInset - m.controls.inset) * p },
    controlsDiscOpacity: clamp01(1 - p / m.discEnd),
    barOwnsIdentity: input.progress > m.barFrom,
    scrollDistance: expanded + m.identityOverflow - collapsed,
    expandedWithIdentity: expanded + m.identityOverflow,
    isCentered: input.alignment === 'center',
  };
};

/** L'avancée pour un défilement donné : 0 au repos, 1 à la distance de repli, négative quand on tire. */
export const meeshyCollapsingHeroProgress = (offset: number, recipe: Pick<MeeshyCollapsingHeroRecipe, 'scrollDistance'>): number => offset / recipe.scrollDistance;

/** Le cran le plus proche (aimant) : seuil à 50 % de la distance de repli. */
export const meeshyCollapsingHeroSnapTarget = (offset: number, recipe: Pick<MeeshyCollapsingHeroRecipe, 'scrollDistance'>): number =>
  offset <= 0 || offset >= recipe.scrollDistance ? offset : offset / recipe.scrollDistance >= MEESHY_COLLAPSING_HERO_MEASURE.snapThreshold ? recipe.scrollDistance : 0;

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyCollapsingHeroStyle = (recipe: MeeshyCollapsingHeroRecipe): CSSProperties =>
  ({
    '--kit-hero-h': rem(recipe.height),
    '--kit-hero-stretch': rem(recipe.bannerStretch),
    '--kit-hero-banner': recipe.bannerOpacity,
    '--kit-hero-glass': recipe.glassOpacity,
    '--kit-hero-radius': rem(recipe.radius),
    '--kit-hero-avatar': rem(recipe.avatar.size),
    '--kit-hero-avatar-x': rem(recipe.avatar.start),
    '--kit-hero-avatar-y': rem(recipe.avatar.top),
    '--kit-hero-title': rem(recipe.title.size),
    '--kit-hero-title-x': rem(recipe.title.start),
    '--kit-hero-title-y': rem(recipe.title.top),
    '--kit-hero-subtitle': rem(recipe.subtitle.size),
    '--kit-hero-disc': recipe.controlsDiscOpacity,
    '--kit-hero-shift': rem(recipe.controls.shift),
    '--kit-hero-target': rem(recipe.controls.target),
    '--kit-hero-identity': rem(recipe.expandedWithIdentity),
  }) as CSSProperties;
