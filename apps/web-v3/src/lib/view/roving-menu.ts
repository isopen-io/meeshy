import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

/**
 * LE MENU ANCRÉ, PARTAGÉ — patron ARIA « menu » à ROVING TABINDEX (#5559
 * défaut 4 : le même patron était écrit DEUX FOIS, une fois par
 * `ReadingModeChip` (#5566) et une fois par `RowActions` (#5559) — même
 * navigation clavier, même gestion du focus, deux implémentations
 * indépendantes. À trente écrans portés, ce motif se serait copié trente
 * fois : la directive « ce sera copié, donc juste MAINTENANT » (#5559
 * revue-correction) s'applique mot pour mot.
 *
 * CE QUE CE FICHIER PORTE — la partie MÉCANIQUE, identique aux deux appelants
 * à l'octet près avant cette extraction :
 *   - Échap referme et rend le focus au déclencheur.
 *   - Un clic/appui HORS du menu ET du déclencheur referme.
 *   - Les flèches/Home/End déplacent le focus DANS le menu, en sautant les
 *     lignes désactivées (`isDisabledAt`) — un bouton `disabled` est hors du
 *     parcours clavier par construction, `findFocusable` avance jusqu'à la
 *     prochaine ligne ATTEIGNABLE plutôt que de s'arrêter dessus.
 *   - À l'ouverture, le focus ENTRE dans le menu (jamais sur le déclencheur).
 *
 * CE QUE CE FICHIER NE PORTE PAS — laissé à chaque appelant, parce que les
 * deux DIVERGENT réellement, pas par accident :
 *   - Le RENDU du déclencheur et des lignes (icône+libellé ici,
 *     titre+sous-titre+coche là).
 *   - Le PLACEMENT (chacun mesure son ancre et appelle `popover.ts`, seul
 *     site de la loi de positionnement — y compris verticalement, #5559
 *     défaut 7).
 *   - `scroll`/`resize` pendant l'ouverture : `RowActions` est en PORTAIL
 *     (`position: fixed`, ancré au VIEWPORT) et referme sur ces deux
 *     événements — un panneau immobile qui suit un défilement désignerait la
 *     mauvaise rangée. `ReadingModeChip` n'est PAS porté (`position:
 *     absolute`, ancré à son propre conteneur) et n'a besoin que de se
 *     RE-MESURER au redimensionnement. Options `onScroll`/`onResize`.
 */

/**
 * Prochain index ATTEIGNABLE à partir de `start`, dans `direction` — jamais
 * un index désactivé. Boucle jusqu'à `count` tentatives avant d'abandonner
 * (retourne `start`), pour ne jamais tourner en rond indéfiniment si TOUT est
 * désactivé.
 */
export function findFocusableIndex(
  count: number,
  start: number,
  direction: 1 | -1,
  isDisabledAt: (index: number) => boolean,
): number {
  if (count <= 0) return start;
  let index = start;
  for (let i = 0; i < count; i++) {
    index = ((index + direction) % count + count) % count;
    if (!isDisabledAt(index)) return index;
  }
  return start;
}

export type RovingMenuOptions = {
  /** Nombre de lignes du menu — `itemRefs.current` en tient autant. */
  readonly itemCount: number;
  /** Aucune ligne désactivée par défaut (cas `RowActions`). */
  readonly isDisabledAt?: (index: number) => boolean;
  /** L'index de départ à l'ouverture — défaut : la première ligne ATTEIGNABLE. */
  readonly computeInitialIndex?: () => number;
  /** `RowActions` referme ; `ReadingModeChip` remesure. Ni l'un ni l'autre par défaut. */
  readonly onScroll?: () => void;
  readonly onResize?: () => void;
  /**
   * OÙ REND LE FOCUS À LA FERMETURE (#5814) — `RowActions`/`ReadingModeChip`
   * déclenchent depuis un `<button>` (`buttonRef`, ci-dessous) ; le menu du
   * message, lui, s'ouvre depuis une RANGÉE (`<div data-row>`, appui long,
   * clic droit, `ContextMenu`), qui n'a pas de `buttonRef` à porter. Quand
   * fourni, `closeAndFocusButton` y rend le focus ; sinon, le comportement
   * EXISTANT (`buttonRef.current?.focus()`) — inchangé pour les deux
   * appelants historiques.
   */
  readonly returnFocusTo?: () => HTMLElement | null;
  /**
   * OUVERT DÈS LE MONTAGE (#5814) — le menu du message est monté par son
   * hôte SEULEMENT quand `menuTarget !== null` (portail conditionnel) : il
   * n'a pas de bouton déclencheur à cliquer une seconde fois pour s'ouvrir,
   * contrairement à `RowActions`/`ReadingModeChip`. `false` par défaut —
   * inchangé pour les deux appelants historiques.
   */
  readonly initialOpen?: boolean;
};

