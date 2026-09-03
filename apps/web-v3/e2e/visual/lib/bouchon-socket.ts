import type { Server as ServeurHttp } from 'node:http';

import { Server, type Socket } from 'socket.io';

import { BATTEMENT } from './lifecycle';

/** `MESSAGE_LIMITS.MAX_MESSAGE_LENGTH` (`config/message-limits.ts:13`) — la même borne que la route, déclarée avec elle dans `bouchon-fil.ts`. */
const LONGUEUR_MAX_DU_CONTENU = 4000;

/**
 * LE BOUCHON SOCKET — un serveur socket.io monté sur le MÊME serveur HTTP que la
 * passerelle de bouchon, qui MIME la passerelle réelle : mêmes chemins, mêmes
 * noms d'événements (`packages/shared/types/socketio-events/event-names.ts`),
 * mêmes charges, PRISES DANS LE CODE du gateway. Un vert obtenu contre un
 * bouchon qui ne ressemble pas au serveur ne prouve rien — chaque copie nomme
 * ici l'émetteur qu'elle imite.
 *
 *   • AUTHENTIFICATION au handshake, ASYNCHRONE — `MeeshySocketIOManager.ts:
 *     1740` lance `handleTokenAuthentication(socket)` sans l'attendre, et
 *     l'identité n'est connue qu'après ses lectures en base. Un bouchon qui
 *     authentifiait dans le tour de `connection` ne jouait jamais la course
 *     que la production joue à chaque ouverture : `conversation:join` émis
 *     dès `connect` y trouve `connectedUsers` vide et reçoit
 *     `conversation:join-error { reason: 'not_authenticated' }`
 *     (`ConversationHandler.ts:129-134`). `AuthHandler.handleTokenAuthentication`
 *     (`services/gateway/src/socketio/handlers/AuthHandler.ts:103-139`) :
 *     `auth.token` = jeton du membre (`extractJWTToken`, `socket-helpers.ts:
 *     55-64`, `Bearer ` toléré), `auth.sessionToken` = session de l'invité
 *     (`extractSessionToken`, `:69-72`) ; un invité dont la place n'est plus
 *     ACTIVE reçoit `error` puis est déconnecté (`_authenticateAnonymousUser`,
 *     `:320-334`) ; un jeton expiré reçoit `auth:token-expired` `{ code:
 *     'token_expired', message }` (`:131`) ; le succès émet `authenticated`
 *     `{ success, user: { id, language, isAnonymous }, version }` (`:283-287`)
 *     puis `presence:snapshot` `{ users }` (`MeeshySocketIOManager.ts:1382`) ;
 *   • `conversation:join` `{ conversationId }` — `ConversationHandler.
 *     handleConversationJoin` (`:99-289`) : `conversation:joined`
 *     `{ conversationId, userId }` (`:245`) puis `conversation:unread-updated`
 *     `{ conversationId, unreadCount, bridge }` (`:262`) ; `conversation:leave`
 *     ⇒ `conversation:left` (`:407`) ;
 *   • `message:send` — `MessageHandler.handleMessageSend` (`:269`) : l'accusé
 *     `{ success: true, data: { messageId } }`, puis `message:new` sur la room,
 *     avec la charge de `buildMessageNewPayload` (`messageNewPayload.ts:
 *     126-176`) — `clientMessageId` à l'expéditeur seul (`stripClientMessageId`,
 *     `MessageHandler.ts:1428-1432`) ; un envoi par la ROUTE passe par
 *     `diffuseLeMessage`, qui adresse la charge avec l'identité client à la
 *     room du COMPTE de l'expéditeur et la charge nue au reste — et la charge
 *     nue à TOUS quand l'expéditeur est anonyme, qui n'a pas de room de compte
 *     (`MeeshySocketIOManager.ts:3042-3056`) ;
 *   • `reaction:add` / `reaction:remove` `{ messageId, emoji }` —
 *     `ReactionHandler.ts` : l'accusé `{ success: true, data: reaction }` /
 *     `{ success: true }` (`AckResponseOf`), puis `reaction:added` /
 *     `reaction:removed` sur la room avec un `ReactionUpdateEvent`
 *     (`packages/shared/types/reaction.ts:76-98`) — `userId` de l'acteur,
 *     `action: 'add' | 'remove'`, l'agrégat ABSOLU ; un `add` déjà là et un
 *     `remove` déjà absent accusent sans diffuser (`:138-143`, `:270-278`) ;
 *   • `typing:start` / `typing:stop` — `StatusHandler` (`:276-292`, `:380-404`) :
 *     `{ userId, username, displayName, conversationId, isTyping }` aux AUTRES
 *     sockets de la room (`socket.to(room)`) ;
 *   • `participant:rights-updated` — `participants-writes.ts:383-425`, quand
 *     un hôte change les droits d'un invité (`porteDeLHote`, `bouchon-fil.ts`) :
 *     la charge RÉDUITE (`disclosableEntryRights`, sans `canViewHistory`) à la
 *     room de conversation, la charge COMPLÈTE (`historyVisibleFrom` compris)
 *     à la room personnelle `user:<Participant.id>`, que le socket anonyme a
 *     rejointe à l'authentification (`AuthHandler.ts:381`) ;
 *   • la PRÉSENCE — `presence:snapshot` `{ users: [{ userId, username,
 *     isOnline, lastActiveAt }] }` au socket fraîchement authentifié
 *     (`MeeshySocketIOManager.ts:1435`, filtré par `_applyPresenceVisibility`),
 *     puis `user:status` `{ userId, username, isOnline, lastActiveAt }` à
 *     chaque transition (`:2869`), aux rooms PERSONNELLES des amis acceptés et
 *     des administrateurs (`presence-audience.ts`, directive 2026-08-25) —
 *     jamais à une room de conversation. Le bouchon tient UN état de présence
 *     (`presences`), que la fiche de conversation, l'instantané et les
 *     transitions projettent tous trois ; le MEMBRE y est l'ami accepté des
 *     deux pairs — la seule raison pour laquelle sa room reçoit quelque
 *     chose —, et l'invité, sans amitié, ne reçoit rien ;
 *   • et une porte de TEST, `emets`, par laquelle un spec fait parler « un
 *     autre participant » — `message:new`, `message:translation`
 *     (`buildTranslationEvent.ts:70-97`), `message:edited`, `message:deleted`,
 *     `reaction:added` (`ReactionUpdateEvent`), `read-status:updated` — sur la
 *     room de la conversation, exactement comme `io.to(room).emit` le fait.
 */

