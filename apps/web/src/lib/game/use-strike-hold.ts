import { useEffect, useRef, useState } from 'react';

import { strikeGate, type StrikeGate } from './strike-gate';

/**
 * CE QUE LA FRAPPE CHANGE ATTEND LA FIN DE LA FRAPPE (#11482) — le porteur, le 2026-10-21 : « dans la vue Héritage,
 * le compteur de Meeshes augmente avant la fin de l'animation de frappe ! ». La porte (`strike-gate.ts`) retient
 * l'écriture optimiste de la frappe, mais pas le reste : la passerelle confirme PENDANT la cérémonie et relaie l'état
 * du jeu (`game:updated`, la relecture qui suit), si bien que la valeur servie bouge alors que le marteau est levé.
 *
 * Ce crochet tient la valeur d'AVANT le geste, quelle que soit la valeur servie entre-temps : il la capture au début
 * de la frappe et la rend quand la frappe est FINIE — la scène est allée au bout (ou un toucher l'a passée) ET la
 * passerelle a répondu. Une confirmation rend la valeur servie et compte une ARRIVÉE (`arrivals`, pour un mouvement
 * court) ; un refus la rend sans arrivée : rien n'a changé.
 */
export type StrikeHold<T> = {
  readonly value: T;
  /** Le nombre de frappes arrivées depuis le montage : chacune change ce qu'on montre, une fois. */
  readonly arrivals: number;
};

type Strike = { ended: boolean; answer: 'pending' | 'confirmed' | 'refused'; released: boolean };

export function useStrikeHold<T>(live: T, gate: StrikeGate = strikeGate): StrikeHold<T> {
  const latest = useRef(live);
  latest.current = live;
  const [held, setHeld] = useState<{ readonly value: T } | null>(null);
  const [arrivals, setArrivals] = useState(0);

  useEffect(() => {
    let current: Strike | null = null;
    const release = (strike: Strike): void => {
      if (strike.released || strike !== current || strike.answer === 'pending' || (strike.answer === 'confirmed' && !strike.ended)) return;
      strike.released = true;
      setHeld(null);
      if (strike.answer === 'confirmed') setArrivals((count) => count + 1);
    };
    const leave = gate.onAnswer((answer) => {
      if (answer.kind === 'pending') {
        const strike: Strike = { ended: false, answer: 'pending', released: false };
        current = strike;
        setHeld({ value: latest.current });
        void gate.opened().then(() => {
          strike.ended = true;
          release(strike);
        });
        return;
      }
      if (current === null || answer.kind === 'idle') return;
      current.answer = answer.kind;
      release(current);
    });
    return () => {
      current = null;
      leave();
    };
  }, [gate]);

  return { value: held === null ? live : held.value, arrivals };
}
