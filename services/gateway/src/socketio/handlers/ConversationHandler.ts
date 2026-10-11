/**
 * Conversation Handler
 * Gère les événements de conversation (join, leave, stats)
 */

// Cycle 99 — `MeeshySocket`, pas le `Socket` nu de socket.io : les huit refus
// de jonction ci-dessous sont désormais vérifiés contre `ServerToClientEvents`.
import type { MeeshySocket as Socket } from '../typed-socket';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import { SERVER_EVENTS, ROOMS, type ReadStatusUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService, type OnlineUserInfo } from '../../services/ConversationStatsService';
import type { PresenceViewer, PresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketConversationJoinSchema, SocketConversationLeaveSchema } from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import type { MessageReadStatusService } from '../../services/MessageReadStatusService.js';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import { bridgeComputed } from '../unreadBridgeField.js';

const logger = enhancedLogger.child({ module: 'ConversationHandler' });

export interface ConversationHandlerDependencies {
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  readStatusService: Pick<MessageReadStatusService, 'getUnreadCount' | 'getLatestMessageSummary'>;
  /**
   * Retracte la frappe que CE socket a diffusée dans la conversation qu'il
   * quitte — `StatusHandler.retractTypingIn` en pratique.
   *
   * Sans elle, seul `disconnecting` retracte, et changer de conversation ne
   * déconnecte pas le socket : les pairs gardent un « X est en train
   * d'écrire… » fantôme jusqu'à leur propre filet de sécurité. La conversation
   * est passée DÉJÀ NORMALISÉE — ce handler l'a résolue, la faire re-résoudre
   * coûterait un second `findUnique` à chaque changement de conversation.
   *
   * Optionnelle : un `ConversationHandler` construit sans elle quitte
   * normalement, il ne retracte simplement rien.
   */
  retractTyping?: (socket: Socket, conversationId: string) => Promise<void>;
  /**
   * Rejoue au socket entrant les partages de position en cours dans la
   * conversation — `LocationHandler.replayLiveLocationsTo` en pratique.
   *
   * `location:live-started` ne touche que les sockets présents à l'instant du
   * départ. Sans ce rejeu, un participant qui ouvre la conversation ensuite
   * n'apprend jamais l'existence du partage, et l'épingle lui reste invisible
   * pour toute la session. Même famille que la resynchronisation des accusés de
   * lecture ci-dessous : ce qu'un client rate en n'étant pas là, la jonction le
   * lui rend.
   *
   * Optionnelle : un `ConversationHandler` construit sans elle joint
   * normalement, il ne rattrape simplement rien.
   */
  replayLiveLocations?: (socket: Socket, conversationId: string) => void;
  /**
   * Le LECTEUR des statistiques, avec son VRAI rôle —
   * `MeeshySocketIOManager._presenceViewer` en pratique. Ni `SocketUser` ni le
   * handshake ne portent `User.role` : il est relu en base, une fois par
   * émission de stats. `null` ⇒ aucun lecteur ⇒ la loi ne nomme personne.
   *
   * Obligatoire, à la différence des deux rappels ci-dessus : un handler sans
   * lecteur ne peut pas projeter `onlineUsers`, et la liste nominative de qui
   * est en ligne est exactement ce que la directive du 2026-08-25 retire à un
   * co-participant qui n'est pas ami.
   */
  presenceViewer: (userId: string) => Promise<PresenceViewer>;
  /**
   * La loi UNIQUE de visibilité de la présence — amitié acceptée, ADMIN+,
   * blocage, préférences — `PresenceVisibilityService.resolveForTargets`, la
   * même porte que `presence:snapshot` et `GET /users/presence`.
   */
  presenceVisibility: Pick<PresenceVisibilityService, 'resolveForTargets'>;
}

export class ConversationHandler {
  private prisma: PrismaClient;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private readStatusService: Pick<MessageReadStatusService, 'getUnreadCount' | 'getLatestMessageSummary'>;
  private retractTyping?: (socket: Socket, conversationId: string) => Promise<void>;
  private replayLiveLocations?: (socket: Socket, conversationId: string) => void;
  private presenceViewer: (userId: string) => Promise<PresenceViewer>;
  private presenceVisibility: Pick<PresenceVisibilityService, 'resolveForTargets'>;
  private rateLimiter = getSocketRateLimiter();

