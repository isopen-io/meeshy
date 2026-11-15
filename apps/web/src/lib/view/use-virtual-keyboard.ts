import { useEffect, useRef, useState } from 'react';

import { nextKeyboardBaseline, virtualKeyboardOf, type KeyboardBaseline } from '@/lib/view/comments-zone';

export type VirtualKeyboard = { readonly inset: number; readonly open: boolean };

const CLOSED: VirtualKeyboard = { inset: 0, open: false };

const sameKeyboard = (a: VirtualKeyboard, b: VirtualKeyboard): boolean => a.inset === b.inset && a.open === b.open;

/**
 * LE CLAVIER VIRTUEL, LU AU `visualViewport` tant que `active` (#9894) — son
 * retrait (Safari iOS, qui recouvre) et son ouverture (la coque Android, qui
 * redimensionne la WebView). La référence est la plus grande vue visible vue
 * à largeur égale : la mesure prise à l'activation, avant que le clavier ne
 * monte, en est la première.
 */
export function useVirtualKeyboard(active: boolean): VirtualKeyboard {
  const [keyboard, setKeyboard] = useState<VirtualKeyboard>(CLOSED);
  const baseline = useRef<KeyboardBaseline | null>(null);
  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!active || viewport === undefined || viewport === null) {
      setKeyboard(CLOSED);
      return;
    }
    const read = () => {
      const seen = { width: viewport.width, height: viewport.height };
      baseline.current = nextKeyboardBaseline(baseline.current, seen);
      const next = virtualKeyboardOf({
        innerHeight: window.innerHeight,
        viewportHeight: viewport.height,
        viewportOffsetTop: viewport.offsetTop,
        baseline: baseline.current,
      });
      setKeyboard((current) => (sameKeyboard(current, next) ? current : next));
    };
    read();
    viewport.addEventListener('resize', read);
    viewport.addEventListener('scroll', read);
    return () => {
      viewport.removeEventListener('resize', read);
      viewport.removeEventListener('scroll', read);
    };
  }, [active]);
  return keyboard;
}
