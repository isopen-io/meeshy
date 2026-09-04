import { deLaLangue } from './langues';
import { STORY, type CopieDuPartage } from './story';

/**
 * LA COPIE DES DEUX AUTRES ÉCRANS DE PARTAGE — le réel et l'humeur.
 *
 * Elles ne sont pas des variantes de la story : ce sont les mêmes phrases,
 * dites du contenu qu'elles servent. Le lecteur est UN (`partage-vue.ts`,
 * #4929 — « rendu par le MÊME composant lecteur que post/story/reel »), et
 * c'est le vocabulaire seul qui change de genre.
 *
 * `CopieDuPartage` se DÉRIVE de `STORY` : ajouter une phrase à l'un oblige les
 * trois, et l'oubli est un échec de compilation plutôt qu'un trou à l'écran.
 *
 * CE QUE CHACUNE DIT DE SON GENRE, ET POURQUOI :
 *
 *   • un RÉEL n'est pas segmenté — il n'a ni précédent ni suivant dans une
 *     séquence d'auteur, donc `segments` parle d'UN réel et le lecteur ne pose
 *     pas la barre (`avecSegments: false` dans son genre) ;
 *   • une HUMEUR est brève et souvent SANS média : sa phrase « sans contenu »
 *     est la seule des trois qui ait des chances d'être lue, et elle le dit
 *     sans reproche — une humeur vide est une humeur, pas une erreur ;
 *   • l'échéance diffère et les invitations le DISENT : 24 h pour une story,
 *     rien pour un réel (il reste), quelques heures pour une humeur. Le
 *     lecteur qui arrive sur une adresse morte doit savoir si c'est normal.
 */

export const REEL: CopieDuPartage = {
  titre: 'Réel',
  de: (auteur: string): string => `Réel de ${auteur}`,
  fermer: 'Fermer',
  segments: (n: number): string => (n === 1 ? 'Ce réel' : `${n} réels de cette personne`),
  segment: (rang: number, total: number): string => `Réel ${rang} sur ${total}`,
  precedente: 'Réel précédent',
  suivante: 'Réel suivant',
  langues: 'Changer la langue',
  langue: (nom: string): string => `Lire en ${nom}`,
  traduitDe: (langue: string): string => `Traduit ${deLaLangue(langue)}`,
  original: 'Voir l’original',
  scene: 'Contenu du réel',
  sansContenu: 'Ce réel ne porte aucun texte.',
  repondreA: (auteur: string): string => `Répondre à ${auteur}…`,
  repondre: 'Votre réponse',
  envoyer: 'Envoyer la réponse',
  aimer: 'J’aime ce réel',
  repondu: 'Votre réponse a été envoyée.',
  refuse: 'Votre réponse n’est pas partie.',
  vide: 'Écrivez votre réponse avant de l’envoyer.',
  indisponible: {
    titre: 'Réel indisponible',
    corps: 'Ce réel n’existe plus, ou il ne vous est pas ouvert.',
    action: 'Retour à l’accueil',
  },
  invitation: {
    titre: 'Ce réel vous attend',
    corps:
      'Meeshy ne sert le contenu d’un réel qu’aux personnes connectées. Entrez avec votre compte : vous reviendrez ici automatiquement.',
    seConnecter: 'Se connecter',
    creerUnCompte: 'Créer un compte',
    note: 'Le lien est gardé de côté : vous reviendrez sur ce réel après connexion.',
  },
} as const;

