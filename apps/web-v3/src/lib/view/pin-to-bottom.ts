/**
 * L'ANCRAGE EN BAS DU FIL — UNE loi, deux appelants (#5774, revue).
 *
 * `routes/thread.tsx` l'appelait à l'OUVERTURE du fil (« un fil s'ouvre en
 * bas ») ; le bouton « revenir en bas » (`use-thread-chrome-signals.ts`) en
 * avait besoin du MÊME comportement et l'a d'abord écrit autrement
 * (`virtualizer.scrollToIndex(dernier, { align: 'end' })`) — deux
 * formulations pour un seul geste, exactement la jumelle que la charte
 * interdit, et la seconde n'atteint pas le même point : `align: 'end'` vise
 * la fin du DERNIER ITEM, tandis que le bas du DÉFILEUR inclut encore son
 * `padding-bottom` (`main … pb-2`).
 *
 * POURQUOI PLUSIEURS IMAGES. Un seul `scrollTop = scrollHeight` vise une
 * hauteur ESTIMÉE : les cellules réellement montées se mesurent ensuite et
 * la hauteur totale change sous lui. On se ré-ancre donc le temps que les
 * mesures convergent — et l'appelant peut ABANDONNER à tout instant
 * (première intention de l'utilisateur) en invoquant le `cancel` rendu.
 *
 * `scrollTop = scrollHeight` est CLAMPÉ par le navigateur à
 * `scrollHeight − clientHeight` : c'est le bas EXACT, sans arithmétique de
 * notre côté.
 */
export type PinToBottomHandle = () => void;

/**
 * VINGT IMAGES à l'ouverture d'un fil (le nombre que `routes/thread.tsx`
 * tenait déjà) : c'est le budget pendant lequel les hauteurs réelles des
 * cellules montées convergent, et pendant lequel une intention de
 * l'utilisateur relâche l'ancrage. Le bouton « revenir en bas » demande le
 * même geste sur un fil DÉJÀ mesuré : `SCROLL_TO_BOTTOM_FRAMES` lui suffit.
 */
export const BOTTOM_ANCHOR_FRAMES = 20;
export const SCROLL_TO_BOTTOM_FRAMES = 6;

export function pinToBottom(
  element: HTMLElement,
  {
    frames,
    onFirstFrame,
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
  }: {
    readonly frames: number;
    readonly onFirstFrame?: () => void;
    readonly requestFrame?: (callback: FrameRequestCallback) => number;
    readonly cancelFrame?: (handle: number) => void;
  },
): PinToBottomHandle {
  let armed = true;
  let done = 0;
  let handle = 0;

  const step = () => {
    if (!armed) return;
    if (done === 0) onFirstFrame?.();
    element.scrollTop = element.scrollHeight;
    done += 1;
    if (done < frames) handle = requestFrame(step);
  };
  handle = requestFrame(step);

  return () => {
    armed = false;
    cancelFrame(handle);
  };
}
