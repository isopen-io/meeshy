import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import {
  FLOATING_BUTTON,
  isFloatingDrag,
  normalizeFloating,
  type FloatingBounds,
  type FloatingFraction,
} from './floating-pose';
import { readFloatingPosition, writeFloatingPosition, type FloatingButtonKey } from './floating-position';
import { LONG_PRESS_MS, pressReducer, type PressState } from './long-press';

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
 *
 * ## L'APPUI LONG, TROISIÈME GESTE DU MÊME DISQUE (#6456)
 *
 * iOS y ajoute `LongPressGesture(minimumDuration: 0.5)`
 * (`FloatingButtons.swift:380-385`). Ici, c'est la machine PURE de
 * `long-press.ts` (`pressReducer` : 500 ms, 6 px) qui le décide — la même que
 * le menu d'un message, et le même seuil que le glisser : au-delà de 6 px,
 * l'appui long est annulé ET le glisser commence, jamais l'un sans l'autre.
 * Déclenché, il abandonne la course (le disque ne bouge plus) et avale le clic
 * du relâché, comme un déplacement : un appui long qui ouvrirait AUSSI la
 * destination du tap au relâché ferait deux navigations d'un seul geste.
 */

type Course = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
};

export type FloatingDragOptions = {
  /** Le geste de l'appui long — absent, le disque n'a que le tap et le glisser. */
  readonly onLongPress?: () => void;
};

