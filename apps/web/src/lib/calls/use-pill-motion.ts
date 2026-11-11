import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { STOW_REDUCED_MS, SWAP_MS, type SwapShape } from './call-pill-motion';
import { useRailPresence } from './use-rail-presence';

/**
 * **LE MOUVEMENT DU VERRE, CHARGÉ À PART** (#17536) — les crochets minces que l'écran d'appel
 * branche ; le moteur (`pill-motion-engine.ts`) vit dans son chunk et se charge dès qu'un
 * verre ou un chrome en a besoin : l'appel vivant l'a donc bien avant le premier toucher.
 */
type Engine = typeof import('./pill-motion-engine');

let loaded: Engine | null = null;

/** Le moteur, chargé UNE fois (l'import dynamique se retient lui-même). */
export const loadPillMotion = (): Promise<Engine> => import('./pill-motion-engine').then((module) => (loaded = module));

/** Le moteur dès qu'il est là : le rendu qui l'attend est refait une fois, à son arrivée. */
function usePillEngine(): Engine | null {
  const [engine, arrived] = useState(loaded);
  useEffect(() => {
    if (engine === null) void loadPillMotion().then(arrived, () => undefined);
  }, [engine]);
  return engine;
}

/** Le verre de la pilule : morphisme à chaque changement de taille, resserré autour des sous-titres quand `stowed`. */
export function usePillGlass(box: RefObject<HTMLElement | null>, skin: RefObject<HTMLElement | null>, stowed: boolean): void {
  const engine = usePillEngine();
  const glass = useRef<ReturnType<Engine['createPillGlass']> | null>(null);
  useLayoutEffect(() => {
    if (glass.current === null && engine !== null && box.current !== null && skin.current !== null) glass.current = engine.createPillGlass(box.current, skin.current);
    glass.current?.update(stowed);
  });
  useEffect(() => () => glass.current?.dispose(), []);
}

/** Ranger les commandes ou les rendre, sous « Réduire les animations » : un fondu court au lieu d'un déplacement. */
export function useStowFade(root: RefObject<HTMLElement | null>, stowed: boolean): void {
  const engine = usePillEngine();
  const before = useRef(stowed);
  useLayoutEffect(() => {
    if (before.current === stowed) return;
    before.current = stowed;
    if (root.current !== null) engine?.fadeStow(root.current, stowed);
  }, [root, stowed]);
}

/**
 * Un fondu d'opacité que « Réduire les animations » raccourcit sans le couper (G4.6, #17567) :
 * joué par le moteur, en Web Animations, là où une transition CSS serait éteinte par la règle
 * générale. Un changement en plein fondu repart de l'opacité affichée ; `done` ne vient que
 * pour le dernier. La première peinture ne joue rien, et tant que le moteur n'est pas là,
 * l'opacité se pose d'un coup.
 */
export function useOpacityFade(ref: RefObject<HTMLElement | null>, on: boolean, ms: number, done?: () => void): void {
  const engine = usePillEngine();
  const running = useRef<Animation | null>(null);
  const painted = useRef(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    running.current = engine === null ? null : engine.fadeOpacity(element, on ? 1 : 0, painted.current ? ms : 0, running.current);
    if (engine === null) element.style.opacity = on ? '1' : '0';
    painted.current = true;
    if (running.current === null) done?.();
    else running.current.finished.then(done, () => undefined);
  }, [on]);
}

/**
 * Un élément qui en remplace un autre (Réglages du mode Effets, la capsule de l'en-tête) : monté
 * dès qu'il est demandé et jusqu'à la fin de son départ ; arrive en fondu et en montée (`rise`) ou
 * en échelle (`scale`), repart de même — en fondu seul sous « Réduire les animations » —, joué par
 * le moteur : la règle générale qui coupe les transitions CSS ne l'éteint pas. La première peinture
 * ne joue rien ; tant que le moteur n'est pas là, l'élément se pose d'un coup.
 */
export function useSwapPresence<E extends HTMLElement>(open: boolean, shape: SwapShape = 'rise'): { readonly mounted: boolean; readonly ref: RefObject<E | null> } {
  const engine = usePillEngine();
  const { mounted } = useRailPresence(open, { exitMs: SWAP_MS, reducedExitMs: STOW_REDUCED_MS });
  const ref = useRef<E | null>(null);
  const running = useRef<Animation | null>(null);
  const painted = useRef(false);
  useLayoutEffect(() => {
    if (painted.current && ref.current !== null) running.current = engine?.playSwap(ref.current, open, running.current, shape) ?? null;
    painted.current = true;
  }, [open]);
  return { mounted, ref };
}
