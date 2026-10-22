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

export function browserLensStage(options: { readonly face: LensStageEnv['face']; readonly reducedMotion?: () => boolean }): LensStage {
  return createLensStage({
    face: options.face,
    cube: () => null,
    lut: browserLutStage,
    paint: { assets: () => null },
    ...(options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion }),
  });
}
