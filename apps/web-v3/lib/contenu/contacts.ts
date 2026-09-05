/**
 * LA COPIE DE L'ÉCRAN DES CONTACTS — ce que l'écran DIT, hors de ce que la
 * passerelle sert.
 *
 * Trois sortes de lignes cohabitent dans une liste UNIQUE (`cible/contacts.png`)
 * et se distinguent par leur SECONDE ligne, jamais par leur seule couleur :
 * « Demande reçue il y a 2 jours », « Demande envoyée il y a 3 jours »,
 * « @marta ». Un daltonien, un lecteur d'écran et un écran au soleil doivent
 * lire la même distinction.
 *
 * CE QUI N'EST PAS ICI : le nom des gens, leur pseudonyme, leur présence. Ils
 * viennent de la passerelle, gatés par la loi de visibilité, et les composer
 * ici serait une seconde source.
 */

export const CONTACTS = {
  titre: 'Contacts',
  retour: 'Retour aux conversations',
  /** L'en-tête de la liste, lu avant les lignes par les lecteurs d'écran. */
  liste: 'Vos demandes en attente, puis vos contacts',

  /** Le compteur du sous-titre — il ne compte QUE ce sur quoi on peut agir. */
  enAttente: (n: number): string => (n <= 1 ? `${n} demande en attente` : `${n} demandes en attente`),

  demandeRecue: 'Demande reçue',
  demandeEnvoyee: 'Demande envoyée',
  /** L'état d'une demande envoyée : un CONSTAT, pas un bouton — rien à faire de ce côté. */
  enAttenteDeReponse: 'En attente',

  accepter: 'Accepter',
  refuser: 'Refuser',
  /** Ce que l'action DIT une fois faite — un contrôle muet laisse le doute qu'il prétendait lever. */
  acceptee: 'Demande acceptée',
  refusee: 'Demande refusée',
  /** Le retour en arrière du refus optimiste, tant que sa fenêtre est ouverte. */
  annuler: 'Annuler',
  echouee: 'La demande n’a pas pu être traitée. Réessayez dans un instant.',

  vide: 'Aucun contact',
  videPrecision:
    'Les personnes de votre carnet d’adresses déjà sur Meeshy apparaîtront ici, avec les demandes que vous recevez.',

  panne: 'Vos contacts n’ont pas pu être chargés',
  pannePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',
} as const;

/**
 * LE GLYPHE D'UNE LIGNE — trois valeurs, une par sorte de ligne, et rien à
 * défaillir : contrairement au genre d'une notification (que la passerelle
 * choisit et fera évoluer), la sorte d'une ligne de contacts est décidée ICI,
 * à partir de `senderId`. Une table fermée sur un domaine fermé n'a pas besoin
 * de défaut.
 */
export const GLYPHE_RECUE = 'ph-user-plus';
export const GLYPHE_ENVOYEE = 'ph-clock';
export const GLYPHE_CONTACT = 'ph-users';