export type FloatingDrag = {
  readonly position: FloatingFraction;
  /** Le décalage VIVANT pendant le geste — une transformation, jamais une réécriture de la pose. */
  readonly offset: { readonly x: number; readonly y: number } | null;
  readonly dragging: boolean;
  /** À interroger AVANT d'agir sur un clic : un déplacement, ou un appui long, n'ouvre rien. */
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
  /**
   * **LE MENU CONTEXTUEL DU SYSTÈME.** Un lien tenu au doigt ouvre, sur
   * Android, la bulle « ouvrir dans un onglet » — souvent avant nos 500 ms.
   * Pendant un appui principal, il VAUT l'appui long et il est avalé ; pendant
   * ou juste après un geste, il est avalé ; hors de tout appui (clic droit de la
   * souris), le menu du navigateur reste.
   */
  readonly onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
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

const IDLE: PressState = { phase: 'idle' };

/**
 * Le délai, après le relâché, pendant lequel le clic synthétisé est encore
 * celui du geste. Chromium tactile l'émet une milliseconde après `pointerup`,
 * mais dans une tâche SÉPARÉE (mesuré) : un désarmement à `setTimeout(0)`
 * passerait avant lui.
 */
const RELEASE_CLICK_MS = 350;

/**
 * **LE RELÂCHÉ D'UN APPUI LONG NE TOUCHE RIEN** (#6456).
 *
 * L'appui long a déjà changé d'écran sous le doigt : le disque est démonté, et
 * le clic que le navigateur synthétise au relâché retombe sur ce qui est
 * dessous — mesuré au navigateur sur une coque tactile, il atteignait la scène
 * des Réels, dont le tap met la lecture en pause. `consumeClick` ne peut rien
 * pour lui : il n'est interrogé que par un élément qui n'existe plus.
 *
 * Le clic est donc avalé à la FENÊTRE, en capture, et seulement celui qui suit
 * le relâché de CE geste : un nouvel appui ou une touche désarme, et la fenêtre
 * se referme d'elle-même — un clic volontaire suivant n'est jamais mangé.
 */
function swallowReleaseClick(): void {
  function swallow(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    disarm();
  }
  function onRelease(): void {
    window.removeEventListener('pointerup', onRelease, true);
    window.addEventListener('click', swallow, true);
    setTimeout(disarm, RELEASE_CLICK_MS);
  }
  function disarm(): void {
    window.removeEventListener('pointerup', onRelease, true);
    window.removeEventListener('click', swallow, true);
    window.removeEventListener('pointerdown', disarm, true);
    window.removeEventListener('pointercancel', disarm, true);
    window.removeEventListener('keydown', disarm, true);
  }
  window.addEventListener('pointerup', onRelease, true);
  window.addEventListener('pointerdown', disarm, true);
  window.addEventListener('pointercancel', disarm, true);
  window.addEventListener('keydown', disarm, true);
}

export function useFloatingDrag(
  key: FloatingButtonKey,
  fallback: FloatingFraction,
  options: FloatingDragOptions = {},
): FloatingDrag {
  const [position, setPosition] = useState<FloatingFraction>(() => readFloatingPosition(key, fallback));
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const course = useRef<Course | null>(null);
  /** Le clic qui suit doit être AVALÉ — posé par un déplacement ou par un appui long. */
  const avaleClic = useRef(false);
  const appui = useRef<PressState>(IDLE);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Par référence : l'appelant garde le droit d'écrire une fermeture en ligne
     sans recréer les gestionnaires à chaque rendu (motif de `long-press.ts`). */
  const onLongPressRef = useRef(options.onLongPress);
  onLongPressRef.current = options.onLongPress;

  const desarmer = useCallback(() => {
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    minuteur.current = null;
  }, []);

  /* Un minuteur qui survivrait au démontage ouvrirait les Réels depuis un
     écran qu'on a déjà quitté. */
  useEffect(() => desarmer, [desarmer]);

  const declencher = useCallback(() => {
    desarmer();
    appui.current = { phase: 'open' };
    course.current = null;
    avaleClic.current = true;
    setOffset(null);
    swallowReleaseClick();
    onLongPressRef.current?.();
  }, [desarmer]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      /* Le bouton PRINCIPAL seulement : un clic droit ouvre le menu contextuel
         du navigateur, et le capturer priverait le lien de sa seule autre porte. */
      if (event.button !== 0) return;
      /* **La capture est la seule forme correcte.** Sans elle, les événements
         cessent dès que le pointeur quitte l'élément — de 52 px de côté, c'est
         immédiat — et le bouton reste collé à mi-course. */
      event.currentTarget.setPointerCapture(event.pointerId);
      course.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
      avaleClic.current = false;

      desarmer();
      if (onLongPressRef.current === undefined) return;
      appui.current = pressReducer(IDLE, { type: 'down', x: event.clientX, y: event.clientY, at: event.timeStamp });
      minuteur.current = setTimeout(() => {
        minuteur.current = null;
        appui.current = pressReducer(appui.current, { type: 'tick', elapsedMs: LONG_PRESS_MS });
        if (appui.current.phase === 'open') declencher();
      }, LONG_PRESS_MS);
    },
    [declencher, desarmer],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const en_cours = course.current;
      if (!en_cours || en_cours.pointerId !== event.pointerId) return;

      appui.current = pressReducer(appui.current, { type: 'move', x: event.clientX, y: event.clientY });
      if (appui.current.phase === 'cancelled') desarmer();

      const dx = event.clientX - en_cours.startX;
      const dy = event.clientY - en_cours.startY;
      if (!en_cours.moved && isFloatingDrag(Math.hypot(dx, dy))) {
        en_cours.moved = true;
        avaleClic.current = true;
      }
      if (en_cours.moved) setOffset({ x: dx, y: dy });
    },
    [desarmer],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      desarmer();
      appui.current = pressReducer(appui.current, { type: 'up' });
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
    [desarmer, key],
  );

  const onPointerCancel = useCallback(() => {
    desarmer();
    appui.current = pressReducer(appui.current, { type: 'cancel' });
    course.current = null;
    avaleClic.current = false;
    setOffset(null);
  }, [desarmer]);

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (onLongPressRef.current !== undefined && appui.current.phase === 'pressing') {
        event.preventDefault();
        declencher();
        return;
      }
      if (course.current !== null || avaleClic.current) event.preventDefault();
    },
    [declencher],
  );

  /**
   * Rend `true` quand le clic qui suit doit être AVALÉ, et désarme du même
   * geste. Un drapeau qui ne se désarme pas rendrait le bouton inerte pour
   * toujours après un seul déplacement — le défaut serait durable et
   * invisible à la capture suivante.
   */
  const consumeClick = useCallback(() => {
    if (!avaleClic.current) return false;
    avaleClic.current = false;
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
    onContextMenu,
  };
}
