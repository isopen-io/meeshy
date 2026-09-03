/**
 * LA COPIE DE L'ÉCRAN DE RECHERCHE.
 *
 * CE QU'ELLE NE DIT PAS : « N résultats ». Aucune des deux routes ne sert de
 * total — `/conversations/search` rend un tableau nu, `/directory/people`
 * pagine par curseur — et un chiffre tiré de `data.length` compterait les
 * lignes RAPATRIÉES, plafonnées par la limite, sous un libellé qui promet un
 * total. Les groupes se comptent donc par ce qu'ils MONTRENT (« 3 affichées »),
 * et « il en reste » se dit à part, parce que c'est la seule chose que
 * `hasMore` autorise à dire.
 */

export const RECHERCHE = {
  titre: 'Recherche',
  retour: 'Retour à l’accueil',

  /** Le sous-titre de la cible — ce sur quoi la recherche porte RÉELLEMENT. */
  portee: 'Conversations et personnes',

  /** Le champ. Son libellé est VISIBLE : un placeholder seul disparaît à la frappe. */
  champ: 'Que cherchez-vous ?',
  placeholder: 'Un nom, un titre de conversation',
  lancer: 'Chercher',

  groupeConversations: 'Conversations',
  groupePersonnes: 'Personnes',

  /**
   * Ce que le groupe MONTRE — jamais ce qu'il totalise. « 3 affichées » est
   * vrai quel que soit le nombre de lignes que la passerelle détient ;
   * « 3 résultats » ne le serait que par chance.
   */
  affichees: (n: number): string => (n <= 1 ? `${n} affichée` : `${n} affichées`),
  affiches: (n: number): string => (n <= 1 ? `${n} affiché` : `${n} affichés`),

  /** `hasMore` — la seule chose que la passerelle autorise à dire de plus. */
  encore: 'Affinez votre recherche pour en voir davantage',

  /** L'état initial : une invitation, pas une liste vide qui a coûté deux appels. */
  invite: 'Cherchez dans vos conversations et vos contacts',
  invitePrecision:
    'Tapez un nom de personne ou un titre de conversation. La recherche porte sur ce à quoi vous avez accès.',

  vide: 'Aucun résultat',
  videPrecision: 'Aucune conversation ni personne ne correspond à cette recherche.',

  panne: 'La recherche n’a pas abouti',
  pannePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',
} as const;

/** Le paramètre d'adresse — un `GET` de formulaire, donc une adresse partageable. */
export const PARAMETRE_DE_RECHERCHE = 'q';

export const GLYPHE_CONVERSATION = 'ph-chat-circle';
export const GLYPHE_PERSONNE = 'ph-user';
export const GLYPHE_RECHERCHE = 'ph-magnifying-glass';
