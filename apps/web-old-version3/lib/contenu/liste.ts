/**
 * LA COPIE DE LA LISTE DES CONVERSATIONS — et ses trois GESTES.
 *
 * Elle vit sous `lib/` et non sous `app/` pour la même raison que celle du fil
 * (`lib/contenu/fil.ts`) : elle a DEUX auteurs. Le serveur compose la ligne
 * (`app/connecte/liste-vue.ts`) et le module de participation la repeint en
 * direct (`lib/realtime/liste.ts`) — « écrit… », « 3 non lus », « Archiver »
 * doivent être le MÊME mot des deux côtés, sans quoi une ligne repeinte
 * diverge de sa jumelle servie au premier correctif.
 *
 * `app/connecte/contenu.ts` la RÉEXPORTE : ses lecteurs historiques (la vue du
 * tableau de bord, les témoins) n'ont pas d'adresse à changer.
 */

export const CHATS = {
  /**
   * LE TITRE ET LE SOUS-TITRE — « Chats » / « Liste des conversations »
   * (cible `chats.png`, `vues.json#chats`), depuis la disposition #5164. Le
   * `<h1>` du corps, `<section aria-label>` et `<title>` du document en
   * dérivent tous les trois : un seul mot, jamais deux à tenir à jour.
   */
  titre: 'Chats',
  accroche: 'Liste des conversations',
  /** Le nom de la région qui porte les deux puces d'action — un mot d'INTERFACE, donc ici et non dans la vue. */
  actionsRapides: 'Actions rapides',
  /** Le libellé de la première puce d'action — mène à `/links?nouveau`. */
  actionLien: 'Créer un lien',
  /** Le libellé de la seconde — mène à `/chats?nouvelle`. Plus court que `NOUVELLE_CONVERSATION.ouvrir` : les deux puces se partagent 390 px. */
  actionConversation: 'Conversation',
  vide: 'Aucune conversation',
  videPrecision: 'Démarrez une nouvelle conversation pour discuter avec vos amis !',
  participants: 'participants',
  nonLus: 'non lus',
  /** Ce que la ligne dit quand quelqu'un y écrit — la place de l'aperçu, le temps d'une frappe. */
  frappe: 'écrit…',
  /** La pastille de langue (charte règle 22) : le CODE de la langue d'origine, jamais un drapeau. */
  traduitDepuis: 'Traduit depuis cette langue',
  sourdine: 'En sourdine',
  /** Le trou de synchronisation (§ 7) : des messages ont manqué pendant l'absence. */
  trou: 'Des messages manquent',
  trouAction: 'Recharger la liste',
  /** Le nom accessible de l'avatar d'une ligne, quand il ouvre le profil de l'AUTRE personne d'un tête-à-tête (§ 12.10.3). */
  voirLeProfil: (nom: string): string => `Voir le profil de ${nom}`,
} as const;

/**
 * LA CONVERSATION MISE EN AVANT (#5164) — la PREMIÈRE non lue dans l'ORDRE
 * SERVI, jamais la plus non lue ni la première tout court (`cible/chats.png`).
 *
 * PURE, SANS DOM, PARTAGÉE PAR LES DEUX AUTEURS DE CETTE LISTE : le serveur
 * l'appelle sur les `Conversation[]` qu'il vient de servir (déjà triées par la
 * passerelle, `lastMessageAt desc`), et le module de participation l'appelle
 * sur `ordonnees(etat)` — la même fonction, deux entrées qui ont chacune la
 * forme `{ id, nonLus }`. Un candidat RETIRÉ (`retiree`, § 12.10.4) n'entre pas
 * dans la liste que l'appelant passe : c'est à l'appelant de le filtrer, parce
 * que seul lui sait ce que « retiré » veut dire dans son propre état — le
 * serveur n'a pas cette notion.
 */
export type CandidatVedette = { readonly id: string; readonly nonLus: number };

export const vedetteDe = (candidats: readonly CandidatVedette[]): string | null =>
  candidats.find((candidat) => candidat.nonLus > 0)?.id ?? null;

/**
 * LES TROIS GESTES D'UNE LIGNE — leur nom, leur verbe, et leur route.
 *
 * Chacun a un EFFET RÉEL sur la passerelle (charte règle 7), et chacun est
 * atteignable par TROIS chemins qui ne peuvent pas diverger, parce qu'ils
 * partagent ce vocabulaire : le balayage tactile (§ 12.10.4), le menu que
 * chaque ligne porte — clavier et lecteur d'écran —, et le `<form method=post>`
 * qui marche sans un octet de JavaScript.
 *
 * `sourdine` et `archiver` sont des BASCULES : leur libellé dépend de l'état de
 * la ligne, et une bascule qui dirait toujours « Archiver » mentirait à la
 * seconde pression. `supprimer` n'en est pas une — d'où sa confirmation
 * réversible (`lib/realtime/liste.ts`), le serveur ne sachant pas défaire.
 */
export type GesteDeLigne = 'sourdine' | 'archiver' | 'supprimer';

export const GESTES: readonly GesteDeLigne[] = ['sourdine', 'archiver', 'supprimer'];

export const estUnGeste = (valeur: string): valeur is GesteDeLigne =>
  (GESTES as readonly string[]).includes(valeur);

