import { createElement, type ComponentType, type ReactNode } from 'react';

/**
 * Un chunk chargé UNE fois — et rechargé après un échec : un préchargement
 * raté (réseau coupé) ne condamne pas le premier toucher qui en a besoin.
 */
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  const memo: { pending: Promise<T> | null } = { pending: null };
  return () => {
    memo.pending ??= load().catch((error: unknown) => {
      memo.pending = null;
      throw error;
    });
    return memo.pending;
  };
}

export type PreloadedView<P extends object> = {
  /** Charge la vue (une fois) — à l'intention : à l'état qui l'annonce, au survol, au premier idle. */
  readonly load: () => Promise<ComponentType<P>>;
  /** La vue : rendue DANS le même rendu dès qu'elle est chargée ; sinon, suspendue jusqu'à la frontière `Suspense` la plus proche. */
  readonly View: (props: P) => ReactNode;
};

type Cell<P extends object> = { view: ComponentType<P> | null; failure: { readonly error: unknown } | null; waiting: Promise<void> | null };

/**
 * **UNE VUE FROIDE, PEINTE SANS DÉTOUR UNE FOIS LÀ** (#17650) — ce que `lazy()`
 * ne donne pas : une vue PRÉCHARGÉE par un autre chemin que son propre rendu
 * (l'état qui l'annonce, un idle) se rend synchroniquement au premier rendu qui
 * la demande, sans passer par un repli. Pas encore là, elle suspend comme une
 * vue `lazy()` ; un chargement raté se dit à la frontière d'erreur une fois,
 * puis le rendu suivant retente — jamais une suspension en boucle sur un module
 * que le navigateur refuse.
 */
export function preloadedView<P extends object>(load: () => Promise<ComponentType<P>>): PreloadedView<P> {
  const cell: Cell<P> = { view: null, failure: null, waiting: null };
  const loadView = once(() =>
    load().then((view) => {
      cell.view = view;
      return view;
    }),
  );
  const View = (props: P): ReactNode => {
    if (cell.view !== null) return createElement(cell.view, props);
    const failure = cell.failure;
    if (failure !== null) {
      cell.failure = null;
      throw failure.error;
    }
    cell.waiting ??= loadView().then(
      () => {
        cell.waiting = null;
      },
      (error: unknown) => {
        cell.waiting = null;
        cell.failure = { error };
      },
    );
    throw cell.waiting;
  };
  return { load: loadView, View };
}
