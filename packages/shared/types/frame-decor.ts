/**
 * Les briques COMMUNES aux contours d'avatar et aux cadres de bannière (#10932) :
 * les DÉGRADÉS et les MOUVEMENTS déclarés. Un cadre décore la photo, il ne la
 * remplace jamais (planche `docs/product/cadres-photo/planche-cadres-photo.html`).
 *
 * Un mouvement est une DONNÉE, rendue par le GPU sur `transform` et `opacity`
 * seuls : rotation, pulsation, reflet qui glisse, scintillement, inclinaison
 * ancrée. Il désigne ses cibles par le `group` des chemins qu'il anime (une
 * cible sans chemin n'anime rien). La couche `lottie` reste pour l'animation
 * complexe ; aucun cadre de la planche ne l'exige. Mouvement réduit : tout
 * s'arrête, le cadre fixe reste — c'est au rendu de l'appliquer.
 *
 * La liste est TOLÉRANTE : un mouvement inconnu ou hors bornes est IGNORÉ, les
 * autres restent. Un client publié avant un sixième mouvement lit donc un cadre
 * récent en le jouant sans lui, jamais en le refusant.
 */
import * as z from 'zod/mini';
import { slugSchema } from './appearance-design.js';

export const FRAME_MOTION_KINDS = ['rotate', 'pulse', 'sweep', 'twinkle', 'skew'] as const;
export type FrameMotionKind = (typeof FRAME_MOTION_KINDS)[number];

/** `frame` : le centre du cadre ; `self` : le centre de la cible ; `top` / `bottom` : le bord de la cible (la frange pend de son bord haut). */
export const FRAME_MOTION_ORIGINS = ['frame', 'self', 'top', 'bottom'] as const;
export type FrameMotionOrigin = (typeof FRAME_MOTION_ORIGINS)[number];

/** `alternate` : aller-retour (balancement, inclinaison) ; `reverse` : sens inverse (anneau anti-horaire, reflet de droite à gauche). */
export const FRAME_MOTION_DIRECTIONS = ['normal', 'reverse', 'alternate'] as const;
export type FrameMotionDirection = (typeof FRAME_MOTION_DIRECTIONS)[number];

export const FRAME_MOTION_LIMITS = {
  maxMotions: 8,
  /** Au-delà, la liste est un abus, pas un cadre : elle est refusée en bloc. */
  maxDeclaredMotions: 32,
  maxTargets: 16,
  /** Secondes. */
  minDuration: 0.5,
  maxDuration: 180,
  maxDelay: 30,
  maxStagger: 10,
} as const;

type Bounds = { readonly min: number; readonly max: number };

/**
 * L'amplitude, par mouvement (`null` = il n'en prend pas) : degrés de rotation
 * (absente = un tour complet), accroissement d'échelle (1 → 1 + a), creux
 * d'opacité du scintillement (1 → 1 − a), degrés d'inclinaison.
 */
export const FRAME_MOTION_AMPLITUDE: Readonly<Record<FrameMotionKind, Bounds | null>> = {
  rotate: { min: 1, max: 360 },
  pulse: { min: 0.01, max: 0.3 },
  sweep: null,
  twinkle: { min: 0.05, max: 1 },
  skew: { min: 1, max: 15 },
};

/** Les points d'ancrage qu'un mouvement accepte ; un reflet et un scintillement n'en ont pas. */
export const FRAME_MOTION_ORIGINS_BY_KIND: Readonly<Record<FrameMotionKind, readonly FrameMotionOrigin[]>> = {
  rotate: ['frame', 'self', 'top', 'bottom'],
  pulse: ['frame', 'self'],
  sweep: [],
  twinkle: [],
  skew: ['self', 'top', 'bottom'],
};

const seconds = (max: number) => z.number().check(z.minimum(0), z.maximum(max));

const amplitudeFits = (motion: { readonly kind: FrameMotionKind; readonly amplitude?: number }): boolean => {
  const bounds = FRAME_MOTION_AMPLITUDE[motion.kind];
  if (motion.amplitude === undefined) return true;
  return bounds !== null && motion.amplitude >= bounds.min && motion.amplitude <= bounds.max;
};

