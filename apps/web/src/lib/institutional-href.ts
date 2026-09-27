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
export type InstitutionalPage = 'terms' | 'privacy';

export function institutionalHref(page: InstitutionalPage, _options: { readonly shell: boolean }): string {
  return `/${page}`;
}

export function appInstitutionalHref(page: InstitutionalPage): string {
  return institutionalHref(page, { shell: __SHELL__ });
}
