/**
 * LE FORMAT D'UN CADRE DE GLOIRE (#10154, L3, § 5.1–5.2 de
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md`) — ce que le peintre
 * (web, iOS) lit pour composer un cadre : des COUCHES raster adressées par
 * contenu, rognées à leur boîte, et des DONNÉES vivantes (texte, Mee et Meo,
 * blason, bandeau) qu'il peint lui-même.
 *
 * Tout ce qui se peint est déclaré, rien ne se devine :
 *  - `stack` donne l'ordre des couches ; sans photo, `windowFill` puis
 *    l'emblème du moment prennent la place de `photo` ;
 *  - les coordonnées sont en pixels de l'image finale (1080×1920 pour la
 *    story : le repère de design 540×960 multiplié par deux) ;
 *  - les couleurs sont des DONNÉES `#RRGGBBAA`, jamais des littéraux de code ;
 *  - un emplacement de texte porte sa ligne de base, son ancre, sa police (une
 *    famille de la liste FERMÉE `GLORY_FRAME_FONTS`, jamais téléchargée par un
 *    pack), son remplissage, ses effets et le pire contraste mesuré à l'export
 *    contre les pixels réellement dessous ;
 *  - une mise en page de Mee et Meo porte DEUX ancres (`mee`, `meo`) ou UNE
 *    seule (`pair`, un sticker à deux oiseaux), jamais les deux.
 *
 * Séparé de `glory-frame-pack.ts` pour que la boutique (qui ne lit que les
 * vignettes et les noms) n'embarque pas ce schéma.
 */
import * as z from 'zod/mini';
import { PackAssetRefSchema } from './content-pack-index.js';
import type { PackAssetRef } from './content-pack.js';

/** Les polices des cadres, embarquées par les clients : un pack les RÉFÉRENCE, jamais il ne les transporte (§ 5.6). */
export const GLORY_FRAME_FONTS = ['Manrope', 'Cinzel', 'Cinzel Decorative', 'Cormorant Garamond', 'Fraunces', 'Caveat'] as const;
export type GloryFrameFont = (typeof GLORY_FRAME_FONTS)[number];

/** Les modes de fusion qu'une passe de `grade` peut déclarer, posée SUR la photo dans la fenêtre. */
export const GLORY_FRAME_BLENDS = ['normal', 'screen', 'multiply'] as const;
export type GloryFrameBlend = (typeof GLORY_FRAME_BLENDS)[number];

/** Les deux rangs de l'avant-plan : sous les oiseaux, au-dessus d'eux. */
export const GLORY_FRAME_FRONT_RANKS = ['under-birds', 'over-birds'] as const;
export type GloryFrameFrontRank = (typeof GLORY_FRAME_FRONT_RANKS)[number];

/** Les deux variantes d'une plaque dessinée : sans message, avec message (sa hauteur change). */
export const GLORY_FRAME_PLATE_VARIANTS = ['plain', 'message'] as const;
export type GloryFramePlateVariant = (typeof GLORY_FRAME_PLATE_VARIANTS)[number];

/** Les noms de mise en page des oiseaux ; `selfie` n'est jamais celle par défaut (choisie exprès, H-3). */
export const GLORY_FRAME_BIRD_LAYOUTS = ['pied', 'perches', 'cotes', 'ruban', 'duo', 'libre', 'selfie'] as const;
export type GloryFrameBirdLayout = (typeof GLORY_FRAME_BIRD_LAYOUTS)[number];

/** `x, y, largeur, hauteur`, en pixels de l'image finale. */
export type GloryFrameBox = readonly [number, number, number, number];

export type GloryFrameColor = string;

export type GloryFramePaint =
  | { readonly solid: GloryFrameColor }
  | {
      readonly linear: {
        readonly x1: number;
        readonly y1: number;
        readonly x2: number;
        readonly y2: number;
        readonly stops: readonly { readonly offset: number; readonly color: GloryFrameColor }[];
      };
    };

/** Une primitive de filtre SVG telle que l'export l'a lue (`op` + ses attributs), que chaque peintre traduit. */
export type GloryFrameFilterOp = Readonly<Record<string, string>>;
export type GloryFrameFilter = readonly (readonly GloryFrameFilterOp[])[];

export type GloryFrameStroke = { readonly paint: GloryFramePaint; readonly width: number };

/** Une copie du texte, décalée, posée sous (`under`) ou sur lui : lueur, relief, double tracé. */
export type GloryFrameTextEffect = {
  readonly dx: number;
  readonly dy: number;
  readonly fill: GloryFramePaint;
  readonly stroke: GloryFrameStroke | null;
  readonly opacity: number;
  readonly under: boolean;
  readonly filter: GloryFrameFilter | null;
};

