import { useEffect, useState } from 'react';

import { minuteClock } from './minute-clock';

/**
 * LA MINUTE COURANTE, comme CLÉ DE DÉPENDANCE.
 *
 * Une vue dont le rendu dépend de « maintenant » — le sectionnement de la
 * Lentille en AUJOURD'HUI / HIER / CETTE SEMAINE, par exemple — ne peut pas
 * mémoriser son calcul sur les seules entrées de données : à minuit, les
 * mêmes conversations changent de section sans qu'aucune d'elles n'ait bougé.
 * Ce crochet rend un ENTIER qui change une fois par minute (le numéro de la
 * minute), et qu'un `useMemo` prend en dépendance : le calcul se refait à la
 * minute, jamais à l'image.
 *
 * L'horloge est celle, PARTAGÉE, de `minute-clock.ts` — un seul
 * `setInterval` pour toute l'application, celui-là même auquel les heures
 * relatives des rangées s'abonnent. Jamais un second minuteur.
 */
export function useMinute(): number {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));

  useEffect(() => minuteClock.subscribe((now) => setMinute(Math.floor(now / 60_000))), []);

  return minute;
}
