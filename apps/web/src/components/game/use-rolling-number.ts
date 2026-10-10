import { useEffect, useRef, useState } from 'react';

import { prefersReducedMotion } from '@/lib/game/haptics';
import { ROLL_MS, rolledValue } from '@/lib/game/rolling';

/**
 * LE CHIFFRE QUI ROULE, côté écran (#9494) — la valeur AFFICHÉE d'un nombre
 * que le serveur met à jour. À l'arrivée de l'écran elle vaut la cible tout de
 * suite (cache d'abord : rien ne roule à la première peinture) ; quand la
 * cible change, elle défile de ce qui est affiché à la nouvelle valeur
 * (`rolledValue`), une image par rafraîchissement. Une cible qui change en
 * plein défilé repart de là où le chiffre en est, jamais de zéro.
 *
 * `prefers-reduced-motion` : le chiffre saute à sa valeur, aucune image n'est
 * demandée. Le démontage annule la boucle. Les dépendances du navigateur
 * entrent par `RollEnv` : le rythme se teste avec une file d'images à la main.
 */
export type RollEnv = {
  readonly reducedMotion: () => boolean;
  readonly raf: (callback: (timestamp: number) => void) => number;
  readonly cancelRaf: (id: number) => void;
};

const browserRoll = (): RollEnv => ({
  reducedMotion: () => prefersReducedMotion(),
  raf: (callback) => requestAnimationFrame(callback),
  cancelRaf: (id) => cancelAnimationFrame(id),
});

export function useRollingNumber(target: number, env?: RollEnv): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const envRef = useRef(env);
  envRef.current = env;

  useEffect(() => {
    const roll = envRef.current ?? browserRoll();
    const settle = (value: number): void => {
      shownRef.current = value;
      setShown(value);
    };
    if (shownRef.current === target) return undefined;
    if (roll.reducedMotion() || !Number.isFinite(target)) {
      settle(target);
      return undefined;
    }
    const from = shownRef.current;
    let start: number | null = null;
    let id = 0;
    const frame = (timestamp: number): void => {
      start ??= timestamp;
      const elapsed = timestamp - start;
      settle(rolledValue(from, target, elapsed));
      if (elapsed < ROLL_MS) id = roll.raf(frame);
    };
    id = roll.raf(frame);
    return () => roll.cancelRaf(id);
  }, [target]);

  return shown;
}