export type GloryFrameTextSlot = {
  readonly x: number;
  readonly baseline: number;
  readonly anchor: 'start' | 'middle' | 'end';
  /** Absente pour l'identité. */
  readonly matrix?: readonly [number, number, number, number, number, number];
  readonly font: {
    readonly family: GloryFrameFont;
    readonly weight: number;
    readonly style: 'normal' | 'italic';
    readonly size: number;
    readonly tracking: number;
  };
  readonly fill: GloryFramePaint;
  readonly stroke: GloryFrameStroke | null;
  readonly opacity: number;
  readonly effects: readonly GloryFrameTextEffect[];
  readonly filter: GloryFrameFilter | null;
  /** Le texte courbe (légendes des médailles, des pièces) : le chemin, et le décalage de départ (`startOffset` SVG : longueur ou pourcentage). */
  readonly path: { readonly d: string; readonly startOffset: string } | null;
  /** La boîte du texte d'EXEMPLE rendu à l'export : la place que le peintre ne doit pas déborder. */
  readonly bbox: GloryFrameBox;
  /** Le pire contraste WCAG mesuré à l'export contre les pixels réellement dessous. */
  readonly contrast: number;
  /** Le texte d'exemple de l'export (le français des planches) ; les emplacements vivants le remplacent. */
  readonly sample: string;
};

export type GloryFrameLayer = PackAssetRef & { readonly box: GloryFrameBox };
export type GloryFrameGradeLayer = GloryFrameLayer & { readonly blend: GloryFrameBlend };

export type GloryFrameBirdAnchor = {
  /** Une pose de Mee ou de Meo de la liste embarquée (`mee-…`, `meo-…`, `duo-…`), jamais un sticker de tiers. */
  readonly sticker: string;
  readonly box: GloryFrameBox;
  readonly rotate: number;
  readonly flip: boolean;
  readonly opacity: number;
};

/** Deux oiseaux, ou une paire dans un seul sticker, ou Meo seul (il tient l'appareil : la mise en page `selfie`). */
export type GloryFrameBirds =
  | { readonly mee: GloryFrameBirdAnchor; readonly meo: GloryFrameBirdAnchor }
  | { readonly pair: GloryFrameBirdAnchor }
  | { readonly meo: GloryFrameBirdAnchor };

export type GloryFrameFormat = {
  readonly size: readonly [number, number];
  readonly window: {
    readonly box: GloryFrameBox;
    /** La fenêtre photo, masque sans perte adressé par contenu ; `path` vectoriel au suivi #10254. */
    readonly mask: GloryFrameLayer;
    readonly veilMaxAlpha: number;
  };
  readonly stack: readonly string[];
  readonly layers: {
    readonly decor: GloryFrameLayer;
    readonly windowFill: GloryFrameLayer;
    readonly grade: readonly GloryFrameGradeLayer[];
    readonly front: { readonly [R in GloryFrameFrontRank]?: GloryFrameLayer };
    readonly plate: { readonly [V in GloryFramePlateVariant]?: GloryFrameLayer };
  };
  readonly crest: { readonly box: GloryFrameBox } | null;
  readonly text: Readonly<Record<string, GloryFrameTextSlot>>;
  readonly birds: {
    readonly default: GloryFrameBirdLayout;
    readonly layouts: { readonly [L in GloryFrameBirdLayout]?: GloryFrameBirds };
  };
  readonly banner: { readonly box: GloryFrameBox } | null;
};

export const GLORY_FRAME_COLOR_PATTERN = /^#[0-9A-F]{8}$/;
const STACK_TOKEN = /^(?:photo|decor|crest|plate|birds|text|banner|grade:\d{1,2}|front:(?:under-birds|over-birds))$/;
const STICKER_ID = /^(?:mee|meo|duo)-[a-z0-9-]+$/;
const SLOT_KEY = /^[a-z][a-z0-9]*(?:\.[0-9]{1,3})?$/;
const MAX_TEXT_LENGTH = 400;

const finite = z.number().check(z.refine(Number.isFinite));
const nonNegative = finite.check(z.minimum(0));
const unit = finite.check(z.minimum(0), z.maximum(1));
const box: z.ZodMiniType<GloryFrameBox> = z.tuple([finite, finite, nonNegative, nonNegative]);
const color = z.string().check(z.regex(GLORY_FRAME_COLOR_PATTERN));

const paint: z.ZodMiniType<GloryFramePaint> = z.union([
  z.object({ solid: color }),
  z.object({
    linear: z.object({
      x1: finite,
      y1: finite,
      x2: finite,
      y2: finite,
      stops: z.array(z.object({ offset: unit, color })).check(z.minLength(2), z.maxLength(16)),
    }),
  }),
]);

const filter: z.ZodMiniType<GloryFrameFilter> = z
  .array(z.array(z.record(z.string(), z.string()).check(z.refine((op) => typeof op.op === 'string' && op.op.startsWith('fe')))).check(z.maxLength(12)))
  .check(z.maxLength(8));

const stroke: z.ZodMiniType<GloryFrameStroke> = z.object({ paint, width: nonNegative });

const effect: z.ZodMiniType<GloryFrameTextEffect> = z.object({
  dx: finite,
  dy: finite,
  fill: paint,
  stroke: z.nullable(stroke),
  opacity: unit,
  under: z.boolean(),
  filter: z.nullable(filter),
});

