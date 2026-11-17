import type { CSSProperties } from 'react';

import { ensureContrast } from './kit-color';

/**
 * K31 · MeeshyCodeCard — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Il montre un code, il ne sait pas ce qu'il ouvre. Une chaîne opaque devient une matrice QR
 * (modules arrondis, trois yeux à la teinte, pastille au centre — UN seul encodeur, celui du
 * produit, `lib/qr.ts`) posée sur une plaque TOUJOURS claire, dans une carte de verre qui
 * s'incline. Le verre (K01), les durées (K26), le billet autour d'une miniature (K30), la
 * grille d'actions (K32) et le menu (K18) sont à d'autres. L'adresse, le jeton ou le secret
 * sont à l'app : le composant reçoit `payload` et ne le lit jamais.
 */
export type MeeshyCodeCardStyle = 'glass' | 'plain' | 'reticle';
export type MeeshyCodeCardSize = 72 | 160 | 220;
export type MeeshyCodeCardTilt = 'device' | 'pointer' | 'none';
export type MeeshyCodeCardFace = 'code' | 'identity';
export type MeeshyCodeReticleState = 'idle' | 'seeking' | 'found';

export const MEESHY_CODE_CARD_MEASURE = {
  cardRadius: 34,
  plateRadius: { mini: 14, other: 28 },
  plateMargin: { mini: 6, other: 16 },
  chrome: 98,
  centerShare: 0.25,
  centerFrom: 120,
  moduleShare: 0.86,
  moduleRadius: 0.36,
  maxMiniModules: 24,
  // harmony-exempt: la plaque d'un code est TOUJOURS claire et son encre toujours sombre, dans les deux thèmes (une couleur de lisibilité, pas de chrome)
  plate: '#F5F3FF',
  // harmony-exempt: l'encre des modules, jamais thématisée
  ink: '#1B1140',
  arrivalMs: { full: 700, reduced: 200 },
  tilt: { pivot: 16, glintFrom: 112, glintTo: -32, glintFlat: 40, plate: 7, center: 13 },
} as const;

export type MeeshyCodeCardRecipeInput = {
  readonly style?: MeeshyCodeCardStyle | undefined;
  readonly size?: MeeshyCodeCardSize | undefined;
  readonly tilt?: MeeshyCodeCardTilt | undefined;
  readonly tint?: string | undefined;
  readonly modules?: number | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyCodeCardRecipe = {
  readonly style: MeeshyCodeCardStyle;
  readonly side: number;
  readonly cardWidth: number;
  readonly cardRadius: number;
  readonly plateRadius: number;
  readonly plateMargin: number;
  readonly plateColor: string;
  readonly inkColor: string;
  readonly tintColor: string;
  readonly centerSize: number;
  readonly showsCenter: boolean;
  readonly showsCaption: boolean;
  readonly tilt: MeeshyCodeCardTilt;
  readonly hasGlint: boolean;
  readonly arrivalMs: number;
  readonly isRefused: boolean;
};

const even = (value: number): number => Math.round(value / 2) * 2;

/** La recette d'une carte : style, côté et inclinaison deviennent des nombres. */
export const meeshyCodeCardRecipe = (input: MeeshyCodeCardRecipeInput): MeeshyCodeCardRecipe => {
  const m = MEESHY_CODE_CARD_MEASURE;
  const style = input.style ?? 'glass';
  const side = input.size ?? 220;
  const isMini = side === 72;
  const reduce = input.reduceMotion === true;
  const wanted = input.tilt ?? 'device';
  const tilt = isMini || style === 'plain' || reduce ? 'none' : wanted;
  return {
    style,
    side,
    cardWidth: side + m.chrome,
    cardRadius: m.cardRadius,
    plateRadius: isMini ? m.plateRadius.mini : m.plateRadius.other,
    plateMargin: isMini ? m.plateMargin.mini : m.plateMargin.other,
    plateColor: m.plate,
    inkColor: m.ink,
    tintColor: ensureContrast(input.tint ?? m.ink, m.plate),
    centerSize: even(side * m.centerShare),
    showsCenter: side >= m.centerFrom,
    showsCaption: !isMini,
    tilt,
    hasGlint: style === 'glass' && tilt !== 'none',
    arrivalMs: reduce ? m.arrivalMs.reduced : m.arrivalMs.full,
    isRefused: isMini && (input.modules ?? 0) > m.maxMiniModules,
  };
};

/** L'inclinaison, fonction pure de l'angle : pivot borné à ±16°, reflet de 112 % à −32 %, plaque ±7, pastille ±6 de plus, à rebours. */
export const meeshyCodeTilt = (angle: number): { readonly pivot: number; readonly glint: number; readonly plate: number; readonly center: number } => {
  const t = MEESHY_CODE_CARD_MEASURE.tilt;
  const pivot = Math.min(t.pivot, Math.max(-t.pivot, angle));
  const unit = pivot / t.pivot;
  return {
    pivot,
    glint: t.glintFlat - unit * (t.glintFlat - t.glintTo),
    plate: 0 - unit * t.plate,
    center: 0 - unit * t.center,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyCodeCardStyleVars = (recipe: MeeshyCodeCardRecipe): CSSProperties =>
  ({
    '--kit-code-side': rem(recipe.side),
    '--kit-code-card-w': rem(recipe.cardWidth),
    '--kit-code-card-radius': rem(recipe.cardRadius),
    '--kit-code-plate-radius': rem(recipe.plateRadius),
    '--kit-code-plate-margin': rem(recipe.plateMargin),
    '--kit-code-plate': recipe.plateColor,
    '--kit-code-ink': recipe.inkColor,
    '--kit-code-tint': recipe.tintColor,
    '--kit-code-center': rem(recipe.centerSize),
    '--kit-code-arrival': `${recipe.arrivalMs}ms`,
    '--kit-code-pivot': '0deg',
    '--kit-code-glint': '40%',
    '--kit-code-plate-x': '0px',
    '--kit-code-center-x': '0px',
  }) as CSSProperties;
