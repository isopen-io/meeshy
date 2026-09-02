/**
 * LA COPIE DU FIL — ce que l'écran DIT, hors de ce qu'il compose. Une phrase
 * qui vit ici se relit d'un coup ; une phrase enfouie dans un gabarit se
 * corrige trois fois.
 *
 * Elle vit sous `lib/` et non sous `app/` parce qu'elle a DEUX lecteurs : le
 * serveur, qui compose le document (`app/connecte/fil-vue.ts`, `fil-lignes.ts`,
 * les deux routes), et le module de participation, qui peint en direct
 * (`lib/realtime/fil-peinture.ts`, `participate.ts`). Le module en portait une
 * COPIE (`LIBELLES`) — la jumelle que la charte interdit : « Envoi en cours »
 * pouvait diverger de lui-même entre la ligne servie et la ligne peinte.
 *
 * Les mots du legacy sont repris là où il en a (`apps/web/locales/fr/
 * conversations.json` : « Écrire un message », « Aucun message dans cette
 * conversation », « Démarrez la conversation en envoyant un message ! ») ; les
 * états que le legacy ne dessine pas — hors ligne, place fermée, lien clos,
 * messages manquants — prennent la phrase de la conception (§ 6.3, § 7).
 */

export const FIL = {
  retour: 'Retour aux conversations',
  retourAccueil: 'Retour à l’accueil',
  /** Le titre d'un fil dont la passerelle n'a servi aucun nom — jamais un segment d'adresse. */
  conversation: 'Conversation',
  participants: 'participants',
  enLigne: 'en ligne',
  entreComme: 'Entré comme',
  anonyme: 'anonyme',
  /** Le sous-titre d'une place dont la passerelle n'a pas nommé l'occupant (état G au rechargement) — jamais un nom vide. */
  entreEnAnonyme: 'Entré en anonyme',
  prisme: 'AUTO',
  prismeTitre: 'Vos messages sont servis dans cette langue',
  messages: 'Messages',
  messagesOrdre: 'Messages, du plus récent au plus ancien',
  plusAnciens: 'Messages plus anciens',
  vide: 'Aucun message dans cette conversation',
  videPrecision: 'Démarrez la conversation en envoyant un message !',
  vous: 'Vous',
  systeme: 'Message système',
  original: 'Voir l’original',
  traduitDepuis: 'Traduit depuis cette langue',
  modifie: 'modifié',
  supprime: 'Ce message a été supprimé',
  protege: 'Message protégé',
  accuse: { envoye: 'Envoyé', recu: 'Reçu', lu: 'Lu' },
  enAttente: 'Envoi en cours',
  horsLigne: 'En attente du réseau',
  echec: 'Non envoyé',
  refuse: 'Refusé par le serveur',
  reessayer: 'Réessayer',
  frappe: 'écrit…',
  nouveaux: (n: number): string => (n === 1 ? '1 nouveau message' : `${n} nouveaux messages`),
  trou: 'Des messages manquent ici',
  trouAction: 'Charger les messages manquants',
  aujourdhui: 'Aujourd’hui',
  hier: 'Hier',
  piece: 'Pièce jointe',
  transcription: 'Transcription',
  telecharger: 'Télécharger',
  ecrire: 'Écrire un message',
  ecrireEn: (langue: string): string => `Écrire en ${langue}…`,
  envoyer: 'Envoyer',
  aideDuClavier: 'Entrée envoie, Maj + Entrée passe à la ligne.',
  joindre: 'Joindre un fichier',
  joindreImage: 'Joindre une photo',
  retirerLaPiece: 'Retirer la pièce jointe',
  pieceTropLourde: 'Cette pièce jointe dépasse la taille admise.',
  messageVide: 'Le message est vide.',
  /** Le compteur, dès 90 % du plafond — `LONGUEUR_MAX_DU_MESSAGE` (`lib/api/fil.ts`). */
  compteur: (longueur: number, maximum: number): string => `${longueur} / ${maximum}`,
  tropLong: (longueur: number, maximum: number): string => `Ce message fait ${longueur} caractères ; la limite est de ${maximum}. Raccourcissez-le, il est conservé.`,
  reagir: 'Réagir',
  reactions: 'Réactions',
  choisirUneReaction: 'Choisir une réaction',
  fermer: 'Fermer',
} as const;

/** Les six réactions offertes par la palette — celles que les trois clients proposent en premier. */
export const EMOJIS_DE_LA_PALETTE = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

/**
 * LES DROITS DE L'INVITÉ — leur copie ET leur verdict — vivent dans
 * `lib/contenu/droits.ts` : une source, lue par le bandeau du fil, par
 * l'accordéon de la modale et par le module qui repeint (issue #4523).
 */

export const BANDEAUX = {
  placeFermee: {
    titre: 'Votre place a été fermée',
    corps: 'Ce que vous avez lu reste à l’écran. Reprenez votre place pour continuer à écrire.',
    action: 'Reprendre ma place',
  },
  horsLigne: {
    titre: 'Hors ligne',
    corps: 'Vos messages partiront dans l’ordre au retour du réseau.',
    action: 'Réessayer',
  },
  sessionExpiree: {
    titre: 'Votre session a expiré',
    corps: 'Ce que vous avez lu reste à l’écran. Reconnectez-vous pour continuer à écrire.',
    action: 'Se reconnecter',
  },
  miseAJour: 'Mise à jour…',
} as const;

/**
 * POURQUOI le composeur est fermé — les phrases vivent avec les CODES qu'elles
 * traduisent, dans `lib/api/invite.ts` : le module de participation les sert
 * sur un 410 de battement (§ 6.3 état G) comme la route les sert au montage,
 * depuis UNE table.
 */
export { RAISONS_DE_FERMETURE, raisonDeFermeture } from '@/lib/api/invite';

export const INTROUVABLE = {
  titre: 'Conversation introuvable',
  corps:
    'Ce fil n’existe pas, ou vous n’en faites pas partie. Retrouvez vos conversations depuis la liste.',
  action: 'Mes conversations',
} as const;

/**
 * CE QU'UN MEMBRE LIT quand un lien ne peut pas l'ouvrir — jamais la modale
 * anonyme (conception § 12.3 : « un lecteur connecté ne voit jamais la
 * modale »). La raison est nommée par la passerelle ; la phrase vient de la
 * même table que celle de la modale (`REFUS`, `app/(public)/chat/[lien]/
 * choix-vue.ts`), et l'action mène à ce que le membre possède déjà.
 */
export const REFUS_DU_MEMBRE = {
  titre: 'Ce lien ne peut pas vous ouvrir la conversation',
  action: 'Mes conversations',
} as const;

/**
 * CE QU'UN MEMBRE LIT quand sa navigation ne vaut pas encore un geste — elle
 * vient d'ailleurs, ou d'un agent qui ne dit pas d'où (`app/provenance.ts` ›
 * `navigationEtrangere`) : le lien est nommé, et l'adhésion se DEMANDE par un
 * `<form method="post">`, à la même adresse. Un tap, jamais une mutation posée
 * par un site tiers.
 */
export const ADHESION_DU_MEMBRE = {
  titre: (nom: string): string => `Rejoindre ${nom} ?`,
  corps: 'Ce lien vous ouvre cette conversation. Vous y entrerez avec votre compte, et vous y lirez tout ce que le lien vous ouvre.',
  action: (nom: string): string => `Rejoindre ${nom}`,
  autre: 'Mes conversations',
} as const;
