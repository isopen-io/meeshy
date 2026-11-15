import { useEffect, useRef, useState } from 'react';

import { choiceAfterSharerChange, type SpotlightChoice } from './call-spotlight';

/**
 * **LE CHOIX LOCAL DE LA UNE** (#8392) — l'état de l'écran d'appel, que le partageur qui change fait tomber : un
 * partage qui COMMENCE prend la une même après un choix manuel (#18180), et la fin d'un partage congédié par
 * « Grille » rend la main à la règle (`choiceAfterSharerChange`, miroir de `GroupCallSpotlight.choiceAfterSharerChanged`
 * d'Android).
 */
export function useSpotlightChoice(sharer: string | null): readonly [SpotlightChoice, (choice: SpotlightChoice) => void] {
  const [choice, setChoice] = useState<SpotlightChoice>(null);
  const seen = useRef(sharer);
  useEffect(() => {
    const from = seen.current;
    seen.current = sharer;
    setChoice((current) => choiceAfterSharerChange(current, from, sharer));
  }, [sharer]);
  return [choice, setChoice];
}
