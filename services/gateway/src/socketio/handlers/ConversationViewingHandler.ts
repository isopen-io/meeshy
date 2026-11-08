/**
 * « Est dans la conversation » (#8892).
 *
 * Un utilisateur est ICI tant qu'au moins un de ses sockets a l'écran de la
 * conversation ouvert et au premier plan. L'appartenance à la room ne le dit
 * pas : `AuthHandler._joinUserConversations` fait entrer chaque socket dans
 * TOUTES ses rooms à l'authentification.
 *
 * Signal d'ACTIVITÉ, sur le modèle de `typing:start` : il voyage dans la room
 * de la conversation, n'expose ni `isOnline` ni `lastActiveAt`, et exclut les
 * pairs bloqués dans les deux sens. Un utilisateur qui a coupé
 * `showOnlineStatus` n'est jamais annoncé — il voit les autres, on ne le voit
 * pas.
 *
 * Tout vit en mémoire : aucune écriture en base, un registre borné par le
 * nombre de sockets connectés, vidé à `disconnecting`.
 *
 * ─── CE QUE CE FILTRE NE COUVRE PAS (#16800) ────────────────────────────────
 *
 * Il est LOCAL AU NŒUD, comme chez ses deux jumeaux de salon : `userSockets`
 * est une `Map` par processus, alors que la diffusion traverse les instances
 * (l'adaptateur Redis est monté en production). Avec une seconde instance, un
 * pair bloqué attaché à l'autre nœud recevrait les annonces émises ici. Une
 * seule instance tourne aujourd'hui ; la limite est dite parce qu'un invariant
 * annoncé plus fort qu'il n'est vaut moins que pas d'invariant.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CLIENT_EVENTS, SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { ViewingEvent } from '@meeshy/shared/types/socketio-events';
import type { MeeshySocket as Socket } from '../typed-socket';
import type { ServerEmitTarget } from '../serverEmit';
import type { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';
import { getConnectedUser, normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import { resolveParticipant } from '../utils/participant-resolver';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketViewingActivitySchema, SocketViewingSchema } from '../../validation/socket-event-schemas.js';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ConversationViewingHandler' });

export interface ViewingIO {
  to(room: string): { except(socketIds: string[]): ServerEmitTarget };
}

export interface ConversationViewingHandlerDependencies {
  io: ViewingIO;
  prisma: PrismaClient;
  privacyPreferencesService: Pick<PrivacyPreferencesService, 'shouldShowOnlineStatus'>;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  userSockets: Map<string, Set<string>>;
  /** Injectable pour les tests ; l'horloge murale en production (#16752). */
  now?: () => number;
}

/**
 * Le pas de rafraîchissement du filtre d'annonce (#16752).
 *
 * `viewing:activity` revient toutes les deux secondes pendant que l'écran reste
 * ouvert (#9061, 90/min autorisés), et son filtre était écrit UNE fois par
 * `viewing:start` puis jamais relu : quelqu'un qui bloquait un lecteur
 * continuait de voir son point PULSER, sans aucune borne de temps — aussi
 * longtemps que l'écran restait ouvert.
 *
 * Même pas que le jumeau de la position (`LocationHandler`), et pour la même
 * raison : relire à chaque pouls mettrait la base sur le trajet d'un signal qui
 * bat toutes les deux secondes. Le jumeau de la FRAPPE, lui, relit à chaque
 * `typing:start` — il peut, parce qu'une frappe est bornée par la vitesse des
 * doigts et par son propre étranglement de 3 s.
 */
const BLOCK_SET_REFRESH_MS = 60_000;

/**
 * `blockRelated` est le FILTRE D'ANNONCE de ce socket (#16752) : il gouverne
 * `viewing:start`, l'instantané et `viewing:activity` — les trois émissions qui
 * NOMMENT un lecteur — et rien d'autre. Les deux rétractations ne le lisent pas
 * (une rétractation ne se filtre pas, cf. `retract`).
 *
 * Il est lu à l'ouverture et retenu, parce que `viewing:activity` arrive toutes
 * les deux secondes (#9061) et ne doit pas relire la base à chaque pouls ; il se
 * rafraîchit par pas de `BLOCK_SET_REFRESH_MS`, sans quoi un blocage POSTÉRIEUR
 * à l'ouverture restait sans effet tant que l'écran demeurait ouvert.
 */
