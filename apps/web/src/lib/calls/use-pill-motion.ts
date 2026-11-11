import { createElement, type ReactNode, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import type { MorphRect, SwapShape } from './call-pill-motion';

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

/** Ce que porte ce qui repart : marqué sortant, ni focus ni clic, caché au lecteur d'écran. */
export const LEAVING = { 'data-leaving': '', inert: true, 'aria-hidden': true } as const;

/**
 * CE QUI ENTRE ET REPART AVEC SA VALEUR (la capsule de l'en-tête, P9.8, #17509) — la dernière
 * valeur non nulle reste montée le temps de son départ, marquée {@link LEAVING}, et se démonte
 * quand le mouvement du moteur (`playSwap`) est FINI : aucune durée redite ici, la sortie dure ce
 * que dure son mouvement, fondu court sous « Réduire les animations » compris. Un retour pendant
 * le départ repart de l'opacité affichée. La première peinture ne joue rien ; sans moteur, la
 * valeur se pose et repart d'un coup.
 */
function useHeldSwap<T>(value: T | null, shape: SwapShape): { readonly held: T | null; readonly leaving: typeof LEAVING | null; readonly ref: RefObject<HTMLDivElement | null> } {
  const engine = usePillEngine();
  const last = useRef(value);
  if (value !== null) last.current = value;
  const present = value !== null;
  const [gone, setGone] = useState(!present);
  const ref = useRef<HTMLDivElement | null>(null);
  const running = useRef<Animation | null>(null);
  const painted = useRef(false);
  useLayoutEffect(() => {
    const played = painted.current && ref.current !== null ? (engine?.playSwap(ref.current, present, running.current, shape) ?? null) : null;
    painted.current = true;
    running.current = played;
    const finished = played?.finished;
    if (present) setGone(false);
    else if (finished === undefined) setGone(true);
    else finished.then(() => setGone(true), () => undefined);
  }, [present]);
  return { held: present || !gone ? last.current : null, leaving: present ? null : LEAVING, ref };
}

/**
 * L'hôte de {@link useHeldSwap} : un bloc qui porte ses attributs (`className`, `data-*`) et rend
 * `children` de la valeur retenue ; par défaut il grandit depuis son ancre (`scale`, l'ancre est
 * `transform-origin`, posée par la feuille). Il vit ici, avec le mouvement, et non dans l'écran d'appel
 * (`budgets.json` › `call_overlay`).
 */
export function HeldSwap<T>({ value, shape = 'scale', children, ...attributes }: { readonly value: T | null; readonly shape?: SwapShape; readonly children: (held: T) => ReactNode; readonly className?: string } & { readonly [data: `data-${string}`]: string }) {
  const { held, leaving, ref } = useHeldSwap(value, shape);
  return held === null ? null : createElement('div', { ref, ...attributes, ...leaving }, children(held));
}

/**
 * La scène audio du duo, pleine ou compacte (#17529, P9b) : quand `compact` change, l'avatar est relevé
 * AU RENDU qui le change, le DOM montrant encore l'état d'avant (un passage en cours compris), puis le
 * moteur le fait glisser vers sa nouvelle place. La première peinture ne joue rien. La mesure vit dans le
 * moteur : ce crochet n'importe que des types, et l'écran ne précharge aucun chunk de plus.
 */
export function useStageMorph(stage: RefObject<HTMLElement | null>, compact: boolean): void {
  const engine = usePillEngine();
  const committed = useRef<boolean | null>(null);
  const first = useRef<MorphRect | null>(null);
  const running = useRef<readonly Animation[]>([]);
  if (committed.current !== null && committed.current !== compact) first.current = engine?.stagePortraitRect(stage.current) ?? null;
  useLayoutEffect(() => {
    const before = committed.current;
    const from = first.current;
    committed.current = compact;
    first.current = null;
    if (before === null || before === compact || stage.current === null || engine === null) return;
    running.current = engine.playStageMorph(stage.current, from, running.current);
  }, [compact]);
}
