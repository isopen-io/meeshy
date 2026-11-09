/**
 * LA LOI DE L'APERÇU TENU (#17243) — la carte d'une conversation tenue et son
 * menu se partagent la hauteur de l'écran par UNE progression, de 0 (le menu
 * compact : sa poignée et sa tête) à 1 (toutes les actions). Au repos la carte
 * prend la plus grande part ; tirer le menu vers le haut le fait grandir, et
 * la carte rend exactement ce qu'il prend. Deux crans, compact et étendu :
 * relâcher conclut vers le plus proche, ou vers celui que la vélocité désigne.
 *
 * Pure, sans DOM : le geste (`conversation-peek-cluster.tsx`) l'interroge à
 * chaque image et écrit ses deux hauteurs sans repasser par un rendu.
 */

export type PeekDetent = 'compact' | 'expanded';

/** Qui a ouvert l'aperçu : l'appui long, le clic droit, ou la touche menu. */
export type PeekOrigin = 'press' | 'pointer' | 'keyboard';

/** La tête du menu : les trois premières actions, comme la tête compacte d'iOS. */
export const PEEK_COMPACT_ROWS = 3;
export const PEEK_ROW_HEIGHT = 44;
/** La poignée de tirage : une cible de 44 de haut, sa capsule au centre. */
export const PEEK_HANDLE_HEIGHT = 44;
/** Le rembourrage et la bordure du menu, haut et bas confondus. */
export const PEEK_MENU_CHROME = 10;
export const PEEK_SIDE = 12;
export const PEEK_GAP = 8;
export const PEEK_MAX_WIDTH = 560;
export const PEEK_MAX_HEIGHT = 880;
/** L'en-tête de la carte et une rangée : ce que la carte garde, toujours. */
export const PEEK_CARD_MIN = 120;
/** Au-delà de cette vitesse (px/ms), le relâcher suit le sens du geste. */
export const PEEK_SETTLE_VELOCITY = 0.5;

type Insets = { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };

export type PeekSheetFrameInput = {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly safe: Insets;
  readonly itemCount: number;
};

export type PeekSheetFrame = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly gap: number;
  readonly cardMin: number;
  readonly menuCompact: number;
  readonly menuExpanded: number;
};

export type PeekSheetHeights = { readonly card: number; readonly menu: number };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const menuHeightFor = (rows: number): number => PEEK_HANDLE_HEIGHT + rows * PEEK_ROW_HEIGHT + PEEK_MENU_CHROME;

export function peekSheetFrame({ viewport, safe, itemCount }: PeekSheetFrameInput): PeekSheetFrame {
  const innerWidth = Math.max(0, viewport.width - safe.left - safe.right - 2 * PEEK_SIDE);
  const width = Math.min(PEEK_MAX_WIDTH, innerWidth);
  const left = safe.left + PEEK_SIDE + (innerWidth - width) / 2;
  const innerHeight = Math.max(0, viewport.height - safe.top - safe.bottom - 2 * PEEK_SIDE);
  const height = Math.min(PEEK_MAX_HEIGHT, innerHeight);
  const top = safe.top + PEEK_SIDE + (innerHeight - height) / 2;
  const menuRoom = Math.max(0, height - PEEK_GAP - PEEK_CARD_MIN);
  const menuExpanded = Math.min(menuHeightFor(itemCount), menuRoom);
  const menuCompact = Math.min(menuHeightFor(Math.min(PEEK_COMPACT_ROWS, itemCount)), menuExpanded);
  return { top, left, width, height, gap: PEEK_GAP, cardMin: PEEK_CARD_MIN, menuCompact, menuExpanded };
}

export function peekSheetHeights(frame: PeekSheetFrame, progress: number): PeekSheetHeights {
  const menu = frame.menuCompact + (frame.menuExpanded - frame.menuCompact) * clamp01(progress);
  return { card: frame.height - frame.gap - menu, menu };
}

/** `dy` positif : le doigt descend. Tirer vers le haut de toute la course mène de 0 à 1. */
export function progressAfterDrag({ frame, from, dy }: { readonly frame: PeekSheetFrame; readonly from: number; readonly dy: number }): number {
  const travel = frame.menuExpanded - frame.menuCompact;
  if (travel <= 0) return from;
  return clamp01(from - dy / travel);
}

/** `velocity` en px/ms, positive vers le bas. */
export function settleDetent({ progress, velocity }: { readonly progress: number; readonly velocity: number }): PeekDetent {
  if (velocity <= -PEEK_SETTLE_VELOCITY) return 'expanded';
  if (velocity >= PEEK_SETTLE_VELOCITY) return 'compact';
  return progress >= 0.5 ? 'expanded' : 'compact';
}

export function detentProgress(detent: PeekDetent): 0 | 1 {
  return detent === 'expanded' ? 1 : 0;
}

/**
 * Sans geste possible ou souhaité — ouvert au clavier, sous « Réduire les
 * animations », ou un menu qui tient dans sa tête — toutes les actions sont
 * là dès l'ouverture.
 */
export function initialDetent({ frame, reducedMotion, origin }: { readonly frame: PeekSheetFrame; readonly reducedMotion: boolean; readonly origin: PeekOrigin }): PeekDetent {
  if (reducedMotion || origin === 'keyboard') return 'expanded';
  return frame.menuExpanded > frame.menuCompact ? 'compact' : 'expanded';
}

/** La poignée est un bouton : Entrée et Espace basculent, les flèches choisissent. */
export function detentAfterKey(detent: PeekDetent, key: string): PeekDetent | null {
  if (key === 'Enter' || key === ' ') return detent === 'expanded' ? 'compact' : 'expanded';
  if (key === 'ArrowUp') return 'expanded';
  if (key === 'ArrowDown') return 'compact';
  return null;
}