const textSlot: z.ZodMiniType<GloryFrameTextSlot> = z.object({
  x: finite,
  baseline: finite,
  anchor: z.enum(['start', 'middle', 'end']),
  matrix: z.optional(z.tuple([finite, finite, finite, finite, finite, finite])),
  font: z.object({
    family: z.enum(GLORY_FRAME_FONTS),
    weight: z.int().check(z.minimum(100), z.maximum(900)),
    style: z.enum(['normal', 'italic']),
    size: finite.check(z.minimum(4), z.maximum(400)),
    tracking: finite,
  }),
  fill: paint,
  stroke: z.nullable(stroke),
  opacity: unit,
  effects: z.array(effect).check(z.maxLength(8)),
  filter: z.nullable(filter),
  path: z.nullable(z.object({ d: z.string().check(z.minLength(1), z.maxLength(4_000)), startOffset: z.string().check(z.regex(/^-?\d+(?:\.\d+)?%?$/)) })),
  bbox: box,
  contrast: nonNegative,
  sample: z.string().check(z.maxLength(MAX_TEXT_LENGTH)),
});

const layer: z.ZodMiniType<GloryFrameLayer> = z.intersection(PackAssetRefSchema, z.object({ box }));
const gradeLayer: z.ZodMiniType<GloryFrameGradeLayer> = z.intersection(layer, z.object({ blend: z.enum(GLORY_FRAME_BLENDS) }));

const anchor: z.ZodMiniType<GloryFrameBirdAnchor> = z.object({
  sticker: z.string().check(z.regex(STICKER_ID), z.maxLength(48)),
  box,
  rotate: finite,
  flip: z.boolean(),
  opacity: unit,
});

const isPrefixed = (anchorOf: GloryFrameBirdAnchor, prefix: 'mee-' | 'meo-'): boolean => anchorOf.sticker.startsWith(prefix);

/** Deux ancres OU une paire OU Meo seul, jamais un mélange : une clé en trop rend la mise en page illisible. */
const birds: z.ZodMiniType<GloryFrameBirds> = z.union([
  z.strictObject({ mee: anchor, meo: anchor }).check(z.refine((two) => isPrefixed(two.mee, 'mee-') && isPrefixed(two.meo, 'meo-'))),
  z.strictObject({ pair: anchor }).check(z.refine((one) => one.pair.sticker.startsWith('duo-'))),
  z.strictObject({ meo: anchor }).check(z.refine((one) => isPrefixed(one.meo, 'meo-'))),
]);

const layoutKeys = Object.fromEntries(GLORY_FRAME_BIRD_LAYOUTS.map((name) => [name, z.optional(birds)])) as {
  [L in GloryFrameBirdLayout]: z.ZodMiniOptional<typeof birds>;
};

const sameStackLayers = (format: GloryFrameFormat): boolean => {
  const grades = format.stack.filter((token) => token.startsWith('grade:')).map((token) => Number(token.slice(6)));
  const gradesDeclared = grades.length === format.layers.grade.length && grades.every((index, at) => index === at);
  const fronts = GLORY_FRAME_FRONT_RANKS.every((rank) => format.stack.includes(`front:${rank}`) === (format.layers.front[rank] !== undefined));
  return gradesDeclared && fronts && format.stack.includes('photo') && format.stack.includes('decor') && new Set(format.stack).size === format.stack.length;
};

export const GloryFrameFormatSchema: z.ZodMiniType<GloryFrameFormat> = z
  .object({
    size: z.tuple([z.int().check(z.minimum(1)), z.int().check(z.minimum(1))]),
    window: z.object({ box, mask: layer, veilMaxAlpha: unit }),
    stack: z.array(z.string().check(z.regex(STACK_TOKEN))).check(z.minLength(2), z.maxLength(24)),
    layers: z.object({
      decor: layer,
      windowFill: layer,
      grade: z.array(gradeLayer).check(z.maxLength(12)),
      front: z.object({ 'under-birds': z.optional(layer), 'over-birds': z.optional(layer) }),
      plate: z.object({ plain: z.optional(layer), message: z.optional(layer) }),
    }),
    crest: z.nullable(z.object({ box })),
    text: z.record(z.string().check(z.regex(SLOT_KEY)), textSlot),
    birds: z
      .object({ default: z.enum(GLORY_FRAME_BIRD_LAYOUTS), layouts: z.object(layoutKeys) })
      .check(z.refine((value) => value.layouts[value.default] !== undefined)),
    banner: z.nullable(z.object({ box })),
  })
  .check(z.refine(sameStackLayers));

/** Tous les fichiers qu'un format référence : masque, couches, passes — ce que le magasin doit pouvoir servir. */
export function gloryFrameFormatAssets(format: GloryFrameFormat): readonly PackAssetRef[] {
  const { decor, windowFill, grade, front, plate } = format.layers;
  const optional = [front['under-birds'], front['over-birds'], plate.plain, plate.message].filter((ref): ref is GloryFrameLayer => ref !== undefined);
  return [format.window.mask, decor, windowFill, ...grade, ...optional].map(({ src, bytes, sha256 }) => ({ src, bytes, sha256 }));
}