export const ACTIONS = {
  menu: (titre: string): string => `Actions pour ${titre}`,
  sourdine: 'Mettre en sourdine',
  sonner: 'Réactiver le son',
  archiver: 'Archiver',
  supprimer: 'Supprimer pour moi',
  annuler: 'Annuler',
  echec: 'Ce geste n\u2019a pas pu \u00eatre enregistr\u00e9. R\u00e9essayez.',
} as const;

/**
 * CE QUE LE LECTEUR LIT APRÈS LE GESTE — quatre issues, pas trois : mettre en
 * sourdine et réactiver le son sont le même GESTE et deux CONFIRMATIONS, et
 * « préférences enregistrées » pour les deux serait une phrase qui n'apprend
 * rien à qui vient de faire l'un des deux.
 *
 * Ce vocabulaire est CLOS, et c'est ce qui le rend sûr sur le chemin sans
 * JavaScript : la porte redirige vers `/chats?fait=<clé>` (Post/Redirect/Get),
 * et le document ne rend une phrase que pour une clé de cette table. Rien de ce
 * qu'un tiers écrirait dans l'adresse n'atteint le document — pas même échappé.
 */
export type ConfirmationDeGeste = 'sourdine' | 'sonner' | 'archiver' | 'supprimer';

export const CONFIRMATIONS: Readonly<Record<ConfirmationDeGeste, string>> = {
  sourdine: 'Conversation mise en sourdine.',
  sonner: 'Son de la conversation réactivé.',
  archiver: 'Conversation archivée.',
  supprimer: 'Conversation supprimée pour vous.',
};

export const estUneConfirmation = (valeur: string): valeur is ConfirmationDeGeste =>
  Object.prototype.hasOwnProperty.call(CONFIRMATIONS, valeur);

/** La confirmation que tel geste produit, sur telle ligne — la sourdine dépend de l'état d'AVANT. */
export const confirmationDuGeste = ({
  geste,
  sourdine,
}: {
  readonly geste: GesteDeLigne;
  readonly sourdine: boolean;
}): ConfirmationDeGeste => (geste === 'sourdine' ? (sourdine ? 'sonner' : 'sourdine') : geste);

/** Le libellé d'une bascule, décidé par l'ÉTAT de la ligne — jamais par le geste seul. */
export const libelleDuGeste = ({
  geste,
  sourdine,
}: {
  readonly geste: GesteDeLigne;
  readonly sourdine: boolean;
}): string => {
  if (geste === 'sourdine') return sourdine ? ACTIONS.sonner : ACTIONS.sourdine;
  if (geste === 'archiver') return ACTIONS.archiver;
  return ACTIONS.supprimer;
};

/**
 * LA FENÊTRE DE RÉVERSIBILITÉ — cinq secondes pendant lesquelles le geste est
 * PEINT mais pas ENVOYÉ (§ 12.10.4 : « optimiste, réversible tant que le
 * serveur n'a pas confirmé »).
 *
 * Elle n'est pas une commodité d'interface : `DELETE /conversations/:id/
 * delete-for-me` est une porte à SENS UNIQUE côté serveur (« Permanently hide a
 * conversation for the calling user »). Un optimisme qui enverrait d'abord et
 * proposerait « Annuler » ensuite promettrait une réversibilité que la
 * passerelle ne sait pas rendre. Différer l'envoi est la seule façon HONNÊTE de
 * tenir la promesse — et le départ de la page l'expédie sans attendre.
 */
export const FENETRE_REVERSIBLE_MS = 5_000;

/**
 * LA COPIE DE LA FEUILLE « NOUVELLE CONVERSATION » (`sheet:conv`, #5072).
 *
 * DEUX GESTES, ET LE CRITÈRE DE FIN LES COMPTE : ouvrir la feuille, soumettre.
 * Cocher des contacts est FACULTATIF — une conversation qui naît vide se
 * remplit par un lien de partage, et exiger un participant ferait un troisième
 * geste obligatoire pour rien.
 *
 * LE TYPE N'EST PAS OFFERT. `POST /conversations` en accepte cinq (`direct`,
 * `group`, `public`, `global`, `broadcast`) ; cette feuille en sert UN,
 * `group`, et le nomme par ce qu'il fait plutôt que par son mot de schéma. Un
 * tête-à-tête ne se décide pas ici mais depuis la personne — c'est un autre
 * geste, avec une autre porte d'entrée. Offrir cinq boutons radio dont trois
 * sont refusés à un lecteur ordinaire (`global` demande ADMIN, `broadcast` un
 * droit de diffusion) serait un contrôle qui ment.
 */
export const NOUVELLE_CONVERSATION = {
  ouvrir: 'Nouvelle conversation',
  titre: 'Nouvelle conversation',
  fermer: 'Fermer',

  nom: 'Nom de la conversation',
  nomAide: 'Ce que les autres verront en haut du fil.',
  description: 'Description',
  descriptionAide: 'Facultative — une phrase pour dire de quoi il s’agit.',

  contacts: 'Inviter des contacts',
  contactsAide: 'Facultatif. Vous pourrez aussi partager un lien après la création.',
  sansContact: 'Vous n’avez pas encore de contact à inviter.',

  creer: 'Créer la conversation',
  refuse: 'La conversation n’a pas été créée.',
  sansNom: 'Donnez un nom à la conversation.',
} as const;
