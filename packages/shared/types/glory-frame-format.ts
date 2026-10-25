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
import { GLORY_DECOR_KEY_PATTERN, GLORY_DECOR_LIVE_DATA } from './glory-frame-decor-vocabulary.js';

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

export const GLORY_FRAME_COLOR_PATTERN = /^#[0-9A-F]{8}$/;
const STACK_TOKEN = /^(?:photo|decor|crest|plate|birds|text|banner|grade:\d{1,2}|front:(?:under-birds|over-birds))$/;
const STICKER_ID = /^(?:mee|meo|duo)-[a-z0-9-]+$/;
const SLOT_KEY = /^[a-z][a-z0-9]*(?:\.[0-9]{1,3})?$/;
const MAX_TEXT_LENGTH = 400;

/**
 * Le CHEMIN de la fenêtre photo (#10254) : sa grammaire est FERMÉE — sous-chemins `M x y`, pas relatifs `h`/`v`
 * entiers, `Z`. Le générateur (`docs/product/cadres-de-gloire/generateur/lib/window-path.mjs`) l'écrit sur la grille
 * des pixels, chaque contour tournant la fenêtre à sa droite : un `clip` le rend au pixel près du masque, et aucun
 * tracé SVG arbitraire (courbe, arc, commande inconnue) n'atteint jamais un `Path2D`.
 */
export const GLORY_FRAME_WINDOW_PATH_PATTERN = /^(?:M\d+ \d+(?:[hv]-?\d+)+Z)+$/;
/** Le plus long chemin mesuré (`egypte.ambassadeur-5`, 23 833 caractères au 2026-10-25), avec sa marge. */
export const GLORY_FRAME_WINDOW_PATH_MAX_LENGTH = 64_000;

const finite = z.number().check(z.refine(Number.isFinite));
const nonNegative = finite.check(z.minimum(0));
const unit = finite.check(z.minimum(0), z.maximum(1));
const box = z.tuple([finite, finite, nonNegative, nonNegative]);
const color = z.string().check(z.regex(GLORY_FRAME_COLOR_PATTERN));

