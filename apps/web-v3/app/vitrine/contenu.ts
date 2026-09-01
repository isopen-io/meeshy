/**
 * LE CONTENU DE LA VITRINE — celui du legacy, repris mot pour mot.
 *
 * Directive du porteur (2026-09-01) : « réutiliser la landing page legacy, en
 * améliorant juste le design pour se rapprocher du design v3 ». Ce fichier
 * porte donc la copie de `apps/web/locales/fr/landing.json` — sections `hero`,
 * `features`, `mission`, `cta`, `footer` — sans une virgule de changement.
 *
 * POURQUOI UNE COPIE ET NON UNE LECTURE
 *
 * L'invariant (i) de `scripts/check-v3-pipeline.mjs` interdit à une source de
 * la v3 d'atteindre le disque hors de son paquet : l'étage builder ne copie que
 * `apps/web-v3/`, et un `import` vers `apps/web/locales/` produirait un
 * document VIDE dans l'image, visible en production seulement. Ce n'est pas une
 * jumelle qui va diverger, c'est une MIGRATION : le legacy sera décommissionné
 * (§ 4.9 étape 7), et cette copie sera alors la seule.
 *
 * CE QUI A ÉTÉ LAISSÉ DE CÔTÉ, ET POURQUOI
 *
 * `navigation` (Accueil · Fonctionnalités · À propos · Contact) n'entre pas :
 * la v3 ne sert aucune de ces quatre adresses, et une barre dont trois liens
 * sur quatre franchissent la zone vers des pages que le legacy rendra encore
 * pendant des semaines annoncerait une navigation qui n'existe pas. Elle
 * reviendra avec les écrans, pas avant.
 *
 * `footer.social.followUs` non plus : il n'existe aucune URL sociale à mettre
 * derrière, et un intitulé sans destination est un contrôle qui ment.
 *
 * LA LANGUE. Le fichier n'existe qu'en français parce que `DOCUMENT_LANGUAGE`
 * vaut `'fr'` — une constante, aujourd'hui. Le jour où #4415 la rend variable,
 * les trois autres locales du legacy (`en`, `es`, `pt`) rejoignent ce fichier
 * telles quelles : elles sont déjà écrites.
 */

export type Atout = {
  readonly titre: string;
  readonly corps: string;
};

export const HEROS = {
  badge: 'Traduction en temps réel',
  titre: 'Communiquez sans ',
  titreAccentue: 'barrières linguistiques',
  accroche:
    'Meeshy traduit vos conversations en temps réel, vous permettant de discuter avec n’importe qui, dans n’importe quelle langue.',
  creer: 'Créer son compte maintenant',
  connexion: 'Se connecter',
} as const;

export const ATOUTS_TITRE = 'Fonctionnalités puissantes';
export const ATOUTS_ACCROCHE = 'Tout ce dont vous avez besoin pour communiquer sans frontières';

export const ATOUTS: readonly Atout[] = [
  {
    titre: 'Traduction en temps réel',
    corps: 'Vos messages sont traduits instantanément pendant que vous tapez',
  },
  { titre: 'Support multi-langues', corps: 'Supportant plus de 100 langues du monde entier' },
  { titre: 'Privé et sécurisé', corps: 'Vos conversations sont chiffrées de bout en bout' },
  {
    titre: 'Chats de groupe',
    corps: 'Discutez avec plusieurs personnes dans différentes langues',
  },
  { titre: 'Détection automatique', corps: 'Détecte automatiquement la langue de vos messages' },
  {
    titre: 'Interface moderne',
    corps: 'Design élégant et intuitif pour une meilleure expérience',
  },
  {
    titre: 'Traduction universelle',
    corps: 'Communiquez avec n’importe qui, n’importe où dans le monde',
  },
  {
    titre: 'Salles de classe multilingues',
    corps: 'Parfait pour l’éducation internationale et les équipes distribuées',
  },
  {
    titre: 'Collègues internationaux',
    corps: 'Collaborez efficacement avec des équipes du monde entier',
  },
];

export const MISSION = {
  titre: 'Notre mission',
  corps:
    'Connecter le monde, une traduction à la fois. Notre plateforme permet aux gens des quatre coins du monde de communiquer librement, en abattant les murs qui nous séparent et en construisant des ponts de compréhension.',
  devise: 'Un monde, plusieurs langues, une conversation',
} as const;

export const APPEL = {
  titre: 'Prêt à commencer ?',
  accroche: 'Rejoignez des milliers d’utilisateurs qui communiquent déjà sans barrières',
  action: 'Créer un compte gratuit',
} as const;

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
