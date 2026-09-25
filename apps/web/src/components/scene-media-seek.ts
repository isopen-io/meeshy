import { useEffect } from 'react';

import { mediaSeekTarget } from '@/lib/canvas/media-seek';

import type { SceneClockHandle } from './scene-clock';

/** En deçà, le média est déjà « là » : le reposer relancerait un décodage
 * pour une image identique — le seek est TOLÉRANT. */
const SEEK_TOLERANCE_SECONDS = 0.05;

/** Pose `currentTime` si l'écart le justifie ; un élément qui refuse (réseau,
 * source protégée non résolue) garde sa position, sans casser le geste. */
export function alignMediaElement(el: HTMLMediaElement, target: number): void {
  if (Math.abs(el.currentTime - target) < SEEK_TOLERANCE_SECONDS) return;
  try {
    el.currentTime = target;
  } catch {
    // Un élément sans données seekables ignore la position — le prochain seek la reposera.
  }
}

/**
 * LE PARCOURS AU DOIGT (#7879) — un `<video>`/`<audio>` de la scène se recale
 * sur l'horloge à CHAQUE `seek` (jamais à chaque trame : pendant la lecture,
 * il court sur sa propre horloge). La pause pendant le glissé vient de
 * `playing`, que l'hôte coupe ; la reprise repart de la position posée ici.
 */
export function useMediaSeek(params: {
  readonly ref: { readonly current: HTMLMediaElement | null };
  readonly clock: SceneClockHandle | null;
  readonly loop: boolean;
}): void {
  const { ref, clock, loop } = params;
  useEffect(() => {
    if (clock === null) return;
    return clock.subscribeSeek((t) => {
      const el = ref.current;
      if (el === null) return;
      const target = mediaSeekTarget({ t, mediaDuration: el.duration, loop });
      if (target !== null) alignMediaElement(el, target);
    });
  }, [clock, loop, ref]);
}
