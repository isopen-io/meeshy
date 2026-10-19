/**
 * `BannerFrameDesign` (#10932) — un CADRE de bannière : une bordure et des
 * ornements posés SUR la photo de bannière (ou, sans photo, sur le fond de
 * bannière), le CENTRE restant TRANSPARENT. Il ne remplace jamais la photo :
 * c'est le troisième côté du décor de profil (`bannerFrame`), distinct du fond
 * (`banner`, `AppearanceDesign`). Planche validée :
 * `docs/product/cadres-photo/planche-cadres-photo.html`, groupes
 * `id="<style>-banniere-fixe"` / `-banniere-anime`.
 *
 * Gabarit : viewBox 0 0 300 100, la hauteur fait l'échelle. Une bannière plus
 * large ÉTIRE le cadre sans le déformer :
 *   - la BORDURE (`border`) et ses FILETS sont des rectangles que le rendu trace
 *     à la largeur réelle — jamais un chemin étiré ;
 *   - les PIÈCES (`pieces`) restent fixes, ancrées au bord gauche (`start`), au
 *     bord droit (`end`) ou au centre (`center`) : coins, montants, cartouche ;
 *   - les FRISES (`friezes`) répètent leur module entre `from` et `to` (marges
 *     prises depuis chaque bord) : `repeat` pose des modules entiers, `justify`
 *     recalcule le module pour tomber juste.
 * Les frises se peignent AVANT les pièces : un coin, un cartouche couvrent la
 * frise qui court dessous, quelle que soit la largeur (#10936).
 *
 * Le centre transparent est une LOI, pas une intention :
 * `bannerFrameDrawableRegion` rend la seule région où le rendu peint — le
 * pourtour de `border.width` (≤ 9,6, moins de 10 % de la hauteur), plus les
 * quatre coins et le cartouche central, qui entrent jusqu'à 20 et pas plus loin.
 * Le rendu y découpe TOUT ce que le cadre dessine.
 *
 * Couleurs FIXES (le cadre se voit des autres), désignées par index dans
 * `palette`. Ce sont des DONNÉES (hex, chemins aux seules commandes SVG, nombres
 * bornés) : aucun client n'injecte de SVG reçu. Mouvements : `frame-decor.ts`.
 */
import * as z from 'zod/mini';
import { PackAssetRefSchema } from './content-pack-index.js';
import { APPEARANCE_LIMITS, PATH_D_PATTERN, hexSchema, slugSchema } from './appearance-design.js';
import { FrameMotionListSchema, frameGradientsSchema, frameGroupSchema, gradientsFitPalette, strokesFitGradients } from './frame-decor.js';

export const BANNER_FRAME_VIEWBOX = [0, 0, 300, 100] as const;
const REFERENCE_WIDTH = BANNER_FRAME_VIEWBOX[2];
const HEIGHT = BANNER_FRAME_VIEWBOX[3];

export const BANNER_FRAME_LIMITS = {
  /** La bordure : moins de 10 % de la hauteur. */
  maxBorderWidth: 9.6,
  /** Ce que les coins et le cartouche central peuvent mordre vers le centre. */
  maxReach: 20,
  /** Le cartouche reste une clé de voûte, jamais un bandeau qui couvre le portrait. */
  maxCartoucheWidth: 80,
  maxColors: 8,
  maxFilets: 6,
  maxPieces: 16,
  maxFriezes: 8,
  maxModule: 60,
  /** Le total des chemins (pièces et modules de frise) : la limite des contours, conservée. */
  maxPaths: APPEARANCE_LIMITS.maxRingPaths,
} as const;

export const BANNER_FRAME_ANCHORS = ['start', 'center', 'end'] as const;
export type BannerFrameAnchor = (typeof BANNER_FRAME_ANCHORS)[number];

export const BANNER_FRAME_FITS = ['repeat', 'justify'] as const;
export type BannerFrameFit = (typeof BANNER_FRAME_FITS)[number];

export const CARTOUCHE_EDGES = ['top', 'bottom', 'both'] as const;
export type CartoucheEdge = (typeof CARTOUCHE_EDGES)[number];

const unit = z.number().check(z.minimum(0), z.maximum(1));
const colorIndex = z.int().check(z.minimum(0), z.maximum(BANNER_FRAME_LIMITS.maxColors - 1));
const gradientIndex = z.optional(z.int().check(z.minimum(0), z.maximum(3)));

