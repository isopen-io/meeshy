import { createElement, lazy } from 'react';
import type { ComponentType } from 'react';

/**
 * UN COMPOSANT PARESSEUX QU'ON PEUT PRÉCHARGER (#8598). `lazy()` suspend au
 * PREMIER rendu de chaque composant paresseux, même quand son module est déjà
 * résolu : la page scène de la visionneuse s'ouvrait sur une image VIDE alors
 * que la carte du fil venait de peindre la même scène avec le même moteur.
 *
 * `preload()` lance (une seule fois) le chargement et retient le composant ;
 * dès qu'il est retenu, `Component` le rend DIRECTEMENT, sans passer par
 * `Suspense`. Tant qu'il ne l'est pas, `Component` délègue à `lazy()` sur la
 * MÊME promesse — un seul chargement quel que soit le chemin.
 */
export type Preloadable<P extends object> = {
  readonly Component: ComponentType<P>;
  readonly preload: () => Promise<unknown>;
};

export function preloadable<P extends object>(loader: () => Promise<{ readonly default: ComponentType<P> }>): Preloadable<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<{ readonly default: ComponentType<P> }> | null = null;
  const preload = (): Promise<{ readonly default: ComponentType<P> }> => {
    pending ??= loader().then((module) => {
      loaded = module.default;
      return module;
    });
    return pending;
  };
  const Lazy = lazy(preload);
  const Component = (props: P) => createElement(loaded ?? Lazy, props);
  return { Component, preload };
}