  constructor(deps: ConversationHandlerDependencies) {
    this.prisma = deps.prisma;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.readStatusService = deps.readStatusService;
    this.retractTyping = deps.retractTyping;
    this.replayLiveLocations = deps.replayLiveLocations;
    this.presenceViewer = deps.presenceViewer;
    this.presenceVisibility = deps.presenceVisibility;
  }

  /**
   * Gère l'événement conversation:join
   */
  async handleConversationJoin(socket: Socket, data: { conversationId: string }): Promise<void> {
    // Resolve early so we can attach the conversationId to every error
    // emission. The client uses it to route the error to the right
    // ViewModel and purge stale cache entries.
    const requestedId = (data && typeof data === 'object' && 'conversationId' in data)
      ? String((data as { conversationId: unknown }).conversationId ?? '')
      : '';
    try {
      const schemaValidation = validateSocketEvent(SocketConversationJoinSchema, data);
      if (schemaValidation.success === false) {
        socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
          conversationId: requestedId,
          reason: 'invalid_payload',
          message: schemaValidation.error,
        });
        return;
      }
      const validated = schemaValidation.data;

      const normalizedId = await normalizeConversationId(
        validated.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const userIdOrToken = this.socketToUser.get(socket.id);
      const connectedUser = userIdOrToken ? this.connectedUsers.get(userIdOrToken) : null;

      if (!connectedUser) {
        socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
          conversationId: validated.conversationId,
          reason: 'not_authenticated',
          message: 'Non authentifié',
        });
        return;
      }

      const joinAllowed = await this.rateLimiter.checkLimit(userIdOrToken!, SOCKET_RATE_LIMITS.CONVERSATION_JOIN);
      if (!joinAllowed) {
        socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
          conversationId: validated.conversationId,
          reason: 'rate_limited',
          message: 'Trop de requêtes. Veuillez réessayer.',
        });
        return;
      }

      // La ligne `Participant` que le contrôle d'appartenance résout, quelle que
      // soit la branche. Distincte de `participationId` plus bas, qui est
      // l'identité de ROOM (`User.id` quand il y en a un) : les deux espaces
      // d'id ne se croisent pas, et le rattrapage d'accusés doit remplir un
      // champ `participantId` avec un vrai `Participant.id`.
      let participantRowId: string | null = null;

      if (connectedUser.isAnonymous) {
        // Anonymous: verify participant owns this exact conversation
        const participantId = connectedUser.participantId;
        const participant = await this.prisma.participant.findFirst({
          where: { id: participantId, conversationId: normalizedId, isActive: true },
          select: { id: true },
        });
        participantRowId = participant?.id ?? null;
        if (!participant) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
            conversationId: validated.conversationId,
            reason: 'not_a_member',
            message: 'Vous n\'êtes pas membre de cette conversation',
          });
          return;
        }
      } else {
        // Registered: check participant record by userId
        const userId = connectedUser.userId!;
        const participant = await this.prisma.participant.findFirst({
          where: { conversationId: normalizedId, userId },
          select: { id: true, bannedAt: true, leftAt: true, isActive: true },
        });
        participantRowId = participant?.id ?? null;

        if (!participant) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
            conversationId: validated.conversationId,
            reason: 'not_a_member',
            message: 'Vous n\'êtes pas membre de cette conversation',
          });
          return;
        }

        if (participant.bannedAt) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
            conversationId: validated.conversationId,
            reason: 'banned',
            message: 'Vous êtes banni de cette conversation',
          });
          return;
        }

        if (participant.leftAt || participant.isActive === false) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
            conversationId: validated.conversationId,
            reason: 'no_longer_member',
            message: 'Vous n\'êtes plus membre de cette conversation',
          });
          return;
        }
      }

      const room = ROOMS.conversation(normalizedId);
      await socket.join(room);

      // Rattrapage AVANT les accusés ci-dessous, et hors du gate
      // `participationId` : l'appartenance vient d'être contrôlée, et un invité
      // de lien partagé a autant besoin de voir l'épingle d'un pair que le
      // membre inscrit. Ne peut pas jeter — l'implémentation est synchrone et
      // sans I/O — mais un rejeu perdu ne doit de toute façon jamais faire
      // échouer une jonction.
      try {
        this.replayLiveLocations?.(socket, normalizedId);
      } catch (err) {
        logger.warn('live location replay failed on join (non-blocking)', { conversationId: normalizedId, error: err });
      }

      const registeredUserId = connectedUser.userId;
      // L'identité du socket dans cette conversation. Un invité de lien partagé
      // n'a pas de `userId` : c'est son `Participant.id` qui l'identifie, et
      // c'est celui que le contrôle d'appartenance vient de résoudre. SURTOUT
      // PAS `connectedUser.id`, qui est le jeton de SESSION — un credential n'a
      // rien à faire dans un payload d'événement, et il ne résout d'ailleurs
      // aucune ligne Participant (`getUnreadCount` rendrait 0 en silence).
      //
      // Les deux émissions ci-dessous étaient gatées sur `userId` et laissaient
      // donc l'invité rejoindre en SILENCE — sans accusé, sans badge — alors
      // que le contrôle d'appartenance l'a laissé passer et que son socket EST
      // dans la room.
      const participationId = registeredUserId ?? connectedUser.participantId;

      if (participationId) {
        // `userId` ne peut pas être omis pour un anonyme : côté iOS,
        // `ConversationParticipationEvent.userId` est un `String` NON optionnel
        // et un payload amputé ferait échouer le décodage Swift — l'accusé
        // serait silencieusement jeté. Aucun des cinq consommateurs connus ne
        // LIT ce champ (web use-socket-cache-sync / use-stream-socket /
        // orchestrator, iOS ConversationSyncEngine / ParticipantsView
        // n'exploitent que `conversationId`), mais tous exigent qu'il soit là.
        socket.emit(SERVER_EVENTS.CONVERSATION_JOINED, {
          conversationId: normalizedId,
          userId: participationId
        });

        // `getUnreadCount` accepte indifféremment un `Participant.id` ou un
        // `User.id` (contrat documenté dans MessageReadStatusService, qui nomme
        // le chemin anonyme comme le cas courant).
        try {
          const unreadCount = await this.readStatusService.getUnreadCount(participationId, normalizedId);
          // Pont ✦ : `null` EXPLICITE (cycle 63). On rejoint une conversation
          // pour la LIRE — l'ouvrir CONSOMME le pont, et c'est un fait que ce
          // handler connaît sans rien calculer. L'effacement est donc voulu
          // ici, à la différence de l'instantané de reconnexion qui, lui,
          // s'abstient. Depuis que l'absence du champ signifie « je n'ai pas
          // calculé », ne rien dire aurait laissé le pont en place sur une
          // conversation qu'on vient précisément d'ouvrir.
          socket.emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
            conversationId: normalizedId,
            unreadCount,
            ...bridgeComputed(undefined),
          });
        } catch (err) {
          logger.warn('unread count fetch failed on join (non-blocking)', { conversationId: normalizedId, error: err });
        }

        await this._resyncReadStatusToSocket(socket, normalizedId, participantRowId, registeredUserId ?? null);
      }

      if (registeredUserId) {
        // Envoyer les stats de conversation. On passe l'id RÉSOLU (`normalizedId`),
        // comme le room join, le payload joined et l'emit unread ci-dessus — sauf
        // pour la conversation globale "meeshy", que ConversationStatsService résout
        // lui-même via le littéral (elle n'a pas de rows Participant : lui donner
        // l'ObjectId renverrait participantCount:0 / onlineUsers:[]). Passer le brut
        // `validated.conversationId` pour tout autre identifiant de slug faisait
        // manquer `findFirst({ id })` → stats vides mises en cache 1h sous la clé slug.
        const statsConversationId = validated.conversationId === 'meeshy' ? 'meeshy' : normalizedId;
        await this.sendConversationStatsToSocket(socket, statsConversationId).catch(err => {
          logger.warn('conversation stats broadcast failed (non-blocking)', { conversationId: statsConversationId, error: err });
        });
      }
    } catch (error) {
      logger.error('conversation:join failed', { error });
      socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
        conversationId: requestedId,
        reason: 'server_error',
        message: 'Erreur serveur lors du join',
      });
    }
  }

  /**
   * Rattrape les accusés de livraison/lecture manqués pendant que ce socket
   * était absent.
   *
   * `read-status:updated` n'est émis QUE par une action d'accusé — un pair qui
   * lit, une remise automatique. Un socket coupé à cet instant ne le reçoit
   * jamais, et RIEN ne le lui rejoue : l'événement n'est pas dans la file de
   * livraison hors ligne (elle ne porte que des messages et leurs mutations),
   * et la coche de l'expéditeur reste donc figée sur sa valeur d'avant la
   * coupure. Le seul rattrapage existant est le lot REST du web, mémoïsé sur
   * l'id du dernier message PROPRE : il ne se relance qu'en ENVOYANT un
   * message, si bien qu'une personne qui lit sans écrire ne voit plus jamais
   * ses coches avancer.
   *
   * Le join est le point de rattachement de CHAQUE reconnexion — web
   * (`_autoJoinLastConversation`), iOS et Android re-joignent tous après
   * l'authentification. Réparer ici sert donc les trois clients, sans qu'aucun
   * n'ait à changer : le payload est celui qu'ils traitent déjà.
   *
   * `type: 'received'` n'est pas décoratif. iOS (`ConversationSyncEngine`,
   * `NotificationCoordinator`) et Android ne remettent le compteur de non-lus à
   * zéro que sur un `type: 'read'` émis par SOI-MÊME ; estampiller ce
   * rattrapage `read` viderait la pastille du rejoignant à chaque ouverture de
   * conversation. `received` ne porte que le `summary` agrégé — exactement le
   * contrat de la remise automatique en lot
   * (`MessageHandler.autoDeliverToOnlineRecipients`), qui est le précédent de
   * cette forme. Ni `lastReadAt` ni `unreadCount` ne l'accompagnent : ils
   * n'appartiennent qu'aux diffusions `read`, et le badge du rejoignant vient
   * de partir juste au-dessus.
   *
   * Un résumé à zéro membre signifie « aucun message dans cette conversation » :
   * il n'y a rien à rattraper, et les trois clients ignorent de toute façon un
   * résumé qui ne monte aucune coche.
   *
   * `participantId` prend la ligne `Participant` résolue par le contrôle
   * d'appartenance, JAMAIS l'identité de room (`participationId`), qui est un
   * `User.id` dès que le rejoignant a un compte. Les deux espaces d'id ne se
   * croisent pas : y mettre le mauvais ne planterait rien — iOS lit
   * `userId ?? participantId` et le trouve non nul dans les deux cas — mais le
   * champ mentirait sur ce qu'il nomme, et c'est ainsi que se fabriquent les
   * confusions d'id que ce fichier documente ailleurs.
   *
   * Best-effort : le join a réussi, la room est rejointe. Un rattrapage qui
   * échoue ne doit pas le défaire.
   */
  private async _resyncReadStatusToSocket(
    socket: Socket,
    conversationId: string,
    participantRowId: string | null,
    registeredUserId: string | null
  ): Promise<void> {
    try {
      const summary = await this.readStatusService.getLatestMessageSummary(conversationId);
      if (summary.totalMembers === 0 && summary.deliveredCount === 0 && summary.readCount === 0) return;

      // Annoté contre le contrat, comme ses quatre frères émetteurs. Le littéral
      // NU qu'il était échappait à `ReadStatusUpdatedEventData` : sous
      // `strictNullChecks: false`, le socket typé ne rattrape pas non plus la
      // nullité, donc c'est le site d'appel qui doit prouver `participantId`.
      // Il le prouve — les deux branches du contrôle d'appartenance rendent la
      // main avant d'arriver ici quand la ligne `Participant` est absente.
      const payload: ReadStatusUpdatedEventData = {
        conversationId,
        participantId: participantRowId,
        userId: registeredUserId,
        type: 'received' as const,
        updatedAt: new Date(),
        summary,
      };

      socket.emit(SERVER_EVENTS.READ_STATUS_UPDATED, payload);
    } catch (err) {
      logger.warn('read-status resync failed on join (non-blocking)', { conversationId, error: err });
    }
  }

  /**
   * Gère l'événement conversation:leave
   */
  async handleConversationLeave(socket: Socket, data: { conversationId: string }): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketConversationLeaveSchema, data);
      if (schemaValidation.success === false) {
        socket.emit(SERVER_EVENTS.ERROR, { message: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const normalizedId = await normalizeConversationId(
        validated.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      // Retracter AVANT de sortir : « je retire ce que j'ai diffusé, puis je
      // sors ». Le try/catch est local et non le try/catch général — une
      // retraction qui échoue ne doit pas transformer un départ demandé par le
      // client en `conversation:leave` refusé.
      if (this.retractTyping) {
        try {
          await this.retractTyping(socket, normalizedId);
        } catch (error) {
          logger.error('conversation:leave — typing retraction failed', { error, conversationId: normalizedId });
        }
      }

      const room = ROOMS.conversation(normalizedId);
      await socket.leave(room);

      const userId = this.socketToUser.get(socket.id);
      if (userId) {
        socket.emit(SERVER_EVENTS.CONVERSATION_LEFT, {
          conversationId: normalizedId,
          userId
        });
      }
    } catch (error) {
      logger.error('conversation:leave failed', { error });
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Failed to leave conversation' });
    }
  }

  /**
   * Envoie les statistiques de conversation à un socket.
   *
   * Les stats sont calculées et mises en cache SANS lecteur — l'entrée est
   * partagée par tous les sockets d'une conversation. Seule `onlineUsers`, une
   * liste d'IDENTITÉS, est projetée ici, par socket, à travers la loi de
   * visibilité de la présence (directive produit du 2026-08-25 : hors amitié
   * acceptée ou ADMIN+, personne ne voit qui est en ligne). Les agrégats sans
   * identité (`participantCount`, les compteurs par langue) voyagent tels
   * quels. La charge émise est un NOUVEL objet : l'entrée de cache n'est
   * jamais touchée, deux sockets en reçoivent deux projections.
   */
  async sendConversationStatsToSocket(socket: Socket, conversationId: string): Promise<void> {
    try {
      // Read-only refresh on join: getOrCompute returns cached-or-freshly-computed
      // stats WITHOUT mutating them. Using updateOnNewMessage here (the per-new-message
      // increment path) bumped messagesPerLanguage['fr'] by one on every warm-cache
      // join, inflating a conversation's message counts and persisting the corruption
      // in the shared singleton cache until its 1h TTL expired.
      const stats = await conversationStatsService.getOrCompute(
        this.prisma,
        conversationId,
        () => Array.from(this.connectedUsers.values()).map((u) => u.id)
      );
      if (!stats) return;

      socket.emit(SERVER_EVENTS.CONVERSATION_STATS, {
        conversationId,
        stats: { ...stats, onlineUsers: await this._onlineUsersVisibleTo(socket, stats.onlineUsers) },
      });
    } catch (error) {
      logger.error('conversation stats emit failed', { error });
    }
  }

  /**
   * La projection de `onlineUsers` pour CE socket : ne reste que ce que la loi
   * marque `showOnline` — soi et ses amis acceptés pour un lecteur ordinaire,
   * tout le monde pour un ADMIN+. Fermée par construction : un id que la carte
   * ne mentionne pas est retiré.
   *
   * Un socket anonyme n'a pas d'identité à relire — le lecteur est `null` et
   * c'est la loi qui répond HIDDEN pour tous, pas ce handler. Une liste vide
   * ne consulte ni le lecteur ni la loi : rien à projeter, aucune lecture.
   */
  private async _onlineUsersVisibleTo(
    socket: Socket,
    onlineUsers: readonly OnlineUserInfo[],
  ): Promise<readonly OnlineUserInfo[]> {
    if (onlineUsers.length === 0) return onlineUsers;

    const viewerUserId = this._registeredUserIdOf(socket);
    const viewer = viewerUserId ? await this.presenceViewer(viewerUserId) : null;
    const visibility = await this.presenceVisibility.resolveForTargets(
      viewer,
      onlineUsers.map((u) => u.id),
    );
    return onlineUsers.filter((u) => visibility.get(u.id)?.showOnline === true);
  }

  /**
   * Le `User.id` derrière un socket, ou `null` pour un invité de lien partagé
   * — dont la clé dans `connectedUsers` est un jeton de session, jamais une
   * identité qu'on présente à la loi.
   */
  private _registeredUserIdOf(socket: Socket): string | null {
    const key = this.socketToUser.get(socket.id);
    const connectedUser = key ? this.connectedUsers.get(key) : undefined;
    if (!connectedUser || connectedUser.isAnonymous) return null;
    return connectedUser.userId ?? null;
  }
}
