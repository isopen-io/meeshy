import { heuristicFaceBox, shouldDetect, smoothFaceBox, type Box } from './face-effects';

/**
 * **LE VISAGE, IMAGE APRÈS IMAGE** (#8551, #8552) — partagé par le traitement
 * des images envoyées (les effets de visage) et la capture (« Chaque
 * visage »). Le détecteur est celui du NAVIGATEUR (Shape Detection API,
 * `FaceDetector` : Chrome sur Android et macOS, la coque) ; aucun modèle
 * n'est téléchargé. Il tourne une image sur `FACE_DETECT_EVERY`, sans jamais
 * faire attendre l'image courante : elle se dessine avec la dernière boîte
 * connue, lissée. Sans détecteur, ou quand il échoue, la boîte supposée.
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

export function createFaceTracker(detector: FaceDetectorPort | null): FaceTracker {
  const state: { seen: Box | null; shown: Box | null; busy: boolean } = { seen: null, shown: null, busy: false };
  const ask = (source: CanvasImageSource): void => {
    if (detector === null || state.busy) return;
    state.busy = true;
    detector.detect(source).then(
      (found) => {
        state.seen = boxOf(found);
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
      if (shouldDetect(frameIndex)) ask(source);
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
