import { clampPose, movedBy, rotatedBy, scaledBy, type StudioPose } from './studio-pose';

/**
 * **LES GESTES DU PLATEAU** (#6943) — la géométrie qui transforme des pixels
 * de pointeur ou une touche de clavier en une pose. Module PUR : aucun DOM,
 * aucun état React. C'est ce qui rend ces règles éprouvables, là où « un
 * contrôle déplaçable au pointeur a trois pièges qu'aucun unitaire ne voit ».
 *
 * **Pincer et tourner à deux doigts** (`pinchPose`), comme iOS
 * (`StoryCanvasUIView+Gestures.swift`). Les bornes ne sont pas réécrites
 * ici — elles viennent toutes de `studio-pose.ts`.
 *
 * **Et tout ce que le pointeur fait, le clavier le fait** (`keyboardPose`) :
 * « un objet déplaçable doit aussi être déplaçable au clavier » (dimension 5,
 * Facilité d'accès). Un plateau qui ne s'exploite qu'à la souris n'est pas
 * livré.
 */
export type StageBox = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

/** Les pixels PAGE d'un pointeur, vus comme une fraction de la scène. Un
 * plateau pas encore mesuré (largeur nulle) rend le centre plutôt qu'un
 * `NaN` qui se propagerait jusqu'au document publié. */
export function pointerFraction(stage: StageBox, clientX: number, clientY: number): { readonly x: number; readonly y: number } {
  if (stage.width <= 0 || stage.height <= 0) return { x: 0.5, y: 0.5 };
  return { x: (clientX - stage.left) / stage.width, y: (clientY - stage.top) / stage.height };
}

const DEGREES = 180 / Math.PI;

type Point = { readonly x: number; readonly y: number };

/** iOS divise par deux la rotation des doigts (`handleRotation`, retour
 * 2026-05-27 : « la rotation 1:1 était trop sensible »). */
const PINCH_ROTATION_SENSITIVITY = 0.5;

/**
 * **PINCER ET TOURNER À DEUX DOIGTS** (#8515, miroir `handlePinch` /
 * `handleRotation` de `StoryCanvasUIView+Gestures.swift`) — le rapport des
 * écarts donne l'échelle, l'angle entre les deux droites la rotation (à demi
 * sensibilité, comme iOS). Composé contre la pose de DÉPART, jamais contre
 * l'image précédente ; l'ancre ne bouge pas.
 */
export function pinchPose(origin: StudioPose, from: readonly [Point, Point], to: readonly [Point, Point]): StudioPose {
  const [a0, b0] = from;
  const [a1, b1] = to;
  const start = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  if (start < 1) return clampPose(origin);
  const scaled = scaledBy(origin, Math.hypot(b1.x - a1.x, b1.y - a1.y) / start);
  const turn = (Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)) * DEGREES;
  return rotatedBy(scaled, turn * PINCH_ROTATION_SENSITIVITY);
}

/** Un pas de déplacement au clavier — 1 % de la scène, dix fois plus avec Maj.
 * Assez fin pour placer, assez grand pour traverser. */
export const KEYBOARD_NUDGE = 0.01;
/** Un pas d'échelle MULTIPLICATIF : du 5 % perçu à toute taille, là où un pas
 * additif serait énorme sur un objet minuscule et imperceptible sur un grand. */
export const KEYBOARD_SCALE = 1.05;
export const KEYBOARD_ROTATE = 5;

/** `null` ⇒ cette touche ne fait rien ici : l'hôte la laisse passer plutôt
 * que d'avaler une frappe qu'il ne traite pas. */
export function keyboardPose(pose: StudioPose, key: string, shift: boolean): StudioPose | null {
  const step = shift ? KEYBOARD_NUDGE * 10 : KEYBOARD_NUDGE;
  if (key === 'ArrowLeft') return movedBy(pose, -step, 0);
  if (key === 'ArrowRight') return movedBy(pose, step, 0);
  if (key === 'ArrowUp') return movedBy(pose, 0, -step);
  if (key === 'ArrowDown') return movedBy(pose, 0, step);
  if (key === '+' || key === '=') return scaledBy(pose, KEYBOARD_SCALE);
  if (key === '-' || key === '_') return scaledBy(pose, 1 / KEYBOARD_SCALE);
  if (key === ']') return rotatedBy(pose, KEYBOARD_ROTATE);
  if (key === '[') return rotatedBy(pose, -KEYBOARD_ROTATE);
  return null;
}