export const JETON_DU_MEMBRE = 'JWT.sonde';
export const JETON_EXPIRE = 'JWT.expire';
export const SESSION_DE_L_INVITE = 'session-tolu';
export const PARTICIPANT_DE_L_INVITE = 'p-tolu';
export const UTILISATEUR_DU_MEMBRE = 'u1';
export const PARTICIPANT_DU_MEMBRE = 'p-amina';

/**
 * Le délai de l'authentification — le temps que `AuthHandler` passe en base
 * avant d'émettre `authenticated`. Un réglage de HARNAIS : sa valeur n'imite
 * aucun chiffre du serveur, elle garantit seulement que la course existe.
 */
export const DELAI_D_AUTHENTIFICATION_MS = 40;

/**
 * LE PING DU BOUCHON EST UN RÉGLAGE DE HARNAIS, PAS UNE COPIE DE LA PASSERELLE
 * (`pingInterval: 25000, pingTimeout: 20000`, `MeeshySocketIOManager.ts:394-395`)
 * — et c'est l'horloge VIRTUELLE des specs qui l'impose.
 *
 * Le client compte `pingInterval + pingTimeout` de temps de PAGE entre deux
 * pings reçus, puis ferme son transport (« ping timeout »). Or `page.clock`
 * fait avancer ce temps-là de dix minutes en quelques millisecondes réelles,
 * sans qu'un seul ping réel n'ait pu arriver : avec 1 s + 2 s, le client
 * lâchait un transport VIVANT à la troisième seconde virtuelle, puis se
 * reconnectait sous la même horloge — son `timeout: 20000` de connexion
 * (virtuel) abattait chaque poignée de main RÉELLE avant qu'elle n'aboutisse
 * (« WebSocket is closed before the connection is established », 8 à 15 fois
 * dans la console), le backoff montait à 30 s virtuels, et l'horloge se
 * figeait avec cette minuterie pendante : l'onglet restait « creux » pour
 * toujours (cas E), et le battement du cas F partait dans cette tempête sans
 * jamais être répondu. Mesuré : cas E rouge une fois sur trois (#4836), cas F
 * rouge trois fois sur trois dans le projet `pages`.
 *
 * D'où la forme : le serveur PINGUE en temps réel toutes les secondes — entre
 * deux gestes du spec, le client tient donc toujours un ping frais —, et il
 * TOLÈRE deux fenêtres de recette (2 × 10 min) de temps de page sans pong :
 * aucune avance virtuelle d'un spec ne dépasse cette tolérance, le transport
 * survit à l'avance, et il n'y a plus rien à reconnecter. Un socket réellement
 * mort se ferme, lui, par le transport (close du navigateur à la fermeture de
 * l'onglet ou du contexte) : `connectes()` n'a pas besoin de ce délai pour
 * dire vrai (cas H).
 */
