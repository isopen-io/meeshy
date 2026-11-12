import { createElement, type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

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
export function HeldSwap<T>({ value, shape = 'scale', children, ...attributes }: { readonly value: T | null; readonly shape?: SwapShape; readonly children: (held: T) => ReactNode; readonly className?: string; readonly style?: CSSProperties } & { readonly [data: `data-${string}`]: string }) {
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

/** Ce que montre la couche d'appel : l'écran plein, ou la capsule de l'appel réduit. */
export type CallView = 'screen' | 'pill';

/**
 * Le rôle d'une vue dans l'échange : `leaving` — elle repart, montée le temps de son mouvement ; `arrives` —
 * elle se monte en prenant la place de l'autre ; `gone` — à appeler quand son départ est fini.
 */
export type ViewMotion = { readonly leaving: boolean; readonly arrives: boolean; readonly gone: () => void };

/**
 * **L'ÉCRAN D'APPEL ET LA CAPSULE S'ÉCHANGENT** (S1.7, S2.1, #17774) — la vue qui repart reste montée,
 * marquée {@link LEAVING}, jusqu'à la fin de son mouvement (`useViewMotion`) pendant que l'autre arrive. Seul
 * l'échange de l'une à l'autre se joue : un appel qui s'ouvre, ou une bulle qui rend l'écran, ne jouent rien
 * (aucune vue d'où ils viennent), et la vue qui s'en va vers la bulle se démonte à l'instant. Revenir à la vue
 * qui repart la rend à l'arrivée, sans la remonter.
 */
export function useViewHold(view: CallView | null): { readonly screen: ViewMotion | null; readonly pill: ViewMotion | null } {
  const last = useRef<CallView | null>(view);
  const held = useRef<CallView | null>(null);
  const [, redraw] = useState(0);
  if (view !== last.current) {
    held.current = view !== null && last.current !== null ? last.current : null;
    last.current = view;
  }
  const gone = (which: CallView) => () => {
    if (held.current !== which) return;
    held.current = null;
    redraw((count) => count + 1);
  };
  const motionOf = (which: CallView): ViewMotion | null => (view === which ? { leaving: false, arrives: held.current !== null, gone: gone(which) } : held.current === which ? { leaving: true, arrives: false, gone: gone(which) } : null);
  return { screen: motionOf('screen'), pill: motionOf('pill') };
}

/**
 * Le mouvement d'une vue sur son propre élément (`root`) : à l'arrivée du fondu et de l'échelle, au départ
 * l'inverse, puis `gone`. Sans moteur ou sans animation, le départ est immédiat. Interruptible.
 */
export function useViewMotion(root: RefObject<HTMLElement | null>, motion: ViewMotion | undefined): void {
  const engine = usePillEngine();
  const running = useRef<Animation | null>(null);
  const was = useRef<boolean | null>(null);
  const leaving = motion?.leaving;
  useLayoutEffect(() => {
    const element = root.current;
    if (motion === undefined || element === null) return;
    const before = was.current;
    was.current = motion.leaving;
    if (before === null ? !motion.arrives && !motion.leaving : before === motion.leaving) return;
    const played = engine?.playViewSwap(element, !motion.leaving, running.current) ?? null;
    running.current = played;
    if (!motion.leaving) return;
    if (played === null) motion.gone();
    else played.finished.then(motion.gone, () => undefined);
  }, [leaving, engine]);
}

/** La capsule qui devient pastille ordinaire, ou l'inverse, quand le partage finit ou commence : le même mouvement d'arrivée. */
export function useFormSwap(root: RefObject<HTMLElement | null>, form: boolean): void {
  const engine = usePillEngine();
  const running = useRef<Animation | null>(null);
  const before = useRef(form);
  useLayoutEffect(() => {
    if (before.current === form) return;
    before.current = form;
    if (root.current !== null) running.current = engine?.playViewSwap(root.current, true, running.current) ?? null;
  }, [form]);
}

/**
 * **LA PILE DES BANDEAUX SE REFERME EN MOUVEMENT** (S2.6, #17774) — quand `key` (les bandeaux présents) change, la
 * place de chacun est relevée AU RENDU qui le change (le DOM montre encore l'ancienne pile), puis chacun rejoint la
 * sienne par la transformation seule. Rien n'est mesuré tant que `key` ne change pas, ni tant que le moteur n'est pas là.
 */
export function useBannersClose(stack: RefObject<HTMLElement | null>, key: string): void {
  const engine = usePillEngine();
  const committed = useRef(key);
  const first = useRef<ReadonlyMap<Element, number> | null>(null);
  if (key !== committed.current && first.current === null && loaded !== null) first.current = loaded.measureBanners(stack.current);
  useLayoutEffect(() => {
    const from = first.current;
    first.current = null;
    committed.current = key;
    if (from !== null && stack.current !== null) engine?.playBannersClose(stack.current, from);
  }, [key]);
}

/**
 * CE QUI FLOTTE À UNE PLACE QUE LA PILE LUI GARDE LA SUIT (S2.6, #17774) — l'indicateur d'enregistrement vit hors
 * de la pile, à la hauteur de sa case : quand `place` change, il est relevé AU RENDU qui le change, puis rejoint sa
 * nouvelle place par la transformation seule, avec la case qu'il suit, au lieu de sauter.
 */
export function useFollowPlace(node: RefObject<HTMLElement | null>, place: number): void {
  const engine = usePillEngine();
  const committed = useRef(place);
  const first = useRef<number | undefined>(undefined);
  if (place !== committed.current && first.current === undefined && loaded !== null) first.current = loaded.placeOf(node.current);
  useLayoutEffect(() => {
    const from = first.current;
    first.current = undefined;
    committed.current = place;
    if (from !== undefined && node.current !== null) engine?.slideFrom(node.current, from);
  }, [place]);
}
