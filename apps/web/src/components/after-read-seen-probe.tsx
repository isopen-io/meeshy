import { useContext, useEffect, useRef } from 'react';

import { useModalLayersOpen } from '@/lib/view/modal-layers';
import { AfterReadSeenContext } from '@/lib/view/use-after-read-consumption';

/**
 * Le temps qu'une rangée doit rester à l'écran pour être VUE — assez pour
 * écarter la traversée d'un défilement rapide, assez court pour qu'un regard
 * suffise.
 */
export const AFTER_READ_SEEN_DWELL_MS = 600;

/**
 * UNE FLAMME-ŒIL VUE AU MILIEU DU FIL (#8343) — la frontière de lecture
 * (`useReadTracking`) n'avance qu'en BAS du fil : une rangée lue en remontant
 * l'historique ne comptait jamais comme vue. Cette sonde, posée sur la rangée
 * (couvrant sa hauteur, sans capter aucun geste), la déclare vue quand elle
 * est à l'écran `AFTER_READ_SEEN_DWELL_MS` durant, onglet au premier plan et
 * sans couche par-dessus — les trois refus de la détection de lecture.
 */
export function AfterReadSeenProbe({ messageId }: { readonly messageId: string }) {
  const noteSeen = useContext(AfterReadSeenContext);
  const modalOpen = useModalLayersOpen();
  const node = useRef<HTMLSpanElement>(null);
  const modalRef = useRef(modalOpen);
  modalRef.current = modalOpen;

  useEffect(() => {
    const target = node.current;
    if (noteSeen === null || target === null || typeof IntersectionObserver === 'undefined') return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined || done) return;
        if (!entry.isIntersecting) {
          stop();
          return;
        }
        if (timer !== null) return;
        /* Un refus (onglet masqué, couche par-dessus) RÉARME l'attente tant
           que la rangée reste à l'écran : la couche refermée, la rangée
           toujours là finit par compter, sans nouvel événement de géométrie. */
        const arm = () => {
          timer = setTimeout(() => {
            if (document.visibilityState === 'hidden' || modalRef.current) {
              arm();
              return;
            }
            timer = null;
            done = true;
            noteSeen(messageId);
            observer.disconnect();
          }, AFTER_READ_SEEN_DWELL_MS);
        };
        arm();
      },
      { threshold: 0.6 },
    );
    observer.observe(target);
    return () => {
      stop();
      observer.disconnect();
    };
  }, [noteSeen, messageId]);

  return (
    <span
      ref={node}
      data-after-read-probe
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    />
  );
}