const originFits = (motion: { readonly kind: FrameMotionKind; readonly origin?: FrameMotionOrigin }): boolean =>
  motion.origin === undefined || FRAME_MOTION_ORIGINS_BY_KIND[motion.kind].includes(motion.origin);

export const FrameMotionSchema = z
  .object({
    kind: z.enum(FRAME_MOTION_KINDS),
    targets: z
      .array(slugSchema)
      .check(z.minLength(1), z.maxLength(FRAME_MOTION_LIMITS.maxTargets), z.refine((targets) => new Set(targets).size === targets.length)),
    duration: z.number().check(z.minimum(FRAME_MOTION_LIMITS.minDuration), z.maximum(FRAME_MOTION_LIMITS.maxDuration)),
    delay: z.optional(seconds(FRAME_MOTION_LIMITS.maxDelay)),
    /** Le décalage entre deux cibles successives (« décalées de 0,8 s »). */
    stagger: z.optional(seconds(FRAME_MOTION_LIMITS.maxStagger)),
    direction: z.optional(z.enum(FRAME_MOTION_DIRECTIONS)),
    amplitude: z.optional(z.number()),
    origin: z.optional(z.enum(FRAME_MOTION_ORIGINS)),
  })
  .check(z.refine(amplitudeFits), z.refine(originFits));
export type FrameMotion = z.infer<typeof FrameMotionSchema>;

const readableMotions = (items: unknown[]): FrameMotion[] =>
  items
    .flatMap((item) => {
      const parsed = FrameMotionSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, FRAME_MOTION_LIMITS.maxMotions);

/** La liste des mouvements d'un cadre : les illisibles tombent un par un, jamais le cadre. */
export const FrameMotionListSchema = z.pipe(
  z.array(z.unknown()).check(z.maxLength(FRAME_MOTION_LIMITS.maxDeclaredMotions)),
  z.transform(readableMotions),
);

export const parseFrameMotions = (input: unknown): readonly FrameMotion[] => {
  const parsed = FrameMotionListSchema.safeParse(input);
  return parsed.success ? parsed.data : [];
};

// ── Les dégradés ────────────────────────────────────────────────────────

export const FRAME_GRADIENT_LIMITS = { maxGradients: 4, minStops: 2, maxStops: 4 } as const;

const unit = z.number().check(z.minimum(0), z.maximum(1));

/**
 * Un dégradé LINÉAIRE en fractions de la boîte du chemin qui le porte. Ses
 * arrêts désignent leur couleur par l'INDEX dans la palette fixe du cadre :
 * un cadre se voit des autres, ses couleurs sont les mêmes pour tous.
 */
export const FrameGradientSchema = z.object({
  kind: z.literal('linear'),
  x1: unit,
  y1: unit,
  x2: unit,
  y2: unit,
  stops: z
    .array(z.object({ color: z.int().check(z.minimum(0), z.maximum(7)), at: unit, opacity: z.optional(unit) }))
    .check(
      z.minLength(FRAME_GRADIENT_LIMITS.minStops),
      z.maxLength(FRAME_GRADIENT_LIMITS.maxStops),
      z.refine((stops) => stops.every((stop, index) => index === 0 || stop.at >= stops[index - 1]!.at)),
    ),
});
export type FrameGradient = z.infer<typeof FrameGradientSchema>;

export const frameGradientsSchema = z.array(FrameGradientSchema).check(z.maxLength(FRAME_GRADIENT_LIMITS.maxGradients));

/** Chaque arrêt désigne une couleur de la palette (`colorCount` couleurs). */
export const gradientsFitPalette = (gradients: readonly FrameGradient[] | undefined, colorCount: number): boolean =>
  (gradients ?? []).every((gradient) => gradient.stops.every((stop) => stop.color < colorCount));

/** Chaque trait qui désigne un dégradé désigne un dégradé déclaré. */
export const strokesFitGradients = (strokes: readonly { readonly gradient?: number }[], gradients: readonly FrameGradient[] | undefined): boolean =>
  strokes.every((stroke) => stroke.gradient === undefined || stroke.gradient < (gradients?.length ?? 0));

/** L'identifiant d'un groupe de chemins, cible des mouvements. */
export const frameGroupSchema = slugSchema;
