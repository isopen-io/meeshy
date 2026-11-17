import '@/styles/kit-avatar-morph.css';
import '@/styles/kit-motion.css';
import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import {
  MEESHY_AVATAR_MORPH_MEASURE,
  meeshyAvatarMorphName,
  meeshyAvatarMorphRecipe,
  meeshyAvatarMorphStyle,
  type MeeshyAvatarMorphPath,
} from './meeshy-avatar-morph-recipe';

export * from './meeshy-avatar-morph-recipe';

export type MeeshyAvatarMorphApi = {
  readonly hasScope: boolean;
  /** Joue `update` ; si l'identité a deux emplacements, un seul, nommé, voyage de l'un à l'autre. Rend vrai si un voyage a eu lieu — `update` s'exécute dans tous les cas. */
  readonly travel: (id: string, update: () => void) => boolean;
};

type Registry = {
  readonly register: (id: string, element: HTMLElement) => () => void;
  readonly api: MeeshyAvatarMorphApi;
};

const ScopeContext = createContext<Registry | null>(null);

const OUT_OF_SCOPE: MeeshyAvatarMorphApi = {
  hasScope: false,
  travel: (_id, update) => {
    update();
    return false;
  },
};

type TransitionHost = { startViewTransition?: (update: () => void) => { finished: Promise<unknown> } };

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const nameOf = (element: HTMLElement, name: string | null): void => {
  element.style.setProperty('view-transition-name', name ?? '');
  element.style.setProperty('view-transition-class', name === null ? '' : 'kit-morph');
};

/**
 * La portée des voyages : posée UNE fois par la racine, autour de la navigation. Elle tient le
 * registre des emplacements (identité → éléments) et orchestre la transition de vue. Sans
 * elle, aucun voyage : le repli est le fondu enchaîné.
 */
export function MeeshyAvatarMorphScope({ children }: { readonly children?: ReactNode }) {
  const slots = useRef(new Map<string, Set<HTMLElement>>());
  const traveling = useRef<{ readonly id: string; readonly name: string } | null>(null);

  const register = useCallback((id: string, element: HTMLElement): (() => void) => {
    const set = slots.current.get(id) ?? new Set<HTMLElement>();
    set.add(element);
    slots.current.set(id, set);
    if (traveling.current?.id === id) nameOf(element, traveling.current.name);
    return () => {
      set.delete(element);
      if (set.size === 0) slots.current.delete(id);
    };
  }, []);

  const travel = useCallback((id: string, update: () => void): boolean => {
    const host = document as unknown as TransitionHost;
    const set = slots.current.get(id);
    if (typeof host.startViewTransition !== 'function' || prefersReducedMotion() || set === undefined || set.size !== 1) {
      update();
      return false;
    }
    const source = [...set][0] as HTMLElement;
    const name = meeshyAvatarMorphName(id);
    traveling.current = { id, name };
    nameOf(source, name);
    const transition = host.startViewTransition(() => {
      nameOf(source, null);
      flushSync(update);
    });
    const done = (): void => {
      slots.current.get(id)?.forEach((element) => nameOf(element, null));
      traveling.current = null;
    };
    transition.finished.then(done, done);
    return true;
  }, []);

  const registry = useMemo<Registry>(() => ({ register, api: { hasScope: true, travel } }), [register, travel]);
  return <ScopeContext.Provider value={registry}>{children}</ScopeContext.Provider>;
}

/** Le crochet de l'hôte : `travel(id, update)` joue la navigation en faisant voyager l'avatar. Hors portée, il rend un voyage qui ne part jamais. */
export const useMeeshyAvatarMorph = (): MeeshyAvatarMorphApi => useContext(ScopeContext)?.api ?? OUT_OF_SCOPE;

export type MeeshyAvatarMorphProps = {
  readonly id: string;
  readonly size: number;
  readonly children?: ReactNode;
  readonly ring?: ReactNode;
  readonly badge?: ReactNode;
  readonly path?: MeeshyAvatarMorphPath | undefined;
  readonly progress?: number | null | undefined;
  readonly ringTravels?: boolean | undefined;
  readonly badgeTravels?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly onArrive?: (() => void) | undefined;
  readonly className?: string | undefined;
};

/**
 * Un emplacement d'avatar : un cadre rond de la taille donnée, le contenu de l'hôte, deux
 * emplacements autour (`ring`, `badge`). Deux emplacements de même identité dans la même
 * portée sont le même avatar ; un doublon coupe le voyage. `progress` (0 à 1) pilote le
 * voyage par une valeur — le repli d'un en-tête au défilement — au lieu du temps.
 */
export const MeeshyAvatarMorph = memo(function MeeshyAvatarMorph({ id, size, children, ring, badge, path, progress, ringTravels, badgeTravels, isEnabled = true, onArrive, className }: MeeshyAvatarMorphProps) {
  const scope = useContext(ScopeContext);
  const element = useRef<HTMLDivElement | null>(null);
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  const register = scope?.register;
  useLayoutEffect(() => {
    const node = element.current;
    if (register === undefined || node === null || !isEnabled) return undefined;
    const release = register(id, node);
    if (node.style.getPropertyValue('view-transition-name') !== '') arrive.current?.();
    return release;
  }, [register, id, isEnabled]);
  const recipe = meeshyAvatarMorphRecipe({ from: size, to: size, hasScope: scope !== null, canTravel: typeof document !== 'undefined' && typeof (document as unknown as TransitionHost).startViewTransition === 'function', path, progress, reduceMotion: prefersReducedMotion(), ringTravels, badgeTravels });
  return (
    <div
      ref={element}
      className={className === undefined ? 'kit-morph' : `kit-morph ${className}`}
      data-kit-avatar-morph=""
      data-morph-id={id}
      data-mode={recipe.mode}
      data-ring-travels={ringTravels === true ? '' : undefined}
      data-badge-travels={badgeTravels === true ? '' : undefined}
      style={{ ...meeshyAvatarMorphStyle(size, recipe.progress), '--kit-morph-badge-lead': `${MEESHY_AVATAR_MORPH_MEASURE.badgeLeadMs}ms`, '--kit-morph-badge-return': `${MEESHY_AVATAR_MORPH_MEASURE.badgeReturnMs}ms` } as never}
    >
      {ring === undefined ? null : <span className="kit-morph__ring" data-kit-morph-ring="">{ring}</span>}
      <span className="kit-morph__content">{children}</span>
      {badge === undefined ? null : <span className="kit-morph__badge" data-kit-morph-badge="">{badge}</span>}
    </div>
  );
});
