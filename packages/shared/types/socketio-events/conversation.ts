/**
 * Le domaine CONVERSATION : cycle de vie (créée, mise à jour, fermée,
 * supprimée, restaurée), participation, refus de `conversation:join`,
 * compteurs de non-lus et statistiques.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

// Motifs de refus de `conversation:join` — la table ET la règle qui décide
// lesquels autorisent un consommateur à purger son cache (cycle 99)
import type { ConversationJoinErrorReason } from '../../utils/conversation-join-error.js';

// Le pont ✦ (G-123) — payload optionnel de `conversation:unread-updated`
import type { ConversationBridge } from '../conversation-bridge.js';

/**
 * Données pour l'événement de participation à une conversation
 */
export interface ConversationParticipationEventData {
  readonly conversationId: string;
  readonly userId: string;
  // PAS d'effectif ici, et c'est délibéré : `conversation:joined` /
  // `conversation:left` sont des accusés de ROOM (`ConversationHandler`),
  // réémis à chaque ouverture et à chaque fermeture de fil, sans qu'aucune
  // appartenance change. L'adhésion et le départ réels ont leurs propres
  // événements — `CONVERSATION_PARTICIPANT_JOINED` / `_LEFT` — et ce sont eux
  // qui portent `memberCount`.
}

/**
 * Données pour le REFUS d'une jonction de conversation (`conversation:join-error`).
 *
 * Déclaré au cycle 99. L'événement existait depuis longtemps — huit sites
 * d'émission dans `ConversationHandler`, un consommateur web et un consommateur
 * iOS — mais n'avait AUCUNE entrée ici. Ses deux consommateurs en avaient donc
 * chacun transcrit la forme en lisant le producteur, et tous deux avaient
 * conclu la même chose de travers : que l'événement signifiait « tu n'es plus
 * membre », alors que quatre de ses sept motifs sont transitoires.
 *
 * `reason` n'est pas décoratif : c'est lui qui sépare les refus qui établissent
 * la non-appartenance de ceux qui ne disent rien de l'appartenance. Un
 * consommateur DOIT le lire avant de détruire quoi que ce soit, via
 * `isMembershipDeniedJoinError()` — la seule règle, partagée.
 *
 * @see utils/conversation-join-error.ts
 */
export interface ConversationJoinErrorEventData {
  /**
   * L'identifiant TEL QUE DEMANDÉ par le client, pas l'identifiant normalisé :
   * sur les refus précoces (`invalid_payload`, `server_error`) la normalisation
   * n'a pas eu lieu, et le client doit pouvoir rapprocher le refus de la
   * demande qu'il a émise.
   */
  readonly conversationId: string;
  readonly reason: ConversationJoinErrorReason;
  readonly message: string;
}

/**
 * Payload de `CONVERSATION_NEW` — émis aux user-rooms de TOUS les
 * participants (créateur inclus) lors de la création d'une conversation.
 * Champs minimaux pour permettre au client de prepend la row sans GET
 * supplémentaire ; les détails enrichis (participants complets, tags,
 * preferences user-scoped) restent fetchables via `/conversations/:id`
 * et seront mergés au moment où le client en a besoin.
 */
export interface ConversationNewEventData {
  readonly conversationId: string;
  readonly conversationType: string;          // 'direct' | 'group' | 'public' | 'community' | 'global' | 'broadcast'
  readonly title: string | null;
  readonly creatorId: string;
  readonly participantIds: readonly string[]; // tous les participants y compris le créateur
  readonly createdAt: string;                 // ISO8601
}

/**
 * Données pour l'événement de statistiques de conversation
 */
export interface ConversationStatsEventData {
  readonly conversationId: string;
  readonly stats: ConversationStatsDTO;
}

/**
 * Données pour l'événement de mise à jour du compteur de messages non lus
 */
