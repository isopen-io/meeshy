import { browserFaceDetector, createFaceTracker } from '@/lib/calls/face-tracker';

import { createLutStage, type LutStage } from './lens-lut-stage';
import { createLensStage, type LensStage } from './lens-stage';

/**
 * **L'ÉTAGE LENS DU NAVIGATEUR** (W14, #11320) — la colle : le détecteur de
 * visage du navigateur (le même que les effets de visage, lu une image sur
 * cinq et lissé), et la LUT sur un canevas WebGL2 hors écran, bâti au premier
 * besoin. Il ne dépend que d'API qu'un WORKER connaît aussi.
 *
 * Les fichiers d'une lens (cube de sa LUT, images de ses stickers) ne lui sont
 * pas encore remis : aucune surface du web ne télécharge un pack de lens. Une
 * lens s'y joue donc par ses textes, ses particules et son plan, et sa LUT et
 * ses stickers attendent ce téléchargement (#11320, blocage consigné).
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

export function browserLensStage(options: { readonly reducedMotion?: () => boolean } = {}): LensStage {
  const tracker = createFaceTracker(browserFaceDetector());
  const counter = { frame: 0 };
  return createLensStage({
    face: (source, frame) => tracker.next(source, frame, counter.frame++),
    cube: () => null,
    lut: browserLutStage,
    paint: { assets: () => null },
    ...(options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion }),
  });
}
