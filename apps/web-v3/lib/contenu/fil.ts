import type { Citation } from '@/lib/api/citations';
import { MENTION_SUPPRIMEE } from '@/lib/api/fil';

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

/**
 * LES QUATRE ÉTATS DU TEMPS RÉEL, NOMMÉS — et c'est le point : ils l'étaient
 * par une COULEUR seulement, ce qui ne dit rien à qui n'a pas d'yeux et rien
 * du tout quand deux états partagent le même rendu.
 *
 * `inconnu` est l'état SERVI : le module de participation charge après le
 * premier pixel (§ 12.4), donc il est vrai à l'ouverture, et il reste vrai
 * pour toujours si le module n'arrive jamais — actif absent de l'image,
 * poignée de main refusée, JavaScript coupé. C'est ce cas-là qui doit se
 * LIRE : un fil qui recharge la page à chaque envoi, sans qu'aucun témoin ne
 * dise pourquoi, coûte un diagnostic entier.
 *
 * Le module écrit les trois autres au fil de ses transitions
 * (`lib/realtime/participate.ts`, `point()`), depuis cette table et jamais
 * depuis une chaîne recopiée : une seule source pour le libellé et pour ce
 * que la feuille dessine.
 */
export const ETATS_DU_TEMPS_REEL = {
  inconnu: 'Temps réel : pas encore actif',
  connecte: 'Temps réel : actif',
  creux: 'Temps réel : reconnexion en cours',
  'hors-ligne': 'Temps réel : hors ligne',
} as const;

export type EtatDuTempsReel = keyof typeof ETATS_DU_TEMPS_REEL;

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
  supprime: MENTION_SUPPRIMEE,
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
  /**
   * CE QU'UN VOCAL OU UNE VIDÉO ANNONCE quand sa transcription est SERVIE dans
   * une autre langue que celle où elle a été faite — le CODE des deux langues,
   * comme la pastille `.langue` (charte règle 23 : jamais un drapeau).
   *
   * Elle remplace « Sous-titres fr », qui PROMETTAIT une piste de sous-titres
   * que le lecteur ne portait pas : la passerelle n'expose aucun WebVTT, et
   * fabriquer des minutages serait inventer. Le Prisme était ANNONCÉ sans être
   * APPLIQUÉ (cycle 123) ; il est désormais DIT tel qu'il est servi, et le
   * transcrit se lit juste dessous.
   */
  transcrit: (origine: string, servie: string): string => `Transcrit du ${origine} · lire en ${servie}`,
  /**
   * LE GESTE D'UN BLOC DE PIÈCE, avec ce que la pièce annonce — le nom
   * accessible que la cible porte. La composition vit ICI, avec les deux
   * phrases : écrite dans la ligne servie ET dans le peintre, elle aurait
   * divergé au premier séparateur.
   */
  lire: (nom: string, meta = ''): string => (meta === '' ? `Lire ${nom}` : `Lire ${nom} · ${meta}`),
  citations: 'Ce que ce message cite',
  reponseA: (qui: string): string => `En réponse à ${qui}`,
  reponseAUnMessage: 'En réponse à un message',
  transfertDepuis: (source: string): string => `Transféré depuis ${source}`,
  transfert: 'Message transféré',
  reponseALaPublication: (quoi: string): string => `A répondu à ${quoi}`,
  /** Les deux formes d'une publication citée : la MIENNE, et celle d'un autre — jamais une contraction à deviner. */
  publication: {
    mienne: { humeur: 'votre humeur', story: 'votre story', reel: 'votre reel', publication: 'votre publication' },
    autre: { humeur: 'une humeur', story: 'une story', reel: 'un reel', publication: 'une publication' },
  },
  deQui: (qui: string): string => ` de ${qui}`,
  /** Le geste d'un bloc qui se TÉLÉCHARGE — nommé dans la cible, parce qu'elle ouvre un onglet. */
  telecharger: (nom: string, meta = ''): string => (meta === '' ? `Télécharger ${nom}` : `Télécharger ${nom} · ${meta}`),
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

/**
 * LE LIBELLÉ D'UNE CITATION — une table, deux lecteurs : le serveur qui rend la
 * ligne (`app/connecte/fil-lignes.ts`) et le module qui la peint en direct
 * (`lib/realtime/fil-peinture.ts`). Écrit deux fois, « Transféré depuis » et
 * « A répondu à votre story » auraient divergé au premier correctif — c'est la
 * jumelle que la charte interdit, et c'est ce que `LIBELLES` avait déjà coûté
 * une fois au fil.
 */
export const libelleDeCitation = (citation: Citation): string => {
  if (citation.genre === 'transfert') {
    return citation.source === null ? FIL.transfert : FIL.transfertDepuis(citation.source);
  }
  if (citation.genre === 'reponse') {
    return citation.source === null ? FIL.reponseAUnMessage : FIL.reponseA(citation.source);
  }
  const sorte = citation.sorte ?? 'publication';
  const quoi = citation.pourMoi
    ? FIL.publication.mienne[sorte]
    : FIL.publication.autre[sorte] + (citation.source === null ? '' : FIL.deQui(citation.source));
  return FIL.reponseALaPublication(quoi);
};

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
