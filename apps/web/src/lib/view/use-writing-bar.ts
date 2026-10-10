import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { keyboardInsetOf } from '@/lib/view/scene-yields';
import type { WritingBar } from '@/lib/view/use-comments-sheet-host';

/**
 * LE CLAVIER VIRTUEL, LU AU `visualViewport` (#8643) — tant que `active`.
 * Safari iOS garde la fenêtre et rétrécit la vue visible : la feuille se pose
 * alors AU-DESSUS du clavier plutôt que dessous. La coque Android redimensionne
 * la WebView : le retrait reste nul (`keyboardInsetOf`).
 */
export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!active || viewport === undefined || viewport === null) {
      setInset(0);
      return;
    }
    const read = () =>
      setInset(keyboardInsetOf({ innerHeight: window.innerHeight, viewportHeight: viewport.height, viewportOffsetTop: viewport.offsetTop }));
    read();
    viewport.addEventListener('resize', read);
    viewport.addEventListener('scroll', read);
    return () => {
      viewport.removeEventListener('resize', read);
      viewport.removeEventListener('scroll', read);
    };
  }, [active]);
  return inset;
}

/**
 * LA FEUILLE RAPPORTE SA BARRE À L'HÔTE tant qu'on écrit : son bord haut et la
 * hauteur du cadre qui la porte (son `offsetParent` — la scène de la story, le
 * cadre des Réels), remesurés à chaque changement de taille (liste retirée,
 * bandeau de réponse, clavier). On cesse d'écrire ⇒ `null`.
 */
export function useWritingBarReport({
  sheet,
  writing,
  keyboardInset,
  report,
}: {
  readonly sheet: { readonly current: HTMLElement | null };
  readonly writing: boolean;
  readonly keyboardInset: number;
  readonly report: ((bar: WritingBar | null) => void) | undefined;
}): void {
  const reportRef = useRef(report);
  reportRef.current = report;
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!writing || el === null) {
      reportRef.current?.(null);
      return;
    }
    const frame = el.offsetParent instanceof HTMLElement ? el.offsetParent : null;
    const measure = () => reportRef.current?.({ barTop: el.offsetTop, frameHeight: frame?.clientHeight ?? window.innerHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (frame !== null) observer.observe(frame);
    return () => observer.disconnect();
  }, [sheet, writing, keyboardInset]);
  useEffect(() => () => reportRef.current?.(null), []);
}
