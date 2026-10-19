/**
 * `AvatarRingDesign` (#10632, § 5.2) — un contour d'avatar. Un contour se voit
 * des AUTRES : ses couleurs sont FIXES (aucun rôle `accent`), identiques pour
 * tous. Les traits d'ornement désignent leur couleur par l'INDEX dans
 * `stroke.colors` — la palette d'un contour est la seule qu'il connaît.
 *
 * Un contour peut porter des DÉGRADÉS (`gradients`, désignés par index depuis
 * un trait, sa `color` restant le repli d'un rendu qui ne les connaît pas) et
 * des MOUVEMENTS déclarés (`motion`, communs aux cadres de bannière, #10932) :
 * deux champs FACULTATIFS, qu'un client plus ancien ignore.
 *
 * Rendu de référence : `avatarRingSvg` (`utils/appearance-svg.ts`).
 */
import * as z from 'zod/mini';
import { PackAssetRefSchema } from './content-pack-index.js';
import { APPEARANCE_LIMITS, PATH_D_PATTERN, hexSchema, slugSchema } from './appearance-design.js';
import { FrameMotionListSchema, frameGradientsSchema, frameGroupSchema, gradientsFitPalette, strokesFitGradients } from './frame-decor.js';

/** `none` (#10936) : aucun trait de base — l'ornement dessine tout le contour, comme les cadres de la planche. */
export const RING_STROKE_STYLES = ['solid', 'double', 'dotted', 'dashed', 'gradient', 'none'] as const;
export type RingStrokeStyle = (typeof RING_STROKE_STYLES)[number];

/** Le rayon du cercle de l'avatar dans le viewBox 0 0 100 100 : l'ornement s'organise autour. */
export const RING_AVATAR_RADIUS = 42;

/** La palette d'un contour : huit couleurs au plus, comme un cadre de bannière (#10936). */
export const RING_MAX_COLORS = 8;

const RingOrnamentStrokeSchema = z.object({
  d: z.string().check(z.regex(PATH_D_PATTERN)),
  /** Index dans `stroke.colors`. */
  color: z.int().check(z.minimum(0), z.maximum(RING_MAX_COLORS - 1)),
  opacity: z.number().check(z.minimum(0), z.maximum(1)),
  width: z.optional(z.number().check(z.gt(0), z.maximum(40))),
  /** Index dans `gradients` ; `color` reste le repli. */
  gradient: z.optional(z.int().check(z.minimum(0), z.maximum(3))),
  /** Le groupe que les mouvements désignent. */
  group: z.optional(frameGroupSchema),
});
export type RingOrnamentStroke = z.infer<typeof RingOrnamentStrokeSchema>;

export const AvatarRingDesignSchema = z
  .object({
    key: slugSchema,
    stroke: z.object({
      style: z.enum(RING_STROKE_STYLES),
      /** Fraction du diamètre. */
      width: z.number().check(z.minimum(0.02), z.maximum(0.12)),
      colors: z.array(hexSchema).check(z.minLength(1), z.maxLength(RING_MAX_COLORS)),
    }),
    ornament: z.optional(z.object({ paths: z.array(RingOrnamentStrokeSchema).check(z.minLength(1), z.maxLength(APPEARANCE_LIMITS.maxRingPaths)) })),
    gradients: z.optional(frameGradientsSchema),
    motion: z.optional(FrameMotionListSchema),
    lottie: z.optional(PackAssetRefSchema),
  })
  .check(
    z.refine((ring) => ring.ornament === undefined || ring.ornament.paths.every((path) => path.color < ring.stroke.colors.length)),
    z.refine((ring) => gradientsFitPalette(ring.gradients, ring.stroke.colors.length) && strokesFitGradients(ring.ornament?.paths ?? [], ring.gradients)),
    z.refine((ring) => (ring.ornament?.paths.reduce((total, path) => total + path.d.length, 0) ?? 0) <= APPEARANCE_LIMITS.maxTotalPathLength),
  );
export type AvatarRingDesign = z.infer<typeof AvatarRingDesignSchema>;

export const parseAvatarRingDesign = (input: unknown): AvatarRingDesign | null => {
  const parsed = AvatarRingDesignSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

export const AvatarRingPackContractSchema = z
  .object({
    domain: z.literal('avatar-ring'),
    rings: z.array(AvatarRingDesignSchema).check(z.minLength(1), z.maxLength(APPEARANCE_LIMITS.maxPackDesigns)),
  })
  .check(z.refine((contract) => new Set(contract.rings.map((ring) => ring.key)).size === contract.rings.length));
export type AvatarRingPackContract = z.infer<typeof AvatarRingPackContractSchema>;

export const parseAvatarRingPackContract = (input: unknown): AvatarRingPackContract | null => {
  const parsed = AvatarRingPackContractSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};
