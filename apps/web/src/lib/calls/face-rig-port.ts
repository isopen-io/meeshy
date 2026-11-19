import type { Circle, FacePose } from './face-effects';
import type { FaceDetectorPort } from './face-tracker';
import type { FaceTarget } from './video-effects-frames';

/**
 * **LE GRÉEMENT DU VISAGE, CÔTÉ CALQUE** (#19779) — ce que le calque des
 * effets de visage (`face-effects-draw.ts`, dans le worker des effets qui a
 * son plafond) attend du gréement (`face-rig.ts`, un chunk à part) :
 *
 * - `detector` : le détecteur que suit le calque — à 478 points sur un
 *   appareil de palier A, sinon celui du navigateur ;
 * - `pose` : la pose que disent les repères, ou `null` (boîte seule) ;
 * - `magnify` : la loupe des yeux du bébé, posée sur l'image peinte ;
 * - `close` : rend le modèle.
 *
 * `lazyFaceRig` le demande au PREMIER visage cherché, une seule fois ; d'ici
 * là, et s'il ne se charge pas, le détecteur du navigateur répond, sans pose
 * ni loupe — l'effet garde le dessin d'avant, jamais l'image n'attend.
 */
export type FaceRig = {
  readonly detector: FaceDetectorPort;
  readonly pose: (frame: { readonly width: number; readonly height: number }) => FacePose | null;
  readonly magnify: (target: FaceTarget, eyes: readonly Circle[]) => void;
  readonly close: () => void;
};

export function lazyFaceRig(load: () => Promise<FaceRig>, fallback: FaceDetectorPort | null): FaceRig {
  const state: { rig: FaceRig | null; asked: boolean; closed: boolean } = { rig: null, asked: false, closed: false };
  const adopt = (rig: FaceRig): void => {
    if (state.closed) rig.close();
    else state.rig = rig;
  };
  const ask = (): void => {
    if (state.asked) return;
    state.asked = true;
    load().then(adopt, () => undefined);
  };
  return {
    detector: {
      detect: (source) => {
        ask();
        const port = state.rig?.detector ?? fallback;
        return port === null ? Promise.resolve([]) : port.detect(source);
      },
    },
    pose: (frame) => state.rig?.pose(frame) ?? null,
    magnify: (target, eyes) => state.rig?.magnify(target, eyes),
    close: () => {
      state.closed = true;
      state.rig?.close();
      state.rig = null;
    },
  };
}
