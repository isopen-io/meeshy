/**
 * LE CHROME DU SITE — ce qui entoure CHAQUE écran public de la v3, et qui
 * n'appartient donc à aucun d'eux.
 *
 * Ces trois déclarations vivaient dans `app/vitrine/contenu.ts`, où elles
 * n'avaient qu'un consommateur. Les cinq pages institutionnelles en sont les
 * suivantes, et elles portent le MÊME pied : c'est la dimension 6 (cohérence de
 * positionnement) — même repère, même vocabulaire, à la même place. Les laisser
 * chez la vitrine aurait obligé `/about` à importer depuis la page d'accueil,
 * ou — pire — à recopier ces lignes : la définition d'une jumelle.
 *
 * Le contenu reste celui du legacy, mot pour mot : `footer` de
 * `apps/web/locales/fr/landing.json` pour le pied, `backHome` des cinq pages
 * institutionnelles pour le retour (les cinq portent la MÊME chaîne).
 */

export type Lien = {
  readonly libelle: string;
  readonly href: string;
};

export const MARQUE = 'Meeshy';

/**
 * Le retour est le MÊME mot sur les cinq pages, et il n'est pas paramétrable :
 * un écran qui voudrait le renommer renommerait un repère, pas un libellé.
 * C'est la règle que `/l/:token` applique déjà à son propre chevron.
 */
export const RETOUR = 'Retour à l’accueil';

export const PIED = {
  devise: 'Briser les barrières linguistiques, une conversation à la fois',
  droits: '© 2025 Meeshy. Tous droits réservés.',
  liens: [
    { libelle: 'À propos', href: '/about' },
    { libelle: 'Contact', href: '/contact' },
    { libelle: 'Partenaires', href: '/partners' },
    { libelle: 'Conditions d’utilisation', href: '/terms' },
    { libelle: 'Politique de confidentialité', href: '/privacy' },
  ],
} as const;