const BannerFramePathSchema = z.object({
  d: z.string().check(z.regex(PATH_D_PATTERN)),
  color: colorIndex,
  /** Index dans `gradients` ; `color` reste le repli d'un rendu qui ne les connaît pas. */
  gradient: gradientIndex,
  opacity: unit,
  /** > 0 ⇒ trait de cette épaisseur ; absent ⇒ remplissage. */
  width: z.optional(z.number().check(z.gt(0), z.maximum(40))),
  fillRule: z.optional(z.enum(['nonzero', 'evenodd'])),
  group: z.optional(frameGroupSchema),
});
export type BannerFramePath = z.infer<typeof BannerFramePathSchema>;

const pathList = z.array(BannerFramePathSchema).check(z.minLength(1), z.maxLength(BANNER_FRAME_LIMITS.maxPaths));

const FiletSchema = z
  .object({
    /** Distance au bord extérieur. */
    inset: z.number().check(z.minimum(0), z.maximum(BANNER_FRAME_LIMITS.maxBorderWidth)),
    width: z.number().check(z.gt(0), z.maximum(2)),
    color: colorIndex,
    gradient: gradientIndex,
    opacity: unit,
  });

const BorderSchema = z
  .object({
    width: z.number().check(z.gt(0), z.maximum(BANNER_FRAME_LIMITS.maxBorderWidth)),
    color: colorIndex,
    gradient: gradientIndex,
    opacity: unit,
    filets: z.optional(z.array(FiletSchema).check(z.maxLength(BANNER_FRAME_LIMITS.maxFilets))),
  })
  .check(z.refine((border) => (border.filets ?? []).every((filet) => filet.inset <= border.width)));

const reachDepth = z.number().check(z.minimum(0), z.maximum(BANNER_FRAME_LIMITS.maxReach));

const ReachSchema = z.object({
  /** Le côté des quatre carrés de coin. */
  corner: reachDepth,
  cartouche: z.optional(
    z.object({
      width: z.number().check(z.gt(0), z.maximum(BANNER_FRAME_LIMITS.maxCartoucheWidth)),
      depth: z.number().check(z.gt(0), z.maximum(BANNER_FRAME_LIMITS.maxReach)),
      edge: z.enum(CARTOUCHE_EDGES),
    }),
  ),
});

const PieceSchema = z.object({ anchor: z.enum(BANNER_FRAME_ANCHORS), paths: pathList });

const FriezeSchema = z
  .object({
    /** La largeur d'un module, dessiné une fois à partir de `from`. */
    module: z.number().check(z.gt(0), z.maximum(BANNER_FRAME_LIMITS.maxModule)),
    from: z.number().check(z.minimum(0), z.maximum(REFERENCE_WIDTH / 2)),
    to: z.number().check(z.minimum(0), z.maximum(REFERENCE_WIDTH / 2)),
    fit: z.enum(BANNER_FRAME_FITS),
    paths: pathList,
  })
  .check(z.refine((frieze) => frieze.from + frieze.module + frieze.to <= REFERENCE_WIDTH));

type DesignShape = {
  readonly palette: readonly string[];
  readonly gradients?: readonly { readonly stops: readonly { readonly color: number }[] }[];
  readonly border: { readonly color: number; readonly gradient?: number; readonly filets?: readonly { readonly color: number; readonly gradient?: number }[] };
  readonly pieces?: readonly { readonly paths: readonly BannerFramePath[] }[];
  readonly friezes?: readonly { readonly paths: readonly BannerFramePath[] }[];
};

const pathsOf = (design: DesignShape): readonly BannerFramePath[] => [
  ...(design.pieces ?? []).flatMap((piece) => piece.paths),
  ...(design.friezes ?? []).flatMap((frieze) => frieze.paths),
];

const paintsOf = (design: DesignShape): readonly { readonly color: number; readonly gradient?: number }[] => [
  design.border,
  ...(design.border.filets ?? []),
  ...pathsOf(design),
];