type SocketViewing = {
  readonly userId: string;
  readonly conversationIds: ReadonlySet<string>;
  readonly blockRelated: ReadonlySet<string>;
  /** L'instant de la dernière TENTATIVE de lecture — échouée comprise. */
  readonly blockRelatedAt: number;
};

/** Ouvertures retenues au plus par socket en attente d'authentification (#9047). */
export const MAX_PENDING_OPENINGS = 3;

export class ConversationViewingHandler {
  private readonly io: ViewingIO;
  private readonly prisma: PrismaClient;
  private readonly privacyPreferencesService: ConversationViewingHandlerDependencies['privacyPreferencesService'];
  private readonly connectedUsers: Map<string, SocketUser>;
  private readonly socketToUser: Map<string, string>;
  private readonly userSockets: Map<string, Set<string>>;
  private readonly now: () => number;
  private readonly bySocket = new Map<string, SocketViewing>();
  private readonly byConversation = new Map<string, Map<string, Set<string>>>();
  /**
   * Les ouvertures reçues AVANT la fin de l'authentification du socket (#9047).
   * iOS émet `viewing:start` dès la connexion — au démarrage, au retour au
   * premier plan, à chaque reconnexion — pendant que la passerelle attend
   * encore cinq lectures avant d'inscrire le socket : l'ouverture tombait en
   * silence et le pair ne voyait jamais le point « ici ». Elle attend ici, et
   * `afterAuthentication` la rejoue.
   */
  private readonly pendingBySocket = new Map<string, ReadonlySet<string>>();
  /**
   * Les gestes d'UN socket s'appliquent dans l'ordre où il les a envoyés
   * (#9052). `viewing:start` attend plusieurs lectures ; un `viewing:stop`
   * (image ouverte) ou une déconnexion arrivés pendant ce temps le
   * précédaient, puis le `start` réinscrivait un lecteur parti — voire un
   * socket mort, à jamais « ici ».
   */
  private readonly queueBySocket = new Map<string, Promise<void>>();
  private readonly rateLimiter = getSocketRateLimiter();