export const PING_DU_BOUCHON = {
  intervalleMs: 1_000,
  toleranceMs: 2 * BATTEMENT.fenetreDeRecetteMs,
} as const;

export type Identite =
  | { readonly genre: 'membre'; readonly id: string }
  | { readonly genre: 'invite'; readonly id: string };

/** Le `Participant.id` d'une identité — ce que `ReactionUpdateEvent.participantId` et `senderId` d'un anonyme portent. */
export const participantDe = (identite: Identite): string =>
  identite.genre === 'invite' ? identite.id : PARTICIPANT_DU_MEMBRE;

export type Emission = { readonly evenement: string; readonly charge: unknown; readonly a: number };

/**
 * LE MAGASIN DES RÉACTIONS, partagé par le socket et par la route : l'état
 * ABSOLU par message et par emoji, tel que `reactionService.createUpdateEvent`
 * l'agrège pour la diffusion.
 */
export type MagasinDeReactions = {
  /** `false` quand le participant avait déjà cet emoji (`unchanged`). */
  readonly ajoute: (messageId: string, emoji: string, participantId: string) => boolean;
  /** `false` quand la réaction était déjà absente. */
  readonly retire: (messageId: string, emoji: string, participantId: string) => boolean;
  readonly agregat: (messageId: string, emoji: string) => { readonly emoji: string; readonly count: number; readonly participantIds: readonly string[] };
  /** Ce que la liste sert : `reactionSummary` (`messages-list-query.ts`). */
  readonly resume: (messageId: string) => Readonly<Record<string, number>>;
};

export const magasinDeReactions = (initial: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {}): MagasinDeReactions => {
  const parMessage = new Map<string, Map<string, Set<string>>>(
    Object.entries(initial).map(([messageId, parEmoji]) => [
      messageId,
      new Map(Object.entries(parEmoji).map(([emoji, participants]) => [emoji, new Set(participants)])),
    ]),
  );
  const participants = (messageId: string, emoji: string): Set<string> => {
    const parEmoji = parMessage.get(messageId) ?? new Map<string, Set<string>>();
    parMessage.set(messageId, parEmoji);
    const ensemble = parEmoji.get(emoji) ?? new Set<string>();
    parEmoji.set(emoji, ensemble);
    return ensemble;
  };
  return {
    ajoute: (messageId, emoji, participantId) => {
      const ensemble = participants(messageId, emoji);
      if (ensemble.has(participantId)) return false;
      ensemble.add(participantId);
      return true;
    },
    retire: (messageId, emoji, participantId) => participants(messageId, emoji).delete(participantId),
    agregat: (messageId, emoji) => {
      const ensemble = participants(messageId, emoji);
      return { emoji, count: ensemble.size, participantIds: [...ensemble] };
    },
    resume: (messageId) =>
      Object.fromEntries(
        [...(parMessage.get(messageId) ?? new Map<string, Set<string>>()).entries()]
          .filter(([, ensemble]) => ensemble.size > 0)
          .map(([emoji, ensemble]) => [emoji, ensemble.size]),
      ),
  };
};

/** `ReactionUpdateEvent` (`packages/shared/types/reaction.ts:76-98`), tel que `createUpdateEvent` le compose. */
export const evenementDeReaction = ({
  magasin,
  messageId,
  conversationId,
  emoji,
  action,
  acteur,
}: {
  readonly magasin: MagasinDeReactions;
  readonly messageId: string;
  readonly conversationId: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly acteur: Identite;
}) => ({
  messageId,
  conversationId,
  participantId: participantDe(acteur),
  ...(acteur.genre === 'membre' ? { userId: acteur.id } : {}),
  emoji,
  action,
  aggregation: magasin.agregat(messageId, emoji),
  timestamp: new Date().toISOString(),
});

