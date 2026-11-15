import { useEffect, useState } from 'react';

import { secondClock, type IntervalClock } from './interval-clock';

/**
 * L'INSTANT, POUR UNE LIGNE QUI DÉCOMPTE (#7547) — rend `now` rafraîchi à la
 * seconde tant que `deadlineMs` n'est pas atteinte, puis FIGÉ à l'échéance.
 *
 * C'est ce qui fait passer seule une ligne éphémère de « 🔥 4 min » à
 * « ⏱ Message expiré », sans attendre `message:expired` : la ligne recompose
 * avec cet instant, et c'est le composeur partagé qui tranche.
 *
 * S'ABONNE SEULEMENT tant qu'il reste du temps — motif `useCountdown` : une
 * ligne sans échéance, ou échue, ne réveille rien (dimension 3), et une seule
 * ligne tique, jamais la liste entière (dimension 4).
 */
export function useLiveNow(
  deadlineMs: number | undefined,
  clock: IntervalClock = secondClock,
  now: () => number = () => Date.now(),
): number {
  const [instant, setInstant] = useState(now);

  useEffect(() => {
    const start = now();
    setInstant(start);
    if (deadlineMs === undefined || start >= deadlineMs) return;
    const unsubscribe = clock.subscribe((tickNow) => {
      setInstant(tickNow);
      if (tickNow >= deadlineMs) unsubscribe();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` est STABLE par appelant ; le suivre relancerait l'abonnement à chaque rendu.
  }, [deadlineMs, clock]);

  return instant;
}
