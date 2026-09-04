import { deLaLangue } from './langues';

/**
 * LA COPIE DE LA STORY — ce que l'écran DIT, hors de ce qu'il compose.
 *
 * Même règle que `lib/contenu/fil.ts` : une phrase qui vit ici se relit d'un
 * coup ; une phrase enfouie dans un gabarit se corrige trois fois. Elle vit
 * sous `lib/` parce que la vue ET la porte la lisent — la porte compose le
 * refus, la vue le peint.
 *
 * `traduitDe` prend le nom de la langue tel que `lib/contenu/langues.ts` le
 * rend — en FRANÇAIS, décliné par `deLaLangue`. Cette phrase disait
 * « Traduit de Español » : le nom natif, faute d'une table française, écart
 * alors ASSUMÉ. Il ne l'est plus — `Intl.DisplayNames` est cette table, la
 * plateforme la fournit, et « Traduit de Español » n'est pas une langue mais
 * une faute. La cible (`cible/story.png`) dessinait déjà la forme française.
 */

export const STORY = {
  titre: 'Story',
  de: (auteur: string): string => `Story de ${auteur}`,
  fermer: 'Fermer',
  segments: (n: number): string => (n === 1 ? 'Cette story' : `${n} stories de cette personne`),
  segment: (rang: number, total: number): string => `Story ${rang} sur ${total}`,
  precedente: 'Story précédente',
  suivante: 'Story suivante',
  langues: 'Changer la langue',
  langue: (nom: string): string => `Lire en ${nom}`,
  traduitDe: (langue: string): string => `Traduit ${deLaLangue(langue)}`,
  original: 'Voir l’original',
  scene: 'Contenu de la story',
  /** Une story sans texte NI média : la passerelle en sert, la vue ne fabrique rien. */
  sansContenu: 'Cette story ne porte aucun texte.',
  repondreA: (auteur: string): string => `Répondre à ${auteur}…`,
  repondre: 'Votre réponse',
  envoyer: 'Envoyer la réponse',
  aimer: 'J’aime cette story',
  repondu: 'Votre réponse a été envoyée.',
  refuse: 'Votre réponse n’est pas partie.',
  vide: 'Écrivez votre réponse avant de l’envoyer.',
  indisponible: {
    titre: 'Story indisponible',
    corps:
      'Cette story n’existe plus, ou elle ne vous est pas ouverte. Les stories restent visibles 24 h après leur publication.',
    action: 'Retour à l’accueil',
  },
  invitation: {
    titre: 'Cette story vous attend',
    corps:
      'Meeshy ne sert le contenu d’une story qu’aux personnes connectées. Entrez avec votre compte : vous reviendrez ici automatiquement.',
    seConnecter: 'Se connecter',
    creerUnCompte: 'Créer un compte',
    note: 'Le lien est gardé de côté : vous reviendrez sur cette story après connexion.',
  },
} as const;

/** Le plafond de `CreateCommentSchema.content` (`services/gateway/src/routes/posts/types.ts:406`). */
export const LONGUEUR_MAX_DE_LA_REPONSE = 2000;

/**
 * ÉLARGIR les littéraux d'un `as const` sans perdre sa FORME.
 *
 * `typeof STORY` fige chaque phrase en type littéral (`'Story'`, et non
 * `string`) : dérivé tel quel, il n'accepterait qu'une copie disant exactement
 * les mêmes mots — c'est-à-dire aucune autre. Ce type garde les CLÉS et la
 * structure, et ne relâche que les chaînes. Les fonctions sont laissées
 * intactes : mapper sur leurs propriétés les détruirait.
 */
type Elargi<T> = {
  readonly [K in keyof T]: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends string
      ? string
      : T[K] extends object
        ? Elargi<T[K]>
        : T[K];
};

/**
 * LA FORME de la copie d'un écran de PARTAGE — story, réel, humeur.
 *
 * Les trois écrans sont le MÊME lecteur (#4929 : « rendu par le MÊME composant
 * lecteur que post/story/reel ») ; ce qui les sépare est leur vocabulaire, et
 * un vocabulaire se paramètre. Le type se DÉRIVE de `STORY` plutôt que d'être
 * écrit à côté : ajouter une phrase à l'un oblige les trois, et l'oubli est un
 * échec de compilation plutôt qu'un trou à l'écran.
 */
export type CopieDuPartage = Elargi<typeof STORY>;
