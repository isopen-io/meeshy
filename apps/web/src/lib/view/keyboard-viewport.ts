import { nextKeyboardBaseline, virtualKeyboardOf, type KeyboardBaseline } from '@/lib/view/comments-zone';

/** Ce que le clavier recouvre du bas de la page, en px — lu par `h-app` (`app.css`). */
export const KEYBOARD_INSET_VAR = '--keyboard-inset';

/** `open` tant que le clavier est ouvert — `--safe-bottom` tombe alors à zéro (`app.css`). */
export const KEYBOARD_ATTRIBUTE = 'data-keyboard';

type ViewportEvents = 'resize' | 'scroll';

export type KeyboardViewportHost = {
  readonly innerHeight: number;
  readonly scrollY: number;
  scrollTo(x: number, y: number): void;
  readonly visualViewport:
    | {
        readonly width: number;
        readonly height: number;
        readonly offsetTop: number;
        readonly scale: number;
        addEventListener(type: ViewportEvents, listener: () => void): void;
        removeEventListener(type: ViewportEvents, listener: () => void): void;
      }
    | null
    | undefined;
  readonly document: {
    readonly documentElement: {
      readonly scrollHeight: number;
      readonly style: {
        setProperty(name: string, value: string): void;
        removeProperty(name: string): string;
      };
      setAttribute(name: string, value: string): void;
      removeAttribute(name: string): void;
    };
  };
};

/**
 * **LE CLAVIER VIRTUEL, POSÉ UNE FOIS SUR `<html>` POUR TOUTE L'APPLICATION**
 * (#10005, note « plat » de la planche : « composeur collé au clavier via
 * visualViewport »).
 *
 * Safari et Chrome iOS ignorent `interactive-widget=resizes-content`
 * (`index.html`) : le clavier y RECOUVRE la page. Sa hauteur part dans
 * `--keyboard-inset`, que `h-app` retire de `100dvh` ; un écran d'application
 * que Safari a fait glisser pour montrer le champ est ramené en haut — une
 * PAGE qui défile (la landing) garde sa position. Chrome Android et les
 * coques réduisent déjà la vue : rien à retirer, mais `data-keyboard="open"`
 * dit que le clavier est là, et l'indicateur home n'écarte plus le composeur.
 *
 * La loi du clavier est celle de la feuille de commentaires (#9894,
 * `virtualKeyboardOf`) : la même mesure, un seul seuil.
 *
 * Un zoom au pincement (`scale` > 1) rétrécit aussi la vue visible et la
 * décale : ce n'est pas un clavier. Pendant qu'il dure, rien n'est mesuré ni
 * ramené — sinon l'écran rapetissait et la page zoomée sautait en haut.
 */
export function installKeyboardViewport(host: KeyboardViewportHost): () => void {
  const viewport = host.visualViewport;
  if (viewport === undefined || viewport === null) return () => undefined;
  const root = host.document.documentElement;
  let baseline: KeyboardBaseline | null = null;

  const clear = () => {
    root.style.removeProperty(KEYBOARD_INSET_VAR);
    root.removeAttribute(KEYBOARD_ATTRIBUTE);
  };

  const measure = () => {
    baseline = nextKeyboardBaseline(baseline, { width: viewport.width, height: viewport.height });
    return virtualKeyboardOf({
      innerHeight: host.innerHeight,
      viewportHeight: viewport.height,
      viewportOffsetTop: viewport.offsetTop,
      baseline,
    });
  };

  const slidAppScreen = () =>
    (viewport.offsetTop > 0 || host.scrollY > 0) && root.scrollHeight <= host.innerHeight;

  const read = () => {
    if (viewport.scale > 1) return;
    const first = measure();
    if (!first.open) {
      clear();
      return;
    }
    if (slidAppScreen()) host.scrollTo(0, 0);
    const keyboard = measure();
    root.setAttribute(KEYBOARD_ATTRIBUTE, 'open');
    if (keyboard.inset > 0) root.style.setProperty(KEYBOARD_INSET_VAR, `${keyboard.inset}px`);
    else root.style.removeProperty(KEYBOARD_INSET_VAR);
  };

  read();
  viewport.addEventListener('resize', read);
  viewport.addEventListener('scroll', read);
  return () => {
    viewport.removeEventListener('resize', read);
    viewport.removeEventListener('scroll', read);
    clear();
  };
}