export const BannerFrameDesignSchema = z
  .object({
    key: slugSchema,
    viewBox: z.tuple([z.literal(0), z.literal(0), z.literal(REFERENCE_WIDTH), z.literal(HEIGHT)]),
    palette: z.array(hexSchema).check(z.minLength(1), z.maxLength(BANNER_FRAME_LIMITS.maxColors)),
    gradients: z.optional(frameGradientsSchema),
    border: BorderSchema,
    reach: ReachSchema,
    pieces: z.optional(z.array(PieceSchema).check(z.maxLength(BANNER_FRAME_LIMITS.maxPieces))),
    friezes: z.optional(z.array(FriezeSchema).check(z.maxLength(BANNER_FRAME_LIMITS.maxFriezes))),
    motion: z.optional(FrameMotionListSchema),
    /** Couche animée facultative (moteur Lottie partagé) : aucun cadre de la planche ne l'exige. */
    lottie: z.optional(PackAssetRefSchema),
  })
  .check(
    z.refine((design) => paintsOf(design).every((paint) => paint.color < design.palette.length)),
    z.refine((design) => gradientsFitPalette(design.gradients, design.palette.length) && strokesFitGradients(paintsOf(design), design.gradients)),
    z.refine((design) => pathsOf(design).length <= BANNER_FRAME_LIMITS.maxPaths),
    z.refine((design) => pathsOf(design).reduce((total, path) => total + path.d.length, 0) <= APPEARANCE_LIMITS.maxTotalPathLength),
  );
export type BannerFrameDesign = z.infer<typeof BannerFrameDesignSchema>;

export const parseBannerFrameDesign = (input: unknown): BannerFrameDesign | null => {
  const parsed = BannerFrameDesignSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

// ── Le centre transparent ──────────────────────────────────────────────

export type FrameRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type BannerFrameDrawableRegion = {
  /** La bannière entière, à la largeur logique (hauteur 100). */
  readonly outer: FrameRect;
  /** Ce qui reste TRANSPARENT : le rendu n'y peint rien, hors `reserved`. */
  readonly hole: FrameRect;
  /** Les seules morsures dans le trou : les quatre coins, puis le cartouche central. */
  readonly reserved: readonly FrameRect[];
};

/**
 * La région où un cadre peint, à une largeur LOGIQUE (`largeur × 100 / hauteur`,
 * 300 au gabarit) : `outer` privé de `hole`, plus `reserved`. Le rendu découpe
 * tout ce que le cadre dessine à cette région.
 */
export function bannerFrameDrawableRegion(design: Pick<BannerFrameDesign, 'border' | 'reach'>, width: number): BannerFrameDrawableRegion {
  const border = design.border.width;
  const corner = design.reach.corner;
  const corners: readonly FrameRect[] = [
    { x: 0, y: 0, width: corner, height: corner },
    { x: width - corner, y: 0, width: corner, height: corner },
    { x: 0, y: HEIGHT - corner, width: corner, height: corner },
    { x: width - corner, y: HEIGHT - corner, width: corner, height: corner },
  ];
  const cartouche = design.reach.cartouche;
  const x = cartouche === undefined ? 0 : (width - cartouche.width) / 2;
  const cartouches: readonly FrameRect[] =
    cartouche === undefined
      ? []
      : [
          ...(cartouche.edge === 'bottom' ? [] : [{ x, y: 0, width: cartouche.width, height: cartouche.depth }]),
          ...(cartouche.edge === 'top' ? [] : [{ x, y: HEIGHT - cartouche.depth, width: cartouche.width, height: cartouche.depth }]),
        ];
  return {
    outer: { x: 0, y: 0, width, height: HEIGHT },
    hole: { x: border, y: border, width: width - 2 * border, height: HEIGHT - 2 * border },
    reserved: [...corners, ...cartouches],
  };
}

// ── Le contrat d'un pack de cadres de bannière ──────────────────────────

export const BannerFramePackContractSchema = z
  .object({
    domain: z.literal('banner-frame'),
    frames: z.array(BannerFrameDesignSchema).check(z.minLength(1), z.maxLength(APPEARANCE_LIMITS.maxPackDesigns)),
  })
  .check(z.refine((contract) => new Set(contract.frames.map((frame) => frame.key)).size === contract.frames.length));
export type BannerFramePackContract = z.infer<typeof BannerFramePackContractSchema>;

export const parseBannerFramePackContract = (input: unknown): BannerFramePackContract | null => {
  const parsed = BannerFramePackContractSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};
