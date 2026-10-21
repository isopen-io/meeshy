import type { ConversationFlags } from '@/lib/api/preferences';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { rowMenuItems, type RowActionId, type RowMenuItem } from './row-actions';
import { swipeEngages } from './swipe';

/**
 * **LA LOI DU BALAYAGE D'UNE LIGNE DE CONVERSATION** (#10580) — miroir de
 * `SwipeableRow` (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/SwipeableRow.swift`)
 * et des couples que `ConversationListView.swift` lui remet. Aucun DOM ici.
 *
 * - bord de DÉBUT (balayage dans le sens de lecture) : épingler, sourdine ;
 * - bord de FIN : archiver, lu / non lu, supprimer ;
 * - `ROW_SWIPE_MAX_ACTIONS` par côté, jamais plus.
 *
 * Les actions SONT celles du menu de la ligne (`rowMenuItems`) : même id, même
 * libellé, même glyphe, mêmes conditions (archive imposée, compte requis pour
 * supprimer). Cette loi ne fait que les RANGER par bord.
 *
 * Un décalage est lu dans le SENS DE LECTURE : positif ⇒ le bord de début est
 * révélé, négatif ⇒ le bord de fin.
 */
export const ROW_SWIPE_MAX_ACTIONS = 3;
export const ROW_SWIPE_CELL = 76;
export const ROW_SWIPE_RUBBER_BAND = 0.18;
export const ROW_SWIPE_SNAP_FRACTION = 0.35;
/** En px/s, dans le sens de lecture. */
export const ROW_SWIPE_SNAP_VELOCITY = 450;
const FLICK_OPEN_DISTANCE = 20;
const FLICK_CLOSE_DISTANCE = 10;

export type RowSwipeEdge = 'leading' | 'trailing';

/** Dans l'ordre depuis le BORD : la première est la première révélée. */
export const ROW_SWIPE_EDGES: Readonly<Record<RowSwipeEdge, readonly RowActionId[]>> = {
  leading: ['pin', 'mute'],
  trailing: ['archive', 'read', 'delete'],
};

export type RowSwipeSides = Readonly<Record<RowSwipeEdge, readonly RowMenuItem[]>>;

export function conversationRowSwipeSides(params: {
  readonly flags: ConversationFlags;
  readonly unread: boolean;
  readonly language: InterfaceLanguage;
  readonly canDelete: boolean;
}): RowSwipeSides {
  const menu = rowMenuItems(params);
  const side = (edge: RowSwipeEdge): readonly RowMenuItem[] =>
    ROW_SWIPE_EDGES[edge]
      .flatMap((id) => menu.filter((item) => item.id === id))
      .slice(0, ROW_SWIPE_MAX_ACTIONS);
  return { leading: side('leading'), trailing: side('trailing') };
}

export type RowSwipeWidths = Readonly<Record<RowSwipeEdge, number>>;

export function rowSwipeWidths(sides: RowSwipeSides): RowSwipeWidths {
  return { leading: sides.leading.length * ROW_SWIPE_CELL, trailing: sides.trailing.length * ROW_SWIPE_CELL };
}

/**
 * Un glissé HORIZONTAL FRANC — la loi du dépôt (`swipeEngages`, 3:1 au-delà de
 * 22 px), pas une seconde : sinon le geste appartient au défilement et au
 * tirer-pour-rafraîchir.
 */
export function rowSwipeEngages(dx: number, dy: number): boolean {
  return swipeEngages(dx, dy, 'normal');
}

const banded = (distance: number, zone: number): number =>
  distance <= zone ? distance : zone + (distance - zone) * ROW_SWIPE_RUBBER_BAND;

/** Le décalage à peindre : 1:1 dans la zone d'actions, élastique au-delà. */
export function rowSwipeOffset(params: { readonly base: number; readonly dx: number; readonly widths: RowSwipeWidths }): number {
  const { base, dx, widths } = params;
  const raw = base + dx;
  if (raw === 0) return 0;
  const zone = raw > 0 ? widths.leading : widths.trailing;
  if (zone === 0) return dx * ROW_SWIPE_RUBBER_BAND;
  return Math.sign(raw) * banded(Math.abs(raw), zone);
}

/**
 * Où la ligne se pose quand le doigt se lève : `0` (fermée), la largeur du
 * bord de début, ou l'opposé de celle du bord de fin. `dx` et `velocity` sont
 * lus dans le sens de lecture.
 */
export function rowSwipeSettle(params: {
  readonly base: number;
  readonly dx: number;
  readonly velocity: number;
  readonly widths: RowSwipeWidths;
}): number {
  const { base, dx, velocity, widths } = params;
  if (base !== 0) {
    const closing = -Math.sign(base) * dx;
    const closingVelocity = -Math.sign(base) * velocity;
    const closes =
      closing > Math.abs(base) * ROW_SWIPE_SNAP_FRACTION || (closing > FLICK_CLOSE_DISTANCE && closingVelocity > ROW_SWIPE_SNAP_VELOCITY);
    return closes ? 0 : base;
  }
  const opens = (distance: number, speed: number, zone: number): boolean =>
    zone > 0 && (distance > zone * ROW_SWIPE_SNAP_FRACTION || (distance > FLICK_OPEN_DISTANCE && speed > ROW_SWIPE_SNAP_VELOCITY));
  if (opens(dx, velocity, widths.leading)) return widths.leading;
  if (opens(-dx, -velocity, widths.trailing)) return -widths.trailing;
  return 0;
}

/** Les trois propriétés personnalisées d'une image du balayage (#11314). */
export type RowSwipePaint = {
  /** Le déplacement physique du contenu, signé. */
  readonly swipe: string;
  /** La largeur découverte, toujours positive. */
  readonly reveal: string;
  /** Où le conteneur d'actions attend hors de la ligne : `-100%` à gauche, `100%` à droite. `null` à l'arrêt : il garde le côté qu'il avait. */
  readonly hide: string | null;
};

/**
 * Le décalage voyage en `translate` : le conteneur d'actions occupe la largeur
 * de la ligne, attend HORS d'elle (`hide`) et glisse de `swipe` — jamais une
 * largeur qui change. Le côté se lit au signe PHYSIQUE du déplacement
 * (`offset × sign`, `sign` valant −1 en RTL) ; à zéro il ne change pas, pour que
 * la fermeture glisse vers le bord d'où l'ouverture est venue.
 */
export function rowSwipePaint({ offset, sign }: { readonly offset: number; readonly sign: 1 | -1 }): RowSwipePaint {
  const physical = offset * sign;
  return {
    swipe: `${physical}px`,
    reveal: `${Math.abs(offset)}px`,
    hide: physical === 0 ? null : physical > 0 ? '-100%' : '100%',
  };
}
