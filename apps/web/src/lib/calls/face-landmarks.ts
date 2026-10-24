import type { DeviceTier } from '../device/capability-tier';

import type { Box } from './face-effects';

/**
 * **LES 478 POINTS DU VISAGE** (W15, #11321) — ce que lit MediaPipe Face
 * Landmarker (`face-landmarker.ts`, chargé à la demande) là où le navigateur ne
 * rend qu'une boîte (`FaceDetector`). Les points sont NORMALISÉS à l'image que
 * le modèle a lue : ils ne dépendent d'aucune échelle, comme le visage « en
 * coordonnées unitaires » d'iOS (`CallFaceTracker`), et suivent un changement
 * de résolution sans attendre la lecture suivante.
 *
 * Ce module est LÉGER (aucune dépendance de MediaPipe) : le détecteur (`face-landmark-detector.ts`) et les
 * lens le lisent, le modèle vit dans son chunk.
 */
export const FACE_LANDMARK_COUNT = 478;

export type FaceLandmark = { readonly x: number; readonly y: number; readonly z: number };

export type FaceLandmarks = readonly FaceLandmark[];

/**
 * Le PALIER A : seuls les appareils `high` et `pro` lisent les points. Le
 * modèle pèse ~3,7 Mo de plus à télécharger et une lecture WebAssembly par
 * image suivie ; `low` et `mid` gardent le détecteur du navigateur, ou la boîte
 * supposée — la lens se joue partout, seule la précision change.
 */
export const landmarksTierAllows = (tier: DeviceTier): boolean => tier === 'high' || tier === 'pro';

/** La boîte qui englobe les points, en pixels d'une image de `size` ; `null` sans point ou sans surface. */
export function landmarksBox(points: FaceLandmarks, size: { readonly width: number; readonly height: number }): Box | null {
  if (points.length === 0 || size.width <= 0 || size.height <= 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left * size.width, y: top * size.height, width: (Math.max(...xs) - left) * size.width, height: (Math.max(...ys) - top) * size.height };
}
