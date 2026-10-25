import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import { gloryFrameFormatAssets, gloryFramePainterAssets, type GloryFrameLayer } from '@meeshy/shared/types/glory-frame-format';

import { loadGloryFonts, type GloryFontRequest } from '../glory-fonts';
import { anchorsOf, birdLayoutOf, type GloryFrameBirdLayout, type GloryFrameBirdTable, type GloryFrameFormat } from './frame-spec';
import type { GloryBirdImages, GloryLayerImages } from './paint-glory-frame';

/**
 * **LES IMAGES D'UN CADRE DE GLOIRE** (#10159, § 5.5) — les couches lues dans
 * le MAGASIN des packs (`lib/packs/pack-asset-store.ts`, sans réseau : une
 * couche absente rend le cadre « pas prêt »), les stickers de Mee et de Meo
 * rastérisés depuis le catalogue embarqué, les polices attendues. Tout est
 * injecté : le témoin n'a ni Cache Storage, ni `createImageBitmap`, ni
 * `document.fonts`.
 *
 * Ce module n'adresse jamais `/pack-assets/` lui-même et ne fait aucun
 * `fetch(` (garde du § 8.7) : il LIT par le magasin et DEMANDE par lui.
 *
 * Les bitmaps tiennent leur mémoire jusqu'à `close()` (#9382) : un décor
 * 1080×1920 décodé pèse 8,3 Mo. L'aperçu décode à DEMI-résolution
 * (`createImageBitmap(blob, { resizeWidth })`), l'image finale en pleine taille ;
 * le peintre pose chaque couche dans la boîte du contrat, la résolution de la
 * bitmap ne change pas la géométrie.
 *
 * La fenêtre (#10254) : c'est ICI que se décide chemin ou masque, une fois par
 * chargement. Le `Path2D` du chemin se construit au chargement et voyage avec
 * les couches (le peintre ne le reconstruit pas à chaque image de la
 * chorégraphie) ; un moteur sans `Path2D`, ou qui refuse de le construire,
 * reçoit le masque à la place — la présence (`missingGloryFrameAssets`) le
 * compte alors, et le peintre découpe par lui, jamais au seul rectangle.
 */

/** Une image décodée qui sait rendre sa mémoire — `ImageBitmap` en production. */
export type ClosableImage = CanvasImageSource & { readonly close?: () => void };

export type GloryAssetDeps = {
  /** Les octets vérifiés d'un fichier de pack, du SEAU seulement ; `null` s'il n'y est pas. */
  readonly read: (ref: PackAssetRef) => Promise<Blob | null>;
  /** Demande au magasin de ranger ce qui manque, sans attendre. */
  readonly request: (refs: readonly PackAssetRef[]) => void;
  /** Le seau tient-il ce fichier ? Sans en lire les octets ; absent : `read` en tient lieu. */
  readonly has?: (ref: PackAssetRef) => Promise<boolean>;
  /** Décode un fichier image ; `scale` < 1 pour un aperçu à résolution réduite. */
  readonly decode: (blob: Blob, box: { readonly width: number; readonly height: number }, scale: number) => Promise<ClosableImage>;
  /** Rastérise le SVG d'un sticker Mee en image décodée ; `null` si le navigateur ne sait pas. */
  readonly rasterSticker: (markup: string, size: number) => Promise<ClosableImage | null>;
  /** Le SVG d'un sticker du catalogue embarqué ; `null` pour un identifiant inconnu. */
  readonly stickerMarkup: (sticker: string) => string | null;
  readonly fonts?: Pick<FontFaceSet, 'load'>;
  /** Construit le chemin de la fenêtre ; absent : le `Path2D` du navigateur s'il existe ; `null` : un moteur sans lui. */
  readonly path2d?: ((d: string) => Path2D) | null;
};

export type GloryFrameImages = {
  readonly layers: GloryLayerImages;
  readonly birds: GloryBirdImages;
  /** Rend la mémoire de chaque bitmap ; à appeler en quittant le déroulé ou en changeant de cadre. */
  readonly close: () => void;
};

/** Le rendu d'un sticker : le double de la plus grande ancre des contrats (180 px), comme les dessins du cadre simple. */
const STICKER_SIZE = 512;

const browserPath2d = (d: string): Path2D => new Path2D(d);

const builderOf = (deps: Pick<GloryAssetDeps, 'path2d'>): ((d: string) => Path2D) | null =>
  deps.path2d !== undefined ? deps.path2d : typeof Path2D === 'function' ? browserPath2d : null;

/** Le chemin de la fenêtre construit pour ce moteur ; `null` : le peintre découpe par le masque. */
export function gloryWindowPath(format: GloryFrameFormat, deps: Pick<GloryAssetDeps, 'path2d'> = {}): Path2D | null {
  const build = builderOf(deps);
  if (format.window.path === undefined || build === null) return null;
  try {
    return build(format.window.path);
  } catch {
    return null;
  }
}

/** Ce que le peintre lit : le masque de la fenêtre seulement quand il ne découpera pas au chemin (#10254). */
const layerRefs = (format: GloryFrameFormat, deps: GloryAssetDeps): readonly PackAssetRef[] =>
  builderOf(deps) === null ? gloryFrameFormatAssets(format) : gloryFramePainterAssets(format);