export type BouchonSocket = {
  readonly io: Server;
  /**
   * CE QU'UN MESSAGE DOIT À LA LIGNE DE LISTE de chaque destinataire —
   * `conversation:updated` (le rang et l'aperçu DÉJÀ descendu au prisme du
   * lecteur : `MeeshySocketIOManager.ts:3216`, `MessageHandler.ts:1691`) puis
   * `conversation:unread-updated` (la pastille :
   * `emitUnreadCountsToRecipients.ts`). Les deux partent vers la room
   * PERSONNELLE du lecteur, jamais vers celle de la conversation — et c'est
   * l'ordre RÉEL : l'aperçu d'abord, le compte ensuite.
   */
  readonly diffuseLaLigne: (params: {
    readonly conversationId: string;
    readonly pour: string;
    readonly lastMessageAt: string;
    readonly lastMessagePreview: string;
    readonly lastMessageOriginalLanguage?: string | null;
    readonly lastMessageTranslations?: Readonly<Record<string, string>> | null;
    readonly unreadCount?: number;
  }) => void;
  /** Ce que les clients ont ÉMIS, dans l'ordre — l'équivalent du journal HTTP. */
  readonly recus: readonly Emission[];
  /** Faire parler la room de la conversation, comme `io.to(room).emit`. */
  readonly emets: (conversationId: string, evenement: string, charge: unknown) => void;
  /** `message:new` d'un envoi par la ROUTE — l'identité client à l'expéditeur inscrit, la charge nue aux autres. */
  readonly diffuseLeMessage: (conversationId: string, message: Record<string, unknown>, expediteur: Identite) => void;
  /** `reaction:added` / `reaction:removed` d'un geste par la ROUTE. */
  readonly diffuseLaReaction: (conversationId: string, action: 'add' | 'remove', evenement: ReturnType<typeof evenementDeReaction>) => void;
  /**
   * `participant:rights-updated` d'un `PATCH …/participants/:id/rights`
   * (`participants-writes.ts:383-425`) : la charge RÉDUITE — sans
   * `canViewHistory` ni `historyVisibleFrom` (#4009, #3898) — à la room de
   * conversation, la charge COMPLÈTE à la room personnelle de l'intéressé
   * (`user:<Participant.id>` pour un invité). Deux charges, un ordre qui ne se
   * suppose pas : la réduite part en premier, comme là-bas.
   */
  readonly diffuseLesDroits: (changement: ChangementDeDroits) => void;
  /**
   * Une transition de présence — `user:status` (`MeeshySocketIOManager.ts:2869`)
   * aux rooms personnelles de l'AUDIENCE (`presence-audience.ts` : les amis
   * acceptés du sujet, ici le membre), jamais à la room de conversation. L'état
   * partagé (`presences`) est écrit d'abord : la fiche et l'instantané suivants
   * disent la même chose.
   */
  readonly diffuseLaPresence: (userId: string, isOnline: boolean) => void;
  /** Le nombre de sockets vivants — un onglet fermé doit en retirer un. */
  readonly connectes: () => number;
  /**
   * Les `conversation:join` arrivés AVANT l'authentification — ceux que la
   * passerelle refuse par `not_authenticated` (`ConversationHandler.ts:129-134`).
   * Un module qui rejoint sur `connect` en produit un à chaque ouverture ; un
   * module qui rejoint sur `authenticated` n'en produit jamais.
   */
  readonly jonctionsRefusees: () => number;
  /**
   * LA PASSERELLE DEVIENT INJOIGNABLE — les sockets vivants tombent, et les
   * poignées de main suivantes sont refusées jusqu'à `retablis()`.
   *
   * Ce n'est PAS `contexte.setOffline` : le réseau du navigateur reste debout,
   * donc aucun `online` ni aucun `visibilitychange` ne vient sauver la page.
   * C'est la coupure du § 7 (« socket tombée 30 s – 5 min ») telle qu'une 3G
   * rurale la produit, l'onglet resté À L'ÉCRAN — le seul cas où le retour de
   * visibilité, seul déclencheur de rattrapage de la liste jusqu'ici, ne vient
   * jamais.
   */
  readonly coupe: () => void;
  readonly retablis: () => void;
  readonly ferme: () => Promise<void>;
};

const room = (conversationId: string): string => `conversation:${conversationId}`;

/** `ROOMS.user(id)` — le `User.id` d'un inscrit, le `Participant.id` d'un visiteur sans compte (`AuthHandler.ts:381`). */
const roomPersonnelle = (id: string): string => `user:${id}`;

