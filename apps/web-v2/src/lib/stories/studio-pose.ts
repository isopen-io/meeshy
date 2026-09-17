/**
 * **LA POSE D'UN OBJET POSÉ SUR LA SCÈNE** (#6943) — l'ancre normalisée, son
 * échelle et sa rotation, telles que `CanvasV3` les porte : `anchor.{x,y}` sur
 * l'enveloppe, `transform.{scale,rotation}` à côté. Le moteur les APPLIQUE
 * déjà (`scene-object-frame.tsx` écrit `rotate()/scale()` depuis
 * `objectPose`) ; ce qui manquait était de quoi les ÉCRIRE.
 *
 * Les bornes sont celles d'iOS, jamais réinventées :
 *  - `SceneObjectScalePolicy` (`packages/MeeshySDK/.../SceneObjectScalePolicy.swift:33-60`)
 *    — `minScale 0.3`, `maxScale 4.0`, et une échelle NULLE ou non finie
 *    ramenée à **1**, pas à la borne basse : une valeur absurde est une
 *    donnée manquante, pas un objet minuscule ;
 *  - l'ancre reste dans `[0,1]` (`StoryCanvasUIView+Gestures.swift:380-394`) —
 *    un objet ne se perd jamais hors cadre, d'où l'auteur ne pourrait plus le
 *    reprendre ;
 *  - **la rotation n'a AUCUNE borne angulaire** sur iOS, mais elle se ramène
 *    ici dans `(−180, 180]` : c'est la même orientation, et deux tours de
 *    doigt ne doivent pas graver `720` dans un document que trois clients
 *    relisent.
 *
 * Module PUR : aucune dépendance au DOM ni à React. Le geste (pointeur,
 * clavier) l'appelle, il ne l'implémente pas.
 */
export type StudioPose = {
  /** Fraction de la LARGEUR de la scène, 0 à gauche, 1 à droite. */
  readonly x: number;
  /** Fraction de la HAUTEUR de la scène, 0 en haut, 1 en bas. */
  readonly y: number;
  readonly scale: number;
  /** Degrés, comme `transform.rotation` du fil (jamais des radians). */
  readonly rotation: number;
};

export const SCALE_MIN = 0.3;
export const SCALE_MAX = 4;

export const IDENTITY_POSE: StudioPose = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);

const clampScale = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
};

/** `(−180, 180]` — `180` reste `180`, jamais `−180` : les deux dessinent la
 * même chose, mais l'auteur qui a poussé le curseur au bout voit sa valeur. */
const normalizeRotation = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
};

export function clampPose(pose: StudioPose): StudioPose {
  return { x: clamp01(pose.x), y: clamp01(pose.y), scale: clampScale(pose.scale), rotation: normalizeRotation(pose.rotation) };
}

/** @param dx, dy en FRACTION de scène — le geste convertit ses pixels par la
 * taille du plateau, jamais l'inverse : la loi ignore la taille de l'écran. */
export function movedBy(pose: StudioPose, dx: number, dy: number): StudioPose {
  return clampPose({ ...pose, x: pose.x + dx, y: pose.y + dy });
}

/** MULTIPLICATIF : un pincement COMPOSE avec l'échelle en place, il ne la
 * remplace pas — sans quoi reprendre un objet déjà agrandi le ferait sauter. */
export function scaledBy(pose: StudioPose, factor: number): StudioPose {
  return clampPose({ ...pose, scale: Number.isFinite(factor) && factor > 0 ? pose.scale * factor : pose.scale });
}

export function rotatedBy(pose: StudioPose, degrees: number): StudioPose {
  return clampPose({ ...pose, rotation: pose.rotation + (Number.isFinite(degrees) ? degrees : 0) });
}
