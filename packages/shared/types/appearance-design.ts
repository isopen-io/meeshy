/**
 * `AppearanceDesign` (#10632, § 5.1) — la donnée vectorielle UNIQUE dont les
 * deux plateformes peignent le même dessin : fonds de conversation et
 * bannières de profil (même schéma, autre cadrage). Ce sont des DONNÉES :
 * aucun client n'injecte jamais de SVG brut reçu, il construit son dessin
 * depuis ces champs validés (hex, chemins aux seules commandes SVG, plafonds).
 *
 * Rendu de référence : `utils/appearance-svg.ts`.
 */
import * as z from 'zod/mini';
import { PACK_SLUG_PATTERN } from './content-pack.js';
import { PackAssetRefSchema } from './content-pack-index.js';

/** Hex majuscules, sans alpha. */
export const HEX_PATTERN = /^#[0-9A-F]{6}$/;
/** Commandes de chemin SVG seules, jamais un autre caractère (aucune injection possible). */
export const PATH_D_PATTERN = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]{1,4000}$/;

export const APPEARANCE_LIMITS = {
  maxKeyLength: 24,
  maxPathLength: 4000,
  /** La somme des longueurs de chemins d'un modèle. */
  maxTotalPathLength: 24_000,
  maxTilePaths: 24,
  maxScenePaths: 48,
  maxRingPaths: 48,
  maxPackDesigns: 32,
  /** L'opacité maximale d'un trait de motif de FOND : sous un fil de messages, un motif reste DISCRET (§ 6, lisibilité). */
  maxPatternOpacity: 0.12,
  /** L'opacité maximale d'un trait de motif de BANNIÈRE (#11165) : aucun texte de fil ne la lit, elle doit se voir. */
  maxBannerPatternOpacity: 0.32,
} as const;

/** Où un modèle se peint : sous un fil (`wallpaper`) ou en bannière de profil (`banner`). */
export type AppearanceSurface = 'wallpaper' | 'banner';

const PATTERN_CAP: Readonly<Record<AppearanceSurface, number>> = {
  wallpaper: APPEARANCE_LIMITS.maxPatternOpacity,
  banner: APPEARANCE_LIMITS.maxBannerPatternOpacity,
};

/**
 * Les rôles de couleur, résolus par la palette du schéma (clair/sombre).
 * `accent` = l'accent EFFECTIF du lecteur ; `accent-next` / `accent-prev` =
 * cet accent tourné de +30° / −30° (la dérivation de `conversationAccentPalette`).
 */
export const PAINT_ROLES = ['ink', 'accent', 'accent-next', 'accent-prev', 'soft', 'base'] as const;
export type PaintRole = (typeof PAINT_ROLES)[number];

export const APPEARANCE_STYLES = ['pattern', 'illustration', 'gradient'] as const;
export type AppearanceStyle = (typeof APPEARANCE_STYLES)[number];

export const SCENE_ANCHORS = ['bottom', 'center', 'bottom-end'] as const;
export type SceneAnchor = (typeof SCENE_ANCHORS)[number];

export const hexSchema = z.string().check(z.regex(HEX_PATTERN));
export const slugSchema = z.string().check(z.regex(PACK_SLUG_PATTERN), z.maxLength(APPEARANCE_LIMITS.maxKeyLength));
const unit = z.number().check(z.minimum(0), z.maximum(1));

const paletteSchema = z.object({ base: hexSchema, ink: hexSchema, soft: hexSchema, accent: z.optional(hexSchema) });

export const DesignStrokeSchema = z.object({
  d: z.string().check(z.regex(PATH_D_PATTERN)),
  role: z.enum(PAINT_ROLES),
  opacity: unit,
  /** > 0 ⇒ trait de cette épaisseur ; absent ⇒ remplissage. */
  width: z.optional(z.number().check(z.gt(0), z.maximum(40))),
});
export type DesignStroke = z.infer<typeof DesignStrokeSchema>;

const tileSchema = z.object({
  width: z.number().check(z.gt(0), z.maximum(512)),
  height: z.number().check(z.gt(0), z.maximum(512)),
  scale: z.number().check(z.minimum(0.5), z.maximum(3)),
  rotation: z.number().check(z.minimum(-45), z.maximum(45)),
  paths: z.array(DesignStrokeSchema).check(z.minLength(1), z.maxLength(APPEARANCE_LIMITS.maxTilePaths)),
});

const sceneSchema = z.object({
  viewBox: z.tuple([z.literal(0), z.literal(0), z.number().check(z.gt(0), z.maximum(1000)), z.number().check(z.gt(0), z.maximum(1000))]),
  anchor: z.enum(SCENE_ANCHORS),
  paths: z.array(DesignStrokeSchema).check(z.minLength(1), z.maxLength(APPEARANCE_LIMITS.maxScenePaths)),
});

