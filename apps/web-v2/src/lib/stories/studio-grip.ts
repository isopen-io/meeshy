import { clampPose, movedBy, rotatedBy, scaledBy, type StudioPose } from './studio-pose';

/**
 * **LES GESTES DU PLATEAU** (#6943) — la géométrie qui transforme des pixels
 * de pointeur ou une touche de clavier en une pose. Module PUR : aucun DOM,
 * aucun état React. C'est ce qui rend ces règles éprouvables, là où « un
 * contrôle déplaçable au pointeur a trois pièges qu'aucun unitaire ne voit ».
 *
 * **UNE poignée pour l'échelle ET la rotation** (`gripPose`) — la grammaire
 * d'un éditeur à un seul doigt, là où iOS a le pincement à deux doigts
 * (`StoryCanvasUIView+Gestures.swift`) : la DISTANCE au centre donne
 * l'échelle, l'ANGLE autour du centre donne la rotation. Les bornes ne sont
 * pas réécrites ici — elles viennent toutes de `studio-pose.ts`.
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

/** L'état au MOMENT de la saisie — le centre de l'objet, le point saisi, et la
 * pose de départ. Tout se compose contre lui, jamais contre l'image
 * précédente : autrement un mouvement rapide dériverait. */
export type GripOrigin = {
  readonly centerX: number;
  readonly centerY: number;
  readonly grabX: number;
  readonly grabY: number;
  readonly scale: number;
  readonly rotation: number;
};

const DEGREES = 180 / Math.PI;

export function gripPose(pose: StudioPose, origin: GripOrigin, clientX: number, clientY: number): StudioPose {
  const grabDx = origin.grabX - origin.centerX;
  const grabDy = origin.grabY - origin.centerY;
  const grabDistance = Math.hypot(grabDx, grabDy);
  // Une poignée saisie SUR le centre n'a ni distance ni angle de référence :
  // le geste est sans effet plutôt que division par zéro.
  if (grabDistance < 1) return clampPose(pose);

  const dx = clientX - origin.centerX;
  const dy = clientY - origin.centerY;
  const distance = Math.hypot(dx, dy);

  const scaled = scaledBy({ ...pose, scale: origin.scale }, distance / grabDistance);
  const delta = (Math.atan2(dy, dx) - Math.atan2(grabDy, grabDx)) * DEGREES;
  return rotatedBy({ ...scaled, rotation: origin.rotation }, delta);
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
