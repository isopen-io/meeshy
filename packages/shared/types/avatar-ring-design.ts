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

/** Le débordement maximal d'un calque illustré : un film de côté 1,5 × la boîte du contour (#13960). */
export const RING_DECOR_MAX_REACH = 1.5;

/**
 * Les CALQUES ILLUSTRÉS d'un contour (#13960) — un cadre n'est plus seulement un anneau :
 * un film `back` se joue DERRIÈRE l'avatar (ailes, rayons, flammes), un film `front`
 * AU-DESSUS (masque, toile, griffes, braises), et l'un comme l'autre peuvent couvrir
 * l'avatar en partie et DÉBORDER du contour. Chaque film est carré, centré sur l'avatar,
 * de côté `reach ×` la boîte du contour : le viewBox 0 0 100 100 du contour en occupe le
 * centre, sur `100 / reach` de son côté. Le film tient dans la place que l'hôte lui donne
 * (`ringDecorFit`, #15157) : rien ne grandit, rien ne se décale, rien ne couvre un voisin.
 * Un client antérieur ignore le champ et garde l'anneau fixe (`stroke` + `ornament`), qui
 * reste l'image de repli : il ne se dessine plus SOUS un film qui s'affiche.
 */
const AvatarRingDecorSchema = z
  .object({
    reach: z.number().check(z.minimum(1), z.maximum(RING_DECOR_MAX_REACH)),
    back: z.optional(PackAssetRefSchema),
    front: z.optional(PackAssetRefSchema),
  })
  .check(z.refine((decor) => decor.back !== undefined || decor.front !== undefined));
export type AvatarRingDecor = z.infer<typeof AvatarRingDecorSchema>;

export type RingDecorFit = { readonly scale: number; readonly side: number; readonly offset: number };

/**
 * Comment poser un cadre illustré dans une boîte de contour de côté `box` (#15157). Le film ne
 * peint jamais hors de la boîte que l'anneau seul occupe déjà, sauf la place `room` que l'hôte
 * déclare libre de chaque côté (aucun nom, aucun avatar voisin n'y vit). Quand le film demande
 * plus (`box × reach`), l'avatar, son contour et ses films se réduisent ENSEMBLE de `scale` —
 * l'illustration reste calée sur l'avatar. `side` est le côté du film, `offset` son décalage
 * depuis le coin de la boîte. Le cadre se pose ENTIER à toutes les tailles (#16114) : aucune
 * boîte n'est trop petite pour lui — liste, bulle, mini-avatar comme profil.
 */
export const ringDecorFit = ({ box, reach, room = 0 }: { readonly box: number; readonly reach: number; readonly room?: number }): RingDecorFit => {
  const need = box * reach;
  const side = Math.min(need, box + 2 * Math.max(0, room));
  return { scale: side / need, side, offset: (box - side) / 2 };
};

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
    decor: z.optional(AvatarRingDecorSchema),
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