/** Ce qu'un `PATCH …/participants/:id/rights` produit — l'état RÉSOLU après l'écriture, jamais le delta. */
export type ChangementDeDroits = {
  readonly conversationId: string;
  readonly participantId: string;
  readonly updatedBy: string;
  readonly rights: Readonly<Record<string, boolean>> & { readonly canViewHistory: boolean };
};

const chaine = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null);

/** Un message tel que `buildMessageNewPayload` le compose (`messageNewPayload.ts:126-176`), servi par le bouchon. */
export const chargeDeMessage = ({
  id,
  conversationId,
  senderId,
  content,
  originalLanguage = 'fr',
  clientMessageId,
  sender,
  translations = [],
  attachments = [],
  createdAt = new Date().toISOString(),
}: {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly originalLanguage?: string;
  readonly clientMessageId?: string;
  readonly sender: { readonly id: string; readonly displayName: string; readonly type?: 'user' | 'anonymous'; readonly userId?: string };
  readonly translations?: readonly { readonly language: string; readonly content: string }[];
  readonly attachments?: readonly Record<string, unknown>[];
  readonly createdAt?: string;
}) => ({
  id,
  conversationId,
  senderId,
  content,
  originalLanguage,
  messageType: attachments.length === 0 ? 'text' : 'file',
  ...(clientMessageId === undefined ? {} : { clientMessageId }),
  isBlurred: false,
  isViewOnce: false,
  effectFlags: 0,
  isEdited: false,
  createdAt,
  updatedAt: createdAt,
  validatedMentions: [],
  translations,
  sender: { type: 'user', ...sender },
  attachments,
});

/**
 * Ce que les PAIRS reçoivent : la charge sans `clientMessageId` — la passerelle
 * ne le rend qu'à l'expéditeur (`MessageHandler.ts:1428-1432`, `stripClientMessageId`).
 */
export const pourLesPairs = (message: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(message).filter(([cle]) => cle !== 'clientMessageId'));

