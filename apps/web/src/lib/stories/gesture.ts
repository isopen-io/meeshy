/**
 * LES GESTES DU LECTEUR — miroir de `StoryViewerView+Canvas.swift` (#5817,
 * D-1) : trois bandes horizontales, un tap court sur un BORD navigue, un
 * appui POSÉ met en pause, un déplacement n'est plus un tap.
 *
 * Loi PURE, sans DOM : le composant qui l'appelle mesure la fraction en x du
 * toucher (`clientX / rect.width`), le delta écoulé et le déplacement, et
 * cette fonction décide. Même discipline que `lib/stories/playback.ts`.
 */

/** `holdThresholdSeconds` (`StoryViewerView+Canvas.swift:19-33`), relevé de
 * 0,2 à 0,45 s : « un tap humain POSÉ dure 150 à 300 ms ». */
export const HOLD_THRESHOLD_MS = 450;

/** `dragSlopPixels` (`:19-33`) — au-delà, ce n'est plus un tap. */
export const DRAG_SLOP_PX = 24;

/** `StoryTapZone.edgeFraction` (`:486-503`) — 30 % de chaque côté ; la bande
 * centrale (40 %) ne navigue jamais, réservée au double-tap. */
export const EDGE_FRACTION = 0.3;

/** Fenêtre du double-tap central qui bascule pause/lecture (`decideDoubleTap`, `:632`). */
export const DOUBLE_TAP_WINDOW_MS = 300;

export type TapZone = 'previous' | 'center' | 'next';

/** `xFraction` ∈ [0, 1] — la position horizontale du toucher, en fraction de
 * la largeur du canevas. */
export function classifyTapZone(xFraction: number): TapZone {
  if (xFraction < EDGE_FRACTION) return 'previous';
  if (xFraction >= 1 - EDGE_FRACTION) return 'next';
  return 'center';
}

export function isHold(elapsedMs: number): boolean {
  return elapsedMs >= HOLD_THRESHOLD_MS;
}

export function isDrag(deltaPx: number): boolean {
  return Math.abs(deltaPx) > DRAG_SLOP_PX;
}

export function isDoubleTap(deltaMs: number): boolean {
  return deltaMs <= DOUBLE_TAP_WINDOW_MS;
}

export type TouchDownAction = 'resume' | 'none';

/**
 * `decideTouchDown` (`:579-587`) — touche-DOWN en pause sur un BORD reprend
 * la lecture (le relâchement suivant ne navigue pas, `resumeFromPause`) ; au
 * CENTRE, rien (réservé au double-tap).
 */
export function decideTouchDown(params: { readonly zone: TapZone; readonly isPaused: boolean }): TouchDownAction {
  if (!params.isPaused) return 'none';
  return params.zone === 'center' ? 'none' : 'resume';
}

export type TouchUpAction = 'previous' | 'next' | 'none';

/**
 * `decideTouchUp` (`:601-626`) — dans cet ordre : un appui qui tenait la
 * pause reste en pause ; un déplacement n'est plus un tap ; un appui aussi
 * long qu'une pause ne navigue pas (même sans avoir déclenché `holdActive`,
 * p.ex. l'appui vient tout juste de franchir le seuil) ; sinon la ZONE
 * décide.
 */
export function decideTouchUp(params: {
  readonly zone: TapZone;
  readonly holdActive: boolean;
  readonly moved: boolean;
  readonly elapsedMs: number;
}): TouchUpAction {
  if (params.holdActive) return 'none';
  if (params.moved) return 'none';
  if (isHold(params.elapsedMs)) return 'none';
  if (params.zone === 'previous') return 'previous';
  if (params.zone === 'next') return 'next';
  return 'none';
}
