import { heuristicFaceBox, shouldDetect, smoothFaceBox, type Box } from './face-effects';

/**
 * **LE VISAGE, IMAGE APRÈS IMAGE** (#8551, #8552) — partagé par le traitement
 * des images envoyées (les effets de visage) et la capture (« Chaque
 * visage »). Le détecteur est celui du NAVIGATEUR (Shape Detection API,
 * `FaceDetector` : Chrome sur Android et macOS, la coque) ; aucun modèle
 * n'est téléchargé. Il tourne une image sur `FACE_DETECT_EVERY`, sans jamais
 * faire attendre l'image courante : elle se dessine avec la dernière boîte
 * connue, lissée. Sans détecteur, ou quand il échoue, la boîte supposée. Il
 * lit une image RÉDUITE à `DETECT_WIDTH` (#9100), et sa boîte revient à
 * l'échelle de l'image.
 */

type Detected = { readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } };

export type FaceDetectorPort = { readonly detect: (source: CanvasImageSource) => Promise<readonly Detected[]> };

type FaceDetectorCtor = new (options: { readonly fastMode: boolean; readonly maxDetectedFaces: number }) => FaceDetectorPort;

/** Le détecteur du navigateur, ou `null` là où il n'existe pas. */
export function faceDetectorOf(scope: Record<string, unknown>): FaceDetectorPort | null {
  const Detector = scope.FaceDetector as FaceDetectorCtor | undefined;
  if (typeof Detector !== 'function') return null;
  try {
    return new Detector({ fastMode: true, maxDetectedFaces: 1 });
  } catch {
    return null;
  }
}

export const browserFaceDetector = (): FaceDetectorPort | null => faceDetectorOf(globalThis as unknown as Record<string, unknown>);

const boxOf = (found: readonly Detected[]): Box | null => {
  const first = found[0]?.boundingBox;
  return first === undefined || first.width <= 0 ? null : { x: first.x, y: first.y, width: first.width, height: first.height };
};

export type FaceTracker = { readonly next: (source: CanvasImageSource, frame: { readonly width: number; readonly height: number }, frameIndex: number) => Box };

/** La largeur de l'image que lit le détecteur (#9100) : un visage s'y trouve, et la relecture GPU → CPU d'une image 720p ne se paie plus. */
export const DETECT_WIDTH = 320;

type Reduced = { readonly image: CanvasImageSource; readonly width: number; readonly close: () => void };

/** Réduit `source` (large de `from`) à `to` pixels de large ; rend l'image et sa largeur réelle. */
export type ResizePort = (source: CanvasImageSource, size: { readonly from: number; readonly to: number }) => Promise<Reduced>;

type BitmapScope = { readonly createImageBitmap?: (source: CanvasImageSource, options: { readonly resizeWidth: number; readonly resizeQuality: 'low' }) => Promise<ImageBitmap> };

/** La réduction du navigateur (`createImageBitmap`, aussi dans un Worker), ou l'image telle quelle là où elle n'existe pas. */
export function browserResize(scope: BitmapScope = globalThis as BitmapScope): ResizePort {
  const create = scope.createImageBitmap;
  if (typeof create !== 'function') return async (image, { from }) => ({ image, width: from, close: () => undefined });
  return async (image, { to }) => {
    const bitmap = await create.call(scope, image, { resizeWidth: to, resizeQuality: 'low' });
    return { image: bitmap, width: bitmap.width, close: () => bitmap.close() };
  };
}

const scaled = (box: Box | null, factor: number): Box | null => (box === null || factor === 1 ? box : { x: box.x * factor, y: box.y * factor, width: box.width * factor, height: box.height * factor });

export function createFaceTracker(detector: FaceDetectorPort | null, options: { readonly resize?: ResizePort } = {}): FaceTracker {
  const resize = options.resize ?? browserResize();
  const state: { seen: Box | null; shown: Box | null; busy: boolean } = { seen: null, shown: null, busy: false };
  const read = async (port: FaceDetectorPort, source: CanvasImageSource, width: number): Promise<Box | null> => {
    if (width <= DETECT_WIDTH) return boxOf(await port.detect(source));
    const reduced = await resize(source, { from: width, to: DETECT_WIDTH });
    try {
      return scaled(boxOf(await port.detect(reduced.image)), width / reduced.width);
    } finally {
      reduced.close();
    }
  };
  const ask = (source: CanvasImageSource, width: number): void => {
    if (detector === null || state.busy) return;
    state.busy = true;
    read(detector, source, width).then(
      (box) => {
        state.seen = box;
        state.busy = false;
      },
      () => {
        state.seen = null;
        state.busy = false;
      },
    );
  };
  return {
    next: (source, frame, frameIndex) => {
      if (shouldDetect(frameIndex)) ask(source, frame.width);
      const target = state.seen ?? heuristicFaceBox(frame);
      state.shown = state.seen === null ? target : smoothFaceBox(state.shown, target);
      return state.shown;
    },
  };
}

/** Le visage d'UNE image — pour la capture : le détecteur, sinon la boîte supposée. */
export async function detectFace(detector: FaceDetectorPort | null, source: CanvasImageSource, frame: { readonly width: number; readonly height: number }): Promise<Box> {
  if (detector === null) return heuristicFaceBox(frame);
  const found = await detector.detect(source).catch(() => []);
  return boxOf(found) ?? heuristicFaceBox(frame);
}
