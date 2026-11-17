import type { CSSProperties } from 'react';

/**
 * K29 · MeeshyAvatarMorph — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * Un avatar VOYAGE d'un écran à l'autre (liste → fiche → épingle de carte) au lieu de
 * réapparaître. Le composant transporte, il ne dessine rien : l'avatar, ses initiales, sa
 * photo, sa présence et son anneau sont ceux de l'hôte. Il relie deux emplacements qui portent
 * la même identité dans la même portée : un seul avatar, jamais deux. Sans portée, sans
 * capacité du navigateur ou sous mouvement réduit : fondu enchaîné sur place.
 */
export type MeeshyAvatarMorphPath = 'auto' | 'straight' | 'arc';
export type MeeshyAvatarMorphMode = 'shared' | 'driven' | 'crossfade';

export const MEESHY_AVATAR_MORPH_SIZES = { bar: 36, row: 44, pin: 56, hero: 112 } as const;

export const MEESHY_AVATAR_MORPH_MEASURE = {
  token: 'travel',
  durationMs: 560,
  ringGapRatio: 0.045,
  ringGapMin: 2,
  badgeRatio: 0.25,
  badgeMin: 14,
  badgeLeadMs: 80,
  badgeReturnMs: 120,
} as const;

export type MeeshyAvatarMorphRecipeInput = {
  readonly from: number;
  readonly to: number;
  readonly hasScope: boolean;
  readonly canTravel?: boolean | undefined;
  readonly path?: MeeshyAvatarMorphPath | undefined;
  readonly progress?: number | null | undefined;
  readonly reduceMotion?: boolean | undefined;
  readonly ringTravels?: boolean | undefined;
  readonly badgeTravels?: boolean | undefined;
  readonly displacement?: { readonly x: number; readonly y: number } | undefined;
};

export type MeeshyAvatarMorphRecipe = {
  readonly mode: MeeshyAvatarMorphMode;
  readonly path: 'straight' | 'arc';
  readonly token: 'travel';
  readonly durationMs: number;
  readonly progress: number | null;
  readonly scaleFrom: number;
  readonly scaleTo: number;
  readonly ringInFlight: 0 | 1;
  readonly badgeInFlight: 0 | 1;
  readonly badgeLeadMs: number;
  readonly badgeReturnMs: number;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const resolvePath = (input: MeeshyAvatarMorphRecipeInput): 'straight' | 'arc' => {
  if (input.path === 'straight' || input.path === 'arc') return input.path;
  const move = input.displacement;
  if (move === undefined) return 'straight';
  return Math.min(Math.abs(move.x), Math.abs(move.y)) > Math.max(input.from, input.to) / 2 ? 'arc' : 'straight';
};

export const meeshyAvatarMorphRecipe = (input: MeeshyAvatarMorphRecipeInput): MeeshyAvatarMorphRecipe => {
  const progress = input.progress === undefined || input.progress === null || !Number.isFinite(input.progress) ? null : Math.min(Math.max(input.progress, 0), 1);
  const mode: MeeshyAvatarMorphMode = !input.hasScope || input.reduceMotion === true ? 'crossfade' : progress !== null ? 'driven' : input.canTravel === true ? 'shared' : 'crossfade';
  const big = Math.max(input.from, input.to, 1);
  return {
    mode,
    path: resolvePath(input),
    token: MEESHY_AVATAR_MORPH_MEASURE.token,
    durationMs: MEESHY_AVATAR_MORPH_MEASURE.durationMs,
    progress,
    scaleFrom: input.from / big,
    scaleTo: input.to / big,
    ringInFlight: input.ringTravels === true ? 1 : 0,
    badgeInFlight: input.badgeTravels === true ? 1 : 0,
    badgeLeadMs: MEESHY_AVATAR_MORPH_MEASURE.badgeLeadMs,
    badgeReturnMs: MEESHY_AVATAR_MORPH_MEASURE.badgeReturnMs,
  };
};

/** Les emplacements autour du contenu : l'anneau à 4,5 % de la taille (2 au moins), le badge à 25 % (14 au moins). */
export const meeshyAvatarMorphJewels = (size: number): { readonly ringGap: number; readonly badge: number } => ({
  ringGap: round2(Math.max(size * MEESHY_AVATAR_MORPH_MEASURE.ringGapRatio, MEESHY_AVATAR_MORPH_MEASURE.ringGapMin)),
  badge: Math.max(size * MEESHY_AVATAR_MORPH_MEASURE.badgeRatio, MEESHY_AVATAR_MORPH_MEASURE.badgeMin),
});

const REM = 16;
export const avatarMorphRem = (px: number): string => `${px / REM}rem`;

/** Un nom de transition valide pour un identifiant opaque. */
export const meeshyAvatarMorphName = (id: string): string => `kit-morph-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

export const meeshyAvatarMorphStyle = (size: number, progress: number | null): CSSProperties => {
  const jewels = meeshyAvatarMorphJewels(size);
  return {
    '--kit-morph-size': avatarMorphRem(size),
    '--kit-morph-ring': avatarMorphRem(jewels.ringGap),
    '--kit-morph-badge': avatarMorphRem(jewels.badge),
    ...(progress === null ? {} : { '--kit-morph-progress': String(progress) }),
  } as CSSProperties;
};
