import { useEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  PEEK_COMPACT_ROWS,
  detentAfterKey,
  detentProgress,
  peekSheetHeights,
  peekSheetOffsets,
  progressAfterDrag,
  settleDetent,
  type PeekDetent,
  type PeekSheetFrame,
} from '@/lib/view/peek-sheet';
import { swallowNextClick } from '@/lib/view/swallow-next-click';

/**
 * LA GRAPPE DE L'APPUI LONG (#11211, #17243) — la carte d'aperçu, GRANDE, au-
 * dessus d'un menu COMPACT (sa poignée et sa tête) qu'on tire vers le haut pour
 * voir toutes les actions ; la carte rend ce que le menu prend
 * (`peek-sheet.ts`, la loi). Le geste suit le doigt par TRANSFORMATIONS
 * seulement : la carte garde sa hauteur de repos, le menu sa hauteur étendue,
 * et chaque `pointermove` écrit DIRECTEMENT sur le DOM la translation du menu
 * et le décalage du contenu (`--peek-shift`) — ni rendu Preact, ni remise en
 * page. Le relâcher conclut vers un cran, et seul ce cran passe par l'état.
 *
 * Sans le geste, tout reste atteignable : la poignée est un bouton (Entrée,
 * Espace, flèches), une action cachée qui reçoit le focus étend le menu, et
 * l'ouverture au clavier ou sous « Réduire les animations » est déjà étendue
 * (`initialDetent`).
 */

/** Au-delà de ce déplacement, l'appui sur le menu devient un tirage. */
const DRAG_SLOP_PX = 6;
/** La vélocité du relâcher se lit sur les 100 dernières ms du geste. */
const VELOCITY_WINDOW_MS = 100;

type Sample = { readonly t: number; readonly y: number };

type Drag = {
  readonly pointerId: number;
  readonly startY: number;
  readonly from: number;
  readonly fromHandle: boolean;
  moving: boolean;
  progress: number;
  samples: Sample[];
};

export type ConversationPeekClusterProps = {
  readonly frame: PeekSheetFrame;
  readonly initial: PeekDetent;
  readonly language: InterfaceLanguage;
  /** La couche modale ENTIÈRE est le `menuRef` de `useRovingMenu` : un appui dedans n'est pas un appui dehors. */
  readonly rootRef: MutableRefObject<HTMLDivElement | null>;
  readonly ids: string;
  readonly menuLabel: string;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  readonly onDismiss: () => void;
  /** Le retour matériel, monté dans le portail. */
  readonly backDismiss: ReactNode;
  /** La carte, à la hauteur que le cran courant lui donne. */
  readonly renderCard: (maxHeight: number) => ReactNode;
  /** Les entrées du menu, inchangées : le catalogue et leurs effets ne dépendent pas du cran. */
  readonly children: ReactNode;
};

