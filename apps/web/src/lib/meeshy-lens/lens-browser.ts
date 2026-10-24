import { createLandmarkDetector, type LandmarkDetector, type LandmarkerPort } from '@/lib/calls/face-landmark-detector';
import type { FaceDetectorPort } from '@/lib/calls/face-tracker';
import type { DeviceTier } from '@/lib/device/capability-tier';

import { createLutStage, type LutStage } from './lens-lut-stage';
import { createLensStage, type LensStage, type LensStageEnv } from './lens-stage';

/**
 * **L'ÉTAGE LENS DU NAVIGATEUR** (W14, #11320) — la colle : la LUT sur un
 * canevas WebGL2 hors écran, bâtie au premier besoin, et le visage que l'hôte
 * des effets lui remet (`face`, le détecteur du navigateur lu une image sur
 * cinq et lissé). Ce chunk n'importe rien du moteur des effets : il en est
 * chargé À LA DEMANDE (`lens-lazy.ts`), jamais l'inverse. Il ne dépend que
 * d'API qu'un WORKER connaît aussi.
 *
 * Les fichiers d'une lens (cube de sa LUT, images de ses stickers) arrivent
 * DANS ses réglages (`LensSettings.files`, #11994), lus et décodés par l'hôte
 * (`call-lens.ts`) : l'étage les y lit, et ses `cube`/`assets` ne sont que le
 * repli d'une lens posée sans fichiers.
 *
 * Le VISAGE (W15, #11321) : l'hôte remet son suiveur (`track`) et le détecteur
 * du navigateur ; l'étage leur adjoint le détecteur à 478 points
 * (`face-landmark-detector.ts`), bâti au premier visage demandé — donc à la
 * première lens qui s'y ancre —, et le rend à sa fermeture. Ce code vit ICI,
 * dans le chunk des lens, et non dans le worker des effets qui a son plafond.
 */
function browserLutStage(): LutStage | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const gl = new OffscreenCanvas(1, 1).getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (gl === null) return null;
  try {
    return createLutStage(gl);
  } catch {
    return null;
  }
}

export type LensFaceEnv = {
  readonly track: (detector: FaceDetectorPort) => LensStageEnv['face'];
  readonly browserDetector: () => FaceDetectorPort | null;
  readonly tier: () => DeviceTier;
  readonly now: () => number;
  readonly load?: () => Promise<LandmarkerPort>;
};

const loadFaceLandmarker = (): Promise<LandmarkerPort> => import('@/lib/calls/video-effects-segmentation').then((module) => module.loadFaceLandmarker());

function lensFace(env: LensFaceEnv): { readonly face: LensStageEnv['face']; readonly close: () => void } {
  const state: { face: LensStageEnv['face'] | null; detector: LandmarkDetector | null } = { face: null, detector: null };
  return {
    face: (source, frame) => {
      if (state.face === null) {
        const detector = createLandmarkDetector({ load: env.load ?? loadFaceLandmarker, tier: env.tier, fallback: env.browserDetector(), now: env.now });
        state.detector = detector;
        state.face = env.track(detector);
      }
      return state.face(source, frame);
    },
    close: () => state.detector?.close(),
  };
}

export function browserLensStage(options: { readonly face: LensFaceEnv; readonly reducedMotion?: () => boolean }): LensStage {
  const face = lensFace(options.face);
  const stage = createLensStage({
    face: face.face,
    cube: () => null,
    lut: browserLutStage,
    paint: { assets: () => null },
    ...(options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion }),
  });
  return {
    ...stage,
    close: () => {
      stage.close();
      face.close();
    },
  };
}
