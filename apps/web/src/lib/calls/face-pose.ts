import type { Box, Circle, FacePose, Point } from './face-effects';
import type { FaceLandmarks } from './face-landmarks';

/**
 * **LA POSE DU VISAGE** (#19779) — ce que les 478 repères de MediaPipe
 * (`face-landmarker.ts`) disent que la boîte du navigateur ne dit pas. Le
 * halo de l'ange et les cornes du démon s'y posent et tournent avec la tête,
 * les yeux du démon et ceux du bébé brillent sur les VRAIS yeux.
 *
 * Les repères lus, dans la numérotation du maillage :
 *
 * - le front (10) et le menton (152) : le centre et la hauteur du visage ;
 * - les deux joues (234, 454) : sa largeur ;
 * - les coins de chaque œil (33 et 133, 362 et 263) : son rayon, et son
 *   centre quand l'iris (468, 473) manque ;
 * - la ligne des yeux : l'inclinaison de la tête.
 *
 * Tout se mesure en PIXELS de l'image (les repères sont normalisés, et une
 * image n'est pas carrée) ; la boîte rendue est celle du visage DEBOUT, dans
 * son propre repère : la dessiner, c'est tourner de `roll` autour de son
 * centre. Une image en miroir ne retourne pas la tête : l'inclinaison reste
 * dans ]−π/2, π/2].
 */

const FOREHEAD = 10;
const CHIN = 152;
const CHEEKS = [234, 454] as const;
const EYES = [
  { corners: [33, 133], iris: 468 },
  { corners: [362, 263], iris: 473 },
] as const;

/** Le dernier repère lu : en deçà, le maillage est incomplet et la pose n'existe pas. */
const NEEDED = CHEEKS[1] + 1;

type Size = { readonly width: number; readonly height: number };

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function poseOf(points: FaceLandmarks, frame: Size): FacePose | null {
  if (points.length < NEEDED || frame.width <= 0 || frame.height <= 0) return null;
  const at = (index: number): Point => {
    const point = points[index];
    return { x: (point?.x ?? 0) * frame.width, y: (point?.y ?? 0) * frame.height };
  };
  const eyeOf = ({ corners, iris }: (typeof EYES)[number]): Circle => {
    const [a, b] = [at(corners[0]), at(corners[1])];
    const center = points.length > iris ? at(iris) : middle(a, b);
    return { cx: center.x, cy: center.y, r: distance(a, b) / 2 };
  };
  const center = middle(at(FOREHEAD), at(CHIN));
  const height = distance(at(FOREHEAD), at(CHIN));
  const width = distance(at(CHEEKS[0]), at(CHEEKS[1]));
  if (width <= 0 || height <= 0) return null;
  const eyes = [eyeOf(EYES[0]), eyeOf(EYES[1])] as const;
  const [dx, dy] = [eyes[1].cx - eyes[0].cx, eyes[1].cy - eyes[0].cy];
  const roll = dx >= 0 ? Math.atan2(dy, dx) : Math.atan2(-dy, -dx);
  return { face: { x: center.x - width / 2, y: center.y - height / 2, width, height }, roll, eyes };
}

const lerp = (from: number, to: number, weight: number): number => from + (to - from) * weight;

/** Le pas de `smoothFaceBox`, réécrit ICI : ce module vit dans le gréement, qui n'importe aucune valeur du worker des effets (`face-rig.ts`). */
const glideBox = (from: Box, to: Box, weight: number): Box => ({ x: lerp(from.x, to.x, weight), y: lerp(from.y, to.y, weight), width: lerp(from.width, to.width, weight), height: lerp(from.height, to.height, weight) });

const glide = (from: Circle, to: Circle, weight: number): Circle => ({ cx: lerp(from.cx, to.cx, weight), cy: lerp(from.cy, to.cy, weight), r: lerp(from.r, to.r, weight) });

/** La pose glisse vers la dernière lecture, comme la boîte (`smoothFaceBox`) : un repère lu une image sur cinq ne saute pas. */
export function smoothPose(previous: FacePose | null, next: FacePose, weight = 0.35): FacePose {
  if (previous === null) return next;
  return {
    face: glideBox(previous.face, next.face, weight),
    roll: lerp(previous.roll, next.roll, weight),
    eyes: [glide(previous.eyes[0], next.eyes[0], weight), glide(previous.eyes[1], next.eyes[1], weight)],
  };
}
