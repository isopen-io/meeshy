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
 * LE GLYPHE DE LA MARQUE — `ph-chat-circle`, sur la tuile de 32 px que la charte
 * décrit (§ 12.5 règle 23), et qui est l'un des cinq emplois autorisés de
 * l'accent (règle 13).
 *
 * Il vit ICI et non dans la feuille parce qu'il est du CONTENU du chrome, au
 * même titre que le mot « Meeshy » : la feuille dit comment la tuile se pose,
 * pas ce qu'elle montre. La pastille pleine qui l'a précédé — un rond peint,
 * sans tracé — disait « accent » et rien d'autre.
 */
export const GLYPHE_DE_LA_MARQUE = 'ph-chat-circle';

/**
 * Le retour est le MÊME mot sur les cinq pages, et il n'est pas paramétrable :
 * un écran qui voudrait le renommer renommerait un repère, pas un libellé.
 * C'est la règle que `/l/:token` applique déjà à son propre chevron.
 */
export const RETOUR = 'Retour à l’accueil';

/**
 * LES NOMS DES DEUX REPÈRES DE NAVIGATION — et ils nomment une FONCTION, jamais
 * le contenu qui passe à côté.
 *
 * La navigation du héros portait `aria-label` = le texte du BADGE
 * (« Traduction en temps réel ») : un lecteur d'écran annonçait « navigation,
 * Traduction en temps réel » pour l'accès au compte. Le témoin d'alors comptait
 * les `aria-label` sans jamais les LIRE, et `axe` ne voit rien — l'étiquette
 * n'était pas vide, elle était FAUSSE. Une étiquette de repère ne se prend donc
 * pas dans le contenu de l'écran : elle se déclare ici, avec le mot du chrome,
 * hors de portée d'un copier-coller.
 *
 * Ce ne sont pas des mots du legacy — un repère n'a pas de jumeau à respecter,
 * il a une fonction à dire. C'est la raison pour laquelle ils vivent avec
 * `RETOUR` et non dans `app/vitrine/contenu.ts`.
 */
export const REPERE_DU_COMPTE = 'Accès au compte';
export const REPERE_DU_PIED = 'Informations sur Meeshy';

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
