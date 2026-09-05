/**
 * LA COPIE DE L'ESPACE MEMBRE — la feuille qui remplace la barre d'onglets, et
 * les deux actions flottantes qui la posent aux deux coins de l'écran.
 *
 * POURQUOI CET ÉCRAN EXISTE. La planche n'a AUCUNE navigation persistante, et
 * c'est une décision tranchée, pas un oubli : « Pas de barre d'onglets […] son
 * rôle est repris par deux FAB + la feuille "Espace membre" » (conception § 11,
 * question 6). La ligne `sheet:member` de la matrice porte le même critère —
 * « Remplace la barre d'onglets absente de la planche ». Sans elle, quatre
 * écrans que la v3 SERT — `/contacts`, `/search`, `/notifications`,
 * `/settings` — n'avaient, mesuré sur `dev`, AUCUN lien entrant : le contrôle
 * sans effet de la charte règle 7 pris par l'autre bout, non pas un bouton qui
 * ne fait rien mais un écran que rien n'ouvre.
 *
 * SEPT RANGÉES DANS LA PLANCHE, CINQ SERVIES. `Appels` (`/calls`) et
 * `Communautés` (`/communities`) sont P2 dans la matrice, et la v3 ne sert
 * aucune des deux routes : les dessiner ouvrirait sur un 404 rendu par le
 * legacy, et un lien mort se pré-charge, s'indexe et se tabule. C'est la
 * doctrine déjà écrite pour le carrefour des réglages (`reglages.ts`) — les
 * rangées servies sont motivées par ce qu'elles PROMETTENT, jamais par ce qui
 * manque à côté.
 *
 * AUCUNE PASTILLE DE COMPTE, et c'est la même famille de raison. La planche
 * montre « 5 non lues » et « 3 demandes en attente » ; les servir demanderait
 * deux appels de plus à la passerelle sur CHAQUE rendu du tableau de bord et de
 * `/chats` — une latence de plus sur une 3G rurale pour un chiffre décoratif.
 * Les mettre à zéro serait pire : « un compteur qui dit 0 à quelqu'un qui en a
 * dix n'est pas une donnée manquante, c'est une donnée FAUSSE »
 * (`app/connecte/contenu.ts`). Le jour où la porte a une raison INDÉPENDANTE de
 * lire ces deux routes, la pastille devient gratuite.
 */

/**
 * L’ADRESSE DE LA FICHE DU COMPTE DU LECTEUR — le SITE UNIQUE de cette
 * destination côté contenu. `app/connecte/profil-vue.ts` la LIT pour l’action
 * « Mon compte » de la branche « c’est vous » (#5030) : le fil et l’espace
 * mènent au compte par la MÊME adresse, jamais par deux littéraux jumeaux.
 * L’identité de la ROUTE, elle, reste chez la route (`CHEMIN_DU_PROFIL`,
 * `app/connecte/reglages-porte.ts`) — c’est une porte, pas une copie.
 */
export const ADRESSE_DE_MON_COMPTE = '/settings/profile';

export const ESPACE = {
  /** Le nom accessible de l'action qui ouvre la feuille, et son titre une fois ouverte. */
  titre: 'Espace membre',
  ouvrir: 'Ouvrir l’espace membre',
  fermer: 'Fermer l’espace membre',
  /** Le sous-titre quand la passerelle n'a servi ni nom ni pseudonyme. */
  sansNom: 'Votre compte',
  /** L'action flottante de GAUCHE — le fil social. */
  fil: 'Le fil',
  /** Le champ de recherche du tableau de bord (planche : « Rechercher partout »). */
  rechercher: 'Rechercher partout',
  /** Le contrôle de sortie (#5095) — un `<form method=post>`, pas un lien. */
  deconnecter: 'Se déconnecter',
} as const;

/**
 * LES RANGÉES, DANS L'ORDRE DE LA PLANCHE (`MeeshyWebV3.dc.html:1112-1120`),
 * moins les deux destinations que la v3 ne sert pas.
 *
 * `href` est comparé aux `app/**\/route.ts` réellement émis par un témoin : une
 * rangée qui pointerait hors de la zone ne serait pas une erreur de style mais
 * un lien qui quitte la v3 en silence.
 */
export const RANGEES_DE_L_ESPACE = [
  {
    glyphe: 'ph-user-circle',
    href: ADRESSE_DE_MON_COMPTE,
    quoi: 'Votre profil',
    sous: 'Nom, langues du Prisme, bio',
  },
  {
    glyphe: 'ph-bell',
    href: '/notifications',
    quoi: 'Notifications',
    sous: 'Ce qui vous attend',
  },
  {
    glyphe: 'ph-address-book',
    href: '/contacts',
    quoi: 'Contacts',
    sous: 'Votre carnet et vos demandes',
  },
  {
    glyphe: 'ph-magnifying-glass',
    href: '/search',
    quoi: 'Rechercher',
    sous: 'Conversations, messages, personnes',
  },
  {
    glyphe: 'ph-link-simple',
    href: '/links',
    quoi: 'Mes liens',
    sous: 'Vos liens de partage',
  },
  {
    glyphe: 'ph-gear',
    href: '/settings',
    quoi: 'Paramètres',
    sous: 'Compte et application',
  },
] as const;
