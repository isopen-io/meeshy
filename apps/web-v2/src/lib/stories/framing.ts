import { fitScene } from '@/lib/canvas/fit';
import { SCENE_ASPECT } from '@/lib/feed/scene-framing';

/**
 * LE PLATEAU DU LECTEUR DE STORY (#6899) — `StoryCanvasFraming.resolve`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift:180-275`)
 * avec les cotes de `readerCanvasFraming` (`StoryViewerView+Canvas.swift:1183-1201`).
 *
 * **La scène garde ses bornes INTRINSÈQUES** — l'ajustement 9:16 du viewport
 * entier (`canvasFitSize`). La carte n'est qu'une ÉCHELLE et un DÉCALAGE
 * vertical posés par-dessus : c'est ce qui laisse l'appui long passer en plein
 * bord (`.free`) par une transformation du compositeur, sans re-mesurer la
 * scène ni recalculer son verdict d'image seule (calculé dans les bornes
 * intrinsèques, qui ne bougent pas).
 *
 * **9:16 figé** : décision porteur du 2026-09-17 sur #6896 — « la scène est
 * toujours 9:16 », `carrierAspect` n'est qu'une mémoire d'édition. Le
 * `readerCanvasRatio` d'iOS (13/09) en dérive encore et se réaligne par #6904 ;
 * ce lecteur naît déjà aligné.
 *
 * L'alignement vertical est `center` (`StageChromeAlignment.verticalAlignment`,
 * directive du 2026-09-15 « ce qui est construit se pose sur le plateau au
 * milieu »). La session plein écran `.immersive` est hors tranche.
 */

/** `headerInset: topInset + 72` — barres de progression + ligne auteur + gap. */
export const READER_HEADER_INSET = 72;
/** `bottomInset: 64`. */
export const READER_BOTTOM_INSET = 64;
/** `sideInset: 8`, de chaque côté. */
export const READER_SIDE_INSET = 8;
/** `cardedCornerRadius: 22`. */
export const READER_CARD_CORNER_RADIUS = 22;

/** Le fond flou plein écran (`storyBlurredBackdrop`,
 * `StoryViewerView+Canvas.swift:2091-2099`) : `.blur(radius: 60)`,
 * `.scaleEffect(1.18)`, `.opacity(0.85)`. */
export const READER_BACKDROP_BLUR = 60;
export const READER_BACKDROP_SCALE = 1.18;
export const READER_BACKDROP_OPACITY = 0.85;

export type ReaderPresentation = 'carded' | 'free';

export type ReaderCardFraming = {
  /** Les bornes intrinsèques de la scène, dans le repère du viewport. */
  readonly canvas: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly scale: number;
  readonly offsetY: number;
  /** Le rayon À POSER sur le calque NON mis à l'échelle — `22 / scale`, pour
   * rendre 22 à l'écran (`StoryReaderCardShape.unscaledCornerRadius`). */
  readonly cornerRadius: number;
};

export function readerCardFraming(params: {
  readonly viewport: { readonly width: number; readonly height: number };
  /** La zone sûre haute, en pixels (`--safe-top`) — `topInset` côté iOS. */
  readonly safeTop: number;
  readonly presentation: ReaderPresentation;
}): ReaderCardFraming {
  const { viewport, safeTop, presentation } = params;
  const size = fitScene({ viewport, ratio: SCENE_ASPECT });
  // Le CENTRAGE vient de `fitScene` (`offsetX`/`offsetY`, #6901) — c'est
  // précisément pour ne pas le recopier ici que la primitive le rend
  // (revue-correction #6901 : le lot avait ajouté les deux champs et laissé
  // ce seul appelant les recalculer, une ligne plus bas).
  const canvas = { x: size.offsetX, y: size.offsetY, width: size.width, height: size.height };
  const identity: ReaderCardFraming = { canvas, scale: 1, offsetY: 0, cornerRadius: 0 };
  if (presentation === 'free' || size.width <= 0 || size.height <= 0) return identity;

  const regionTop = Math.max(0, safeTop + READER_HEADER_INSET);
  const regionBottom = Math.max(regionTop, viewport.height - READER_BOTTOM_INSET);
  const region = { width: Math.max(0, viewport.width - 2 * READER_SIDE_INSET), height: regionBottom - regionTop };
  if (region.width <= 0 || region.height <= 0) return identity;

  const card = fitScene({ viewport: region, ratio: SCENE_ASPECT });
  const scale = Math.min(1, Math.max(0, card.height / size.height));
  if (scale <= 0) return identity;
  const offsetY = regionTop + region.height / 2 - viewport.height / 2;
  return { canvas, scale, offsetY, cornerRadius: READER_CARD_CORNER_RADIUS / scale };
}
