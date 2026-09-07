/**
 * LA COPIE DU COMPOSER (`/composer`, #4966).
 *
 * QUATRE FORMATS DANS LA CIBLE, DEUX SERVIS — et les deux absents le sont pour
 * des raisons DIFFÉRENTES, qu'il faut dire séparément :
 *
 * • **Réel** exige une VIDÉO. `CreatePostSchema.mediaIds` attend des médias
 *   « already uploaded » : cet écran ne téléverse rien, et publier un `REEL`
 *   sans média produirait un réel sans réel. Ce n'est pas un onglet à câbler
 *   plus tard au même endroit — c'est un lot de téléversement.
 * • **Story** a sa propre route (`/stories/new`, #5033), servie depuis ce
 *   lot : son onglet est donc un LIEN VERS ELLE, pas un format de ce
 *   formulaire. Publier une story demande une audience par défaut différente
 *   (`FRIENDS`, le défaut serveur) et une durée de vie à annoncer — deux
 *   choses qu'un troisième `?format=` aurait fondues dans un écran qui ne les
 *   distingue pas.
 *
 * Un onglet vers une route absente, ou vers une publication qu'on ne peut pas
 * composer, est le contrôle sans effet de la charte règle 7 — la même doctrine
 * que les trois rangées servies du carrefour des réglages. Les deux onglets
 * rendus sont motivés par ce qu'ils PROMETTENT.
 *
 * PAS DE COMPTEUR DE CARACTÈRES, ET C'EST UN CHOIX. La cible en dessine un
 * (« 24/140 ») ; sans JavaScript il ne bougerait pas d'un caractère pendant la
 * frappe — un chiffre qui ment est pire que pas de chiffre (charte règle 7).
 * La BORNE, elle, est dite et APPLIQUÉE : `maxlength` la tient nativement, et
 * elle vient de `CreatePostSchema.content` (5 000), jamais du « 140 » de la
 * planche, qu'aucune route n'applique.
 */

/** `CreatePostSchema.content` — `z.string().max(5000)` (`routes/posts/types.ts:237`). */
export const LONGUEUR_MAX_DU_CONTENU = 5000;

/** Le paramètre d'adresse qui choisit le format. Un seul site le nomme. */
export const CHAMP_DU_FORMAT = 'format';

export const FORMATS_SERVIS = [
  { cle: 'post', glyphe: 'ph-article', libelle: 'Post', type: 'POST' },
  { cle: 'humeur', glyphe: 'ph-smiley', libelle: 'Humeur', type: 'STATUS' },
] as const;

/**
 * LA STORY N'EST PAS UN FORMAT DE CE FORMULAIRE — c'est un ÉCRAN. L'onglet est
 * rendu à côté des deux autres, comme la cible le dessine, mais il MÈNE
 * ailleurs : `/stories/new` (#5033). Le distinguer dans le type plutôt que de
 * le glisser dans `FORMATS_SERVIS` est ce qui empêche la porte de le traiter
 * comme un `?format=` qu'elle publierait elle-même.
 */
export const ONGLET_DE_LA_STORY = {
  glyphe: 'ph-sparkle',
  libelle: 'Story',
  href: '/stories/new',
} as const;

export type FormatServi = (typeof FORMATS_SERVIS)[number]['cle'];

export const estUnFormat = (valeur: string): valeur is FormatServi =>
  FORMATS_SERVIS.some((format) => format.cle === valeur);

/**
 * LES DIX HUMEURS DE LA CIBLE (`MeeshyWebV3.dc.html:669`), dans son ordre.
 * `moodEmoji` les accepte toutes (`z.string().max(10)`) — la borne est la
 * TAILLE, pas une énumération : la passerelle ne tient aucune liste, donc
 * celle-ci est une proposition d'écran, jamais une loi. Un emoji hors liste ne
 * serait pas refusé par la passerelle ; il ne serait simplement pas offert ici.
 */
export const HUMEURS = ['😴', '🎉', '💪', '☕', '🔥', '💭', '🎵', '📚', '✈️', '❤️'] as const;

export const CHAMPS_DU_COMPOSER = {
  texte: 'texte',
  humeur: 'humeur',
  audience: 'audience',
} as const;

/**
 * LES TROIS AUDIENCES QUE LA PASSERELLE ACCEPTE SANS CHAMP DE PLUS
 * (`CreatePostSchema.visibility`). `COMMUNITY`, `EXCEPT` et `ONLY` exigent des
 * identifiants que cet écran ne collecte pas : les offrir enverrait une charge
 * que la passerelle refuse.
 */
export const AUDIENCES = [
  { valeur: 'PUBLIC', libelle: 'Public', phrase: 'Tout le monde peut voir cette publication.' },
  { valeur: 'FRIENDS', libelle: 'Contacts', phrase: 'Seuls vos contacts acceptés la voient.' },
  { valeur: 'PRIVATE', libelle: 'Moi seul', phrase: 'Personne d’autre que vous ne la voit.' },
] as const;

export type Audience = (typeof AUDIENCES)[number]['valeur'];

export const estUneAudience = (valeur: string): valeur is Audience =>
  AUDIENCES.some((audience) => audience.valeur === valeur);

export const COMPOSER = {
  titre: 'Composer',
  sousTitre: 'Ce que vous publiez, et pour qui',
  retour: 'Retour',
  formats: 'Ce que vous publiez',
  texte: 'Votre texte',
  textePlaceholder: 'Quoi de neuf ?',
  humeur: 'Votre humeur',
  humeurAide: 'Choisissez une humeur, ajoutez un mot si vous voulez.',
  humeurTexte: 'Un mot sur votre humeur',
  humeurTextePlaceholder: 'Café et revue de mars',
  audience: 'Audience',
  traduction: 'Traduction',
  /**
   * CE QUE « AUTO » VEUT DIRE, ET IL FAUT LE DIRE. La v3 ne CHOISIT pas une
   * langue de traduction : elle REVENDIQUE la langue dans laquelle le texte est
   * écrit (`originalLanguage`), et c'est le Prisme de chaque LECTEUR qui décide
   * ensuite ce qu'il lit. Écrire « Auto » seul laisserait croire à un réglage.
   */
  traductionPhrase: (langue: string): string =>
    `Publié en ${langue} ; chaque lecteur le reçoit dans sa langue.`,
  traductionSansLangue:
    'La langue de votre texte sera détectée ; chaque lecteur le reçoit dans la sienne.',
  publier: 'Publier',
  borne: (max: number): string => `${max.toLocaleString('fr-FR')} caractères au plus.`,
  /** Le retour du Post/Redirect/Get — la publication est partie. */
  publie: 'Publié.',
  publieVoir: 'Voir dans le fil',
  refuse: 'Votre publication n’est pas partie.',
  vide: 'Écrivez quelque chose, ou choisissez une humeur, avant de publier.',
} as const;
