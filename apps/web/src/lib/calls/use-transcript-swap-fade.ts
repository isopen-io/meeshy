import { useLayoutEffect, useRef, type RefObject } from 'react';

import { PILL_TEXT_EXIT } from '@/lib/calls/call-pill-text-exit';

/**
 * **LA BASCULE SE FAIT EN FONDU** (#17897, loi 17 : rien n'apparaît ni ne disparaît d'un coup) —
 * quand l'état « Voir l'original » change, les deux lignes de chaque phrase traduite (repérées
 * `data-call-transcript-swap`) refondent de 0 à 1 le temps d'`PILL_TEXT_EXIT`. L'OPACITÉ seule :
 * aucun déplacement, donc rien à retirer sous « Réduire les animations ». Lancé avant la peinture
 * (`useLayoutEffect`) : le nouveau texte n'apparaît jamais une image en pleine opacité. La première
 * peinture ne fond pas, et une phrase sans traduction, seule, n'a rien à refondre.
 */
export function useTranscriptSwapFade(original: boolean): RefObject<HTMLElement | null> {
  const section = useRef<HTMLElement | null>(null);
  const seen = useRef(original);
  useLayoutEffect(() => {
    if (seen.current === original) return;
    seen.current = original;
    section.current?.querySelectorAll('[data-call-transcript-swap]').forEach((line) => {
      if (typeof line.animate === 'function') line.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PILL_TEXT_EXIT.exitMs, easing: 'ease-out' });
    });
  }, [original]);
  return section;
}
