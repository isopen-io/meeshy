/**
 * LA COPIE DE L'ÉCRAN DU FIL (`/feed`, #5031) — postes et réels.
 *
 * `traduitDe` REPREND l'élision de `lib/contenu/commentaires.ts` plutôt que
 * de la réécrire : c'est une RÈGLE du français, pas une donnée de cet écran.
 * L'exporter depuis un module partagé serait un remaniement hors du territoire
 * de ce lot ; la recopier ICI la ferait diverger de sa source au premier accent
 * ajouté — donc une SEULE ligne, avec sa raison écrite, jusqu'à ce remaniement.
 */

export const FIL_SOCIAL = {
  titre: 'Fil',
  sousTitre: 'Postes et réels',
  retour: 'Retour',
  /**
   * LA PORTE DES RÉELS (#5032) — le bouton que la table de navigation de la
   * planche pose sur cet écran (`MeeshyWebV3.dc.html:870` : « feed → reels,
   * Réels, bouton »). Sans lui, `/feed/reels` serait servi et n'aurait AUCUN
   * lien entrant : l'écran orphelin que la leçon 507 nomme, dans le lot qui
   * suit celui qui l'a écrite.
   */
  reels: 'Réels',
  /**
   * LA PORTE DU COMPOSER (#4966) — le « champ » que la table de navigation de
   * la planche pose sur cet écran (`MeeshyWebV3.dc.html:870` : « feed →
   * composer, Composer, champ »). Un LIEN, pas un `<input>` : la saisie vit
   * sur `/composer`, qui la sert avec son format, son audience et sa
   * publication — un champ ici ferait taper deux fois, exactement comme la
   * recherche du tableau de bord.
   */
  composer: 'Quoi de neuf ?',

  rail: 'Les stories, de la plus récente à la plus ancienne',
  publications: 'Les publications, du plus récent au plus ancien',
  /** Le lien qui saute le rail — un couloir qui peut porter des dizaines de
   * vignettes avant la première publication (§ critère de fin, clavier). */
  allerAuxPublications: 'Aller aux publications',

  aime: 'J’aime',
  aimeRetire: 'Je n’aime plus',
  /** Le compte de cœurs — SERVI (`likeCount`), jamais recompté. */
  aimes: (n: number): string => (n <= 1 ? `${n} j’aime` : `${n} j’aimes`),

  commenter: 'Commenter',
  commentaires: (n: number): string => (n <= 1 ? `${n} commentaire` : `${n} commentaires`),

  reposter: 'Reposter',
  reposte: 'Reposté',
  reposts: (n: number): string => (n <= 1 ? `${n} republication` : `${n} republications`),

  langueDeCePost: 'La langue de cette publication',
  original: 'original',

  vide: 'Aucune publication',
  videPrecision: 'Personne dans votre voisinage n’a encore publié.',

  /** Le lien de pagination (`?cursor=`) — rendu seulement quand `curseurSuivant` est non nul. */
  plus: 'Plus de publications',

  panne: 'Le fil n’a pas pu être chargé',
  pannePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',

  invitation: 'Connectez-vous pour lire votre fil',
  invitationPrecision: 'Le fil social est réservé aux membres.',
  seConnecter: 'Se connecter',

  /** `?refus=1` — le geste (aime/repost) n'a pas abouti. */
  echec: 'Ce geste n’a pas pu être envoyé. Réessayez.',

  /**
   * « traduit de l'anglais », « traduit du russe » — la même règle
   * d'élision que `lib/contenu/commentaires.ts` (§ doc-comment ci-dessus).
   */
  traduitDe: (langue: string): string =>
    /^[aeiouyàâäéèêëîïôöùûü]/i.test(langue) ? `traduit de l’${langue}` : `traduit du ${langue}`,
} as const;

export const GLYPHE_COEUR = 'ph-heart';
export const GLYPHE_COMMENTER = 'ph-chat-circle';
export const GLYPHE_REPOSTER = 'ph-arrows-clockwise';
export const GLYPHE_TRADUCTION = 'ph-translate';
export const GLYPHE_IMAGE = 'ph-image';
