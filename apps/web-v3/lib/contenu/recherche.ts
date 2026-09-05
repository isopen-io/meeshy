/**
 * LA COPIE DE L'ÉCRAN DE RECHERCHE, ses QUATRE groupes (#5174, #5171).
 *
 * CE QU'ELLE NE DIT PAS : « N résultats ». Aucune des quatre routes ne sert de
 * total qu'on puisse honnêtement afficher — `/conversations/search` rend un
 * tableau nu, les trois autres paginent (curseur ou offset) sans jamais porter
 * un compte de l'ENSEMBLE — et un chiffre tiré de `data.length` compterait les
 * lignes RAPATRIÉES, plafonnées par la limite, sous un libellé qui promet un
 * total. Les groupes se comptent donc par ce qu'ils MONTRENT (« 3 affichées »),
 * et « il en reste » se dit à part, parce que c'est la seule chose que
 * `hasMore` autorise à dire.
 */

export const RECHERCHE = {
  titre: 'Recherche',
  retour: 'Retour à l’accueil',

  /** Le sous-titre de la cible — ce sur quoi la recherche porte RÉELLEMENT. */
  portee: 'Conversations, personnes, médias et liens',

  /** Le champ. Son libellé est VISIBLE : un placeholder seul disparaît à la frappe. */
  champ: 'Que cherchez-vous ?',
  placeholder: 'Un nom, un titre, un fichier',
  lancer: 'Chercher',

  groupeConversations: 'Conversations',
  groupePersonnes: 'Personnes',
  groupeMedias: 'Médias',
  groupeLiens: 'Liens',

  /**
   * Ce que le groupe MONTRE — jamais ce qu'il totalise. « 3 affichées » est
   * vrai quel que soit le nombre de lignes que la passerelle détient ;
   * « 3 résultats » ne le serait que par chance.
   *
   * DEUX FORMES, PARCE QUE L'ACCORD SUIT LE NOM DU GROUPE et non un
   * « résultat » implicite : « Conversations · 1 affichée », « Personnes ·
   * 1 affichée », « Médias · 1 affiché », « Liens · 1 affiché ». Les personnes
   * prenaient la forme MASCULINE depuis l'écran d'origine — un accord faux,
   * pas un choix de copie.
   */
  affichees: (n: number): string => (n <= 1 ? `${n} affichée` : `${n} affichées`),
  affiches: (n: number): string => (n <= 1 ? `${n} affiché` : `${n} affichés`),

  /** `hasMore` — la seule chose que la passerelle autorise à dire de plus. */
  encore: 'Affinez votre recherche pour en voir davantage',

  /** L'état initial : une invitation, pas une liste vide qui a coûté quatre appels. */
  invite: 'Cherchez dans vos conversations, vos contacts, vos médias et vos liens',
  invitePrecision:
    'Tapez un nom de personne, un titre de conversation ou le nom d’un fichier. La recherche porte sur ce à quoi vous avez accès.',

  vide: 'Aucun résultat',
  videPrecision: 'Aucune conversation, personne, média ni lien ne correspond à cette recherche.',

  panne: 'La recherche n’a pas abouti',
  pannePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',

  /**
   * UN GROUPE, PAS L'ÉCRAN ENTIER (correctif 2026-09-05) — quand une seule des
   * quatre routes échoue, elle prend cette place dans SON `.combien`, jamais
   * « 0 affiché » qui la confondrait avec une recherche sans résultat.
   */
  groupeIndisponible: 'Indisponible',
  groupeIndisponiblePrecision: 'Ce groupe n’a pas pu être chargé. Réessayez dans un instant.',
} as const;

/** Le paramètre d'adresse — un `GET` de formulaire, donc une adresse partageable. */
export const PARAMETRE_DE_RECHERCHE = 'q';

/**
 * LE SILENCE DE SAISIE avant qu'une recherche parte (#4897) — assez court pour
 * suivre le pouce, assez long pour qu'une frappe continue ne coûte qu'un
 * aller-retour. Distinct de `SILENCE_DE_FRAPPE_MS` (reconnect-policy) : l'un
 * mesure quand ON cherche, l'autre quand L'AUTRE écrit.
 */
export const SILENCE_DE_SAISIE_MS = 300;

export const GLYPHE_CONVERSATION = 'ph-chat-circle';
export const GLYPHE_PERSONNE = 'ph-user';
export const GLYPHE_RECHERCHE = 'ph-magnifying-glass';