  constructor(deps: ConversationViewingHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.privacyPreferencesService = deps.privacyPreferencesService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.userSockets = deps.userSockets;
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Les gestes du client : ouvrir, quitter, être actif (#9061), et passer en
   * arrière-plan — une app qui n'est plus au premier plan n'est plus dans
   * aucune conversation. `CallEventsHandler` écoute le même `presence:app-state`
   * pour la sonnerie.
   */
  listen(socket: Socket): void {
    const logged = (event: string) => (error: unknown) =>
      logger.error('viewing listener failed', { error, event, socketId: socket.id });
    socket.on(CLIENT_EVENTS.VIEWING_START, data => {
      this.handleStart(socket, data).catch(logged(CLIENT_EVENTS.VIEWING_START));
    });
    socket.on(CLIENT_EVENTS.VIEWING_STOP, data => {
      this.handleStop(socket, data).catch(logged(CLIENT_EVENTS.VIEWING_STOP));
    });
    socket.on(CLIENT_EVENTS.VIEWING_ACTIVITY, data => {
      this.handleActivity(socket, data).catch(logged(CLIENT_EVENTS.VIEWING_ACTIVITY));
    });
    socket.on(CLIENT_EVENTS.PRESENCE_APP_STATE, data => {
      this.handleAppState(socket, data).catch(logged(CLIENT_EVENTS.PRESENCE_APP_STATE));
    });
  }

  handleStart(socket: Socket, data: unknown): Promise<void> {
    return this.inOrder(socket.id, () => this.start(socket, data));
  }

  handleStop(socket: Socket, data: unknown): Promise<void> {
    return this.inOrder(socket.id, () => this.stop(socket, data));
  }

  /**
   * Le lecteur ICI regarde, écoute ou agit (#9061) : relayé à la room pour que
   * son point pulse. Rien pour un socket qui n'a pas annoncé la conversation —
   * l'activité ne révèle jamais plus que `viewing:start`.
   */
  handleActivity(socket: Socket, data: unknown): Promise<void> {
    return this.inOrder(socket.id, () => this.activity(socket, data));
  }

  handleAppState(socket: Socket, data: { foreground?: boolean } | undefined): Promise<void> {
    return this.inOrder(socket.id, () => this.appState(socket, data));
  }

  /**
   * Le socket vient d'être inscrit : on annonce les ouvertures qu'il avait
   * envoyées trop tôt, puis on lui redit qui est déjà là.
   */
  afterAuthentication(socket: Socket): Promise<void> {
    return this.inOrder(socket.id, async () => {
      const pending = this.pendingBySocket.get(socket.id) ?? new Set<string>();
      this.pendingBySocket.delete(socket.id);
      for (const conversationId of pending) {
        await this.start(socket, { conversationId });
      }
      await this.emitRoomSnapshots(socket);
    });
  }

  /**
   * LE PARTANT N'EST PLUS ICI (#16654) — le PREMIER verbe du registre qui ne
   * soit pas claveté par socket, et c'est ce qui le rendait nécessaire : toute
   * la surface publique ci-dessus part d'un `socket.id`, si bien qu'aucune
   * route ne pouvait rétracter un spectateur. Mesuré avant ce lot : deux
   * fichiers seulement citaient le registre, le gestionnaire et le manager.
   *
   * La garde de `viewing:activity` ferme le RELAIS vivant ; celle-ci ferme
   * l'ÉTAT SERVEUR, et les deux sont nécessaires. Le relais suppose que
   * l'appareil du partant parle encore ; l'instantané, non — `viewersOf` ne
   * filtre que soi et le blocage, donc un pair qui ouvre le fil APRÈS le
   * retrait s'entendait nommer un non-membre, sans aucune coopération de
   * personne.
   *
   * Unique appelant : `endConversationMembership`, le point de convergence des
   * chemins de fin d'appartenance — c'est là qu'est écrit POURQUOI l'extinction
   * précède l'éviction des rooms.
   *
   * **Ne rejette jamais** (contrat de `DepartedMemberEphemeralState`) : les
   * appelants ont déjà commis leur écriture quand cette unité s'exécute.
   *
   * Pas de `inOrder` : les mutations du registre sont SYNCHRONES, donc
   * atomiques vis-à-vis de la boucle d'événements, et le seul `await` vient
   * après elles. Un `viewing:start` concurrent du même socket ne peut pas
   * réinscrire le partant — il regate sur `resolveParticipant`, dont le cache
   * vient d'être invalidé par le même appelant.
   */
  async retractViewingForDepartedMember(conversationId: string, userId: string): Promise<void> {
    try {
      const socketIds = [...(this.byConversation.get(conversationId)?.get(userId) ?? [])];
      if (socketIds.length === 0) return;

      socketIds.forEach(socketId => this.untrack(socketId, [conversationId]));
      if (this.isHere(userId, conversationId)) return;

      // Sans exclusion, comme toute rétractation (#16752, cf. `retract`). Elle
      // ne lit donc plus la base — deux requêtes de moins sur un chemin dont le
      // contrat est de NE JAMAIS REJETER, et une posture de moins à tenir
      // juste.
      this.broadcast(SERVER_EVENTS.VIEWING_STOP, { userId, conversationId }, new Set());
    } catch (error) {
      logger.error('viewing retraction for departed member failed', { error, conversationId, userId });
    }
  }

  handleSocketDisconnecting(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.pendingBySocket.delete(socketId);
      await this.retractAll(socketId);
    });
  }

  private inOrder(socketId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queueBySocket.get(socketId) ?? Promise.resolve();
    const run = previous.then(task);
    const settled: Promise<void> = run
      .catch(() => undefined)
      .then(() => {
        if (this.queueBySocket.get(socketId) === settled) this.queueBySocket.delete(socketId);
      });
    this.queueBySocket.set(socketId, settled);
    return run;
  }

  private async start(socket: Socket, data: unknown): Promise<void> {
    const validation = validateSocketEvent(SocketViewingSchema, data);
    if (!validation.success) return;

    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      this.holdUntilAuthenticated(socket.id, validation.data.conversationId);
      return;
    }
    const allowed = await this.rateLimiter.checkLimit(userIdOrToken, SOCKET_RATE_LIMITS.CONVERSATION_VIEWING);
    if (!allowed) return;

