import { useEffect, useState } from 'react';

import { countdownRemaining, type MagicLinkDeadline } from './magic-link';
import { secondClock, type IntervalClock } from './interval-clock';

/**
 * LES SECONDES RESTANTES avant l'échéance d'un lien magique — `deadline`
 * `null` quand aucune demande n'est en cours (étape de saisie).
 *
 * S'ABONNE SEULEMENT tant qu'il reste du temps (`remaining > 0`) : à zéro,
 * le compte est FIGÉ et l'horloge à la seconde n'a plus besoin de réveiller
 * ce composant — dimension 3, aucune rétention non bornée (T9 d, #5816).
 *
 * `now` INJECTABLE (défaut `Date.now`) — même discipline que `clock` : un
 * témoin qui fige le temps virtuel (`MagicLinkFlowDeps.now`) doit pouvoir
 * calculer le restant SANS que ce hook retombe sur l'horloge réelle, sans
 * quoi `startedAt` (posé avec le `now` figé) et la lecture initiale (l'horloge
 * réelle) divergeraient de plusieurs années.
 */
export function useCountdown(
  deadline: MagicLinkDeadline | null,
  clock: IntervalClock = secondClock,
  now: () => number = () => Date.now(),
): number {
  const [remaining, setRemaining] = useState(() => (deadline === null ? 0 : countdownRemaining(deadline, now())));

  useEffect(() => {
    if (deadline === null) {
      setRemaining(0);
      return;
    }
    const initial = countdownRemaining(deadline, now());
    setRemaining(initial);
    if (initial <= 0) return;

    // Abonné seulement tant qu'il reste du temps : dès que le tick amène le
    // compte à zéro, on se désabonne NOUS-MÊMES — sans quoi l'horloge
    // partagée continuerait de réveiller ce composant une fois par seconde
    // pour lui faire écrire la même valeur (dimension 3).
    const unsubscribe = clock.subscribe((tickNow) => {
      const next = countdownRemaining(deadline, tickNow);
      setRemaining(next);
      if (next <= 0) unsubscribe();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` est une fonction STABLE par appelant (le défaut `() => Date.now()` est recréé, mais son résultat ne dépend d'aucun état de rendu) ; la suivre romprait la garde de désabonnement à zéro.
  }, [deadline, clock]);

  return remaining;
}
