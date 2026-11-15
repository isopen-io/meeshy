import { PAGE_ABOUT } from './about';
import { PAGE_CHILD_SAFETY } from './child-safety';
import { PAGE_CONTACT } from './contact';
import { PAGE_FAQ } from './faq';
import { PAGE_HELP } from './help';
import { PAGE_PARTNERS } from './partners';
import { PAGE_PRIVACY } from './privacy';
import { PAGE_TERMS } from './terms';
import type { ContentPage } from './type';

/**
 * LES DOCUMENTS QUE LE PRÉCHAUFFAGE ÉCRIT, adresse par adresse.
 *
 * La liste vivait dans `scripts/prerender-institutional.tsx`, hors de portée
 * des témoins : le script s'exécute en écrivant sur le disque, aucun test ne
 * l'importe. Une adresse ajoutée à la source unique
 * (`scripts/lib/institutional-routes.mjs`) sans sa page ici partait au
 * service worker et à nginx sans document à servir. `child-safety.test.tsx`
 * confronte désormais les deux listes.
 */
export const INSTITUTIONAL_PAGES: readonly { readonly route: string; readonly page: ContentPage }[] = [
  { route: 'about', page: PAGE_ABOUT },
  { route: 'child-safety', page: PAGE_CHILD_SAFETY },
  { route: 'contact', page: PAGE_CONTACT },
  /* LES DEUX ADRESSES DU BINAIRE DÉJÀ DISTRIBUÉ (#7287) — `SupportView.swift`
     les ouvre depuis l'App Store, et elles rendaient « adresse inconnue ». */
  { route: 'faq', page: PAGE_FAQ },
  { route: 'help', page: PAGE_HELP },
  { route: 'partners', page: PAGE_PARTNERS },
  { route: 'privacy', page: PAGE_PRIVACY },
  { route: 'terms', page: PAGE_TERMS },
];