const paint = z.union([
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

const filter = z
  .array(z.array(z.record(z.string(), z.string()).check(z.refine((op) => typeof op.op === 'string' && op.op.startsWith('fe')))).check(z.maxLength(12)))
  .check(z.maxLength(8));

const stroke = z.object({ paint, width: nonNegative });

/** Une copie du texte, décalée, posée sous (`under`) ou sur lui : lueur, relief, double tracé. */
const effect = z.object({
  dx: finite,
  dy: finite,
  fill: paint,
  stroke: z.nullable(stroke),
  opacity: unit,
  under: z.boolean(),
  filter: z.nullable(filter),
});

const textSlot = z.object({
  x: finite,
  baseline: finite,
  anchor: z.enum(['start', 'middle', 'end']),
  /** Absente pour l'identité. */
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
  /** Le texte courbe (légendes des médailles, des pièces) : le chemin et son `startOffset` SVG (longueur ou pourcentage). */
  path: z.nullable(z.object({ d: z.string().check(z.minLength(1), z.maxLength(4_000)), startOffset: z.string().check(z.regex(/^-?\d+(?:\.\d+)?%?$/)) })),
  /** La boîte du texte d'EXEMPLE rendu à l'export : la place que le peintre ne doit pas déborder. */
  bbox: box,
  /** Le pire contraste WCAG mesuré à l'export contre les pixels réellement dessous. */
  contrast: nonNegative,
  /** Le texte d'exemple de l'export (le français des planches) ; les emplacements vivants le remplacent. */
  sample: z.string().check(z.maxLength(MAX_TEXT_LENGTH)),
  /** Un texte de décor TRADUIT (#10256) : sa clé dans les chaînes du pack, que le peintre peint à la place de `sample`. */
  i18n: z.optional(z.string().check(z.regex(GLORY_DECOR_KEY_PATTERN))),
  /** Un texte de décor VIVANT (#10256) : la donnée du moment que le peintre remplit (L14, #10167). */
  live: z.optional(z.enum(GLORY_DECOR_LIVE_DATA)),
});

const layer = z.intersection(PackAssetRefSchema, z.object({ box }));
const gradeLayer = z.intersection(layer, z.object({ blend: z.enum(GLORY_FRAME_BLENDS) }));

const anchor = z.object({
  /** Une pose de Mee ou de Meo de la liste embarquée (`mee-…`, `meo-…`, `duo-…`), jamais un sticker de tiers. */
  sticker: z.string().check(z.regex(STICKER_ID), z.maxLength(48)),
  box,
  rotate: finite,
  flip: z.boolean(),
  opacity: unit,
});

const isPrefixed = (anchorOf: z.infer<typeof anchor>, prefix: 'mee-' | 'meo-'): boolean => anchorOf.sticker.startsWith(prefix);

/**
 * Deux oiseaux, OU une paire dans un seul sticker, OU Meo seul (il tient l'appareil : la mise en page `selfie`) —
 * jamais un mélange : une clé en trop rend la mise en page illisible.
 */
const birds = z.union([
  z.strictObject({ mee: anchor, meo: anchor }).check(z.refine((two) => isPrefixed(two.mee, 'mee-') && isPrefixed(two.meo, 'meo-'))),
  z.strictObject({ pair: anchor }).check(z.refine((one) => one.pair.sticker.startsWith('duo-'))),
  z.strictObject({ meo: anchor }).check(z.refine((one) => isPrefixed(one.meo, 'meo-'))),
]);

const layoutKeys = Object.fromEntries(GLORY_FRAME_BIRD_LAYOUTS.map((name) => [name, z.optional(birds)])) as {
  [L in GloryFrameBirdLayout]: z.ZodMiniOptional<typeof birds>;
};

const formatObject = z.object({
  size: z.tuple([z.int().check(z.minimum(1)), z.int().check(z.minimum(1))]),
  /**
   * La fenêtre photo : sa boîte, son CHEMIN (#10254) que le peintre découpe sans décoder d'image, et son masque sans
   * perte adressé par contenu, que garde le client d'avant le chemin. Un contrat sans `path` reste lisible : le
   * peintre découpe alors au rectangle, puis au masque.
   */
  window: z.object({
    box,
    path: z.optional(z.string().check(z.maxLength(GLORY_FRAME_WINDOW_PATH_MAX_LENGTH), z.regex(GLORY_FRAME_WINDOW_PATH_PATTERN))),
    mask: layer,
    veilMaxAlpha: unit,
  }),
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
});

/** Chaque passe de `grade` et chaque rang de `front` déclaré a sa place dans `stack`, et inversement ; `photo` et `decor` y sont. */
const sameStackLayers = (format: z.infer<typeof formatObject>): boolean => {
  const grades = format.stack.filter((token) => token.startsWith('grade:')).map((token) => Number(token.slice(6)));
  const gradesDeclared = grades.length === format.layers.grade.length && grades.every((index, at) => index === at);
  const fronts = GLORY_FRAME_FRONT_RANKS.every((rank) => format.stack.includes(`front:${rank}`) === (format.layers.front[rank] !== undefined));
  return gradesDeclared && fronts && format.stack.includes('photo') && format.stack.includes('decor') && new Set(format.stack).size === format.stack.length;
};

export const GloryFrameFormatSchema = formatObject.check(z.refine(sameStackLayers));

/**
 * Les types DÉRIVENT des schémas : la passerelle compile ce fichier sans `strictNullChecks`, où un type écrit à la
 * main diverge de ce que `zod/mini` infère (nullables, tuples) — une seule source, lue pareil dans les deux modes.
 */
export type GloryFrameBox = z.infer<typeof box>;
export type GloryFrameColor = string;
export type GloryFramePaint = z.infer<typeof paint>;
export type GloryFrameFilter = z.infer<typeof filter>;
export type GloryFrameStroke = z.infer<typeof stroke>;
export type GloryFrameTextEffect = z.infer<typeof effect>;
export type GloryFrameTextSlot = z.infer<typeof textSlot>;
export type GloryFrameLayer = z.infer<typeof layer>;
export type GloryFrameGradeLayer = z.infer<typeof gradeLayer>;
export type GloryFrameBirdAnchor = z.infer<typeof anchor>;
export type GloryFrameBirds = z.infer<typeof birds>;
export type GloryFrameFormat = z.infer<typeof GloryFrameFormatSchema>;

const refOf = ({ src, bytes, sha256 }: GloryFrameLayer): PackAssetRef => ({ src, bytes, sha256 });

/** Les couches peintes d'un format, sans le masque de la fenêtre. */
function paintedLayers(format: GloryFrameFormat): readonly PackAssetRef[] {
  const { decor, windowFill, grade, front, plate } = format.layers;
  const optional = [front['under-birds'], front['over-birds'], plate.plain, plate.message].filter((ref): ref is GloryFrameLayer => ref !== undefined);
  return [decor, windowFill, ...grade, ...optional].map(refOf);
}

/** Tous les fichiers qu'un format référence : masque, couches, passes — ce que le magasin doit pouvoir servir. */
export function gloryFrameFormatAssets(format: GloryFrameFormat): readonly PackAssetRef[] {
  return [refOf(format.window.mask), ...paintedLayers(format)];
}

/**
 * Ce qu'un PEINTRE qui découpe au chemin de la fenêtre (#10254) doit lire du magasin : tout le format, sauf le
 * masque quand le chemin est là. Le pack, lui, sert toujours le masque (`gloryFrameFormatAssets`) : un client
 * d'avant le chemin le lit encore.
 */
export function gloryFramePainterAssets(format: GloryFrameFormat): readonly PackAssetRef[] {
  return format.window.path === undefined ? gloryFrameFormatAssets(format) : paintedLayers(format);
}
