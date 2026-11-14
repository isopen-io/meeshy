import { useCallback, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';

/**
 * **LA SORTIE D'UNE MODALE EST JOUÉE PAR UN FANTÔME ; LE VRAI DIALOGUE SE FERME TOUT DE SUITE** (#18362).
 *
 * Retarder `close()` le temps d'une descente casserait trois choses de l'existant : l'adoption d'entrée
 * de `dismissAllLayers({ successor })` (#10539, #7527), le moment où `onClose` est rappelé, et N4 — une
 * modale qui reste modale 280 ms après le toucher absorbe le geste suivant. Le dialogue se ferme donc au
 * premier toucher, par tous les chemins (bouton, voile, Échap, retour, démontage par l'hôte), et une
 * COPIE inerte de sa boîte, posée en `popover` dans la couche supérieure à la même place, joue la sortie
 * de `styles/sheet-motion.css` puis s'en va. C'est `leaveAsGhost` (`components/call-deck-motion.tsx`)
 * porté à la couche supérieure, sur le modèle de `top-modal-host.ts`.
 *
 * Sous « Réduire les animations », sans API Popover, ou par-dessus une scène d'appel : aucun fantôme,
 * la fermeture reste sèche — ce que K15 prescrit sous réduction, et l'existant ailleurs.
 */

/** K15, colonne web : la feuille monte et descend en 280 ms. */
export const SHEET_MOTION_MS = 280;
/** Le fondu de K01, K02 et K13 : celui des fenêtres centrées et de la confirmation. */
export const DIALOG_FADE_MS = 200;
/** La courbe que `send-sheet.css` et la feuille du jeu écrivaient déjà, promue en constante. */
export const SHEET_MOTION_CURVE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Au-delà, le clone coûterait plus que la sortie qu'il joue : la fermeture reste sèche. */
export const DIALOG_GHOST_MAX_NODES = 1500;

export type DialogGhostKind = 'fullscreen' | 'centered' | 'wide' | 'bottom' | 'confirm' | 'send';

/** Les variables que `styles/sheet-motion.css` lit sur le dialogue, et que son fantôme hérite. */
export const DIALOG_MOTION_STYLE = {
  '--dialog-rise-ms': `${SHEET_MOTION_MS}ms`,
  '--dialog-fade-ms': `${DIALOG_FADE_MS}ms`,
  '--dialog-motion-curve': SHEET_MOTION_CURVE,
} as CSSProperties;

const motionAllowed = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

const popoverSupported = (): boolean => typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

/* `[open]` et non `:modal` : la scène d'appel ne s'ouvre qu'en modale, et un moteur qui ne connaît pas
   `:modal` (happy-dom) la dirait fermée. Le fantôme se peindrait au-dessus de l'appel. */
const callStageOpen = (): boolean => document.querySelector('dialog[data-call-stage][open]') !== null;

const mayLeave = (dialog: HTMLDialogElement): boolean =>
  motionAllowed() &&
  popoverSupported() &&
  dialog.isConnected &&
  dialog.open &&
  !dialog.hasAttribute('data-leaving') &&
  !callStageOpen() &&
  dialog.getElementsByTagName('*').length <= DIALOG_GHOST_MAX_NODES;

const silenceMedia = (root: HTMLElement): void => {
  for (const frame of root.querySelectorAll('iframe')) frame.remove();
  for (const media of root.querySelectorAll<HTMLMediaElement>('video, audio')) {
    media.removeAttribute('autoplay');
    media.removeAttribute('src');
    for (const source of media.querySelectorAll('source')) source.remove();
    media.setAttribute('preload', 'none');
  }
};

const stripIdentity = (root: HTMLElement): void => {
  for (const node of root.querySelectorAll('[id], [autofocus]')) {
    node.removeAttribute('id');
    node.removeAttribute('autofocus');
  }
};

/** Les défilements que le clone ne recopie pas de lui-même, dans l'ordre du document des deux arbres. */
const scrolledOffsets = (dialog: HTMLDialogElement): ReadonlyArray<readonly [number, number, number]> =>
  [...dialog.getElementsByTagName('*')].flatMap((node, index) =>
    node.scrollTop === 0 && node.scrollLeft === 0 ? [] : [[index, node.scrollTop, node.scrollLeft] as const],
  );

const removeAfterExit = (ghost: HTMLElement): void => {
  const timer = setTimeout(() => ghost.remove(), SHEET_MOTION_MS * 2);
  ghost.addEventListener('animationend', (event) => {
    if (event.target !== ghost || ((event as AnimationEvent).pseudoElement ?? '') !== '') return;
    clearTimeout(timer);
    ghost.remove();
  });
};

/**
 * La copie inerte du dialogue ouvert, posée dans la couche supérieure à sa place ; `null` quand la
 * sortie doit rester sèche. Elle n'écrit rien sur le dialogue lui-même : le fermer reste l'affaire de
 * l'appelant.
 */
export function leaveDialogAsGhost(dialog: HTMLDialogElement, kind: DialogGhostKind): HTMLElement | null {
  if (!mayLeave(dialog)) return null;
  const rect = dialog.getBoundingClientRect();
  /* Ce qu'une règle en `[open]` donnait au dialogue (`.send-sheet[open]` : une colonne flexible), et que
     le fantôme, sans `open`, perdrait. */
  const { display, flexDirection } = getComputedStyle(dialog);
  const offsets = scrolledOffsets(dialog);

  const ghost = document.createElement('div');
  ghost.className = dialog.className;
  ghost.style.cssText = dialog.style.cssText;
  for (const child of dialog.childNodes) ghost.appendChild(child.cloneNode(true));
  const clones = [...ghost.getElementsByTagName('*')];
  stripIdentity(ghost);
  silenceMedia(ghost);

  ghost.setAttribute('data-dialog-ghost', kind);
  ghost.setAttribute('data-leaving', '');
  ghost.setAttribute('inert', '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('popover', 'manual');
  Object.assign(ghost.style, {
    position: 'fixed',
    inset: 'auto',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    maxWidth: 'none',
    maxHeight: 'none',
    border: '0',
    padding: '0',
    display,
    flexDirection,
  });

  document.body.appendChild(ghost);
  ghost.showPopover();
  /* Un défilement ne se pose que sur une boîte rendue : après l'insertion, jamais sur le clone détaché. */
  for (const [index, top, left] of offsets) {
    const clone = clones[index];
    if (clone === undefined) continue;
    clone.scrollTop = top;
    clone.scrollLeft = left;
  }
  removeAfterExit(ghost);
  return ghost;
}

/**
 * La sortie d'un `<dialog>` que son composant ouvre lui-même par `showModal()` : `leave()` pour les
 * boutons et le voile, Échap natif et démontage par l'hôte joués d'office.
 */
export function useDialogExit(ref: RefObject<HTMLDialogElement | null>, { kind }: { readonly kind: DialogGhostKind }): { readonly leave: () => void } {
  const kindRef = useRef(kind);
  kindRef.current = kind;

  /* Une cleanup de MISE EN PAGE : sous React, celle d'un effet passif tourne quand le dialogue a déjà
     quitté le document, et sa boîte ne se mesure plus. */
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    const onCancel = () => {
      leaveDialogAsGhost(dialog, kindRef.current);
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      leaveDialogAsGhost(dialog, kindRef.current);
    };
  }, [ref]);

  const leave = useCallback(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    leaveDialogAsGhost(dialog, kindRef.current);
    dialog.close();
  }, [ref]);

  return { leave };
}
