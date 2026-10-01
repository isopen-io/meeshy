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
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { ViewingEvent } from '@meeshy/shared/types/socketio-events';
import type { MeeshySocket as Socket } from '../typed-socket';
import type { ServerEmitTarget } from '../serverEmit';
import type { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';
import { getConnectedUser, normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import { resolveParticipant } from '../utils/participant-resolver';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketViewingSchema } from '../../validation/socket-event-schemas.js';
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
}

type SocketViewing = { readonly userId: string; readonly conversationIds: ReadonlySet<string> };

/** Ouvertures retenues au plus par socket en attente d'authentification (#9047). */
export const MAX_PENDING_OPENINGS = 3;

export class ConversationViewingHandler {
  private readonly io: ViewingIO;
  private readonly prisma: PrismaClient;
  private readonly privacyPreferencesService: ConversationViewingHandlerDependencies['privacyPreferencesService'];
  private readonly connectedUsers: Map<string, SocketUser>;
  private readonly socketToUser: Map<string, string>;
  private readonly userSockets: Map<string, Set<string>>;
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
  }

  handleStart(socket: Socket, data: unknown): Promise<void> {
    return this.inOrder(socket.id, () => this.start(socket, data));
  }

  handleStop(socket: Socket, data: unknown): Promise<void> {
    return this.inOrder(socket.id, () => this.stop(socket, data));
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

  handleSocketDisconnecting(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.pendingBySocket.delete(socketId);
      await this.retractAll(socketId);
    });
  }

  private inOrder(socketId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queueBySocket.get(socketId) ?? Promise.resolve();
    const run = previous.then(task);
    const settled = run.catch(() => undefined);
    this.queueBySocket.set(socketId, settled);
    void settled.then(() => {
      if (this.queueBySocket.get(socketId) === settled) this.queueBySocket.delete(socketId);
    });
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

    const blockRelated = user.isAnonymous ? new Set<string>() : await getBlockRelatedUserIds(this.prisma, userId);
    const alreadyHere = this.viewersOf(conversationId).filter(id => id !== userId && !blockRelated.has(id));
    socket.emit(SERVER_EVENTS.VIEWING_SNAPSHOT, { conversationId, userIds: alreadyHere });

    const announces = await this.privacyPreferencesService.shouldShowOnlineStatus(userId, user.isAnonymous);
    if (!announces) return;

    const wasHere = this.isHere(userId, conversationId);
    this.track(socket.id, userId, conversationId);
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
    const { user, realUserId: userId } = connected;

    const occupied = [...this.byConversation.keys()].filter(id => socket.rooms.has(ROOMS.conversation(id)));
    if (occupied.length === 0) return;

    const blockRelated = user.isAnonymous ? new Set<string>() : await this.blockRelatedOf(userId);
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

    const blockRelated = await this.blockRelatedOf(viewing.userId);
    for (const conversationId of left) {
      this.broadcast(SERVER_EVENTS.VIEWING_STOP, { userId: viewing.userId, conversationId }, blockRelated);
    }
  }

  private broadcast(
    event: typeof SERVER_EVENTS.VIEWING_START | typeof SERVER_EVENTS.VIEWING_STOP,
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

  private async blockRelatedOf(userId: string): Promise<ReadonlySet<string>> {
    const user = this.connectedUsers.get(userId);
    if (user?.isAnonymous) return new Set();
    try {
      return await getBlockRelatedUserIds(this.prisma, userId);
    } catch (error) {
      logger.error('viewing block lookup failed', { error, userId });
      return new Set();
    }
  }

  private viewersOf(conversationId: string): string[] {
    return [...(this.byConversation.get(conversationId)?.keys() ?? [])];
  }

  private isHere(userId: string, conversationId: string): boolean {
    return (this.byConversation.get(conversationId)?.get(userId)?.size ?? 0) > 0;
  }

  private track(socketId: string, userId: string, conversationId: string): void {
    const current = this.bySocket.get(socketId)?.conversationIds ?? new Set<string>();
    this.bySocket.set(socketId, { userId, conversationIds: new Set([...current, conversationId]) });
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
    this.bySocket.set(socketId, { userId: viewing.userId, conversationIds: new Set(remaining) });
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
