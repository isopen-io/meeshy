/**
 * LA SORTIE DES RÉELS (#6498) — où mène le bouton « Retour » du lecteur.
 *
 * iOS présente les Réels par-dessus la navigation et les REFERME : on revient
 * exactement où l'on était. Le web l'imite en reculant l'historique, mais
 * seulement quand l'entrée précédente est dans Meeshy. `history.length` ne le
 * sait pas : il compte aussi les pages des AUTRES sites, et un lien
 * `/reels?seed=` ouvert après une page tierce y ramenait (mesuré). Sans entrée
 * de Meeshy derrière soi, le bouton REMPLACE l'adresse par le Flux — la page
 * d'où les Réels s'ouvrent.
 *
 * - **L'API Navigation** (`navigation.canGoBack`) répond exactement : elle ne
 *   voit que les entrées de l'origine courante.
 * - **Sans elle**, l'entrée d'ARRIVÉE sur le site (lien profond, rechargement)
 *   n'a rien de Meeshy derrière elle qu'on puisse prouver : le Flux. Une entrée
 *   poussée par l'application, dans un historique de plus d'une entrée, recule.
 */
export type ReelsExit = 'back' | 'feed';

export type HistoryView = {
  /** `navigation.canGoBack` — `undefined` là où l'API Navigation n'existe pas. */
  readonly canGoBack: boolean | undefined;
  readonly historyLength: number;
  /** L'entrée courante est celle par laquelle le document a été chargé. */
  readonly onLandingEntry: boolean;
};

export function reelsExitOf(view: HistoryView): ReelsExit {
  if (view.canGoBack !== undefined) return view.canGoBack ? 'back' : 'feed';
  return view.historyLength > 1 && !view.onLandingEntry ? 'back' : 'feed';
}

type NavigationLike = { readonly canGoBack?: unknown };

/** L'historique tel que le navigateur le montre, lu au moment du geste. */
export function currentHistory(): HistoryView {
  const navigation = (window as Window & { readonly navigation?: NavigationLike }).navigation;
  const landing = typeof performance.getEntriesByType === 'function' ? performance.getEntriesByType('navigation')[0]?.name : undefined;
  return {
    canGoBack: typeof navigation?.canGoBack === 'boolean' ? navigation.canGoBack : undefined,
    historyLength: window.history.length,
    /* Une arrivée qu'on ne sait pas dater est traitée comme une arrivée : dans
       le doute, le bouton mène au Flux plutôt que hors de l'application. */
    onLandingEntry: landing === undefined || landing === window.location.href,
  };
}
