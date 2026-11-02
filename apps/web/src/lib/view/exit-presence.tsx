import { createContext, isValidElement, useContext, useLayoutEffect, useReducer, useRef, type ReactElement, type ReactNode, type RefObject } from 'react';

import { REORDER_FLIP_DURATION_MS, REORDER_FLIP_EASING } from './list-reorder-flip';
import { prefersReducedMotion } from './reduced-motion';

/**
 * **UNE RANGÉE QUI QUITTE LA LISTE SE REPLIE AVANT DE PARTIR** (#11574).
 *
 * Le FLIP de la liste (`list-reorder-flip.ts`) anime la remontée et l'entrée ;
 * la SORTIE n'existait pas : archiver ou supprimer une conversation retirait sa
 * rangée d'un coup, et chaque rangée du dessous sautait d'un cran. iOS l'anime
 * (`List` + `withAnimation`, la rangée se replie) ; le web le rejoue en deux
 * moitiés qui ne se connaissent pas :
 *
 * - `ExitPresence` GARDE MONTÉE, à sa place, la rangée dont la clé a quitté
 *   ses enfants, et la déclare sortante par contexte ;
 * - `useExitMotion`, posé sur le nœud de la rangée, la rend INERTE (ni focus,
 *   ni clic, ni lecteur d'écran), lui retire sa place dans le flux par une
 *   marge négative STATIQUE, puis la fond et l'écrase depuis son bord haut —
 *   `opacity` et `transform`, rien d'autre (`check-animated-properties.mjs`).
 *   Les rangées du dessous remontent par le FLIP de la liste, qui voit leur
 *   écart au même commit : la place se referme sans qu'aucune hauteur ne
 *   s'anime.
 *
 * La sortie terminée, la rangée quitte le DOM. Revenue dans les enfants avant
 * la fin — le serveur a refusé, le rollback optimiste la rend —, elle n'est
 * plus sortante : l'animation s'annule et la rangée reste, sans sortie.
 *
 * RIEN NE SE MET EN SCÈNE sous `prefers-reduced-motion` (la rangée part tout
 * de suite), quand la PORTÉE change (un filtre, une recherche remplacent la
 * liste, ils ne retirent pas une conversation), ni au-delà de
 * {@link MAX_DEPARTURES} départs d'un coup. Une clé qui vit encore AILLEURS
 * (`mayExit` faux : une conversation passée d'« Hier » à « Aujourd'hui ») ne
 * laisse aucun fantôme derrière elle — y compris quand elle y reparaît
 * PENDANT sa sortie : la question se repose à chaque rendu.
 *
 * Seuls les enfants À CLÉ sont suivis : la clé est l'identité d'une rangée.
 */

export const MAX_DEPARTURES = 3;
export const EXIT_ATTRIBUTE = 'data-row-exiting';

export type Presence<T> = { readonly key: string; readonly value: T; readonly leaving: boolean };

/**
 * LA LOI PURE — ce qui se rend après un changement d'enfants. `shown` est la
 * liste du dernier commit (sortantes comprises), `next` les enfants demandés,
 * `settled` les sorties terminées.
 */
export function retainDepartures<T>(input: {
  readonly shown: readonly Presence<T>[];
  readonly next: readonly { readonly key: string; readonly value: T }[];
  readonly mayLeave: (key: string) => boolean;
  readonly settled: ReadonlySet<string>;
  readonly flush: boolean;
  readonly max: number;
}): readonly Presence<T>[] {
  const { shown, next, mayLeave, settled, flush, max } = input;
  const staying: readonly Presence<T>[] = next.map(({ key, value }) => ({ key, value, leaving: false }));
  if (flush) return staying;
  const nextKeys = new Set(next.map(({ key }) => key));
  const gone = shown.filter((p) => !nextKeys.has(p.key) && !settled.has(p.key));
  const fresh = gone.filter((p) => !p.leaving && mayLeave(p.key));
  const kept = new Set([...gone.filter((p) => p.leaving && mayLeave(p.key)), ...(fresh.length > max ? [] : fresh)].map((p) => p.key));
  if (kept.size === 0) return staying;
  return shown.reduce<{ readonly list: readonly Presence<T>[]; readonly anchor: string | null }>(
    ({ list, anchor }, p) => {
      if (!kept.has(p.key)) return { list, anchor: list.some((q) => q.key === p.key) ? p.key : anchor };
      const at = anchor === null ? 0 : list.findIndex((q) => q.key === anchor) + 1;
      return { list: [...list.slice(0, at), { ...p, leaving: true }, ...list.slice(at)], anchor: p.key };
    },
    { list: staying, anchor: null },
  ).list;
}