/** Les polices que ce format demande, une requête par face. */
export const fontRequestsOf = (format: GloryFrameFormat): readonly GloryFontRequest[] =>
  Object.values(format.text).map(({ font }) => ({ family: font.family, weight: font.weight, style: font.style }));

/** Les stickers de la pose demandée, et de la pose par défaut (le repli du peintre). */
export const stickersOf = (birds: GloryFrameBirdTable, pose: GloryFrameBirdLayout | null): readonly string[] => {
  const layouts = [birdLayoutOf(birds, pose), birds.layouts[birds.default]].filter((layout) => layout !== undefined);
  return [...new Set(layouts.flatMap((layout) => anchorsOf(layout).map((anchor) => anchor.sticker)))];
};

type Decoded = { readonly ref: PackAssetRef; readonly image: ClosableImage | null };

const present = async (ref: PackAssetRef, deps: GloryAssetDeps): Promise<boolean> => {
  try {
    return deps.has === undefined ? (await deps.read(ref)) !== null : await deps.has(ref);
  } catch {
    return false;
  }
};

/**
 * Les couches d'un format qui MANQUENT au magasin (#10164) : vide, le cadre est
 * prêt ; sinon leur somme d'octets est le poids que la tuile annonce.
 */
export async function missingGloryFrameAssets(format: GloryFrameFormat, deps: GloryAssetDeps): Promise<readonly PackAssetRef[]> {
  const refs = layerRefs(format, deps);
  const presence = await Promise.all(refs.map((ref) => present(ref, deps)));
  return refs.filter((_, index) => !presence[index]);
}

const refOf = ({ src, bytes, sha256 }: GloryFrameLayer): PackAssetRef => ({ src, bytes, sha256 });

async function decodeLayer(layer: GloryFrameLayer, deps: GloryAssetDeps, scale: number): Promise<Decoded> {
  const ref = refOf(layer);
  const blob = await deps.read(ref).catch(() => null);
  if (blob === null) return { ref, image: null };
  try {
    return { ref, image: await deps.decode(blob, { width: layer.box[2], height: layer.box[3] }, scale) };
  } catch {
    return { ref, image: null };
  }
}

const closeAll = (images: readonly (ClosableImage | null | undefined)[]): void => images.forEach((image) => image?.close?.());

async function decodeBirds(stickers: readonly string[], deps: GloryAssetDeps): Promise<GloryBirdImages> {
  const entries = await Promise.all(
    stickers.map(async (sticker): Promise<readonly [string, ClosableImage | null]> => {
      const markup = deps.stickerMarkup(sticker);
      if (markup === null) return [sticker, null];
      return [sticker, await deps.rasterSticker(markup, STICKER_SIZE).catch(() => null)];
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, ClosableImage] => entry[1] !== null));
}

/**
 * Charge tout ce que le peintre demande pour UN format. `null` dès qu'une couche
 * manque au magasin : ce qui manque est DEMANDÉ, et la photo part en carte
 * simple sans attendre — jamais un cadre à moitié décoré.
 */
export async function loadGloryFrameImages(
  format: GloryFrameFormat,
  pose: GloryFrameBirdLayout | null,
  deps: GloryAssetDeps,
  scale = 1,
): Promise<GloryFrameImages | null> {
  const { decor, windowFill, grade, front, plate } = format.layers;
  const optional = (layer: GloryFrameLayer | undefined): Promise<Decoded | null> => (layer === undefined ? Promise.resolve(null) : decodeLayer(layer, deps, scale));
  const windowPath = gloryWindowPath(format, deps);
  const [maskD, decorD, fillD, grades, under, over, plain, message, birds] = await Promise.all([
    windowPath === null ? decodeLayer(format.window.mask, deps, scale) : Promise.resolve(null),
    decodeLayer(decor, deps, scale),
    decodeLayer(windowFill, deps, scale),
    Promise.all(grade.map((layer) => decodeLayer(layer, deps, scale))),
    optional(front['under-birds']),
    optional(front['over-birds']),
    optional(plate.plain),
    optional(plate.message),
    decodeBirds(stickersOf(format.birds, pose), deps),
    loadGloryFonts(fontRequestsOf(format), deps.fonts),
  ]);
  const all = [maskD, decorD, fillD, ...grades, under, over, plain, message].filter((entry): entry is Decoded => entry !== null);
  const missing = all.filter((entry) => entry.image === null).map((entry) => entry.ref);
  if (missing.length > 0 || decorD.image === null || fillD.image === null) {
    closeAll([...all.map((entry) => entry.image), ...Object.values(birds)]);
    deps.request(missing.length > 0 ? missing : layerRefs(format, deps));
    return null;
  }
  const images = [maskD?.image, decorD.image, fillD.image, ...grades.map((entry) => entry.image), under?.image, over?.image, plain?.image, message?.image];
  return {
    layers: {
      mask: maskD?.image ?? null,
      windowPath,
      decor: decorD.image,
      windowFill: fillD.image,
      grade: grades.map((entry) => entry.image).filter((image): image is ClosableImage => image !== null),
      front: { ...(under?.image ? { 'under-birds': under.image } : {}), ...(over?.image ? { 'over-birds': over.image } : {}) },
      plate: { ...(plain?.image ? { plain: plain.image } : {}), ...(message?.image ? { message: message.image } : {}) },
    },
    birds,
    close: () => closeAll([...images, ...Object.values(birds)]),
  };
}
