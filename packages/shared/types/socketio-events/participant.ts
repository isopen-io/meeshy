/**
 * Le domaine PARTICIPANT : rôle, droits, arrivées, départs, bannissements.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Données pour l'événement de mise à jour du rôle d'un participant
 * Émis lorsqu'un admin/modérateur modifie le rôle d'un participant dans une conversation
 */
export interface ParticipantRoleUpdatedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly newRole: string;
  readonly updatedBy: string;
  /**
   * Le participant SÉRIALISÉ (`serializeConversationParticipant`), ou `null`
   * quand la relecture du rang ne rend rien — d'où l'optionnalité, qui est
   * portée par le contrat et doit l'être par chaque décodeur client.
   *
   * **`role` porte le rôle GLOBAL** (`USER|ADMIN|…`) ; le rang DANS LA
   * CONVERSATION est `conversationRole`. Le rang à APPLIQUER reste `newRole`,
   * au premier niveau : ce bloc est un complément d'affichage, pas la décision.
   * Confondre les deux rétrograderait tout le monde en « membre ».
   *
   * Forme minimale garantie ; la charge utile porte le participant entier.
   */
  readonly participant?: {
    readonly id: string;
    readonly participantId?: string;
    readonly role?: string;
    readonly conversationRole?: string | null;
    readonly displayName?: string | null;
    readonly userId: string | null;
  } | null;
}

/**
 * Un hôte a modifié les droits d'un visiteur sans compte.
 *
 * `rights` porte l'état RÉSOLU (`rights ?? permissions`), pas le delta écrit.
 * Un client affiche un état ; lui envoyer une différence l'obligerait à
 * recomposer la résolution, donc à en tenir un second énoncé.
 *
 * Le participant est nommé par `participantId` et non par `userId` : le sujet de
 * cet événement n'a précisément pas de compte — sauf pour l'octroi d'historique
 * par DATE (`historyVisibleFrom`), qui vaut pour tout participant.
 */
export interface ParticipantRightsUpdatedEventData {
  readonly conversationId: string;
  readonly participantId: string;
  readonly updatedBy: string;
  readonly rights: {
    readonly canSendMessages: boolean;
    readonly canSendFiles: boolean;
    readonly canSendImages: boolean;
    readonly canSendVideos: boolean;
    readonly canSendAudios: boolean;
    readonly canSendLocations: boolean;
    readonly canSendLinks: boolean;
    /**
     * **Absent pour la room de conversation** (#4009, décision porteur
     * 2026-08-27) : « qui a le droit de voir l'historique » est un fait de
     * MODÉRATION, au même titre que `historyVisibleFrom` que #3898 a retiré de
     * la diffusion large. Seuls les autres HÔTES et l'INTÉRESSÉ le reçoivent.
     *
     * La clé est **absente**, jamais `false` — `false` dirait « droit retiré »,
     * ce que la room n'a pas à savoir. Un client discrimine donc sur la
     * PRÉSENCE de la clé et ne recopie jamais inconditionnellement, exactement
     * comme pour `historyVisibleFrom`.
     */
    readonly canViewHistory?: boolean;
  };
  /** Instant ISO 8601 depuis lequel ce participant lit l'historique ; `null` = aucun octroi. */
  readonly historyVisibleFrom?: string | null;
}

export interface ConversationParticipantBannedEventData {
  readonly conversationId: string;
  /** Toujours présent — voir `ConversationParticipantLeftEventData.participantId`. */
  readonly participantId?: string;
  /** `null` sans compte — voir `ConversationParticipantLeftEventData.userId`. */
  readonly userId: string | null;
  readonly bannedBy: { readonly id: string };
  readonly bannedAt: string;
  /**
   * Le lien de partage que ce bannissement a FERMÉ, quand la personne était
   * entrée par un lien. Bannir sort de la conversation ET invalide la porte
   * empruntée : sortir quelqu'un en laissant son lien ouvert ne protège de rien,
   * il suffit de le rouvrir pour revenir sous un autre pseudonyme.
   *
   * ABSENT quand il n'y avait pas de lien à fermer (créateur, membre ajouté à la
   * main) — jamais `null` : l'absence dit « aucune porte n'a été fermée ».
   */
  readonly closedShareLinkId?: string;
  /**
   * Faux quand la cible avait DÉJÀ quitté la conversation — bannir un ancien
   * membre reste possible, c'est ce qui l'empêche de revenir par un lien de
   * partage, mais ce bannissement-là ne retire aucune appartenance.
   *
   * Un compteur de membres doit suivre ce champ, jamais la seule réception de
   * l'événement. Absent des serveurs antérieurs à ce contrat : le lire comme
   * `true` y reproduit leur comportement, puisqu'ils ne bannissaient qu'en
   * retirant.
   */
  readonly membershipEnded?: boolean;
  /**
   * Effectif ACTIF APRÈS le bannissement, absolu. Quand il est là, il tranche
   * le cas ci-dessus de lui-même : bannir un ex-membre ne retire personne, donc
   * le compte est simplement inchangé. `membershipEnded` reste pour les clients
   * qui décomptent encore.
   */
  readonly memberCount?: number;
  /**
   * Vrai quand `memberCount` est plafonné à 199 (cap d'affichage « 199+ »,
   * broadcast unique pour toute la room). À POSER avec `memberCount` ; absent
   * quand l'effectif transmis est exact.
   */
  readonly memberCountCapped?: boolean;
}

