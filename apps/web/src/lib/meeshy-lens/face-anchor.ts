import type { LensLayer } from '@meeshy/shared/types/lens-format';

import type { Box, Point } from '@/lib/calls/face-effects';

/**
 * **LES POINTS NOMMÉS DU VISAGE, SUR LA BOÎTE** (W14, #11320) — le contrat
 * MeeshyLens v1 (`packages/shared/types/lens-format.ts`) ancre une couche à un
 * point NOMMÉ du visage ; chaque plateforme le fait correspondre à SES repères.
 * Le web n'a que la BOÎTE du visage (`FaceDetector`, `face-tracker.ts`) : chaque
 * point y est une position fixe, en fractions de la boîte, sur un visage de face.
 *
 * Les côtés sont ceux de la PERSONNE, sur l'image envoyée, qui n'est jamais en
 * miroir : son œil gauche est à DROITE de l'image (x > 0,5).
 *
 * Une ancre d'ÉCRAN est en fractions de l'image ; une ancre de VISAGE est
 * décalée de `dx`, `dy` largeurs de visage.
 */
export type LensAnchor = Extract<LensLayer, { readonly kind: 'sticker' }>['anchor'];

export type LensFacePoint = Extract<LensAnchor, { readonly type: 'face' }>['point'];

export type FrameSize = { readonly width: number; readonly height: number };

const FACE_POINT_FRACTIONS: Readonly<Record<LensFacePoint, readonly [number, number]>> = {
  'top-of-head': [0.5, -0.12],
  forehead: [0.5, 0.18],
  'left-eyebrow': [0.67, 0.3],
  'right-eyebrow': [0.33, 0.3],
  'left-eye': [0.67, 0.4],
  'right-eye': [0.33, 0.4],
  'nose-tip': [0.5, 0.6],
  mouth: [0.5, 0.78],
  chin: [0.5, 0.98],
  'left-cheek': [0.75, 0.65],
  'right-cheek': [0.25, 0.65],
  'left-ear': [1, 0.48],
  'right-ear': [0, 0.48],
};

export function facePointOf(point: LensFacePoint, face: Box): Point {
  const [fx, fy] = FACE_POINT_FRACTIONS[point];
  return { x: face.x + fx * face.width, y: face.y + fy * face.height };
}

/** Le point de l'image où se pose une ancre. */
export function anchorPointOf(anchor: LensAnchor, frame: FrameSize, face: Box): Point {
  if (anchor.type === 'screen') return { x: anchor.x * frame.width, y: anchor.y * frame.height };
  const at = facePointOf(anchor.point, face);
  return { x: at.x + (anchor.dx ?? 0) * face.width, y: at.y + (anchor.dy ?? 0) * face.width };
}

/** L'unité de taille d'une ancre : la largeur du visage pour une ancre de visage, le petit côté de l'image sinon. */
export const anchorScaleOf = (anchor: LensAnchor, frame: FrameSize, face: Box): number =>
  anchor.type === 'face' ? face.width : Math.min(frame.width, frame.height);
