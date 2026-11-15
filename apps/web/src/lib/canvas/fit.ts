import type { CanvasScene } from './document';

/**
 * `fitScene` — l'AJUSTEMENT (aspect-fit, centré) partagé par le moteur de
 * scène (#6898, D-79) : la MÊME primitive sert au plafond d'une carte de fil
 * (`lib/feed/scene-framing.ts#cappedContentSize`), au cadre plein écran d'un
 * Réel, et à la vignette d'une mosaïque — une SEULE fonction, jamais
 * recopiée. Le rapport (`ratio` = largeur / hauteur) NE dépend PAS du mode du
 * player : `playerConfig` (`config.ts`) ne gouverne que le son, la boucle et
 * le chrome.
 *
 * Miroir `CanvasGeometry.aspectFitSize(in:ratio:)`
 * (`CanvasGeometry.swift:87-91`) — une SEULE échelle (`widthBound =
 * min(available.width, available.height × ratio)`), jamais deux ; le
 * CENTRAGE, que SwiftUI fait par son hôte, est ici rendu en `offsetX`/
 * `offsetY` pour que trente hôtes n'aient pas chacun à le recopier (#6901).
 */
export type ViewportSize = { readonly width: number; readonly height: number };

export type FittedBox = {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
};

export function fitScene(params: { readonly viewport: ViewportSize; readonly ratio: number }): FittedBox {
  const { viewport, ratio } = params;
  if (viewport.width <= 0 || viewport.height <= 0 || ratio <= 0) return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  const boxAspect = viewport.width / viewport.height;
  const size = ratio > boxAspect ? { width: viewport.width, height: viewport.width / ratio } : { width: viewport.height * ratio, height: viewport.height };
  return { ...size, offsetX: (viewport.width - size.width) / 2, offsetY: (viewport.height - size.height) / 2 };
}

/**
 * `CanvasGeometry.portraitRatio` (`CanvasGeometry.swift:13`) — le rapport
 * NATUREL d'une scène, DÉFINITIVEMENT 9:16 (décision porteur 2026-09-17,
 * #6896/#6904, D-80 : « 9:16 figé, jamais `carrierAspect` … ce lecteur naît
 * aligné »). `lib/feed/scene-framing.ts#SCENE_ASPECT` DOIT valoir la même
 * chose — gardé par `fit.test.ts` (`SCENE_RATIO === SCENE_ASPECT`) plutôt que
 * par un import croisé, qui bouclerait (`fit.ts` ↔ `scene-framing.ts`, cette
 * dernière important déjà `fitScene`).
 */
export const SCENE_RATIO = 9 / 16;

/**
 * `sceneRatio` — le rapport à PEINDRE (§ 1.4, § 9 Q2 de la spécification
 * `infra-1`). Ne lit PAS `scene.carrierAspect` : cette loi est PÉRIMÉE côté
 * iOS (décision porteur 2026-09-17) et `carrierAspect` reste une mémoire
 * d'édition, lue par personne côté rendu. Le paramètre est conservé pour que
 * l'API accepte une scène — jamais pour en tirer un rapport différent.
 */
export function sceneRatio(_scene: CanvasScene): number {
  return SCENE_RATIO;
}
