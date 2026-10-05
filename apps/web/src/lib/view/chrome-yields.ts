/**
 * QUAND ON ÉCRIT, LE CHROME CÈDE LA PLACE (#8601). Sur un lecteur plein écran
 * (story, réel), ouvrir la feuille de commentaires — pour lire, commenter ou
 * répondre — laissait l'en-tête (barres de progression, auteur, fermer), le
 * bouton retour, les rails et les décorateurs peints autour d'elle. Chaque
 * élément avait SA condition (`chromeHidden || commentsOpen` ici, `chromeHidden`
 * seul là), et l'en-tête de la story ignorait la feuille.
 *
 * UNE loi dit QUAND le chrome cède (`chromeYields`), UNE projection dit
 * COMMENT (`yieldingChrome`) : en fondu, et INERTE — caché aux yeux ⇒ caché au
 * doigt, au clavier et au lecteur d'écran (#7040, D-90 : `opacity: 0` seul
 * laisse un contrôle invisible et vivant). La feuille et le média restent ;
 * à la fermeture, tout revient.
 */
export type ChromeYieldCauses = {
  /** Une feuille est ouverte par-dessus le média : commentaires, réponse,
   * spectateurs. */
  readonly sheetOpen: boolean;
  /** Le lecteur tient le média par un appui long (story). */
  readonly held?: boolean;
};

export function chromeYields({ sheetOpen, held = false }: ChromeYieldCauses): boolean {
  return sheetOpen || held;
}

export const CHROME_YIELD_TRANSITION = 'opacity 180ms ease';

export type YieldingChromeProps = {
  readonly inert: boolean;
  readonly 'data-chrome-yields': 'hidden' | 'shown';
  readonly style: { readonly opacity: 0 | 1; readonly transition: string };
};

export function yieldingChrome({ hidden, reducedMotion }: { readonly hidden: boolean; readonly reducedMotion: boolean }): YieldingChromeProps {
  return {
    inert: hidden,
    'data-chrome-yields': hidden ? 'hidden' : 'shown',
    style: { opacity: hidden ? 0 : 1, transition: reducedMotion ? 'none' : CHROME_YIELD_TRANSITION },
  };
}
