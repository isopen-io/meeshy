/**
 * LA COPIE DE L'ÉCRAN DES LIENS — ce que l'écran DIT, hors de ce que la
 * passerelle sert.
 *
 * LE MOT QUI COMPTE EST « ONT REJOINT », ET IL A ÉTÉ MESURÉ. La cible dessine
 * « 12 vues · 4 ont rejoint » ; la charge ne porte qu'UN nombre,
 * `currentUses`, dont l'unique producteur est `claimLinkUse`
 * (`services/gateway/src/routes/conversations/link-admission.ts:192`) : il
 * s'incrémente sur le chemin d'ADMISSION, borné par `maxUses`, quand quelqu'un
 * ENTRE. Aucun compteur de vues n'existe sur un lien de partage — `clickCount`
 * vit sur `AffiliateToken`, un autre modèle.
 *
 * Écrire « vues » au-dessus de ce nombre serait plus faux que de ne rien
 * écrire : un chiffre plausible sous le mauvais nom ne se signale jamais, et
 * personne ne va vérifier ce qu'un compteur compte.
 */

export const LIENS = {
  titre: 'Mes liens',
  retour: 'Retour à l’accueil',
  /** L'en-tête de la liste, lu avant les lignes par les lecteurs d'écran. */
  liste: 'Vos liens de partage',

  /**
   * Le compte du sous-titre. Il vient de `meta.summary.activeLinks` — TOUT le
   * carnet —, jamais d'un décompte de la page, qui serait plafonné par
   * `limit` et se contredirait à la page suivante.
   */
  actifs: (n: number): string => (n <= 1 ? `${n} lien actif` : `${n} liens actifs`),

  /** « 4 ont rejoint » — ce que le nombre compte VRAIMENT (voir l'en-tête). */
  ontRejoint: (n: number): string => (n <= 1 ? `${n} a rejoint` : `${n} ont rejoint`),

  /** Un lien fermé le DIT : le cacher se lirait comme une perte, pas une fermeture. */
  ferme: 'Fermé',
  /** Sa capacité, quand il en déclare une — « 4 / 50 ». */
  capacite: (utilises: number, maximum: number): string => `${utilises} / ${maximum}`,
  /**
   * L'échéance, dite en ABSOLU. Le reste de la v3 date en relatif (« il y a
   * 2 j »), qui répond à « quand est-ce arrivé ? » ; celle-ci répond à
   * « jusqu'à quand puis-je le partager ? », et « dans 3 j » se relit mal quand
   * on décide d'envoyer un lien. La date est posée dans le fuseau du serveur —
   * `Intl` côté client n'existe pas ici, l'écran n'ayant aucun JavaScript.
   */
  expire: (jour: string): string => `Expire le ${jour}`,

  vide: 'Aucun lien de partage',
  videPrecision:
    'Un lien de partage ouvre une conversation à qui le reçoit, sans compte. Ceux que vous créerez apparaîtront ici.',

  panne: 'Vos liens n’ont pas pu être chargés',
  pannePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',
} as const;

export const GLYPHE_LIEN = 'ph-link-simple';

/**
 * LA COPIE DE LA FEUILLE « NOUVEAU LIEN » (`sheet:link`, #5071).
 *
 * CHAQUE LIBELLÉ RECOUVRE UN CHAMP DE `createLinkSchema`, et rien d'autre : ce
 * que la feuille NOMME, la passerelle l'applique. Le critère de fin interdit
 * nommément le champ décoratif, et le seul candidat du schéma — les pays
 * autorisés, déclarés `CHAMP_PAYS_INERTE` — n'a donc pas de libellé ici.
 *
 * L'EXPIRATION EST UN CHOIX, PAS UNE DATE À SAISIR. « 24 heures / 7 jours /
 * jamais » se décide d'un geste ; un champ de date demande de connaître le
 * format, de calculer, et se trompe d'un fuseau. La date envoyée est calculée
 * au moment de la soumission, par le serveur — la seule horloge que les deux
 * bouts partagent.
 */
export const NOUVEAU_LIEN = {
  ouvrir: 'Nouveau lien',
  titre: 'Nouveau lien de partage',
  fermer: 'Fermer',

  conversation: 'Nom de la conversation',
  conversationAide: 'Le lien ouvre une conversation neuve, publique, que vous nommez ici.',
  nom: 'Nom du lien',
  nomAide: 'Pour vous y retrouver dans la liste. Les invités ne le voient pas.',

  expiration: 'Le lien expire',
  jour: 'Dans 24 heures',
  semaine: 'Dans 7 jours',
  jamais: 'Jamais',

  capacite: 'Nombre de personnes maximum',
  capaciteAide: 'Laissez vide pour ne pas limiter.',

  anonymes: 'Ce que les invités peuvent faire',
  ecrire: 'Écrire des messages',
  fichiers: 'Joindre des fichiers',
  images: 'Envoyer des images',
  historique: 'Lire les messages d’avant leur arrivée',
  pseudonyme: 'Demander un pseudonyme à l’entrée',

  creer: 'Créer le lien',
  cree: 'Votre lien est créé.',
  refuse: 'Le lien n’a pas été créé.',
  sansTitre: 'Donnez un nom à la conversation.',
} as const;

/** Les trois échéances offertes, et ce qu'elles valent en millisecondes. */
export const ECHEANCES = {
  jour: 24 * 60 * 60 * 1000,
  semaine: 7 * 24 * 60 * 60 * 1000,
  jamais: null,
} as const;

export type Echeance = keyof typeof ECHEANCES;
