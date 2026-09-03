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
