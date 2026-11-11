import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

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
