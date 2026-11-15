import { useEffect, useRef } from 'react';

import { usePrefersReducedMotion } from '@/lib/lottie/use-reduced-motion';
import { createRainEngine, RAIN_DEFAULTS } from '@/lib/mood/rain';
import { browserRainScheduler, mountMoodRain, type RainScheduler } from '@/lib/mood/rain-dom';

/**
 * **LA PLUIE DE L'EMOJI D'UNE HUMEUR** (#10813) — la couche qui peuple la page :
 * des instances naissent partout, grossissent en se balançant et s'effacent
 * (`lib/mood/rain.ts` dit comment, `rain-dom.ts` les pose). Décorative de bout
 * en bout : `aria-hidden`, aucun pointeur.
 *
 * « Réduire les animations » : aucune pluie — l'emoji reste au centre, posé
 * par la page. Le démontage retire chaque nœud et annule l'image demandée.
 */
export function MoodRain({
  emoji,
  scheduler = browserRainScheduler,
  random = Math.random,
}: {
  readonly emoji: string;
  readonly scheduler?: RainScheduler;
  readonly random?: () => number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (host === null || reduced || emoji === '') return undefined;
    const viewport = () => ({ width: host.clientWidth || window.innerWidth, height: host.clientHeight || window.innerHeight });
    const engine = createRainEngine({ viewport, random, ...RAIN_DEFAULTS });
    return mountMoodRain(host, { emoji, engine, viewport, scheduler });
  }, [emoji, reduced, scheduler, random]);

  return <div ref={hostRef} data-mood-rain aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" />;
}
