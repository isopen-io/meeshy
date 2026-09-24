import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** Le coin haut-gauche d'une ancre, en coordonnées de fenêtre — la seule
 *  grandeur qu'un défilement change et qu'un événement en vol laisse
 *  INCHANGÉE. `null` quand il n'y a pas d'ancre : le menu se ferme alors
 *  comme avant, sans rien deviner. */
type Corner = { readonly top: number; readonly left: number };

function cornerOf(element: HTMLElement | null | undefined): Corner | null {
  if (element === null || element === undefined) return null;
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left };
}

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
  /** `RowActions` referme ; `ReadingModeChip` remesure. Ni l'un ni l'autre par défaut.
   * Reçoit l'ÉVÉNEMENT : le menu du message a besoin de sa CIBLE pour
   * distinguer le défilement du lecteur de celui que l'application vient
   * d'écrire (`programmatic-scroll.ts`).
   *
   * N'EST APPELÉ QUE SI L'ANCRE A BOUGÉ (#7293, voir `anchor`). */
  readonly onScroll?: (event: Event) => void;
  /**
   * CE QUI ANCRE LE MENU À L'ÉCRAN — le déclencheur (`buttonRef`) par
   * défaut, la RANGÉE pour le menu du message. `useRovingMenu` la mesure au
   * commit qui ouvre le menu, et ne transmet un `scroll` que lorsqu'elle a
   * RÉELLEMENT bougé depuis (#7293).
   */
  readonly anchor?: () => HTMLElement | null;
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
  /**
   * `HTMLElement` et non `HTMLButtonElement` (#6104) : ce hook ne fait
   * qu'appeler `.focus()` sur ces éléments — la contrainte était plus étroite
   * que ce qu'il exige, et elle interdisait la seule forme correcte d'une
   * ligne qui NAVIGUE. L'échelle des menus flottants ouvre huit adresses ;
   * ses lignes sont des `<a>`, parce qu'« un lien qui navigue DOIT rester un
   * lien » (`chrome-action.tsx:36`) — un `<button>` qui appellerait
   * `navigate()` perdrait l'ouverture dans un onglet, le survol qui montre
   * l'adresse, et le menu contextuel du navigateur.
   *
   * Les trois appelants historiques passent des `<button>`, assignables à
   * `HTMLElement` : rien ne change pour eux.
   */
  readonly itemRefs: RefObject<(HTMLElement | null)[]>;
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
  const { itemCount, isDisabledAt = () => false, computeInitialIndex, onScroll, onResize, returnFocusTo, anchor } = options;
  const [open, setOpen] = useState(options.initialOpen ?? false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  /** LE COIN DE L'ANCRE tel que le menu l'a placé — voir `cornerOf`. */
  const placedAt = useRef<Corner | null>(null);

  const closeAndFocusButton = () => {
    setOpen(false);
    (returnFocusTo?.() ?? buttonRef.current)?.focus();
  };

  /**
   * LES SORTIES SONT POSÉES DANS LE COMMIT QUI INSÈRE LE MENU (#7293) —
   * `useLayoutEffect`, jamais `useEffect`.
   *
   * Un effet PASSIF les posait APRÈS la peinture : sous `preact/compat` — le
   * runtime que le `dist` servi embarque — un effet passif est différé par un
   * `requestAnimationFrame`, avec un `setTimeout` de 100 ms pour seule
   * garantie. Entre le commit et cette image, le menu est DANS le document,
   * visible et focalisé, et ni Échap ni un appui hors du menu ne trouvent le
   * moindre écouteur : la touche n'est pas différée, elle est PERDUE, et le
   * menu reste ouvert pour toujours.
   *
   * Mesuré au navigateur sur `/c/c-deploiement` : `contextmenu` sur une
   * rangée, puis `Escape` dans la MÊME tâche que le montage (attente du
   * portail par `MutationObserver`, donc en microtâches, aucune image
   * intercalée) ⇒ le menu survit et le focus ne revient jamais à la rangée —
   * les DEUX témoins « Échap » de `check-thread-states.mjs` § 6.3 bis, ceux
   * que la CI rendait rouges sur `dev` lui-même pendant que le banc local
   * restait vert (son image arrive en 14 ms, avant les allers-retours du
   * témoin).
   *
   * C'est la leçon de #6319, tirée douze lignes plus bas dans le même
   * composant : `useBackDismiss` pose son entrée d'historique en
   * `useLayoutEffect` « pour qu'aucune image ne montre la couche sans que le
   * retour lui appartienne ». La même phrase vaut pour Échap et pour le clic
   * hors du menu — une couche modale est INSÉPARABLE de ses sorties, et le
   * correctif est un ORDRE, jamais un délai de grâce.
   */
  useLayoutEffect(() => {
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
    /**
     * UN DÉFILEMENT QUI N'A PAS BOUGÉ L'ANCRE N'EST PAS UN DÉFILEMENT CONTRE
     * CE MENU (#7293).
     *
     * Un `scroll` n'est pas livré à l'écriture qui le provoque : le
     * navigateur l'émet à l'image suivante. Amener le déclencheur en vue
     * (`.focus()`, un clic sur une rangée hors fenêtre) PUIS ouvrir le menu
     * pose donc un événement EN VOL qui atterrit APRÈS le commit — et qui
     * refermait aussitôt un menu que personne n'avait touché.
     *
     * Mesuré au navigateur, journal de la page : `scroll top=239` (mise en
     * vue) · `scroll top=351` (ancrage bas) · commit du menu · **`scroll
     * top=239`** treize millisecondes plus tard, pour une écriture
     * ANTÉRIEURE au menu.
     *
     * La question n'est donc pas « un défilement est-il arrivé ? » mais
     * « l'ancre a-t-elle bougé ? » — c'est déjà la raison d'être de cette
     * fermeture : « un panneau immobile qui suit un défilement désignerait
     * la mauvaise rangée ». Un événement en vol rapporte la position que le
     * placement a DÉJÀ prise en compte : rien n'a bougé, il n'y a rien à
     * fermer. Une comparaison de POSITIONS, jamais un délai de grâce.
     */
    placedAt.current = cornerOf(anchor?.() ?? buttonRef.current);
    const scrollTarget =
      onScroll === undefined
        ? undefined
        : (event: Event) => {
            const before = placedAt.current;
            const now = cornerOf(anchor?.() ?? buttonRef.current);
            placedAt.current = now;
            if (before !== null && now !== null && Math.abs(now.top - before.top) < 1 && Math.abs(now.left - before.left) < 1) return;
            onScroll(event);
          };
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