export type RovingMenu = {
  readonly open: boolean;
  readonly setOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  /** Ferme le menu et rend le focus au déclencheur — l'issue de `Échap` ET
   *  celle d'un choix effectué (`choose()` côté appelant). */
  readonly closeAndFocusButton: () => void;
  readonly activeIndex: number;
  readonly setActiveIndex: (index: number) => void;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly itemRefs: RefObject<(HTMLButtonElement | null)[]>;
  /**
   * DÉPLACE LE FOCUS À PARTIR D'UNE TOUCHE, sans événement (#5814 revue).
   * Rend `true` quand la touche a été CONSOMMÉE — à l'appelant d'appeler
   * alors `preventDefault()` sur SON événement.
   *
   * Cette porte existe parce qu'un appelant peut avoir besoin de TRADUIRE
   * une touche (le rail du menu du message est HORIZONTAL : `ArrowRight`
   * y vaut `ArrowDown`). La première écriture passait un événement RECOPIÉ
   * (`{ ...event, key: mappedKey }`) : la copie perd `preventDefault`, qui
   * vit sur le PROTOTYPE de l'événement (synthétique React comme natif
   * Preact) — mesuré, `TypeError: event.preventDefault is not a function`,
   * et le rail était donc INERTE au clavier. Une touche se passe par sa
   * VALEUR, jamais par un événement fabriqué.
   */
  readonly handleKey: (key: string) => boolean;
  readonly onMenuKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
};

export function useRovingMenu(options: RovingMenuOptions): RovingMenu {
  const { itemCount, isDisabledAt = () => false, computeInitialIndex, onScroll, onResize, returnFocusTo } = options;
  const [open, setOpen] = useState(options.initialOpen ?? false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const closeAndFocusButton = () => {
    setOpen(false);
    (returnFocusTo?.() ?? buttonRef.current)?.focus();
  };

  // Échap + clic/appui hors du menu.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeAndFocusButton();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    const scrollTarget = onScroll;
    const resizeTarget = onResize;
    if (scrollTarget) document.addEventListener('scroll', scrollTarget, true);
    if (resizeTarget) window.addEventListener('resize', resizeTarget);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      if (scrollTarget) document.removeEventListener('scroll', scrollTarget, true);
      if (resizeTarget) window.removeEventListener('resize', resizeTarget);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Le focus ENTRE dans le menu à l'ouverture.
  useEffect(() => {
    if (!open) return;
    const start = computeInitialIndex ? computeInitialIndex() : findFocusableIndex(itemCount, -1, 1, isDisabledAt);
    setActiveIndex(start);
    const raf = requestAnimationFrame(() => itemRefs.current[start]?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const moveFocusTo = (index: number) => {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  };

  const handleKey = (key: string): boolean => {
    switch (key) {
      case 'ArrowDown':
        moveFocusTo(findFocusableIndex(itemCount, activeIndex, 1, isDisabledAt));
        return true;
      case 'ArrowUp':
        moveFocusTo(findFocusableIndex(itemCount, activeIndex, -1, isDisabledAt));
        return true;
      case 'Home':
        moveFocusTo(findFocusableIndex(itemCount, -1, 1, isDisabledAt));
        return true;
      case 'End':
        moveFocusTo(findFocusableIndex(itemCount, itemCount, -1, isDisabledAt));
        return true;
      default:
        return false;
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (handleKey(event.key)) event.preventDefault();
  };

  return {
    open,
    setOpen,
    closeAndFocusButton,
    activeIndex,
    setActiveIndex,
    buttonRef,
    menuRef,
    itemRefs,
    handleKey,
    onMenuKeyDown,
  };
}
