import type { DeviceTier } from '../device/capability-tier';

import { landmarksBox, landmarksTierAllows, type FaceLandmarks } from './face-landmarks';
import type { FaceDetectorPort } from './face-tracker';

/**
 * **LE DÉTECTEUR À 478 POINTS, CHARGÉ À LA DEMANDE** (W15, #11321) — un
 * `FaceDetectorPort` comme celui du navigateur, que le suiveur
 * (`createFaceTracker`) interroge sans rien savoir du modèle :
 *
 * - le modèle (`face-landmarker.ts`, un chunk à part avec son WebAssembly et
 *   son `.task`, servis par Meeshy) ne se charge qu'au PREMIER visage demandé —
 *   c'est-à-dire à la première lens qui s'ancre au visage (`lensUsesFace`) —,
 *   UNE seule fois, et seulement sur un appareil de palier A ;
 * - tant qu'il charge, ou s'il ne charge pas ou lève sur une image, le
 *   détecteur du navigateur répond (`fallback`) : une lens ne s'arrête jamais
 *   faute de modèle, et un chargement échoué n'est pas rejoué à chaque image.
 */
export type LandmarkerPort = { readonly detect: (image: CanvasImageSource, timestampMs: number) => FaceLandmarks | null; readonly close: () => void };

export type LandmarkDetector = FaceDetectorPort & { readonly close: () => void };

export type LandmarkDetectorEnv = {
  readonly load: () => Promise<LandmarkerPort>;
  readonly tier: () => DeviceTier;
  readonly fallback: FaceDetectorPort | null;
  readonly now: () => number;
};

type SizedImage = { readonly width?: number; readonly height?: number; readonly displayWidth?: number; readonly displayHeight?: number; readonly videoWidth?: number; readonly videoHeight?: number };

/** La taille en pixels de l'image lue, quelle que soit sa nature (bitmap, canevas, image vidéo, vidéo). */
function sizeOf(source: CanvasImageSource): { readonly width: number; readonly height: number } {
  const image = source as SizedImage;
  return { width: image.displayWidth ?? image.videoWidth ?? image.width ?? 0, height: image.displayHeight ?? image.videoHeight ?? image.height ?? 0 };
}

type State = { landmarker: LandmarkerPort | null; asked: boolean; lastStamp: number };

export function createLandmarkDetector(env: LandmarkDetectorEnv): LandmarkDetector {
  const state: State = { landmarker: null, asked: false, lastStamp: 0 };
  const fallback = async (source: CanvasImageSource) => (env.fallback === null ? [] : env.fallback.detect(source));
  const ask = (): void => {
    if (state.asked || !landmarksTierAllows(env.tier())) return;
    state.asked = true;
    env.load().then(
      (landmarker) => void (state.landmarker = landmarker),
      () => undefined,
    );
  };
  /* Le temps d'une vidéo MediaPipe ne recule ni ne se répète : au besoin, une milliseconde de plus. */
  const stamp = (): number => (state.lastStamp = Math.max(env.now(), state.lastStamp + 1));
  return {
    detect: async (source) => {
      ask();
      const landmarker = state.landmarker;
      if (landmarker === null) return fallback(source);
      try {
        const points = landmarker.detect(source, stamp());
        const box = points === null ? null : landmarksBox(points, sizeOf(source));
        return points === null || box === null ? [] : [{ boundingBox: box, landmarks: points }];
      } catch {
        return fallback(source);
      }
    },
    close: () => {
      state.landmarker?.close();
      state.landmarker = null;
    },
  };
}
