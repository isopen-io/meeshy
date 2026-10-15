import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import { IDLE_TAP, mediaOpenerOf, nextTapDeadline, tapKindOf, tapReducer, type TapEffect, type TapEvent, type TapState } from './double-tap';

/**
 * LE HOOK DU DOUBLE TOUCHER (#10599) — vit UNE FOIS dans l'hôte, comme
 * `useLongPress` : ses deux gestionnaires sont étalés sur chaque rangée et
 * lisent `event.currentTarget` (`data-row`), jamais une référence figée.
 *
 * `onClickCapture` voit le clic AVANT la tuile qui l'attend : c'est ce qui
 * permet de RETENIR l'ouverture d'un média le temps de la fenêtre, puis de la
 * RENDRE (`click()` rejoué sur le même bouton) si aucun second appui n'est
 * venu. Un clic clavier (`detail === 0`) n'est jamais retenu.
 *
 * LA SÉLECTION DE TEXTE GAGNE TOUJOURS : un double clic de souris sur un mot
 * le sélectionne au second appui, avant le clic. Si la sélection du document
 * est non vide dans la rangée, le second clic est traité comme un contrôle —
 * aucune barre, le mot reste sélectionné. Le double clic sur la marge de la
 * bulle, sur l'heure ou sur un média ouvre la barre de réaction rapide.
 */

export type DoubleTap = {
  readonly row: HTMLElement;
  /** La cible du second toucher — pour savoir quelle pièce il a touchée. */
  readonly origin: EventTarget | null;
  /** L'abscisse du second toucher, sous laquelle la barre se centre. */
  readonly x: number;
};

let replaying = false;

const now = (): number => performance.now();

function selectionWithin(row: Element): boolean {
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return false;
  return (selection.anchorNode !== null && row.contains(selection.anchorNode)) || (selection.focusNode !== null && row.contains(selection.focusNode));
}

export function useDoubleTap(options: { readonly enabled: () => boolean; readonly onDoubleTap: (tap: DoubleTap) => void }) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const stateRef = useRef<TapState>(IDLE_TAP);
  const heldRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const apply = useCallback(
    (event: TapEvent): readonly TapEffect[] => {
      const step = tapReducer(stateRef.current, event);
      stateRef.current = step.state;
      if (step.effects.includes('release')) {
        const held = heldRef.current;
        heldRef.current = null;
        if (held !== null && held.isConnected) {
          replaying = true;
          try {
            held.click();
          } finally {
            replaying = false;
          }
        }
      }
      if (step.effects.includes('drop') || step.effects.includes('double')) heldRef.current = null;
      clearTimer();
      const deadline = nextTapDeadline(stateRef.current);
      if (deadline !== null) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          apply({ type: 'expire', at: now() });
        }, Math.max(0, deadline - now()));
      }
      return step.effects;
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      apply({ type: 'down', x: event.clientX, y: event.clientY, at: now() });
    },
    [apply],
  );

  const onClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (replaying) return;
      const row = event.currentTarget;
      const messageId = row.dataset.row;
      if (messageId === undefined || event.detail === 0 || !optionsRef.current.enabled()) {
        apply({ type: 'cancel' });
        return;
      }
      const kind = selectionWithin(row) ? 'control' : tapKindOf(event.target, row);
      const effects = apply({ type: 'click', x: event.clientX, y: event.clientY, at: now(), kind, messageId });
      if (effects.includes('hold')) heldRef.current = mediaOpenerOf(event.target);
      if (!effects.includes('hold') && !effects.includes('double')) return;
      event.preventDefault();
      event.stopPropagation();
      if (effects.includes('double')) {
        optionsRef.current.onDoubleTap({ row, origin: event.target, x: event.clientX });
      }
    },
    [apply],
  );

  return useMemo(() => ({ onPointerDown, onClickCapture }), [onPointerDown, onClickCapture]);
}
