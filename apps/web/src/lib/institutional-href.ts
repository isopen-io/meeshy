/**
 * **LES PAGES INSTITUTIONNELLES S'OUVRENT DANS LA COQUE** (#8213).
 *
 * Le web lie `/terms` et `/privacy` en chemin RELATIF : nginx sert le document
 * préchauffé (`terms/index.html`) et le service worker le laisse passer
 * (`navigateFallbackDenylist`, `vite.config.ts`) — le staging sert ainsi ses
 * propres pages.
 *
 * La coque n'a ni nginx ni service worker : son serveur local rend
 * `index.html` pour tout chemin sans extension (`WebViewLocalServer`, Android ;
 * `CapacitorRouter`, iOS), jamais `terms/index.html`. L'application démarrait
 * sur une adresse que la table des routes ne connaît pas — « page
 * introuvable » à la place des conditions qu'on accepte en s'inscrivant. Elle
 * lie donc l'adresse PUBLIQUE, que Capacitor confie au navigateur du système,
 * comme l'app iOS native (`AboutView.swift`).
 */
export type InstitutionalPage = 'about' | 'child-safety' | 'contact' | 'faq' | 'help' | 'partners' | 'privacy' | 'terms';

const CANONICAL_ORIGIN = 'https://meeshy.me';

/** Toute adresse du SITE que la coque ne sert pas — la landing par langue et ses ancres comme les pages (#12930). */
export function siteHref(path: string, options: { readonly shell: boolean }): string {
  return options.shell ? `${CANONICAL_ORIGIN}${path}` : path;
}

export function appSiteHref(path: string): string {
  return siteHref(path, { shell: __SHELL__ });
}

export function institutionalHref(page: InstitutionalPage, options: { readonly shell: boolean }): string {
  return siteHref(`/${page}`, options);
}

export function appInstitutionalHref(page: InstitutionalPage): string {
  return institutionalHref(page, { shell: __SHELL__ });
}