const gradientSchema = z.object({
  angle: z.number().check(z.minimum(0), z.maximum(360)),
  stops: z
    .array(z.object({ role: z.enum(PAINT_ROLES), at: unit }))
    .check(z.minLength(2), z.maxLength(4)),
  blobs: z
    .array(z.object({ x: unit, y: unit, r: z.number().check(z.gt(0), z.maximum(2)), role: z.enum(PAINT_ROLES), opacity: unit }))
    .check(z.maxLength(5)),
});

const strokesOf = (design: { readonly tile?: { readonly paths: readonly DesignStroke[] }; readonly scene?: { readonly paths: readonly DesignStroke[] } }): readonly DesignStroke[] =>
  [...(design.tile?.paths ?? []), ...(design.scene?.paths ?? [])];

/** Exactement UN bloc de forme, celui du style. */
const shapeMatchesStyle = (design: { readonly style: AppearanceStyle; readonly tile?: unknown; readonly scene?: unknown; readonly gradient?: unknown }): boolean => {
  const present = (['pattern', 'illustration', 'gradient'] as const).filter((style) => design[style === 'pattern' ? 'tile' : style === 'illustration' ? 'scene' : 'gradient'] !== undefined);
  return present.length === 1 && present[0] === design.style;
};

/** L'encre d'une tuile : celle de son trait le plus dense (les traits d'une tuile sont posés pour ne pas se superposer). */
const tileInkOpacity = (tile: { readonly paths: readonly DesignStroke[] } | undefined): number =>
  tile === undefined ? 0 : Math.max(...tile.paths.map((stroke) => stroke.opacity));

/**
 * Un fond ou une bannière à motif trop dense est REFUSÉ à la lecture (la passerelle ne le sert pas, aucun client ne le peint) :
 * le plafond est une loi du contrat, pas une recommandation du catalogue intégré. Le schéma porte le plafond le plus haut
 * (bannière) ; la SURFACE resserre (`parseAppearanceDesign`, contrat de pack) — un fond reste à 12 %.
 */
export const AppearanceDesignSchema = z
  .object({
    key: slugSchema,
    style: z.enum(APPEARANCE_STYLES),
    palettes: z.object({ light: paletteSchema, dark: paletteSchema }),
    tile: z.optional(tileSchema),
    scene: z.optional(sceneSchema),
    gradient: z.optional(gradientSchema),
    fit: z.literal('fill'),
    /** Couche animée facultative (moteur Lottie partagé, D6) : ignorée tant qu'il n'est pas sur `dev`. */
    lottie: z.optional(PackAssetRefSchema),
  })
  .check(
    z.refine(shapeMatchesStyle),
    z.refine((design) => tileInkOpacity(design.tile) <= APPEARANCE_LIMITS.maxBannerPatternOpacity),
    z.refine((design) => strokesOf(design).reduce((total, stroke) => total + stroke.d.length, 0) <= APPEARANCE_LIMITS.maxTotalPathLength),
  );
export type AppearanceDesign = z.infer<typeof AppearanceDesignSchema>;

/** Sans surface, la plus stricte : un modèle lu sans savoir où il se peint est lu comme un fond. */
export const parseAppearanceDesign = (input: unknown, surface: AppearanceSurface = 'wallpaper'): AppearanceDesign | null => {
  const parsed = AppearanceDesignSchema.safeParse(input);
  return parsed.success && isDiscreetPattern(parsed.data, surface) ? parsed.data : null;
};

/** L'opacité cumulée d'un motif, 0 hors motif. */
export const patternInkOpacity = (design: AppearanceDesign): number => tileInkOpacity(design.tile);

/** Un motif sous le plafond de sa surface : 12 % d'encre pour un fond, 32 % pour une bannière. Les illustrations et dégradés ne sont pas des motifs. */
export const isDiscreetPattern = (design: AppearanceDesign, surface: AppearanceSurface = 'wallpaper'): boolean => patternInkOpacity(design) <= PATTERN_CAP[surface];

// ── Le contrat d'un pack de fonds ou de bannières ──────────────────────

export const APPEARANCE_CONTRACT_SCHEMA = 1;

export const AppearancePackContractSchema = z
  .object({
    domain: z.enum(['wallpaper', 'banner']),
    designs: z.array(AppearanceDesignSchema).check(z.minLength(1), z.maxLength(APPEARANCE_LIMITS.maxPackDesigns)),
  })
  .check(
    z.refine((contract) => new Set(contract.designs.map((design) => design.key)).size === contract.designs.length),
    z.refine((contract) => contract.designs.every((design) => isDiscreetPattern(design, contract.domain))),
  );
export type AppearancePackContract = z.infer<typeof AppearancePackContractSchema>;

export const parseAppearancePackContract = (input: unknown): AppearancePackContract | null => {
  const parsed = AppearancePackContractSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};
