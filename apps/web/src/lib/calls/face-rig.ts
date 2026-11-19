import type { DeviceTier } from '../device/capability-tier';

import type { Circle, FacePose } from './face-effects';
import type { SpriteSurface, SurfacePort } from './face-effects-draw';
import { createLandmarkDetector, type LandmarkerPort } from './face-landmark-detector';
import { poseOf, smoothPose } from './face-pose';
import type { FaceRig } from './face-rig-port';
import type { FaceDetectorPort } from './face-tracker';
import type { FaceTarget } from './video-effects-frames';

/**
 * **LE GRÉEMENT DU VISAGE** (#19779) — un chunk À PART, chargé au premier
 * visage que cherche le calque des effets (`face-rig-port.ts`) : le worker des
 * effets a son plafond (`budgets.json` › `call_video_effects_worker`).
 *
 * - le DÉTECTEUR à 478 points (`face-landmark-detector.ts`, le même que celui
 *   des lens) : le modèle ne se charge que sur un appareil de palier A, le
 *   détecteur du navigateur répondant d'ici là et partout ailleurs ;
 * - la POSE qu'il en tire (`face-pose.ts`), en pixels de l'image, lissée
 *   d'une image à l'autre ;
 * - la LOUPE des yeux du bébé : la région de chaque œil, lue sur l'image
 *   PEINTE (couleur et lissage compris, jamais l'image brute), grossie de
 *   `BABY_EYE_SCALE` dans une surface de travail, découpée par un masque rond
 *   dégradé (dessiné UNE fois) et reposée centrée sur l'œil. Sans surface de
 *   travail, un disque découpé, sans fondu.
 *
 * Ce chunk n'importe AUCUNE valeur du calque ni de sa géométrie (seulement
 * leurs types) : une seule le ferait importer STATIQUEMENT par le worker des
 * effets, et le sortirait de son « à la demande » (`measure-weight.mjs`).
 */
export type FaceRigEnv = {
  readonly fallback: FaceDetectorPort | null;
  readonly tier: () => DeviceTier;
  readonly now: () => number;
  readonly surface: SurfacePort;
  readonly load?: () => Promise<LandmarkerPort>;
};

/** De combien la loupe grossit un œil du bébé. */
export const BABY_EYE_SCALE = 1.35;

/** La région peinte autour d'un œil, en rayons d'œil : l'œil, ses paupières, le début du sourcil. */
const EYE_REACH = 1.9;

export type Square = { readonly x: number; readonly y: number; readonly size: number };

/** La loupe d'un œil : la région LUE (`from`) et celle où elle se PEINT (`to`), centrées sur l'œil, la seconde `BABY_EYE_SCALE` fois plus grande. */
export function eyeLensOf(eye: Circle): { readonly from: Square; readonly to: Square } {
  const reach = eye.r * EYE_REACH;
  const read = reach / BABY_EYE_SCALE;
  return { from: { x: eye.cx - read, y: eye.cy - read, size: read * 2 }, to: { x: eye.cx - reach, y: eye.cy - reach, size: reach * 2 } };
}

const loadFaceLandmarker = (): Promise<LandmarkerPort> => import('./video-effects-segmentation').then((module) => module.loadFaceLandmarker());

const MASK_EDGE = 64;

const WORK_STEP = 64;

type Surface2D = FaceTarget['context'];

// Le dégradé ci-dessous est un MASQUE ALPHA, pas une couleur : ce canvas hors
// DOM est composé en `globalCompositeOperation = 'destination-in'` (voir
// `lensDrawer`), où seule la composante ALPHA (la rampe 1 → 1 → 0) découpe l'œil
// agrandi — le noir n'est jamais rendu comme une teinte. La charte ne nomme
// aucun jeton pour une rampe d'alpha de compositing, d'où l'exemption à la
// ligne (même régime que le masque de luminance de la famille appel).
function paintMask(into: Surface2D): void {
  const half = MASK_EDGE / 2;
  const gradient = into.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); // harmony-exempt: alpha de masque (destination-in), pas une couleur
  gradient.addColorStop(0.62, 'rgba(0, 0, 0, 1)'); // harmony-exempt: alpha de masque (destination-in), pas une couleur
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // harmony-exempt: alpha de masque (destination-in), pas une couleur
  into.fillStyle = gradient;
  into.fillRect(0, 0, MASK_EDGE, MASK_EDGE);
}

type Lens = ReturnType<typeof eyeLensOf>;

function clipped(context: Surface2D, from: CanvasImageSource, eye: Circle, lens: Lens): void {
  context.save();
  context.beginPath();
  context.arc(eye.cx, eye.cy, lens.to.size / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(from, lens.from.x, lens.from.y, lens.from.size, lens.from.size, lens.to.x, lens.to.y, lens.to.size, lens.to.size);
  context.restore();
}

function lensDrawer(surface: SurfacePort): (context: Surface2D, eye: Circle) => void {
  const state: { mask: SpriteSurface | null | undefined; work: { readonly surface: SpriteSurface; readonly edge: number } | null } = { mask: undefined, work: null };
  const mask = (): SpriteSurface | null => {
    if (state.mask === undefined) {
      state.mask = surface(MASK_EDGE, MASK_EDGE);
      if (state.mask !== null) paintMask(state.mask.context);
    }
    return state.mask;
  };
  const scratch = (size: number): SpriteSurface | null => {
    if (state.work !== null && state.work.edge >= size) return state.work.surface;
    const edge = Math.ceil(Math.max(size, state.work?.edge ?? 0) / WORK_STEP) * WORK_STEP;
    const made = surface(edge, edge);
    state.work = made === null ? null : { surface: made, edge };
    return made;
  };
  return (context, eye) => {
    const lens = eyeLensOf(eye);
    const from = context.canvas;
    const size = lens.to.size;
    const ring = mask();
    const work = ring === null ? null : scratch(Math.ceil(size));
    if (ring === null || work === null) {
      clipped(context, from, eye, lens);
      return;
    }
    const into = work.context;
    into.clearRect(0, 0, Math.ceil(size), Math.ceil(size));
    into.drawImage(from, lens.from.x, lens.from.y, lens.from.size, lens.from.size, 0, 0, size, size);
    into.globalCompositeOperation = 'destination-in';
    into.drawImage(ring.canvas, 0, 0, size, size);
    into.globalCompositeOperation = 'source-over';
    context.drawImage(work.canvas, 0, 0, size, size, lens.to.x, lens.to.y, size, size);
  };
}

export function createFaceRig(env: FaceRigEnv): FaceRig {
  const detector = createLandmarkDetector({ load: env.load ?? loadFaceLandmarker, tier: env.tier, fallback: env.fallback, now: env.now });
  const lens = lensDrawer(env.surface);
  const state: { shown: FacePose | null } = { shown: null };
  return {
    detector,
    pose: (frame) => {
      const points = detector.landmarks();
      const next = points === null ? null : poseOf(points, frame);
      state.shown = next === null ? null : smoothPose(state.shown, next);
      return state.shown;
    },
    magnify: (target, eyes) => eyes.forEach((eye) => lens(target.context, eye)),
    close: () => {
      state.shown = null;
      detector.close();
    },
  };
}
