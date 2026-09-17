/**
 * LA LOI D'IMMERSION DE LA VISIONNEUSE (#6221) — miroir PUR de
 * `StagePresentation.swift` (SDK) : `StageDoor` (`:9-13`), `StagePresentation`
 * (`:39-112`), `after(door)` (`:98-111`), `MediaStagePause.showsBadge`
 * (`:113-136`), `MediaStageGestures.resolveDrag` (`:145-155`),
 * `longPressArmed` (`:157-159`) — et les cotes de `ConversationMediaGalleryView
 * +Geometry.swift` / `ConversationMediaFilmstrip.swift`.
 */
import { fitScene, type ViewportSize } from '@/lib/canvas/fit';

/** `StageEntry` — la porte par laquelle le plateau change de présentation. */
export type StageDoor = 'tap' | 'longPress' | 'swipeUp';

export type StagePresentation =
  | { readonly kind: 'carded' }
  | { readonly kind: 'full'; readonly pausedOnEntry: boolean };

export const CARDED_STAGE: StagePresentation = { kind: 'carded' };

/**
 * `StagePresentation.after(door:)` — le tap BASCULE (carded ⇄ full, jamais
 * en pause), `longPress` entre TOUJOURS en plein cadre EN PAUSE (depuis les
 * deux états), `swipeUp` n'entre qu'UNE fois depuis `carded` — identité
 * depuis `full`.
 */
export function stageAfter(presentation: StagePresentation, door: StageDoor): StagePresentation {
  switch (door) {
    case 'tap':
      return presentation.kind === 'carded' ? { kind: 'full', pausedOnEntry: false } : CARDED_STAGE;
    case 'longPress':
      return { kind: 'full', pausedOnEntry: true };
    case 'swipeUp':
      return presentation.kind === 'carded' ? { kind: 'full', pausedOnEntry: false } : presentation;
    default:
      return presentation;
  }
}

export type StageDragVerdict = 'entersFull' | 'follows' | 'dismisses' | 'ignored';

/**
 * `MediaStageGestures.resolveDrag` — dominance VERTICALE d'abord (`|dy| >
 * |dx|`, sinon `ignored` : un balayage surtout horizontal ne doit jamais être
 * lu comme une fermeture). Puis, SEULEMENT depuis `carded`, un glissement
 * vers le HAUT au-delà du seuil entre en plein cadre ; un glissement vers le
 * BAS au-delà du seuil ferme, DEPUIS N'IMPORTE QUEL état ; entre les deux,
 * le plateau SUIT le doigt sans trancher.
 */
export function resolveStageDrag(params: {
  readonly dx: number;
  readonly dy: number;
  readonly presentation: StagePresentation;
  readonly threshold: number;
}): StageDragVerdict {
  const { dx, dy, presentation, threshold } = params;
  if (Math.abs(dy) <= Math.abs(dx)) return 'ignored';
  if (dy <= -threshold && presentation.kind !== 'full') return 'entersFull';
  if (dy >= threshold) return 'dismisses';
  return 'follows';
}

/**
 * `MediaStageGestures.longPressArmed` — l'appui long n'ouvre le plein cadre
 * que si la page est ACTIVE (la fenêtre de rendu, `prefetchRange`) et n'est
 * PAS déjà sous transformation (zoom/pan en cours) : un pincement en cours ne
 * doit jamais être interrompu par un minuteur d'appui long qui arrive à
 * échéance.
 */
export const longPressArmed = (isActive: boolean, isTransformed: boolean): boolean => isActive && !isTransformed;

/**
 * `MediaStagePause.showsBadge` — la pastille « En pause » ne se pose QUE sur
 * une entrée par appui long (`pausedOnEntry`), sur un média LISIBLE (jamais
 * une photo), et seulement tant qu'il ne joue PAS déjà.
 */
export const showsPausedBadge = (presentation: StagePresentation, playable: boolean, playing: boolean): boolean =>
  presentation.kind === 'full' && presentation.pausedOnEntry && playable && !playing;

/** `ConversationMediaGalleryView+Rules.swift` — la fenêtre de rendu ±1 page. */
export const RENDER_WINDOW_RADIUS = 1;

/** Une page dans la fenêtre ±1 rend ses pixels PLEINS ; hors fenêtre, le fond ThumbHash seul. */
export const rendersFullPixels = (distance: number): boolean => Math.abs(distance) <= RENDER_WINDOW_RADIUS;

/**
 * `[start, end]` — la plage d'index à PRÉCHARGER autour de `index`, bornée à
 * `[0, count-1]`. `null` quand `count` ne porte aucune page.
 */