export interface ConversationParticipantUnbannedEventData {
  readonly conversationId: string;
  /** Toujours présent — voir `ConversationParticipantLeftEventData.participantId`. */
  readonly participantId?: string;
  /** `null` sans compte — voir `ConversationParticipantLeftEventData.userId`. */
  readonly userId: string | null;
  /**
   * Le bannissement est levé dans tous les cas ; l'appartenance n'est rendue
   * que si le bannissement l'avait prise. Faux quand la personne était partie
   * d'elle-même AVANT d'être bannie : elle redevient libre de revenir par une
   * porte d'entrée, mais n'est pas réintégrée.
   *
   * Même lecture que `membershipEnded` côté bannissement — absent ⇒ `true`.
   */
  readonly membershipRestored?: boolean;
  /**
   * Effectif ACTIF APRÈS la levée, absolu — à poser plutôt qu'à incrémenter.
   */
  readonly memberCount?: number;
  /**
   * Vrai quand `memberCount` est plafonné à 199 (cap d'affichage « 199+ »,
   * broadcast unique pour toute la room). À POSER avec `memberCount` ; absent
   * quand l'effectif transmis est exact.
   */
  readonly memberCountCapped?: boolean;
}

export interface ConversationParticipantJoinedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly joinedAt: string;
  /**
   * Effectif ACTIF APRÈS l'adhésion, absolu — à POSER, pas à incrémenter.
   *
   * Un delta ne converge pas : l'événement manqué (hors room, hors ligne, trou
   * de reconnexion) laisse une dérive que rien ne rattrape, et que les deux
   * clients PERSISTENT — cache disque iOS (`schedulePersist`), `staleTime:
   * Infinity` côté web. Un total se rattrape à l'événement suivant.
   *
   * Le compte INCLUT l'arrivant, alors même que l'éventail l'écarte : son
   * propre écran reçoit l'effectif par `conversation:new`.
   *
   * Absent des serveurs antérieurs à ce contrat, où l'incrément reste le seul
   * repli disponible.
   */
  readonly memberCount?: number;
  /**
   * Vrai quand `memberCount` est plafonné à 199 (cap d'affichage « 199+ »,
   * broadcast unique pour toute la room). À POSER avec `memberCount` ; absent
   * quand l'effectif transmis est exact.
   */
  readonly memberCountCapped?: boolean;
}

export interface ConversationParticipantLeftEventData {
  readonly conversationId: string;
  /**
   * L'identité TOUJOURS présente — la seule qu'un visiteur venu par un lien
   * partagé possède, puisqu'il n'a aucune ligne `User`. C'est sur ce champ, et
   * jamais sur `userId`, qu'un client retire la bonne ligne.
   *
   * Absent des serveurs antérieurs à ce contrat : un client le lit alors comme
   * `undefined` et retombe sur `userId`, ce qui reproduit son comportement
   * d'avant (les seuls départs qu'ils annonçaient étaient ceux de comptes).
   */
  readonly participantId?: string;
  /**
   * `null` quand la personne n'a PAS de compte. Ce champ déclare un `User.id` :
   * y recopier un `Participant.id` ferait passer une clé de participant pour une
   * clé d'utilisateur dans tout ce qui la consomme ensuite.
   */
  readonly userId: string | null;
  readonly displayName: string;
  readonly leftAt: string;
  /**
   * Effectif ACTIF APRÈS le départ, absolu — à POSER, pas à soustraire. Un
   * client qui décrémente ne se rattrape jamais d'un événement manqué.
   * Absent des serveurs antérieurs à ce contrat, où le décrément reste le
   * seul repli disponible.
   */
  readonly memberCount?: number;
  /**
   * Vrai quand `memberCount` est plafonné à 199 (cap d'affichage « 199+ »,
   * broadcast unique pour toute la room). À POSER avec `memberCount` ; absent
   * quand l'effectif transmis est exact.
   */
  readonly memberCountCapped?: boolean;
}
