import { coverCrop } from '../call-montage';
import type { Rect, Size } from '../call-montage-shapes';
import type { Surface2D } from './frame-paint-kit';
import type { FrameLook } from './frame-spec';

/**
 * **LES ILLUSTRATIONS D'UNE SCÈNE** (#12683, spec 02 § 1.1) — les couches
 * `image` d'un cadre : au fond, une MATIÈRE qui couvre la toile sous les
 * visages ; devant, une MOULURE découpée en neuf morceaux qui épouse tout
 * écran, coins intacts, bords étirés, centre transparent. Les images
 * viennent d'un magasin injecté (le peintre reste pur) ; une image que le
 * magasin n'a pas ne peint rien — le cadre se peint sans elle.
 */

export type SceneLayer = NonNullable<FrameLook['scene']>[number];

export type FrameImageStore = { readonly get: (src: string) => CanvasImageSource | null };

export const NO_IMAGES: FrameImageStore = { get: () => null };

/** Un magasin sur une table `src → image`. */
export const frameImages = (entries: Readonly<Record<string, CanvasImageSource>>): FrameImageStore => ({ get: (src) => entries[src] ?? null });

export type NineSliceCut = { readonly source: Rect; readonly target: Rect };

/** La taille d'une source d'image, quelle que soit sa nature (image, toile, vidéo, bitmap). */
export function imageSize(source: CanvasImageSource): Size {
  const shape = source as { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number; width?: number | SVGAnimatedLength; height?: number | SVGAnimatedLength };
  if (typeof shape.naturalWidth === 'number' && shape.naturalWidth > 0) return { width: shape.naturalWidth, height: shape.naturalHeight ?? 0 };
  if (typeof shape.videoWidth === 'number' && shape.videoWidth > 0) return { width: shape.videoWidth, height: shape.videoHeight ?? 0 };
  const dimension = (value: number | SVGAnimatedLength | undefined): number => (typeof value === 'number' ? value : (value?.baseVal.value ?? 0));
  return { width: dimension(shape.width), height: dimension(shape.height) };
}

/**
 * Les neuf morceaux d'une image posée en bordure : les coins mesurent `slice` du
 * petit côté — de la source d'un côté, de la destination de l'autre —, les bords
 * s'étirent sur leur longueur, le centre s'étire dans les deux sens.
 */
export function nineSliceCuts(source: Size, target: Size, slice: number): readonly NineSliceCut[] {
  const sourceCorner = slice * Math.min(source.width, source.height);
  const targetCorner = Math.min(slice * Math.min(target.width, target.height), target.width / 2, target.height / 2);
  const bands = (length: number, corner: number): readonly (readonly [number, number])[] => [
    [0, corner],
    [corner, Math.max(0, length - corner * 2)],
    [Math.max(corner, length - corner), corner],
  ];
  const sourceX = bands(source.width, sourceCorner);
  const sourceY = bands(source.height, sourceCorner);
  const targetX = bands(target.width, targetCorner);
  const targetY = bands(target.height, targetCorner);
  return sourceY.flatMap(([sy, sh], row) =>
    sourceX.map(([sx, sw], column) => {
      const [tx, tw] = targetX[column] ?? [0, 0];
      const [ty, th] = targetY[row] ?? [0, 0];
      return { source: { x: sx, y: sy, width: sw, height: sh }, target: { x: tx, y: ty, width: tw, height: th } };
    }),
  );
}

function paintCover(context: Surface2D, image: CanvasImageSource, size: Size): void {
  const source = imageSize(image);
  if (source.width <= 0 || source.height <= 0) return;
  const crop = coverCrop(source, size);
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
}

function paintNineSlice(context: Surface2D, image: CanvasImageSource, size: Size, slice: number): void {
  const source = imageSize(image);
  if (source.width <= 0 || source.height <= 0) return;
  context.imageSmoothingEnabled = true;
  nineSliceCuts(source, size, slice)
    .filter((cut) => cut.source.width > 0 && cut.source.height > 0 && cut.target.width > 0 && cut.target.height > 0)
    .forEach((cut) => context.drawImage(image, cut.source.x, cut.source.y, cut.source.width, cut.source.height, cut.target.x, cut.target.y, cut.target.width, cut.target.height));
}

/** Les couches `image` de `depth`, dans l'ordre de la scène, chacune à son opacité (`amount`, 1 par défaut). */
export function paintSceneImages(context: Surface2D, scene: readonly SceneLayer[] | undefined, depth: SceneLayer['depth'], size: Size, images: FrameImageStore): void {
  (scene ?? [])
    .filter((layer) => layer.kind === 'image' && layer.depth === depth && layer.src !== undefined)
    .forEach((layer) => {
      const image = layer.src === undefined ? null : images.get(layer.src);
      if (image === null) return;
      context.save();
      if (layer.amount !== undefined && layer.amount < 1) context.globalAlpha = layer.amount;
      if (layer.slice === undefined) paintCover(context, image, size);
      else paintNineSlice(context, image, size, layer.slice);
      context.restore();
    });
}