export const bouchonSocket = ({
  serveur,
  placesActives,
  identifiants,
  reactions,
  presences,
  conversationsDuMembre,
}: {
  readonly serveur: ServeurHttp;
  /** Les sessions invitées dont la place est ACTIVE — retirer une clé, c'est `isActive:false`. */
  readonly placesActives: Set<string>;
  /** Le prochain identifiant de message, partagé avec la passerelle HTTP. */
  readonly identifiants: { suivant: () => string };
  /** Les réactions, partagées avec la passerelle HTTP. */
  readonly reactions: MagasinDeReactions;
  /** La présence des pairs — `connectedUsers` —, partagée avec la fiche de conversation que la passerelle HTTP sert. */
  readonly presences: Map<string, boolean>;
  /**
   * LES CONVERSATIONS DU LECTEUR, rejointes À L'AUTHENTIFICATION — comme
   * `AuthHandler._joinUserConversations` (`:724-741`) le fait pour de vrai.
   *
   * Ce n'est pas une commodité : c'est ce qui rend la LISTE (`/chats`) capable
   * d'entendre `typing:start`, poussé à la room de CONVERSATION
   * (`StatusHandler.ts:292`) et à elle seule. Un bouchon qui ne joignait que
   * sur un `conversation:join` explicite aurait rendu vert un module qui, en
   * production, n'aurait jamais vu une frappe — ou rouge un module correct qui
   * refuse d'émettre une jonction dont la passerelle n'a pas besoin.
   */
  readonly conversationsDuMembre: readonly string[];
}): BouchonSocket => {
  // La coupure est refusée AU HANDSHAKE, pas dans un `io.use` : une erreur de
  // middleware fait renoncer le client (« connexion refusée »), là qu'un refus
  // de TRANSPORT le fait réessayer avec son backoff — ce que fait un serveur
  // injoignable, et ce que le module doit traverser.
  let joignable = true;
  const io = new Server(serveur, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    cors: { origin: true, credentials: true },
    allowRequest: (_requete, accepte) => accepte(joignable ? null : 'coupé', joignable),
    // Voir `PING_DU_BOUCHON` : un réglage de HARNAIS dicté par l'horloge virtuelle.
    pingInterval: PING_DU_BOUCHON.intervalleMs,
    pingTimeout: PING_DU_BOUCHON.toleranceMs,
  });
  const recus: Emission[] = [];
  const identites = new Map<string, Identite>();
  let jonctionsRefusees = 0;

  const identiteDe = (socket: Socket): Identite | null => {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const brut = chaine(auth.token) ?? chaine(auth.authToken) ?? chaine(socket.handshake.headers.authorization);
    const jeton = brut !== null && brut.startsWith('Bearer ') ? brut.slice(7) : brut;
    const session = chaine(auth.sessionToken) ?? chaine(socket.handshake.headers['x-session-token']);

    if (session !== null && jeton === null) {
      return placesActives.has(session) ? { genre: 'invite', id: PARTICIPANT_DE_L_INVITE } : null;
    }
    if (jeton === JETON_DU_MEMBRE) return { genre: 'membre', id: UTILISATEUR_DU_MEMBRE };
    return null;
  };

  const socketsDuCompte = (userId: string): readonly Socket[] =>
    [...io.sockets.sockets.values()].filter((s) => {
      const identite = identites.get(s.id);
      return identite?.genre === 'membre' && identite.id === userId;
    });

  const diffuseLeMessage = (conversationId: string, message: Record<string, unknown>, expediteur: Identite): void => {
    if (expediteur.genre === 'invite') {
      io.to(room(conversationId)).emit('message:new', pourLesPairs(message));
      return;
    }
    const siens = socketsDuCompte(expediteur.id);
    io.to(room(conversationId))
      .except(siens.map((s) => s.id))
      .emit('message:new', pourLesPairs(message));
    siens.forEach((s) => s.emit('message:new', message));
  };

  const diffuseLaReaction = (conversationId: string, action: 'add' | 'remove', evenement: ReturnType<typeof evenementDeReaction>): void => {
    io.to(room(conversationId)).emit(action === 'add' ? 'reaction:added' : 'reaction:removed', evenement);
  };

  // `participants-writes.ts:383-425`, dans son ORDRE : la charge réduite à la
  // room de conversation — `disclosableEntryRights(rights, false)` retire
  // `canViewHistory`, et `historyVisibleFrom` n'y voyage pas — puis la charge
  // complète sur la room personnelle de l'intéressé (`ROOMS.user(target.id)`).
  const diffuseLesDroits = ({ conversationId, participantId, updatedBy, rights }: ChangementDeDroits): void => {
    const divulgables = Object.fromEntries(Object.entries(rights).filter(([nom]) => nom !== 'canViewHistory'));
    io.to(room(conversationId)).emit('participant:rights-updated', { conversationId, participantId, updatedBy, rights: divulgables });
    io.to(roomPersonnelle(participantId)).emit('participant:rights-updated', { conversationId, participantId, updatedBy, rights, historyVisibleFrom: null });
  };

  /** `_applyPresenceVisibility` : un membre voit ses amis (ici, tous les pairs) ; un invité, sans amitié, ne voit personne. */
  const instantaneDePresence = (identite: Identite): readonly Record<string, unknown>[] =>
    identite.genre === 'invite'
      ? []
      : [...presences].map(([userId, isOnline]) => ({ userId, username: userId, isOnline, lastActiveAt: null }));

  /**
   * Les deux émissions que la LIGNE DE LISTE reçoit. La charge de
   * `conversation:updated` est celle des trois émetteurs réels, champ pour
   * champ : `conversationId`, `updatedBy`, `lastMessageAt`, `lastMessageId`,
   * `senderId`, `updatedAt`, plus la paire du Prisme que
   * `resolveLastMessagePreviewPrism` y répand.
   */
  const diffuseLaLigne: BouchonSocket['diffuseLaLigne'] = ({
    conversationId,
    pour,
    lastMessageAt,
    lastMessagePreview,
    lastMessageOriginalLanguage = null,
    lastMessageTranslations = null,
    unreadCount,
  }) => {
    io.to(roomPersonnelle(pour)).emit('conversation:updated', {
      conversationId,
      updatedBy: { id: 'u9' },
      lastMessageAt,
      lastMessageId: identifiants.suivant(),
      senderId: 'p-autre',
      updatedAt: new Date().toISOString(),
      lastMessagePreview,
      lastMessageOriginalLanguage,
      lastMessageTranslations,
    });
    if (unreadCount === undefined) return;
    io.to(roomPersonnelle(pour)).emit('conversation:unread-updated', { conversationId, unreadCount, bridge: null });
  };

  const diffuseLaPresence = (userId: string, isOnline: boolean): void => {
    presences.set(userId, isOnline);
    io.to(roomPersonnelle(UTILISATEUR_DU_MEMBRE)).emit('user:status', { userId, username: userId, isOnline, lastActiveAt: null });
  };

  io.on('connection', (socket) => {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;

    // L'authentification est EN COURS pendant `DELAI_D_AUTHENTIFICATION_MS` :
    // ce que la passerelle fait pendant ses lectures en base.
    setTimeout(() => {
      if (socket.disconnected) return;
      if (chaine(auth.token) === JETON_EXPIRE) {
        socket.emit('auth:token-expired', { code: 'token_expired', message: 'JWT token has expired' });
        socket.disconnect(true);
        return;
      }
      const identite = identiteDe(socket);
      if (identite === null) {
        socket.emit('error', { message: 'Anonymous session not found' });
        socket.disconnect(true);
        return;
      }
      identites.set(socket.id, identite);
      // La room PERSONNELLE, rejointe avant l'inscription — `AuthHandler.ts:381` pour un invité
      // (`ROOMS.user(participant.id)`), le chemin inscrit pour un membre (`ROOMS.user(user.id)`).
      void socket.join(roomPersonnelle(identite.id));
      // `_joinUserConversations` — toutes les conversations du lecteur, avant
      // l'inscription. Un invité n'en a qu'une, et c'est sa place qui la nomme.
      conversationsDuMembre.forEach((conversationId) => void socket.join(room(conversationId)));
      socket.emit('authenticated', {
        success: true,
        user: { id: identite.id, language: 'fr', isAnonymous: identite.genre === 'invite' },
        version: 'bouchon',
      });
      socket.emit('presence:snapshot', { users: instantaneDePresence(identite) });
    }, DELAI_D_AUTHENTIFICATION_MS);

    const identite = (): Identite | null => identites.get(socket.id) ?? null;

    socket.on('conversation:join', (charge: unknown) => {
      const conversationId = chaine((charge as Record<string, unknown> | null)?.conversationId);
      recus.push({ evenement: 'conversation:join', charge, a: Date.now() });
      if (conversationId === null) {
        socket.emit('conversation:join-error', { conversationId: '', reason: 'invalid_payload', message: 'invalide' });
        return;
      }
      const qui = identite();
      if (qui === null) {
        jonctionsRefusees += 1;
        socket.emit('conversation:join-error', { conversationId, reason: 'not_authenticated', message: 'Non authentifié' });
        return;
      }
      void socket.join(room(conversationId));
      socket.emit('conversation:joined', { conversationId, userId: qui.id });
      socket.emit('conversation:unread-updated', { conversationId, unreadCount: 0, bridge: null });
    });

    socket.on('conversation:leave', (charge: unknown) => {
      const conversationId = chaine((charge as Record<string, unknown> | null)?.conversationId);
      recus.push({ evenement: 'conversation:leave', charge, a: Date.now() });
      const qui = identite();
      if (conversationId === null || qui === null) return;
      void socket.leave(room(conversationId));
      socket.emit('conversation:left', { conversationId, userId: qui.id });
    });

    socket.on('message:send', (charge: unknown, accuse?: (reponse: unknown) => void) => {
      recus.push({ evenement: 'message:send', charge, a: Date.now() });
      const brut = (charge ?? {}) as Record<string, unknown>;
      const conversationId = chaine(brut.conversationId);
      const content = chaine(brut.content);
      const qui = identite();
      if (qui === null) {
        accuse?.({ success: false, error: 'User not authenticated' });
        return;
      }
      if (conversationId === null || content === null) {
        accuse?.({ success: false, error: 'Validation error' });
        return;
      }
      // `validateMessageLength` (`config/message-limits.ts:32-42`), appelé par
      // `handleMessageSend` (`MessageHandler.ts:362-370`) : au-delà du plafond,
      // `_sendError` accuse `{ success: false, error }` avec la phrase du serveur
      // et émet `error { message }` (`:2272-2284`).
      if (content.length > LONGUEUR_MAX_DU_CONTENU) {
        const message = `Le message ne peut pas dépasser ${LONGUEUR_MAX_DU_CONTENU} caractères (${content.length} caractères fournis)`;
        accuse?.({ success: false, error: message });
        socket.emit('error', { message });
        return;
      }
      const id = identifiants.suivant();
      accuse?.({ success: true, data: { messageId: id } });
      const message = chargeDeMessage({
        id,
        conversationId,
        senderId: qui.id,
        content,
        originalLanguage: chaine(brut.originalLanguage) ?? 'fr',
        clientMessageId: chaine(brut.clientMessageId) ?? undefined,
        sender: {
          id: participantDe(qui),
          displayName: qui.genre === 'invite' ? 'Tolu' : 'Amina Diallo',
          type: qui.genre === 'invite' ? 'anonymous' : 'user',
          ...(qui.genre === 'membre' ? { userId: qui.id } : {}),
        },
      });
      // Les pairs reçoivent la charge SANS `clientMessageId` ; l'expéditeur, avec.
      socket.to(room(conversationId)).emit('message:new', pourLesPairs(message));
      socket.emit('message:new', message);
    });

    (['reaction:add', 'reaction:remove'] as const).forEach((evenement) => {
      socket.on(evenement, (charge: unknown, accuse?: (reponse: unknown) => void) => {
        recus.push({ evenement, charge, a: Date.now() });
        const brut = (charge ?? {}) as Record<string, unknown>;
        const messageId = chaine(brut.messageId);
        const emoji = chaine(brut.emoji);
        const qui = identite();
        if (qui === null) {
          accuse?.({ success: false, error: 'User not authenticated' });
          return;
        }
        if (messageId === null || emoji === null) {
          accuse?.({ success: false, error: 'Validation error' });
          return;
        }
        const action = evenement === 'reaction:add' ? 'add' : 'remove';
        const change =
          action === 'add' ? reactions.ajoute(messageId, emoji, participantDe(qui)) : reactions.retire(messageId, emoji, participantDe(qui));
        accuse?.(action === 'add' ? { success: true, data: { messageId, emoji, participantId: participantDe(qui) } } : { success: true });
        if (!change) return;
        const conversationId = [...socket.rooms].find((r) => r.startsWith('conversation:'))?.slice('conversation:'.length) ?? '';
        diffuseLaReaction(conversationId, action, evenementDeReaction({ magasin: reactions, messageId, conversationId, emoji, action, acteur: qui }));
      });
    });

    (['typing:start', 'typing:stop'] as const).forEach((evenement) => {
      socket.on(evenement, (charge: unknown) => {
        recus.push({ evenement, charge, a: Date.now() });
        const conversationId = chaine((charge as Record<string, unknown> | null)?.conversationId);
        const qui = identite();
        if (conversationId === null || qui === null) return;
        socket.to(room(conversationId)).emit(evenement, {
          userId: qui.id,
          username: qui.genre === 'invite' ? 'Tolu' : 'amina',
          displayName: qui.genre === 'invite' ? 'Tolu' : 'Amina Diallo',
          conversationId,
          isTyping: evenement === 'typing:start',
        });
      });
    });

    socket.on('disconnect', () => {
      identites.delete(socket.id);
    });
  });

  return {
    io,
    recus,
    emets: (conversationId, evenement, charge) => {
      io.to(room(conversationId)).emit(evenement, charge);
    },
    diffuseLaLigne,
    diffuseLeMessage,
    diffuseLaReaction,
    diffuseLesDroits,
    diffuseLaPresence,
    connectes: () => io.sockets.sockets.size,
    jonctionsRefusees: () => jonctionsRefusees,
    coupe: () => {
      joignable = false;
      /**
       * LE TRANSPORT EST ARRACHÉ, il n'est pas « déconnecté ».
       *
       * `io.disconnectSockets(true)` est une déconnexion DÉLIBÉRÉE du serveur :
       * socket.io la propage au client, qui détruit son socket, pose
       * `skipReconnect` et ne revient JAMAIS (mesuré : zéro tentative en huit
       * secondes réelles comme en quatre minutes virtuelles). C'est la bonne
       * sémantique pour « le serveur te congédie », et exactement l'inverse de
       * ce qu'on veut ici : une 3G qui coupe n'annonce rien.
       *
       * On ferme donc la socket TCP sous le transport — ce que voit un client
       * dont le réseau tombe : `transport close`, puis le backoff.
       */
      io.sockets.sockets.forEach((socket) => {
        const brut = (socket.conn as unknown as { readonly transport?: { readonly socket?: { terminate?: () => void; close?: () => void; destroy?: () => void } } })
          .transport?.socket;
        if (brut?.terminate !== undefined) brut.terminate();
        else if (brut?.destroy !== undefined) brut.destroy();
        else brut?.close?.();
      });
    },
    retablis: () => {
      joignable = true;
    },
    ferme: () =>
      new Promise((resoud) => {
        io.close(() => resoud());
      }),
  };
};
