import { createContext, createElement, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { meeshyAvatarMorphName } from './meeshy-avatar-morph-name';

/*
 * La portée vit seule, sans feuille de style ni recette : la racine la pose autour de la
 * navigation, donc elle entre dans la première peinture (#18881). Les emplacements, leurs
 * styles et leur recette se chargent avec l'écran qui les monte.
 */
export type MeeshyAvatarMorphApi = {
  readonly hasScope: boolean;
  /** Joue `update` ; si l'identité a deux emplacements, un seul, nommé, voyage de l'un à l'autre. Rend vrai si un voyage a eu lieu — `update` s'exécute dans tous les cas. */
  readonly travel: (id: string, update: () => void) => boolean;
};

type Registry = {
  readonly register: (id: string, element: HTMLElement) => () => void;
  readonly api: MeeshyAvatarMorphApi;
};

export const ScopeContext = createContext<Registry | null>(null);

const OUT_OF_SCOPE: MeeshyAvatarMorphApi = {
  hasScope: false,
  travel: (_id, update) => {
    update();
    return false;
  },
};

export type TransitionHost = { startViewTransition?: (update: () => void) => { finished: Promise<unknown> } };

export const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  return createElement(ScopeContext.Provider, { value: registry }, children);
}

/** Le crochet de l'hôte : `travel(id, update)` joue la navigation en faisant voyager l'avatar. Hors portée, il rend un voyage qui ne part jamais. */
export const useMeeshyAvatarMorph = (): MeeshyAvatarMorphApi => useContext(ScopeContext)?.api ?? OUT_OF_SCOPE;