type PresenceSignal = { readonly leaving: boolean; readonly onExited: () => void };

const STAYING: PresenceSignal = { leaving: false, onExited: () => {} };

const PresenceContext = createContext<PresenceSignal>(STAYING);

const keyedOf = (children: ReactNode): readonly { readonly key: string; readonly value: ReactElement }[] =>
  (Array.isArray(children) ? children.flat() : [children]).flatMap((child: unknown) =>
    isValidElement(child) && child.key !== null && child.key !== undefined ? [{ key: String(child.key), value: child }] : [],
  );

const always = (): boolean => true;

type Memory = {
  readonly shown: readonly Presence<ReactElement>[];
  readonly scope: string;
  readonly settled: Set<string>;
  readonly signals: Map<string, PresenceSignal>;
};

export function ExitPresence({
  children,
  scope,
  mayExit = always,
}: {
  readonly children: ReactNode;
  readonly scope: string;
  readonly mayExit?: (key: string) => boolean;
}) {
  const memory = useRef<Memory>({ shown: [], scope, settled: new Set(), signals: new Map() });
  const [, refresh] = useReducer((tick: number) => tick + 1, 0);
  const shown = retainDepartures({
    shown: memory.current.shown,
    next: keyedOf(children),
    mayLeave: mayExit,
    settled: memory.current.settled,
    flush: memory.current.scope !== scope || prefersReducedMotion(),
    max: MAX_DEPARTURES,
  });

  useLayoutEffect(() => {
    const leaving = new Set(shown.filter((p) => p.leaving).map((p) => p.key));
    const { settled, signals } = memory.current;
    memory.current = {
      shown,
      scope,
      settled: new Set([...settled].filter((key) => leaving.has(key))),
      signals: new Map([...signals].filter(([key]) => leaving.has(key))),
    };
  });

  const signalOf = (key: string): PresenceSignal => {
    const known = memory.current.signals.get(key);
    if (known !== undefined) return known;
    const signal: PresenceSignal = {
      leaving: true,
      onExited: () => {
        memory.current.settled.add(key);
        refresh();
      },
    };
    memory.current.signals.set(key, signal);
    return signal;
  };

  return shown.map((p) => (
    <PresenceContext.Provider key={p.key} value={p.leaving ? signalOf(p.key) : STAYING}>
      {p.value}
    </PresenceContext.Provider>
  ));
}

const leave = (element: HTMLElement, done: () => void): (() => void) => {
  const { height } = element.getBoundingClientRect();
  const marginTop = Number.parseFloat(getComputedStyle(element).marginTop) || 0;
  const before = { marginBottom: element.style.marginBottom, transformOrigin: element.style.transformOrigin };
  element.setAttribute(EXIT_ATTRIBUTE, '');
  element.setAttribute('inert', '');
  element.setAttribute('aria-hidden', 'true');
  element.style.marginBottom = `${-(height + marginTop)}px`;
  element.style.transformOrigin = 'top';
  const state = { live: true };
  const finish = () => {
    if (!state.live) return;
    state.live = false;
    done();
  };
  const animation =
    typeof element.animate === 'function'
      ? element.animate(
          [
            { opacity: 1, transform: 'scaleY(1)' },
            { opacity: 0, transform: 'scaleY(0)' },
          ],
          { duration: REORDER_FLIP_DURATION_MS, easing: REORDER_FLIP_EASING, fill: 'forwards' },
        )
      : null;
  const fallback = setTimeout(finish, animation === null ? 0 : REORDER_FLIP_DURATION_MS * 2);
  animation?.finished.then(finish, () => {});
  return () => {
    state.live = false;
    clearTimeout(fallback);
    animation?.cancel();
    element.removeAttribute(EXIT_ATTRIBUTE);
    element.removeAttribute('inert');
    element.removeAttribute('aria-hidden');
    element.style.marginBottom = before.marginBottom;
    element.style.transformOrigin = before.transformOrigin;
  };
};

/**
 * La moitié NŒUD de la sortie : rien tant que l'`ExitPresence` la plus proche
 * ne déclare pas la rangée sortante. Rend `true` pendant la sortie.
 */
export function useExitMotion(ref: RefObject<HTMLElement | null>): boolean {
  const presence = useContext(PresenceContext);
  useLayoutEffect(() => {
    if (!presence.leaving) return undefined;
    const element = ref.current;
    if (element === null) {
      presence.onExited();
      return undefined;
    }
    return leave(element, presence.onExited);
  }, [presence, ref]);
  return presence.leaving;
}
