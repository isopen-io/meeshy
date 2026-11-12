import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import { LEAVING, STOW_REDUCED_MS, SWAP_MS, type SwapShape } from './call-pill-motion';
import { useRailPresence } from './use-rail-presence';

/**
 * **LE MOUVEMENT DES MODES D'APPEL** (P8b.6, #17580) — les crochets que la barre de verre et le
 * panneau Réglages du mode Effets branchent ; le moteur (`pill-motion-engine.ts`, ses lois dans
 * `call-pill-motion.ts`) est le même que celui de la pilule, chargé à part.
 *
 * Ils ne vivent pas dans `use-pill-motion.ts` : ce fichier est celui de l'écran d'appel, et un
 * module que l'écran et un mode partagent devient un chunk de plus, dont le NOM entre dans la
 * liste de préchargement du module d'entrée — de quoi faire passer la première peinture au-dessus
 * de son plafond (mesuré : +0,04 Ko). Seul le chargement du moteur y est redit, et `import()`
 * se retient lui-même : un seul moteur, chargé une fois.
 */
type Engine = typeof import('./pill-motion-engine');

let loaded: Engine | null = null;

/** Le moteur, chargé UNE fois. */
export const loadModeMotion = (): Promise<Engine> => import('./pill-motion-engine').then((module) => (loaded = module));

function useEngine(): Engine | null {
  const [engine, arrived] = useState(loaded);
  useEffect(() => {
    if (engine === null) void loadModeMotion().then(arrived, () => undefined);
  }, [engine]);
  return engine;
}

/**
 * Le verre d'une barre de mode : morphisme à chaque changement de taille (les puces qui partent,
 * ou reviennent), et ce qui la surmonte (`rider`) suit son bord du haut, dans le même mouvement.
 */
export function useModeGlass(box: RefObject<HTMLElement | null>, skin: RefObject<HTMLElement | null>, rider?: RefObject<HTMLElement | null>): void {
  const engine = useEngine();
  const glass = useRef<ReturnType<Engine['createPillGlass']> | null>(null);
  useLayoutEffect(() => {
    if (glass.current === null && engine !== null && box.current !== null && skin.current !== null) glass.current = engine.createPillGlass(box.current, skin.current, rider?.current ?? null);
    glass.current?.update(false);
  });
  useEffect(() => () => glass.current?.dispose(), []);
}

/**
 * Un élément qui en remplace un autre (Réglages du mode Effets) : monté dès qu'il est demandé et
 * jusqu'à la fin de son départ ; arrive en fondu et en montée, repart de même — en fondu seul sous
 * « Réduire les animations » —, joué par le moteur : la règle générale qui coupe les transitions
 * CSS ne l'éteint pas. La première peinture ne joue rien ; tant que le moteur n'est pas là,
 * l'élément se pose d'un coup.
 */
export function useSwapPresence<E extends HTMLElement>(open: boolean): { readonly mounted: boolean; readonly ref: RefObject<E | null> } {
  const engine = useEngine();
  const { mounted } = useRailPresence(open, { exitMs: SWAP_MS, reducedExitMs: STOW_REDUCED_MS });
  const ref = useRef<E | null>(null);
  const running = useRef<Animation | null>(null);
  const painted = useRef(false);
  useLayoutEffect(() => {
    if (painted.current && ref.current !== null) running.current = engine?.playSwap(ref.current, open, running.current) ?? null;
    painted.current = true;
  }, [open]);
  return { mounted, ref };
}

/**
 * Un rail latéral, sous « Réduire les animations » (#17643) : la feuille de l'application coupe
 * toute transition CSS (`transition-duration: 0s !important`), le rail ne pourrait que paraître
 * et disparaître d'un coup ; le moteur le fait fondre (opacité seule, 150 ms), interruptible.
 * Hors de ce régime, la transition du rail (translation + opacité) est la sienne : rien ici.
 */
export function useRailFade<E extends HTMLElement>(shown: boolean): RefObject<E | null> {
  const engine = useEngine();
  const ref = useRef<E | null>(null);
  const running = useRef<Animation | null>(null);
  const painted = useRef(false);
  useLayoutEffect(() => {
    if (painted.current && ref.current !== null && prefersReducedMotion()) running.current = engine?.playSwap(ref.current, shown, running.current) ?? null;
    painted.current = true;
  }, [shown]);
  return ref;
}

/**
 * **LE MONTAGE MONTE DU BAS ET Y REDESCEND** (C1.12, #17813 ; `CallModeChromeMotion.risesFromBottom` d'iOS,
 * Effets excepté) — sa barre et son carrousel (`controls`) arrivent par le bord du bas et repartent par lui,
 * son fond (`backdrop`, l'aperçu plein écran) se fond ; sous « Réduire les animations », un fondu court sans
 * montée. Joué par le moteur, que la règle générale n'éteint pas, et interruptible : revenir pendant le départ
 * repart de l'opacité affichée. Le mode qui repart reste monté jusqu'à la fin de son mouvement, puis appelle
 * `gone`. Retourne ce que porte l'élément qui repart (ni focus ni clic). Le moteur est chargé AVEC le mode
 * (`loadMontageModeText`) : l'arrivée est jouée dès le premier rendu ; sans moteur, le mode se pose et repart d'un coup.
 */
export function useModeRise(controls: RefObject<HTMLElement | null>, backdrop: RefObject<HTMLElement | null>, leaving: boolean, gone: () => void): typeof LEAVING | Record<string, never> {
  const engine = useEngine();
  const running = useRef<ReadonlyArray<Animation | null>>([]);
  const phase = useRef<boolean | null>(null);
  const done = useRef(gone);
  done.current = gone;
  useLayoutEffect(() => {
    if (phase.current === leaving) return;
    phase.current = leaving;
    const parts: ReadonlyArray<readonly [HTMLElement | null, SwapShape]> = [
      [controls.current, 'bottom'],
      [backdrop.current, 'fade'],
    ];
    const played = parts.map(([element, shape], index) => (element === null || engine === null ? null : engine.playSwap(element, !leaving, running.current[index] ?? null, shape)));
    running.current = played;
    if (!leaving) return;
    const moving = played.filter((animation): animation is Animation => animation !== null);
    if (moving.length === 0) done.current();
    else void Promise.all(moving.map((animation) => animation.finished)).then(() => done.current(), () => undefined);
  }, [leaving, engine]);
  return leaving ? LEAVING : {};
}
