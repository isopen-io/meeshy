import type { CaptureFile } from './call-capture-save';
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
 * Les fichiers partent par `call-capture-save.ts` (photothèque, sinon porte
 * de fichiers). Rien ne quitte l'appareil.
 */

export { saveCaptures, type CaptureFile, type SaveOutcome } from './call-capture-save';

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