export const HUMEUR: CopieDuPartage = {
  titre: 'Humeur',
  de: (auteur: string): string => `Humeur de ${auteur}`,
  fermer: 'Fermer',
  segments: (n: number): string => (n === 1 ? 'Cette humeur' : `${n} humeurs de cette personne`),
  segment: (rang: number, total: number): string => `Humeur ${rang} sur ${total}`,
  precedente: 'Humeur précédente',
  suivante: 'Humeur suivante',
  langues: 'Changer la langue',
  langue: (nom: string): string => `Lire en ${nom}`,
  traduitDe: (langue: string): string => `Traduit ${deLaLangue(langue)}`,
  original: 'Voir l’original',
  scene: 'Contenu de l’humeur',
  sansContenu: 'Cette humeur ne porte aucun texte.',
  repondreA: (auteur: string): string => `Répondre à ${auteur}…`,
  repondre: 'Votre réponse',
  envoyer: 'Envoyer la réponse',
  aimer: 'J’aime cette humeur',
  repondu: 'Votre réponse a été envoyée.',
  refuse: 'Votre réponse n’est pas partie.',
  vide: 'Écrivez votre réponse avant de l’envoyer.',
  indisponible: {
    titre: 'Humeur indisponible',
    corps: 'Cette humeur n’existe plus, ou elle ne vous est pas ouverte. Une humeur ne dure que quelques heures.',
    action: 'Retour à l’accueil',
  },
  invitation: {
    titre: 'Cette humeur vous attend',
    corps:
      'Meeshy ne sert le contenu d’une humeur qu’aux personnes connectées. Entrez avec votre compte : vous reviendrez ici automatiquement.',
    seConnecter: 'Se connecter',
    creerUnCompte: 'Créer un compte',
    note: 'Le lien est gardé de côté : vous reviendrez sur cette humeur après connexion.',
  },
} as const;

/**
 * UN GENRE DE PARTAGE — ce que le lecteur unique doit savoir pour servir l'un
 * des trois.
 *
 * `base` est le PRÉFIXE d'adresse, écrit ici et nulle part ailleurs : c'est ce
 * qui compose `/stories/:id`, `/reels/:id` et `/moods/:id`, leurs variantes
 * `?lang=` et la cible de leur formulaire de réponse.
 *
 * `avecSegments` dit si le genre se PARCOURT. Une story est une séquence — on
 * passe à la suivante du même auteur — ; un réel et une humeur se lisent seuls.
 * Poser une barre de segments à un seul segment serait un repère qui n'oriente
 * vers rien (charte règle 7).
 */
export type GenreServi = {
  readonly type: 'STORY' | 'REEL' | 'STATUS';
  readonly base: string;
  readonly copie: CopieDuPartage;
  readonly avecSegments: boolean;
};

export const GENRE_STORY: GenreServi = { type: 'STORY', base: '/stories', copie: STORY, avecSegments: true };
export const GENRE_REEL: GenreServi = { type: 'REEL', base: '/reels', copie: REEL, avecSegments: false };
export const GENRE_HUMEUR: GenreServi = { type: 'STATUS', base: '/moods', copie: HUMEUR, avecSegments: false };

/**
 * L'ADRESSE D'UNE PUBLICATION PARTAGÉE — composée du `base` de son genre, ici
 * et nulle part ailleurs.
 *
 * ELLE VIT DANS LA COPIE, PAS DANS LA VUE, depuis que le VOISINAGE porte des
 * adresses (#5032, `lib/api/publication.ts` › `Voisinage`). `voisinage()`
 * convertit ses voisines en adresses au seul site qui sait qu'elles sont des
 * stories ; il ne peut pas importer une fonction de `app/`, et la recopier en
 * aurait fait la jumelle que le § 3.2 interdit. `partage-vue.ts` les
 * ré-exporte pour ses lecteurs historiques.
 */
export const adresseDuPartage = (genre: GenreServi, id: string, langue?: string): string =>
  `${genre.base}/${encodeURIComponent(id)}${langue === undefined ? '' : `?lang=${encodeURIComponent(langue)}`}`;

/** L'adresse d'une STORY — la projection que la porte de `/stories/:id` lit. */
export const adresseDeLaStory = (id: string, langue?: string): string =>
  adresseDuPartage(GENRE_STORY, id, langue);
