import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  FLOATING_BUTTON,
  isFloatingDrag,
  normalizeFloating,
  type FloatingBounds,
  type FloatingFraction,
} from './floating-pose';
import { readFloatingPosition, writeFloatingPosition, type FloatingButtonKey } from './floating-position';

/**
 * **DÉPLACER UN BOUTON FLOTTANT** (#6215) — miroir du `DragGesture` de
 * `FreeFloatingButton` (`FloatingButtons.swift:349-370`).
 *
 * La forme suit `use-pull-to-refresh.ts`, le seul autre geste à suivi de
 * déplacement du dépôt : une **loi pure** (`normalizeFloating`) et un **hook**
 * qui la branche. Ce qui est ici, et seulement ici, est ce qui exige le DOM —
 * la capture du pointeur et la mesure.
 *
 * ## LES COULOIRS NE SONT PAS RECOPIÉS : ILS SONT MESURÉS
 *
 * `--float-side`, `--float-top` et `--float-bottom` vivent dans le CSS, où
 * `env(safe-area-inset-top)` les résout. Les relire par `getComputedStyle`
 * rendrait, selon le navigateur, le jeton NON résolu ; les recopier en
 * JavaScript ferait une seconde table — et elle aurait divergé à l'endroit le
 * plus coûteux : le bouton se serait POSÉ à un endroit et DESSINÉ à un autre.
 *
 * D'où les deux TÉMOINS de position, deux `<span>` vides que le composant rend
 * aux deux extrêmes de la course (`0,0` et `1,1`) avec la MÊME fonction de
 * pose que les boutons. Leurs rectangles donnent les quatre bornes exactes,
 * résolues par le navigateur. L'accord entre le calcul et le dessin devient
 * alors STRUCTUREL au lieu d'être une coïncidence entretenue à la main.
 *
 * C'est la réponse à un défaut de forme connue : *un désaccord entre deux
 * écritures d'une même loi est invisible à tout test qui n'en emprunte qu'une.*
 *
 * ## CE QUI DÉPARTAGE L'APPUI DU DÉPLACEMENT
 *
 * iOS fait cohabiter `DragGesture` et `TapGesture` par `simultaneousGesture` ;
 * le web n'a pas d'équivalent. C'est la DISTANCE qui tranche
 * (`FLOATING_DRAG_THRESHOLD`), et un déplacement AVALE le clic qui le suit —
 * sans quoi traîner le bouton du Flux ouvrirait le Flux en le relâchant.
 */

type Course = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
};

export type FloatingDrag = {
  readonly position: FloatingFraction;
  /** Le décalage VIVANT pendant le geste — une transformation, jamais une réécriture de la pose. */
  readonly offset: { readonly x: number; readonly y: number } | null;
  readonly dragging: boolean;
  /** À interroger AVANT d'agir sur un clic : un déplacement n'ouvre rien. */
  readonly consumeClick: () => boolean;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  /**
   * ABANDON — le système reprend le pointeur (appel entrant, geste système,
   * glisser-déposer natif). Sans lui, le décalage vivant reste posé et le
   * bouton se FIGE à mi-course : défaut mesuré à la recette, où un `<a>`
   * déclenchait le glisser-déposer du navigateur et emportait la suite des
   * événements avec lui.
   */
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
};

/** Les quatre bornes, lues sur les deux témoins de position du composant. */
function measureBounds(element: HTMLElement): FloatingBounds | null {
  const couche = element.closest('.floating-menus');
  const debut = couche?.querySelector('[data-floating-probe="start"]');
  const fin = couche?.querySelector('[data-floating-probe="end"]');
  if (!couche || !debut || !fin) return null;

  const cadre = couche.getBoundingClientRect();
  const a = debut.getBoundingClientRect();
  const b = fin.getBoundingClientRect();

  return {
    width: cadre.width,
    height: cadre.height,
    side: a.left - cadre.left,
    top: a.top - cadre.top,
    bottom: cadre.height - (b.top - cadre.top) - FLOATING_BUTTON,
  };
}

export function useFloatingDrag(key: FloatingButtonKey, fallback: FloatingFraction): FloatingDrag {
  const [position, setPosition] = useState<FloatingFraction>(() => readFloatingPosition(key, fallback));
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const course = useRef<Course | null>(null);
  const aGlisse = useRef(false);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    /* Le bouton PRINCIPAL seulement : un clic droit ouvre le menu contextuel
       du navigateur, et le capturer priverait le lien de sa seule autre porte. */
    if (event.button !== 0) return;
    /* **La capture est la seule forme correcte.** Sans elle, les événements
       cessent dès que le pointeur quitte l'élément — de 52 px de côté, c'est
       immédiat — et le bouton reste collé à mi-course. */
    event.currentTarget.setPointerCapture(event.pointerId);
    course.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    aGlisse.current = false;
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const en_cours = course.current;
    if (!en_cours || en_cours.pointerId !== event.pointerId) return;

    const dx = event.clientX - en_cours.startX;
    const dy = event.clientY - en_cours.startY;
    if (!en_cours.moved && isFloatingDrag(Math.hypot(dx, dy))) {
      en_cours.moved = true;
      aGlisse.current = true;
    }
    if (en_cours.moved) setOffset({ x: dx, y: dy });
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const en_cours = course.current;
      course.current = null;
      if (!en_cours || en_cours.pointerId !== event.pointerId) return;

      if (en_cours.moved) {
        const rect = event.currentTarget.getBoundingClientRect();
        const bounds = measureBounds(event.currentTarget);
        if (bounds) {
          const couche = event.currentTarget.closest('.floating-menus')?.getBoundingClientRect();
          const suivante = normalizeFloating(
            {
              x: rect.left + rect.width / 2 - (couche?.left ?? 0),
              y: rect.top + rect.height / 2 - (couche?.top ?? 0),
            },
            bounds,
          );
          setPosition(suivante);
          writeFloatingPosition(key, suivante);
        }
      }
      setOffset(null);
    },
    [key],
  );

  const onPointerCancel = useCallback(() => {
    course.current = null;
    aGlisse.current = false;
    setOffset(null);
  }, []);

  /**
   * Rend `true` quand le clic qui suit doit être AVALÉ, et désarme du même
   * geste. Un drapeau qui ne se désarme pas rendrait le bouton inerte pour
   * toujours après un seul déplacement — le défaut serait durable et
   * invisible à la capture suivante.
   */
  const consumeClick = useCallback(() => {
    if (!aGlisse.current) return false;
    aGlisse.current = false;
    return true;
  }, []);

  return {
    position,
    offset,
    dragging: offset !== null,
    consumeClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