export function prefetchRange(index: number, count: number): readonly [number, number] | null {
  if (count <= 0) return null;
  const start = Math.max(0, index - RENDER_WINDOW_RADIUS);
  const end = Math.min(count - 1, index + RENDER_WINDOW_RADIUS);
  return [start, end];
}

/**
 * `fullStageBox` (#6902, revue-correction) — LA BOÎTE D'UNE PAGE QUI PREND LE
 * VIEWPORT ENTIER, rendue dans le repère de SA PAGE (le plateau, RÉDUIT par
 * les couloirs). Miroir `MediaStageFraming.full`
 * (`MediaStageFraming.swift:162-190` : `frame = viewport`, `media =
 * aspectFit(ratio, in: viewport)`, coins 0) — une SEULE échelle, JAMAIS de
 * rognage (`:235-246`), donc des bandes assumées même sur une scène 9:16.
 *
 * **POURQUOI UN DÉCALAGE, ET JAMAIS `position: fixed`.** Le plateau reçoit un
 * `transform` pendant un glissement de fermeture (`media-viewer.tsx#
 * onPointerMove`), et un ancêtre TRANSFORMÉ devient le bloc conteneur de tout
 * descendant `fixed` : mesuré sur la première forme de #6902, la boîte passait
 * de 390 × 693 à 371 × 660 et remontait de 16 px dès le PREMIER pixel de
 * glissement — puis revenait d'un coup au relâchement. Une page restée EN FLUX
 * suit le doigt SANS changer de taille, ce que le geste veut.
 *
 * `topInset` est le haut de la page dans le repère du viewport (la hauteur du
 * couloir haut) : le décalage vertical rendu est donc `offsetY − topInset`,
 * et le centre de la boîte retombe au centre du VIEWPORT, jamais au centre de
 * la région entre couloirs (le critère de #6902, ±1 px).
 */
export type FullStageBox = {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
};

export function fullStageBox(params: {
  readonly viewport: ViewportSize;
  readonly ratio: number;
  readonly topInset: number;
}): FullStageBox {
  const { viewport, ratio, topInset } = params;
  const box = fitScene({ viewport, ratio });
  return { width: box.width, height: box.height, left: box.offsetX, top: box.offsetY - topInset };
}

/** `+Geometry.swift` — la géométrie du CHROME de la visionneuse. */
export const STAGE = {
  topCorridorHeight: 56,
  gutter: 12,
  cornerRadius: 22,
  overlayHeight: 110,
} as const;

/** `+Pages.swift:73` — le seuil (px) d'un glissement de plateau qui ferme/entre en plein cadre. */
export const DISMISS_THRESHOLD = 150;
/** `+Pages.swift:72` — le zoom maximal d'une page image. */
export const MAX_SCALE = 5;
/** `+Pages.swift` — la cible du double-tap (`committedScale > 1 ? 1 : 2.5`). */
export const DOUBLE_TAP_SCALE = 2.5;

/** `ConversationMediaFilmstrip.FilmstripMetrics` — les cinq cotes de la pellicule. */
export const FILMSTRIP = {
  itemSide: 54,
  spacing: 6,
  verticalPadding: 10,
  bottomPadding: 6,
  trailingInset: 12,
} as const;

/** Le pas d'un défilement d'une vignette à la suivante. */
const FILMSTRIP_STEP = FILMSTRIP.itemSide + FILMSTRIP.spacing;

/** `reservedHeight = itemSide + 2×verticalPadding + bottomPadding = 54+20+6 = 80`. */
export const FILMSTRIP_RESERVED_HEIGHT =
  FILMSTRIP.itemSide + FILMSTRIP.verticalPadding * 2 + FILMSTRIP.bottomPadding;

/** La marge de tête, côté GAUCHE, pour que la tête de lecture reste au bord DROIT. */
export const filmstripLeadingInset = (viewportWidth: number): number =>
  Math.max(0, viewportWidth - FILMSTRIP.itemSide - FILMSTRIP.trailingInset);

/** Le défilement (px) à appliquer pour amener la vignette `index` à la tête de lecture. */
export const filmstripScrollOffset = (index: number): number => index * FILMSTRIP_STEP;

/** L'index de la vignette la plus proche de la tête de lecture pour un défilement donné. */
export function filmstripIndexAtPlayhead(scrollOffset: number, count: number): number {
  if (count <= 0) return 0;
  const raw = Math.round(scrollOffset / FILMSTRIP_STEP);
  return Math.min(count - 1, Math.max(0, raw));
}

/** Le défilement maximal — toujours un multiple du pas (`FilmstripMetricsTests`, côté iOS). */
export function filmstripMaxScrollOffset(count: number, viewportWidth: number): number {
  void viewportWidth;
  return Math.max(0, (count - 1) * FILMSTRIP_STEP);
}