export interface ConversationUnreadUpdatedEventData {
  readonly conversationId: string;
  readonly unreadCount: number;
  /**
   * Le pont ✦ recalculé POUR CE destinataire (G-123). Le pont est PAR lecteur :
   * deux destinataires du même événement source (un `message:new`) ne portent
   * jamais le même `bridge`.
   *
   * TROIS ÉTATS, et c'est le cœur du contrat (cycle 63). Ce champ a longtemps
   * eu deux formes de fil pour exprimer trois faits, et le troisième —
   * « je n'ai pas calculé » — n'avait aucun mot. Les émetteurs qui ne
   * calculaient pas empruntaient donc le mot de « il n'y en a pas », et les
   * deux clients, qui recopient ce champ AUTORITAIREMENT, lisaient un ORDRE
   * D'EFFACEMENT là où le serveur ne voulait dire que son silence.
   *
   * | Fil | Sens | Le client doit |
   * |-----|------|----------------|
   * | objet | « voici le pont » | remplacer |
   * | `null` | « j'ai calculé : il n'y en a pas » | EFFACER |
   * | absent | « je n'ai pas calculé » | GARDER ce qu'il a |
   *
   * L'ABSENCE EST DÉSORMAIS INOFFENSIVE, et c'est délibéré : le défaut du
   * cycle 62 est né d'un émetteur qui se taisait sans savoir que son silence
   * détruisait. Un émetteur futur qui ignore tout du pont ne peut plus, par sa
   * seule omission, effacer celui d'un lecteur. L'effacement devient un ACTE
   * EXPLICITE (`bridge: null`), qu'on ne pose qu'en sachant ce qu'on dit.
   *
   * Compatibilité : `null` reproduit EXACTEMENT ce que faisaient les clients
   * déployés face à l'omission (ils effaçaient). Un client ancien reste donc
   * correct partout où l'effacement est voulu, et ne perd que le bénéfice du
   * troisième état.
   *
   * @see services/gateway/src/socketio/unreadBridgeField.ts — les quatre
   *      émetteurs et le fait que chacun déclare.
   */
  readonly bridge?: ConversationBridge | null;
}

/**
 * Émis par `DELETE /conversations/:id/delete-for-me` vers la room de
 * l'utilisateur, pour que ses autres appareils retirent la conversation
 * de leur liste (per-user soft delete). Consommé iOS par
 * `ConversationStore.applyConversationDeleted`.
 */
export interface ConversationDeletedEventData {
  readonly userId: string;
  readonly conversationId: string;
}

/**
 * Payload of `CONVERSATION_RESTORED`. Same shape, opposite direction — see
 * `ConversationDeletedEventData` above.
 */
export interface ConversationRestoredEventData {
  readonly userId: string;
  readonly conversationId: string;
}

