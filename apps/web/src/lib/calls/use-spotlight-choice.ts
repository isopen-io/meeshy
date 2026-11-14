import { useEffect, useRef, useState } from 'react';

import { choiceAfterSharerChange, type SpotlightChoice } from './call-spotlight';

/**
 * **LE CHOIX LOCAL DE LA UNE** (#8392) — l'état de l'écran d'appel, que le partageur qui change (il s'arrête,
 * un autre prend le relais, le même repart) fait tomber s'il n'était que « Grille » : la règle reprend la main
 * (`choiceAfterSharerChange`, miroir de `GroupCallSpotlight.choice(afterSharerChangedFrom:)` d'iOS).
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
