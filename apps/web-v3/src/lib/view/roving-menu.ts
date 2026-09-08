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
  readonly onMenuKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
};

export function useRovingMenu(options: RovingMenuOptions): RovingMenu {
  const { itemCount, isDisabledAt = () => false, computeInitialIndex, onScroll, onResize } = options;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const closeAndFocusButton = () => {
    setOpen(false);
    buttonRef.current?.focus();
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

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocusTo(findFocusableIndex(itemCount, activeIndex, 1, isDisabledAt));
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveFocusTo(findFocusableIndex(itemCount, activeIndex, -1, isDisabledAt));
        return;
      case 'Home':
        event.preventDefault();
        moveFocusTo(findFocusableIndex(itemCount, -1, 1, isDisabledAt));
        return;
      case 'End':
        event.preventDefault();
        moveFocusTo(findFocusableIndex(itemCount, itemCount, -1, isDisabledAt));
        return;
      default:
        return;
    }
  };

  return { open, setOpen, closeAndFocusButton, activeIndex, setActiveIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown };
}
