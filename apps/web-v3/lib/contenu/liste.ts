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
  titre: 'Conversations',
  accroche: 'Vos conversations, la plus récente en premier.',
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
} as const;

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