    const connected = getConnectedUser(userIdOrToken, this.connectedUsers);
    if (!connected) return;
    const { user, realUserId: userId } = connected;

    const conversationId = await this.normalize(validation.data.conversationId);
    const participant = await resolveParticipant({
      prisma: this.prisma,
      userIdOrToken,
      conversationId,
      connectedUsers: this.connectedUsers,
    });
    if (!participant) return;

    // Même posture que l'instantané ci-dessous : sans exclusion prouvée, ce
    // socket n'apprend rien et n'annonce rien. `track` n'a donc jamais lieu
    // sur une lecture qui lève — ce qui est l'invariant dont dépendent les deux
    // rétractations : l'ensemble retenu par `SocketViewing.blockRelated` est
    // toujours un ensemble PROUVÉ.
    const blockRelated = await this.blockRelatedOf(userId);
    if (blockRelated === null) return;
    const alreadyHere = this.viewersOf(conversationId).filter(id => id !== userId && !blockRelated.has(id));
    socket.emit(SERVER_EVENTS.VIEWING_SNAPSHOT, { conversationId, userIds: alreadyHere });

    const announces = await this.privacyPreferencesService.shouldShowOnlineStatus(userId, user.isAnonymous);
    if (!announces) return;

    const wasHere = this.isHere(userId, conversationId);
    this.track(socket.id, userId, conversationId, blockRelated);
    if (wasHere) return;
    this.broadcast(SERVER_EVENTS.VIEWING_START, { userId, conversationId }, blockRelated);
  }

  private async stop(socket: Socket, data: unknown): Promise<void> {
    const validation = validateSocketEvent(SocketViewingSchema, data);
    if (!validation.success) return;
    this.release(socket.id, validation.data.conversationId);
    const conversationId = await this.normalize(validation.data.conversationId);
    await this.retract(socket.id, [conversationId]);
  }

  private async activity(socket: Socket, data: unknown): Promise<void> {
    const validation = validateSocketEvent(SocketViewingActivitySchema, data);
    if (!validation.success) return;
    const viewing = this.bySocket.get(socket.id);
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!viewing || !userIdOrToken) return;

    const conversationId = await this.normalize(validation.data.conversationId);
    if (!viewing.conversationIds.has(conversationId)) return;
    const allowed = await this.rateLimiter.checkLimit(userIdOrToken, SOCKET_RATE_LIMITS.CONVERSATION_ACTIVITY);
    if (!allowed) return;

    // L'APPARTENANCE SE REVÉRIFIE ICI (#16654). L'entrée en mémoire ci-dessus
    // a été écrite par `viewing:start`, qui l'a gatée sur `resolveParticipant`
    // — mais elle est un INSTANTANÉ de ce moment-là, et le signal, lui, revient
    // toutes les deux secondes pendant que l'écran reste ouvert (#9061). Entre
    // les deux, un retrait, un bannissement ou un départ peut avoir eu lieu :
    // l'ancien membre continuait alors d'annoncer « je suis ici, maintenant »
    // dans un fil dont son droit d'être venait de cesser.
    //
    // C'est mot pour mot ce que `typing:start` a reçu (`StatusHandler`, #5947) :
    // « letting any authenticated user — including one removed/banned from the
    // conversation — broadcast their identity into a room they don't belong to ».
    // La frappe a été gardée ; le regard, non — il est arrivé après.
    //
    // La lecture est AMORTIE : `resolveParticipant` sert sa réponse d'un cache
    // de cinq minutes, qu'`endConversationMembership` invalide précisément à la
    // fin d'appartenance (`invalidateParticipantCache`). Elle est placée APRÈS
    // le limiteur de débit pour qu'un flot d'activité ne la convoque pas sans
    // borne.
    //
    // LE VERDICT A TROIS ÉTATS, et les deux qui comptent s'arbitrent à
    // l'opposé. `resolveParticipant` n'attrape RIEN : une panne de base LÈVE,
    // elle ne rend pas `null`. Un `null` est donc un négatif PROUVÉ — aucune
    // ligne vivante — et il ferme ; une levée est une ABSENCE DE PREUVE, elle
    // remonte au `.catch` de `listen` et n'éteint rien. C'est le bon sens pour
    // un signal de vivacité : on ne retire pas quelqu'un d'un fil sur une
    // panne. Même arbitrage, mêmes conséquences, que le jumeau `typing:start`,
    // qui expire aussi la room sur ce même négatif prouvé.
    const participant = await resolveParticipant({
      prisma: this.prisma,
      userIdOrToken,
      conversationId,
      connectedUsers: this.connectedUsers,
    });
    if (!participant) {
      // RÉTRACTER D'ABORD, ÉVINCER ENSUITE — même ordre et même raison que
      // l'extinction d'`endConversationMembership` : le `viewing:stop` voyage
      // par la room de la conversation, et il annonce aux pairs ce que leur
      // interface montre encore. Sans lui, le point resterait allumé jusqu'à
      // la fin de leur session.
      await this.retract(socket.id, [conversationId]);
      // La room est une autorisation MISE EN CACHE (#5947) : une
      // non-appartenance PROUVÉE l'expire, sinon l'ancien membre reçoit encore
      // le fil. Dans son PROPRE `try` (#6051) : l'échec de cette mesure de
      // sécurité ne doit pas emporter la rétractation qui la précède, ni
      // l'inverse.
      try {
        await socket.leave(ROOMS.conversation(conversationId));
      } catch (error) {
        logger.error('viewing:activity — expiration de la room échouée, la rétractation a eu lieu', {
          error, userId: viewing.userId, conversationId,
        });
      }
      return;
    }

    // LE FILTRE D'ANNONCE SE RAFRAÎCHIT (#16752). Il était écrit une fois par
    // `viewing:start` et jamais relu, alors que ce pouls revient toutes les deux
    // secondes pendant que l'écran reste ouvert : quelqu'un qui bloquait ce
    // lecteur APRÈS son ouverture continuait de voir son point pulser, sans
    // aucune borne de temps.
    //
    // Trois états, et ils se nomment : `undefined` = pas l'heure de relire ;
    // `null` = relu et RIEN PROUVÉ ; un ensemble = prouvé. Les deux premiers
    // conduisent à la même action — garder l'ensemble retenu, qui est lui aussi
    // une preuve (`track` ne l'écrit que depuis un `start` fail-closed). On
    // n'élargit JAMAIS l'audience d'une annonce sur un doute.
    const dueForRefresh = this.now() - viewing.blockRelatedAt >= BLOCK_SET_REFRESH_MS;
    const refreshed = dueForRefresh ? await this.blockRelatedOf(viewing.userId) : undefined;
    const hidden = refreshed ?? viewing.blockRelated;
    if (dueForRefresh) {
      // L'horloge avance sur toute TENTATIVE, réussie ou non : une base en
      // difficulté est interrogée une fois par minute, pas à chaque pouls.
      const current = this.bySocket.get(socket.id);
      if (current) this.bySocket.set(socket.id, { ...current, blockRelated: hidden, blockRelatedAt: this.now() });
    }

    const focus = validation.data.focus === true ? { focus: true } : {};
    this.broadcast(SERVER_EVENTS.VIEWING_ACTIVITY, { userId: viewing.userId, conversationId, ...focus }, hidden);
  }

  private async appState(socket: Socket, data: { foreground?: boolean } | undefined): Promise<void> {
    if (data?.foreground !== false) return;
    this.pendingBySocket.delete(socket.id);
    await this.retractAll(socket.id);
  }

  /**
   * À l'authentification, après l'entrée dans les rooms : le client vient de
   * vider ce qu'il savait, la passerelle lui redit qui est ICI dans chacune de
   * ses conversations — sans attendre que ces pairs rouvrent leur écran.
   */
  async emitRoomSnapshots(socket: Socket): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;
    const connected = getConnectedUser(userIdOrToken, this.connectedUsers);
    if (!connected) return;
    const { realUserId: userId } = connected;

    const occupied = [...this.byConversation.keys()].filter(id => socket.rooms.has(ROOMS.conversation(id)));
    if (occupied.length === 0) return;

    // FAIL-CLOSED (#16752) : sans exclusion PROUVÉE, aucun instantané ne part.
    // Ce qui suit est la liste NOMINATIVE des gens présents dans chacune des
    // conversations de ce socket — renoncer coûte un point « ici » qui
    // s'allumera au prochain `viewing:start` d'un pair ; servir non filtré
    // coûte un secret qui ne se retire pas.
    //
    // Le `user.isAnonymous ? new Set() :` qui enveloppait cet appel redisait au
    // SITE la règle que `blockRelatedOf` porte déjà — et il ne la redisait
    // qu'ici, si bien que les deux appels de la même loi n'avaient pas la même
    // forme. C'est exactement de cette famille d'écart qu'est né #16752.
    const blockRelated = await this.blockRelatedOf(userId);
    if (blockRelated === null) return;
    for (const conversationId of occupied) {
      const userIds = this.viewersOf(conversationId).filter(id => id !== userId && !blockRelated.has(id));
      if (userIds.length > 0) socket.emit(SERVER_EVENTS.VIEWING_SNAPSHOT, { conversationId, userIds });
    }
  }

  /**
   * Bornée : un socket non authentifié ne doit pas pouvoir faire grossir la
   * mémoire de la passerelle. Un écran n'affiche qu'une conversation à la
   * fois ; seules les dernières ouvertures comptent.
   */
  private holdUntilAuthenticated(socketId: string, conversationId: string): void {
    const previous = [...(this.pendingBySocket.get(socketId) ?? [])].filter(id => id !== conversationId);
    this.pendingBySocket.set(socketId, new Set([...previous, conversationId].slice(-MAX_PENDING_OPENINGS)));
  }

  private release(socketId: string, conversationId: string): void {
    const pending = this.pendingBySocket.get(socketId);
    if (!pending) return;
    const remaining = [...pending].filter(id => id !== conversationId);
    if (remaining.length === 0) {
      this.pendingBySocket.delete(socketId);
      return;
    }
    this.pendingBySocket.set(socketId, new Set(remaining));
  }

  private async retractAll(socketId: string): Promise<void> {
    const viewing = this.bySocket.get(socketId);
    if (!viewing) return;
    await this.retract(socketId, [...viewing.conversationIds]);
  }

  private async retract(socketId: string, conversationIds: readonly string[]): Promise<void> {
    const viewing = this.bySocket.get(socketId);
    if (!viewing) return;
    const leaving = conversationIds.filter(id => viewing.conversationIds.has(id));
    if (leaving.length === 0) return;

    this.untrack(socketId, leaving);
    const left = leaving.filter(id => !this.isHere(viewing.userId, id));
    if (left.length === 0) return;

    // UNE RÉTRACTATION NE SE FILTRE PAS (#16752), et c'est le MÊME arbitrage
    // qu'au jumeau de la position.
    //
    // Qui affiche le point « ici » de ce lecteur ? Ceux à qui un `viewing:start`
    // ou un instantané est parvenu. Cet ensemble n'est PAS le complément du
    // filtre d'annonce : il dépend de l'instant de chaque annonce, du nombre
    // d'appareils de ce compte, d'un rafraîchissement arrivé entre-temps. Le
    // serveur ne peut le connaître qu'en tenant une algèbre d'intersections à
    // travers toutes les annonces — et une erreur, dans ce sens-là, laisse un
    // point ALLUMÉ chez un pair bloqué pour toute sa session, sans recours.
    //
    // Le filtre inverse concède `{userId, conversationId}` à un CO-PARTICIPANT,
    // une fois par fermeture d'écran. Entre les deux, le choix n'est pas serré.
    //
    // Une première version de ce lot excluait l'ensemble retenu et appelait
    // l'UNION des ensembles de plusieurs appareils « la posture la plus
    // fermée » : c'était faux dans le sens qui compte — « n'a RIEN reçu » est
    // l'INTERSECTION, et l'union laissait donc le point allumé.
    for (const conversationId of left) {
      this.broadcast(SERVER_EVENTS.VIEWING_STOP, { userId: viewing.userId, conversationId }, new Set());
    }
  }

  private broadcast(
    event: typeof SERVER_EVENTS.VIEWING_START | typeof SERVER_EVENTS.VIEWING_STOP | typeof SERVER_EVENTS.VIEWING_ACTIVITY,
    payload: ViewingEvent,
    blockRelated: ReadonlySet<string>,
  ): void {
    const excluded = [payload.userId, ...blockRelated].flatMap(id => [...(this.userSockets.get(id) ?? [])]);
    try {
      this.io.to(ROOMS.conversation(payload.conversationId)).except(excluded).emit(event, payload);
    } catch (error) {
      logger.error('viewing broadcast failed', { error, event, conversationId: payload.conversationId });
    }
  }

  /**
   * L'ensemble des comptes qu'un blocage sépare de `userId`, dans un sens ou
   * dans l'autre — ou `null` quand la lecture N'A RIEN PROUVÉ (#16752).
   *
   * TROIS états, jamais deux (la distinction du cycle 127). Cette unité rendait
   * un `Set` VIDE sur une levée, et un ensemble vide ne se lit pas « je ne
   * sais pas » : il se lit **« personne à exclure »**. Une bascule de réplique
   * de vingt secondes publiait donc `viewing:snapshot` — la liste NOMINATIVE
   * des gens présents — aux pairs bloqués dans les deux sens.
   *
   * L'arbitrage du `unknown` se décide par ce qui est EN JEU, et ici c'est un
   * secret : chaque appelant se tait plutôt que d'élargir son audience. C'est
   * la posture que `start` tenait déjà, par accident de forme — il appelait la
   * loi partagée sans `catch`, si bien qu'une levée remontait au `.catch` de
   * `listen` et que rien ne partait. Une asymétrie entre deux appels de la
   * MÊME loi dans le MÊME fichier est le signe d'un oubli, pas d'un arbitrage ;
   * les deux passent désormais par ici.
   *
   * Un participant ANONYME n'a pas de ligne `User` : il ne peut ni bloquer ni
   * être bloqué, et l'ensemble vide est alors une PREUVE, pas une ignorance.
   */
  private async blockRelatedOf(userId: string): Promise<ReadonlySet<string> | null> {
    const user = this.connectedUsers.get(userId);
    if (user?.isAnonymous) return new Set();
    try {
      return await getBlockRelatedUserIds(this.prisma, userId);
    } catch (error) {
      logger.error('viewing block lookup failed', { error, userId });
      return null;
    }
  }

  private viewersOf(conversationId: string): string[] {
    return [...(this.byConversation.get(conversationId)?.keys() ?? [])];
  }

  private isHere(userId: string, conversationId: string): boolean {
    return (this.byConversation.get(conversationId)?.get(userId)?.size ?? 0) > 0;
  }

  private track(socketId: string, userId: string, conversationId: string, blockRelated: ReadonlySet<string>): void {
    const current = this.bySocket.get(socketId)?.conversationIds ?? new Set<string>();
    this.bySocket.set(socketId, {
      userId,
      conversationIds: new Set([...current, conversationId]),
      blockRelated,
      blockRelatedAt: this.now(),
    });
    const users = this.byConversation.get(conversationId) ?? new Map<string, Set<string>>();
    users.set(userId, new Set([...(users.get(userId) ?? []), socketId]));
    this.byConversation.set(conversationId, users);
  }

  private untrack(socketId: string, conversationIds: readonly string[]): void {
    const viewing = this.bySocket.get(socketId);
    if (!viewing) return;
    conversationIds.forEach(conversationId => this.untrackIndex(conversationId, viewing.userId, socketId));
    const remaining = [...viewing.conversationIds].filter(id => !conversationIds.includes(id));
    if (remaining.length === 0) {
      this.bySocket.delete(socketId);
      return;
    }
    this.bySocket.set(socketId, { ...viewing, conversationIds: new Set(remaining) });
  }

  private untrackIndex(conversationId: string, userId: string, socketId: string): void {
    const users = this.byConversation.get(conversationId);
    const sockets = [...(users?.get(userId) ?? [])].filter(id => id !== socketId);
    if (!users) return;
    if (sockets.length > 0) users.set(userId, new Set(sockets));
    else users.delete(userId);
    if (users.size === 0) this.byConversation.delete(conversationId);
  }

  private normalize(conversationId: string): Promise<string> {
    return normalizeConversationId(conversationId, where =>
      this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
    );
  }
}
