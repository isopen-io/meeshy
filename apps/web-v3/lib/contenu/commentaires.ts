/**
 * LA COPIE DE L'ÉCRAN DES COMMENTAIRES.
 *
 * CE QU'ELLE NE COMPOSE PAS : le texte d'une publication ni celui d'un
 * commentaire. Les deux viennent de la passerelle, et le Prisme y a déjà élu sa
 * langue (`lib/api/publication.ts`). Fabriquer ici une phrase à partir du genre
 * ou de la langue ferait une seconde source, qui divergerait du texte servi.
 *
 * LA LIGNE DU PRISME EST UNE PHRASE, PAS UN CODE. « traduit de l'anglais » se
 * lit ; « en → fr » se déchiffre. Le nom de la langue vient d'`Intl`, qui les
 * connaît toutes — une table écrite à la main ici serait fausse dès la
 * huitième.
 */

export const COMMENTAIRES = {
  titre: 'Commentaires',
  retour: 'Retour',
  /** L'en-tête de la liste, lu avant les lignes par les lecteurs d'écran. */
  liste: 'Les commentaires, du plus récent au plus ancien',

  /** Les trois sources que l'écran sait ouvrir — la puce dit LAQUELLE on lit. */
  genres: { POST: 'Post', REEL: 'Réel', STORY: 'Story' } as const,

  /**
   * « traduit de l'anglais », « traduit du russe » — L'ÉLISION EST UNE RÈGLE,
   * pas une table.
   *
   * Le français élide devant une voyelle et contracte devant une consonne. Le
   * nom de la langue vient d'`Intl.DisplayNames`, qui les connaît toutes ; une
   * table écrite à la main ici serait fausse dès la huitième langue, et le
   * produit en sert sept. Le `h` reste hors du champ de cette règle — aucune
   * langue servie ne commence par un `h` muet en français.
   */
  traduitDe: (langue: string): string =>
    /^[aeiouyàâäéèêëîïôöùûü]/i.test(langue) ? `traduit de l’${langue}` : `traduit du ${langue}`,
  voirLOriginal: 'voir l’original',
  voirLaTraduction: 'voir la traduction',

  repondre: 'Répondre',
  modifier: 'Modifier',
  supprimer: 'Supprimer',
  /** Le compte de cœurs. Il est SERVI (`likeCount`), jamais recompté. */
  aimes: (n: number): string => (n <= 1 ? `${n} j’aime` : `${n} j’aimes`),

  /** `hasMore` — il dit qu'il en reste, jamais combien. */
  encore: 'D’autres commentaires suivent',

  vide: 'Aucun commentaire',
  videPrecision: 'Personne n’a encore réagi. Soyez le premier.',

  introuvable: 'Cette publication n’est plus là',
  introuvablePrecision:
    'Elle a été supprimée, ou elle n’est pas partagée avec vous. Les deux se ressemblent, et c’est voulu.',

  panne: 'La publication n’a pas pu être chargée',
  pannePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',

  /** L'invitation du visiteur sans session — jamais une erreur (décision porteur). */
  invitation: 'Connectez-vous pour lire cette publication',
  invitationPrecision:
    'Les publications et leurs commentaires sont réservés aux membres. Votre lien vous y ramènera.',
  seConnecter: 'Se connecter',
} as const;

export const GLYPHE_PAR_GENRE: Readonly<Record<string, string>> = {
  POST: 'ph-article',
  REEL: 'ph-film-strip',
  STORY: 'ph-sparkle',
};

export const GLYPHE_TRADUCTION = 'ph-translate';
export const GLYPHE_COEUR = 'ph-heart';
