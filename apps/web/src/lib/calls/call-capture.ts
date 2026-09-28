import { currentGallerySaver, type GallerySaver } from '@/lib/gallery/gallery-saver';
import { saveToGallery } from '@/lib/gallery/save-to-gallery';
import { fileDeliveryPortal, type FileDeliveryPortal } from '@/lib/media/deliver-file';
import { browserFileDeliveryHost } from '@/lib/media/file-delivery-host';

import { visibleTiles, type CaptureTile } from './call-capture-tiles';
import { captureFileName, captureSize, FACE_CROP_SIZE, faceCropRect, montageLayout, type MontageStyle, type Size } from './call-montage';
import { drawMontage, paintInto, type MontageText } from './call-montage-render';
import { detectFace, type FaceDetectorPort } from './face-tracker';

/**
 * **CAPTURER UN APPEL VIDÉO** (#8552) — deux gestes :
 *
 * - **Capturer** : le montage choisi, à pleine résolution (`captureSize`),
 *   depuis ce que l'écran montre À CET INSTANT — une image PNG ;
 * - **Chaque visage** : un portrait carré (1080) par tuile affichée, cadré sur
 *   le visage (le détecteur du navigateur, sinon la boîte supposée).
 *
 * Les fichiers partent dans la PHOTOTHÈQUE là où l'hôte en a une (la coque
 * Android, album « Meeshy ») ; ailleurs par la porte de fichiers (le
 * téléchargement d'un navigateur, la feuille de partage de la coque iOS).
 * Rien ne quitte l'appareil : aucune image ne passe par le réseau.
 */

export type CaptureFile = { readonly blob: Blob; readonly fileName: string };

export type SaveOutcome = { readonly saved: number; readonly failed: number; readonly cancelled: number };

type Canvas2D = { readonly context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D; readonly toBlob: () => Promise<Blob | null> };

export type CaptureEnv = {
  readonly canvas: (size: Size) => Canvas2D | null;
  readonly detector: FaceDetectorPort | null;
  readonly now: () => Date;
};

export function browserCanvas(size: Size): Canvas2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  return { context, toBlob: () => new Promise((resolve) => canvas.toBlob(resolve, 'image/png')) };
}

export const MONTAGE_DATE = (at: Date, locale: string): string => {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(at);
  } catch {
    return at.toDateString();
  }
};

type MontageInput = { readonly stage: Element; readonly style: MontageStyle; readonly text: MontageText; readonly viewport: Size; readonly env: CaptureEnv };

export async function captureMontage({ stage, style, text, viewport, env }: MontageInput): Promise<CaptureFile | null> {
  const tiles = visibleTiles(stage);
  if (tiles.length === 0) return null;
  const size = captureSize(viewport);
  const surface = env.canvas(size);
  if (surface === null) return null;
  drawMontage(surface.context, montageLayout({ style, count: tiles.length, size, onScreen: tiles.map((tile) => tile.onScreen) }), tiles, text);
  const blob = await surface.toBlob();
  return blob === null ? null : { blob, fileName: captureFileName({ at: env.now(), style }) };
}

async function portrait(tile: CaptureTile, index: number, at: Date, env: CaptureEnv): Promise<CaptureFile | null> {
  const face = await detectFace(env.detector, tile.source, tile.size);
  const surface = env.canvas({ width: FACE_CROP_SIZE, height: FACE_CROP_SIZE });
  if (surface === null) return null;
  paintInto(surface.context, tile, { x: 0, y: 0, width: FACE_CROP_SIZE, height: FACE_CROP_SIZE }, faceCropRect(face, tile.size));
  const blob = await surface.toBlob();
  return blob === null ? null : { blob, fileName: captureFileName({ at, style: 'visage', index }) };
}

export async function captureFaces({ stage, env }: { readonly stage: Element; readonly env: CaptureEnv }): Promise<readonly CaptureFile[]> {
  const at = env.now();
  const files = await Promise.all(visibleTiles(stage).map((tile, index) => portrait(tile, index, at, env)));
  return files.filter((file): file is CaptureFile => file !== null);
}

type SaveEnv = { readonly saver: GallerySaver | null; readonly portal: FileDeliveryPortal | null };

export const browserSaveEnv = (): SaveEnv => ({ saver: currentGallerySaver(), portal: fileDeliveryPortal(browserFileDeliveryHost()) });

const MIME = 'image/png';

async function saveOne(file: CaptureFile, env: SaveEnv): Promise<'saved' | 'failed' | 'cancelled'> {
  const notice = await saveToGallery({ blob: file.blob, fileName: file.fileName, mimeType: MIME, saver: env.saver });
  if (notice !== null) return notice === 'media.viewer.saved' ? 'saved' : 'failed';
  if (env.portal === null) return 'failed';
  const outcome = await env.portal.deliver(file.blob, file.fileName, MIME);
  if (outcome === 'delivered') return 'saved';
  return outcome === 'cancelled' ? 'cancelled' : 'failed';
}

/** Un fichier après l'autre : une feuille de partage n'en montre qu'une à la fois. */
export async function saveCaptures(files: readonly CaptureFile[], env: SaveEnv = browserSaveEnv()): Promise<SaveOutcome> {
  return files.reduce<Promise<SaveOutcome>>(async (previous, file) => {
    const tally = await previous;
    const outcome = await saveOne(file, env);
    return { ...tally, [outcome]: tally[outcome] + 1 };
  }, Promise.resolve({ saved: 0, failed: 0, cancelled: 0 }));
}