export function ConversationPeekCluster({ frame, initial, language, rootRef, ids, menuLabel, onKeyDown, onDismiss, backDismiss, renderCard, children }: ConversationPeekClusterProps) {
  const [detent, setDetent] = useState<PeekDetent>(initial);
  const rest = peekSheetHeights(frame, 0);
  const offsets = peekSheetOffsets(frame, detentProgress(detent));
  const slotRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const detachSwallow = useRef<(() => void) | null>(null);
  const travels = frame.menuExpanded > frame.menuCompact;
  const expanded = detent === 'expanded';
  /** Étendu et plus haut que l'écran, le menu défile au doigt : seul la poignée tire alors. */
  const listScrolls = expanded && frame.menuOverflows;

  useEffect(() => () => detachSwallow.current?.(), []);

  const paint = (progress: number) => {
    const next = peekSheetOffsets(frame, progress);
    slotRef.current?.style.setProperty('--peek-shift', `${next.content}px`);
    if (sheetRef.current !== null) sheetRef.current.style.transform = `translateY(${next.sheet}px)`;
  };

  const conclude = (next: PeekDetent) => {
    sheetRef.current?.removeAttribute('data-peek-dragging');
    paint(detentProgress(next));
    setDetent(next);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!travels || event.button !== 0) return;
    const fromHandle = (event.target as Element).closest('[data-peek-handle]') !== null;
    if (listScrolls && !fromHandle) return;
    const progress = detentProgress(detent);
    drag.current = { pointerId: event.pointerId, startY: event.clientY, from: progress, fromHandle, moving: false, progress, samples: [{ t: event.timeStamp, y: event.clientY }] };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    const dy = event.clientY - current.startY;
    if (!current.moving) {
      if (Math.abs(dy) < DRAG_SLOP_PX) return;
      current.moving = true;
      sheetRef.current?.setAttribute('data-peek-dragging', '');
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* Un pointeur déjà relâché ne se capture pas : le geste continue sans. */
      }
    }
    current.samples = [...current.samples.filter((sample) => event.timeStamp - sample.t <= VELOCITY_WINDOW_MS), { t: event.timeStamp, y: event.clientY }];
    current.progress = progressAfterDrag({ frame, from: current.from, dy });
    paint(current.progress);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!current.moving) return;
    const recent = current.samples.filter((sample) => event.timeStamp - sample.t <= VELOCITY_WINDOW_MS);
    const first = recent[0];
    const velocity = first === undefined || recent.length < 2 ? 0 : (event.clientY - first.y) / Math.max(1, event.timeStamp - first.t);
    detachSwallow.current?.();
    detachSwallow.current = swallowNextClick();
    conclude(settleDetent({ progress: current.progress, velocity }));
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.moving) conclude(detent);
  };

  const onHandleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const next = detentAfterKey(detent, event.key);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    conclude(next);
  };

  /** Une action hors de la tête reçoit le focus (flèches, lecteur d'écran) : le menu s'étend pour la montrer. */
  const onMenuFocus = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (expanded) return;
    const items = [...event.currentTarget.querySelectorAll('[role^="menuitem"]')];
    if (items.indexOf(event.target as Element) >= PEEK_COMPACT_ROWS) conclude('expanded');
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${ids}-card`}
      data-conversation-peek-cluster
      className="conversation-peek-cluster"
      onKeyDown={onKeyDown}
    >
      <div aria-hidden data-conversation-peek-veil className="conversation-peek-veil" onClick={onDismiss} />
      <div data-conversation-peek className="conversation-peek" style={{ top: frame.top, left: frame.left, width: frame.width, height: frame.height, gap: frame.gap }}>
        {backDismiss}
        <div ref={slotRef} data-peek-card-slot className="conversation-peek-card-slot" style={{ height: rest.card, '--peek-shift': `${offsets.content}px` } as CSSProperties}>
          {renderCard(rest.card)}
        </div>
        <div
          ref={sheetRef}
          data-peek-sheet
          data-peek-detent={detent}
          className="conversation-peek-sheet"
          style={{ height: frame.menuExpanded, transform: `translateY(${offsets.sheet}px)`, touchAction: listScrolls ? 'pan-y' : 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {travels ? (
            <button
              type="button"
              data-peek-handle
              aria-expanded={expanded}
              aria-controls={`${ids}-menu`}
              aria-label={rowMenuText(language, 'rowMenu.peek.expand')}
              className="conversation-peek-handle"
              onClick={() => conclude(expanded ? 'compact' : 'expanded')}
              onKeyDown={onHandleKeyDown}
            >
              <span aria-hidden className="conversation-peek-capsule" />
            </button>
          ) : null}
          <div
            id={`${ids}-menu`}
            role="menu"
            aria-label={menuLabel}
            aria-describedby={`${ids}-body`}
            data-peek-menu
            className="conversation-peek-menu"
            style={{ overflowY: expanded ? 'auto' : 'hidden' }}
            onFocusCapture={onMenuFocus}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