export interface ConversationUpdatedEventData {
  readonly conversationId: string;
  readonly updatedBy: { readonly id: string };
  readonly updatedAt: string;
  /**
   * Identité du message que la ligne de liste doit décrire après cet
   * événement. Membre porteur du groupe d'aperçu : c'est LUI que les trois
   * clients lisent en premier, et les autres champs du groupe ne valent que
   * pour le message qu'il nomme.
   *
   * Tri-état, et les trois branches sont distinctes :
   * - **clé ABSENTE** — cet événement ne parle pas du dernier message (un
   *   renommage, un réglage). Ne rien toucher.
   * - **`null`** — « ce lecteur n'a plus AUCUN message visible ici » : il vient
   *   de masquer pour lui le dernier qui lui restait. Seul
   *   `emitConversationPreviewUpdate` produit cette forme.
   * - **plein** — la ligne décrit ce message. Il peut être celui qu'elle
   *   décrivait déjà (édition, traduction qui atterrit) ou un AUTRE (masquage
   *   personnel, suppression pour tous) ; seule l'identité les sépare.
   */
  readonly lastMessageId?: string | null;
  /**
   * Horodatage du message nommé par `lastMessageId` — le RANG de la
   * conversation dans la liste, donc ce que le tri des trois clients lit.
   *
   * **Chaîne ISO**, comme `updatedAt` son jumeau ci-dessus. Les trois
   * émetteurs passaient l'objet `Date` de Prisma : le fil ne montrait pas la
   * différence (l'encodeur par défaut de socket.io est `JSON.stringify`, qui
   * rend exactement `toISOString()`), mais c'était le seul horodatage du
   * payload dont le type était décidé par l'encodeur au lieu d'être énoncé —
   * et tout témoin en cours de route voyait donc une `Date` là où les clients
   * reçoivent une chaîne.
   */
  readonly lastMessageAt?: string | null;
  /**
   * Texte d'aperçu du message nommé, PLAFONNÉ (`truncateMessagePreview`).
   *
   * Vide n'est pas absent : un message position-seule a un `content` vide que
   * le client compose depuis `location`. Sort de `resolveLastMessagePreviewPrism`
   * avec la carte du Prisme, sous le même plafond qu'elle — la paire est
   * indissociable par construction, un appelant ne peut pas en émettre une
   * moitié plafonnée et l'autre non.
   */
  readonly lastMessagePreview?: string | null;
  /**
   * Auteur du message nommé par `lastMessageId`.
   *
   * **Deux espaces d'ids, et le contrat ne les distingue pas.** La colonne
   * `Message.senderId` est un `Participant.id`
   * (`sender Participant @relation("MessageSender")`), et c'est ce que servent
   * le chemin REST/ZMQ et `emitConversationPreviewUpdate`. Le chemin socket
   * (`message:send`) sert un `User.id` — les deux espaces ne se télescopent
   * jamais, si bien que rien ne rougit.
   *
   * Piège ARMÉ, pas panne : aucun client n'en tire de rendu aujourd'hui. Le web
   * l'écrit dans le `Message.senderId` de sa ligne neutre, que rien ne relit ;
   * iOS le décode et ne le mappe pas. Déclaré ici pour que le prochain client
   * qui voudra l'utiliser trouve l'avertissement AVANT de résoudre un nom avec.
   * L'unifier est un changement de SÉMANTIQUE sur le chemin le plus chaud du
   * service — son propre lot, pas celui-ci.
   */
  readonly senderId?: string | null;
  /**
   * Prisme Linguistique de la ligne de liste, résolu POUR CE destinataire —
   * jumeaux des champs que `GET /conversations` pose déjà sur la conversation.
   *
   * Les trois champs d'aperçu (`lastMessagePreview` + ces deux-ci) s'appliquent
   * EN GROUPE : le client préfère la traduction à l'aperçu brut, donc poser l'un
   * sans les autres laisse la ligne rendre l'ANCIEN texte traduit après une
   * édition. `null` est une VALEUR, pas une absence — une édition remet
   * `Message.translations` à null dans la même écriture tout en gardant le même
   * `lastMessageId`, et c'est ce `null` reçu qui périme la carte du client.
   * Seul le serveur sait que la carte a été périmée ; le client ne peut pas le
   * déduire.
   */
  readonly lastMessageTranslations?: Readonly<Record<string, string>> | null;
  readonly lastMessageOriginalLanguage?: string | null;
  /**
   * Lieu partagé du dernier message, hissé depuis `metadata.location` — membre
   * du MÊME groupe d'aperçu que les trois champs ci-dessus, et soumis à la même
   * règle de groupe.
   *
   * Déclaré ici parce qu'il ne l'était nulle part : l'index signature de fin le
   * laissait voyager sans contrat, si bien que la parité entre les TROIS
   * émetteurs de ce groupe (`MessageHandler`, `MeeshySocketIOManager`,
   * `emitConversationPreviewUpdate`) ne reposait que sur la lecture du code
   * voisin. Elle a échoué exactement comme ça : le chemin REST/ZMQ l'a omis
   * pendant que les deux autres le portaient (corrigé par #3122, sans que rien
   * n'empêche la prochaine récidive — c'est ce que cette déclaration ajoute).
   *
   * **Clé ABSENTE = « ce message n'a pas de lieu »**, et non « je n'en parle
   * pas » : les clients écrivent l'épingle AVEC l'identité du message, si bien
   * que son absence efface celle du message précédent quand un texte le
   * remplace. Corollaire opposable à tout nouvel émetteur : **qui porte
   * `lastMessageId` porte le lieu du message qu'il nomme, ou aucun.**
   *
   * Forme non typée, même convention que `MessageRequest.location` : la
   * validation stricte (bornes des coordonnées, longueur des chaînes) vit dans
   * `services/gateway/src/services/location/sharedPlace.ts`, et la dupliquer
   * ici la ferait diverger.
   */
  readonly location?: unknown;
  /**
   * `true` quand le serveur a RECALCULÉ l'aperçu depuis l'état courant de la
   * base, par opposition à une poussée de message (`bump-to-top`) qui ne fait
   * que porter le message qu'on vient d'écrire.
   *
   * Ce que le champ existe pour dire : **cet aperçu peut légitimement RECULER
   * dans le temps.** Supprimer le dernier message pour tous fait redescendre la
   * ligne sur le message PRÉCÉDENT, donc plus ancien ; un lecteur qui masque
   * son propre dernier message visible se voit servir un remplaçant plus ancien
   * par construction. Les clients tiennent une garde monotone sur le groupe
   * d'aperçu — un `lastMessageAt` plus ancien y désigne un message périmé, et
   * tout le groupe est jeté — parce qu'ils ne peuvent pas distinguer, du seul
   * contenu, une diffusion arrivée dans le désordre d'un recalcul autoritatif :
   * les deux reculent, les deux nomment un autre message. Seul l'émetteur le
   * sait, et c'est ce qu'il déclare ici.
   *
   * Posé par `emitConversationPreviewUpdate` (édition, suppression pour tous,
   * traduction qui atterrit, masquage personnel) et par LUI SEUL. Les émetteurs
   * message-driven (`MessageHandler`, `MeeshySocketIOManager`) l'omettent
   * délibérément : ce sont eux que la garde monotone protège.
   *
   * Optionnel et absent par défaut — un client qui ne le lit pas garde
   * exactement le comportement d'avant.
   */
  readonly previewRecalculated?: boolean;
  /**
   * Groupe MÉTADONNÉES — l'autre moitié de l'événement, et la seule que
   * `PUT /conversations/:id` émet (`routes/conversations/core.ts`).
   *
   * Ces huit champs voyagent depuis toujours et les trois clients les lisent
   * (iOS les décode tous sur `ConversationUpdatedEvent`) ; aucun n'était
   * déclaré. Ils passaient par la signature d'index, en compagnie des quatre
   * champs porteurs du groupe d'aperçu ci-dessus.
   *
   * Ils sont posés UN PAR UN, seulement quand la requête les a changés : une
   * clé absente veut dire « ce réglage n'a pas bougé », jamais « remets-le à
   * zéro ». C'est la même règle de tri-état que le groupe d'aperçu, et c'est
   * pourquoi aucun d'eux n'est requis.
   *
   * Le payload de ce chemin ne porte AUCUNE clé `lastMessage*`, délibérément :
   * un `lastMessageTranslations: null` posé par un renommage effacerait une
   * traduction parfaitement valide sur toutes les lignes de liste.
   */
  readonly title?: string;
  readonly description?: string;
  readonly avatar?: string | null;
  readonly banner?: string | null;
  readonly defaultWriteRole?: string;
  readonly isAnnouncementChannel?: boolean;
  readonly slowModeSeconds?: number;
  readonly autoTranslateEnabled?: boolean;
  /*
   * PAS de `readonly [key: string]: unknown` ici, et la raison mérite d'être
   * écrite parce qu'elle n'est PAS celle qu'on croit.
   *
   * La signature d'index vivait ici pour laisser passer les douze champs
   * ci-dessus, qu'aucune ligne ne déclarait. La retirer ne fait tomber AUCUNE
   * compilation — mesuré, 0 erreur sur `packages/shared` + `services/gateway` —
   * parce que les quatre émetteurs composent tous leur charge dans une variable
   * avant de la répandre dans l'appel à `emit`, et qu'une clé venue d'un spread
   * est invisible au contrôle des propriétés excédentaires de TypeScript.
   *
   * Elle ne supprimait donc qu'un contrôle que le spread supprimait déjà. Ce
   * qui SURVIT au spread — un champ requis absent, un champ de type faux — ne
   * porte que sur les champs DÉCLARÉS : c'est la déclaration qui fait le
   * travail, pas la fermeture de la carte. Le cliquet qui garde le reste est un
   * balayage
   * (`services/gateway/src/socketio/__tests__/conversation-updated-declared-fields.ts`),
   * et il n'a de sens que tant que cette signature reste absente — avec elle,
   * tout serait déclaré d'avance et il ne pourrait plus tomber.
   */
}

export interface ConversationClosedEventData {
  readonly conversationId: string;
  readonly closedBy: string;
  readonly closedAt: string;
}

/**
 * Données pour rejoindre/quitter une conversation
 */
export interface ConversationActionData {
  readonly conversationId: string;
}

// ===== TYPES POUR LES STATISTIQUES DE CONVERSATION =====

export interface ConversationOnlineUser {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface ConversationStatsDTO {
  readonly messagesPerLanguage: Record<string, number>;
  readonly participantCount: number;
  readonly participantsPerLanguage: Record<string, number>;
  readonly onlineUsers: readonly ConversationOnlineUser[];
  readonly updatedAt: Date;
}
