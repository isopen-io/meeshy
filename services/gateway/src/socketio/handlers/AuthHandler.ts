import type { MeeshySocket as Socket } from '../typed-socket';
import { PrismaClient, CallEndReason } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../services/StatusService';
import { MaintenanceService } from '../../services/MaintenanceService';
import { CallService } from '../../services/CallService';
import type { DisconnectParticipation } from '../CallEventsHandler';
import { hashSessionToken } from '../../utils/session-token';
import { extractJWTToken, extractSessionToken, type SocketUser } from '../utils/socket-helpers';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import jwt from 'jsonwebtoken';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketAuthenticateSchema } from '../../validation/socket-event-schemas.js';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'AuthHandler' });

export interface AuthHandlerDependencies {
  prisma: PrismaClient;
  statusService: StatusService;
  maintenanceService: MaintenanceService;
  callService: CallService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  userSockets: Map<string, Set<string>>;
  /**
   * Callback fourni par MeeshySocketIOManager pour émettre le snapshot de présence
   * juste après que l'utilisateur a joint ses conversations. Reçoit le socket + le userId
   * du nouvel arrivant. Si null/undefined, le snapshot est silencieusement skippé
   * (rétrocompat).
   */
  emitPresenceSnapshot?: (socket: Socket, userId: string, isAnonymous: boolean) => Promise<void>;
  /**
   * CALL-RESILIENCE (Vague 44) — broadcasts PARTICIPANT_LEFT/call:ended for the
   * anonymous-guest auto-leave below. Injected by MeeshySocketIOManager (owns
   * `io` and `CallEventsHandler`), curried down to
   * `CallEventsHandler.broadcastParticipantLeftResult`. Optional so unit tests
   * constructing AuthHandler directly don't need to stub Socket.IO — leaveCall
   * itself still runs unconditionally either way, only the broadcast fanout is
   * skipped when absent.
   */
  broadcastCallParticipantLeft?: (opts: {
    leftSession: Awaited<ReturnType<CallService['leaveCall']>>;
    participation: DisconnectParticipation;
    userId: string;
  }) => Promise<void>;
  /**
   * CALL-RESILIENCE — force-cleanup fallback when `leaveCall` rejects for one
   * of the participations below, curried down to
   * `CallEventsHandler.forceCleanupParticipationAfterLeaveFailure`. The
   * registered-user path already had this fallback (a failed leave stamps
   * `leftAt` directly and force-ends the session); this anonymous path only
   * logged, so a guest whose leave hit a DB error stayed a zombie participant
   * until the ~120s GC. Optional, same rationale as the callback above.
   */
  forceCleanupCallParticipant?: (opts: {
    participation: DisconnectParticipation;
    userId: string;
    leaveError: unknown;
  }) => Promise<void>;
}

export class AuthHandler {
  private prisma: PrismaClient;
  private statusService: StatusService;
  private maintenanceService: MaintenanceService;
  private callService: CallService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private userSockets: Map<string, Set<string>>;
  private emitPresenceSnapshot?: (socket: Socket, userId: string, isAnonymous: boolean) => Promise<void>;
  private broadcastCallParticipantLeft?: AuthHandlerDependencies['broadcastCallParticipantLeft'];
  private forceCleanupCallParticipant?: AuthHandlerDependencies['forceCleanupCallParticipant'];

  constructor(deps: AuthHandlerDependencies) {
    this.prisma = deps.prisma;
    this.statusService = deps.statusService;
    this.maintenanceService = deps.maintenanceService;
    this.callService = deps.callService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.userSockets = deps.userSockets;
    this.emitPresenceSnapshot = deps.emitPresenceSnapshot;
    this.broadcastCallParticipantLeft = deps.broadcastCallParticipantLeft;
    this.forceCleanupCallParticipant = deps.forceCleanupCallParticipant;
  }

  async handleTokenAuthentication(socket: Socket): Promise<void> {
    try {
      const token = extractJWTToken(socket);
      const sessionToken = extractSessionToken(socket);

      if (!token && !sessionToken) {
        logger.warn('socket sans token — déconnexion dans 10s si non authentifié', { socketId: socket.id });
        const authTimeout = setTimeout(() => {
          if (!this.socketToUser.has(socket.id)) {
            logger.warn('socket toujours non authentifié après 10s — déconnexion', { socketId: socket.id });
            socket.disconnect(true);
          }
        }, 10_000);
        socket.on('disconnect', () => clearTimeout(authTimeout));
        return;
      }

      if (sessionToken && !token) {
        await this._authenticateAnonymousUser(socket, sessionToken);
        return;
      }

      if (token) {
        await this._authenticateJWTUser(socket, token);
        return;
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('token expired on socket connect', { socketId: socket.id });
        socket.emit(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, { code: 'token_expired', message: 'JWT token has expired' });
        socket.disconnect(true);
        return;
      }
      logger.error('erreur authentification automatique', { error });
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Authentication failed' });
      socket.disconnect(true);
    }
  }

  async handleManualAuthentication(
    socket: Socket,
    data: { userId?: string; sessionToken?: string; language?: string; token?: string }
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketAuthenticateSchema, data);
      if (schemaValidation.success === false) {
        socket.emit(SERVER_EVENTS.ERROR, { message: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      // Rate-limit auth attempts by IP to prevent credential stuffing.
      // Key: socket IP so the limit spans multiple socket connections from the same host.
      const clientIp = socket.handshake.address ?? socket.id;
      const rateLimiter = getSocketRateLimiter();
      const allowed = await rateLimiter.checkLimit(clientIp, SOCKET_RATE_LIMITS.SOCKET_AUTH);
      if (!allowed) {
        logger.warn('socket auth rate limit exceeded', { ip: clientIp, socketId: socket.id });
        socket.emit(SERVER_EVENTS.ERROR, { message: 'Too many authentication attempts. Please wait before retrying.', code: 'RATE_LIMIT_EXCEEDED' });
        socket.disconnect(true);
        return;
      }

      const { sessionToken, language, token } = validated;

      if (!token && !sessionToken) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'token or sessionToken required' });
        return;
      }

      if (sessionToken && !token) {
        await this._authenticateAnonymousUser(socket, sessionToken, language);
        return;
      }

      if (token) {
        await this._authenticateJWTUser(socket, token);
        return;
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('token expired on manual auth', { socketId: socket.id });
        socket.emit(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, { code: 'token_expired', message: 'JWT token has expired' });
        socket.disconnect(true);
        return;
      }
      logger.error('erreur authentification manuelle', { error });
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Authentication failed' });
      socket.disconnect(true);
    }
  }

  private async _authenticateJWTUser(socket: Socket, token: string): Promise<void> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET non configuré');
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    const userId = decoded.userId;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        systemLanguage: true,
        regionalLanguage: true,
        customDestinationLanguage: true,
        deviceLocale: true,
      }
    });

    if (!user) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'User not found' });
      socket.disconnect(true);
      return;
    }

    const resolvedLanguages = resolveUserLanguagesOrdered(user, {
      deviceLocale: user.deviceLocale ?? undefined,
    });

    const socketUser: SocketUser = {
      id: user.id,
      socketId: socket.id,
      isAnonymous: false,
      // La langue de CADRAGE est la TÊTE du prisme ordonné calculé juste
      // au-dessus — pas une seconde lecture. `user.systemLanguage || 'en'`
      // rendait ce champ et `resolvedLanguages` divergents dès que le rang 1
      // est vide, dans le MÊME objet littéral.
      language: resolvedLanguages[0] ?? 'en',
      resolvedLanguages,
      userId: user.id
    };

    // Join every room this socket needs to receive messages in BEFORE
    // registering the user as "connected". Delivery code (MessageHandler,
    // MeeshySocketIOManager) gates the offline-delivery queue purely on
    // `connectedUsers.has(userId)`: if we registered first, a message could
    // arrive in the gap between registration and these awaited room joins
    // completing, be skipped from the offline queue (recipient looks
    // online), and never reach the room broadcast either — permanently lost.
    try {
      if (user.id && typeof user.id === 'string') {
        await Promise.allSettled([
          socket.join(ROOMS.user(user.id)),
          socket.join(ROOMS.feed(user.id)),
        ]);
      }
    } catch (error) {
      logger.error('failed to join personal rooms (JWT auth)', { userId: user.id, error });
    }

    await this._joinUserConversations(socket, user.id, false);

    this._registerUser(user.id, socketUser, socket);

    this.statusService.markConnected(user.id, false);
    await this.maintenanceService.updateUserOnlineStatus(user.id, true, true);

    socket.emit(SERVER_EVENTS.AUTHENTICATED, {
      success: true,
      user: { id: user.id, language: socketUser.language, isAnonymous: false },
      version: process.env.APP_VERSION || '1.1.0'
    });

    // Snapshot de présence: même traitement que l'auth manuelle (l.170) et
    // anonyme (l.307). Sans ça, un utilisateur enregistré authentifié via le
    // handshake automatique ne reçoit jamais le seed initial et voit ses
    // contacts hors ligne jusqu'au premier changement d'état. Best-effort.
    if (this.emitPresenceSnapshot) {
      this.emitPresenceSnapshot(socket, user.id, false).catch(error => {
        logger.error('failed to emit presence snapshot (JWT auth)', { userId: user.id, error });
      });
    }
  }

  private async _authenticateAnonymousUser(
    socket: Socket,
    sessionToken: string,
    language?: string
  ): Promise<void> {
    const tokenHash = hashSessionToken(sessionToken);

    const participant = await this.prisma.participant.findFirst({
      where: {
        sessionTokenHash: tokenHash,
        type: 'anonymous',
        isActive: true
      },
      select: {
        id: true,
        displayName: true,
        language: true,
        conversationId: true
      }
    });

    if (!participant) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Anonymous session not found' });
      socket.disconnect(true);
      return;
    }

    const socketUser: SocketUser = {
      id: participant.id,
      socketId: socket.id,
      isAnonymous: true,
      language: language || participant.language || 'en',
      resolvedLanguages: [],
      participantId: participant.id,
      displayName: participant.displayName,
      sessionToken
    };

    // Join rooms before registering — see matching comment in
    // _authenticateJWTUser for why registration must come last.
    // The personal room MUST use ROOMS.user(...) — the same convention the JWT
    // path uses (`socket.join(ROOMS.user(user.id))`) and, critically, the only
    // room every personal-event emitter targets (`io.to(ROOMS.user(participant
    // .userId ?? participant.id))` for CONVERSATION_UNREAD_UPDATED, mentions,
    // etc.). Joining the bare `socketUser.id` room left the anonymous socket in
    // a room no emitter ever addresses, so `conversation:unread-updated` (and
    // any other personal broadcast that falls back to `participant.id`) never
    // reached anonymous participants — their unread badge stayed stale until a
    // manual REST refetch.
    try {
      if (socketUser.id && typeof socketUser.id === 'string') {
        await socket.join(ROOMS.user(socketUser.id));
      }
    } catch (error) {
      logger.error('failed to join personal room for anonymous user', { anonymousId: socketUser.id, error });
    }

    // Même réessai borné que la porte inscrite (`_joinUserConversations`), et
    // pour la même raison — mais l'enjeu est ici plus grand, pas plus petit.
    //
    // La porte de livraison est `connectedUsers.has(clé)`. S'inscrire n'est donc
    // pas neutre : ça DÉSARME la file hors ligne. Une socket rejetée par
    // l'adaptateur puis inscrite quand même est vue joignable par
    // `enqueueForOfflineParticipants`, qui cesse d'enfiler, alors que le
    // `io.to(ROOMS.conversation(...))` ne l'atteint pas davantage — les messages
    // ne vont nulle part, sans rejeu ultérieur.
    //
    // Un invité de lien partagé n'a qu'UNE conversation : ici, « une room
    // échouée » vaut la TOTALITÉ de sa livraison temps réel, là où un inscrit
    // qui en perd une sur trente perd une fraction. La porte qui avait le plus
    // besoin du réessai était la seule à ne pas l'avoir.
    const guestJoinFailed = await this._joinConversationRoomsWithRetry(socket, [participant.conversationId]);
    if (guestJoinFailed.length > 0) {
      logger.error('conversation room join failed after retries for anonymous user — no live message can reach this session', {
        anonymousId: socketUser.id,
        conversationId: participant.conversationId,
      });
    }

    this._registerUser(participant.id, socketUser, socket);

    await this.maintenanceService.updateAnonymousOnlineStatus(socketUser.id, true, true);

    socket.emit(SERVER_EVENTS.AUTHENTICATED, {
      success: true,
      user: { id: socketUser.id, language: socketUser.language, isAnonymous: true },
      version: process.env.APP_VERSION || '1.1.0'
    });

    // Snapshot de présence pour les anonymes aussi (autres participants de la conversation)
    if (this.emitPresenceSnapshot) {
      this.emitPresenceSnapshot(socket, socketUser.id, true).catch(error => {
        logger.error('failed to emit presence snapshot for anonymous', { anonymousId: socketUser.id, error });
      });
    }
  }

  private _registerUser(key: string, user: SocketUser, socket: Socket): void {
    this.connectedUsers.set(key, user);
    this.socketToUser.set(socket.id, key);

    const userSocketsSet = this.userSockets.get(user.id) || new Set();
    userSocketsSet.add(socket.id);
    this.userSockets.set(user.id, userSocketsSet);

    logger.info('user authenticated', { userId: user.id, isAnonymous: user.isAnonymous });
  }

  async handleDisconnection(socket: Socket): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;
    logger.debug('socket disconnected', { socketId: socket.id, userId: userIdOrToken });

    const user = this.connectedUsers.get(userIdOrToken);
    const isAnonymous = user?.isAnonymous || false;

    const socketSet = this.userSockets.get(userIdOrToken);
    if (socketSet) {
      socketSet.delete(socket.id);
    }
    this.socketToUser.delete(socket.id);

    const remainingSockets = this.userSockets.get(userIdOrToken);
    const hasRemainingSockets = remainingSockets && remainingSockets.size > 0;

    if (hasRemainingSockets) {
      const nextSocketId = remainingSockets.values().next().value;
      const currentUser = this.connectedUsers.get(userIdOrToken);
      if (currentUser && nextSocketId) {
        this.connectedUsers.set(userIdOrToken, { ...currentUser, socketId: nextSocketId });
      }
      return;
    }

    this.userSockets.delete(userIdOrToken);
    this.statusService.markDisconnected(userIdOrToken, isAnonymous);

    // Unregister BEFORE any await — the exact mirror of the connect path, which
    // joins the rooms before registering (see `_authenticateJWTUser`) for the
    // symmetric reason.
    //
    // This handler runs on `disconnect`, which Socket.IO emits AFTER the socket
    // has left every room (the manager says so on its own `disconnecting`
    // listener). Delivery is gated purely on `connectedUsers.has(key)`: while
    // this map still holds a socket that is already out of its rooms, an event
    // for that recipient is skipped from the offline queue (they look online)
    // AND reaches no room broadcast — lost outright, with nothing to replay on
    // reconnect. Every `await` between the room exit and this delete is that
    // window.
    //
    // The registered path was safe only by accident: it has no await before
    // here. The anonymous path has one on EVERY guest disconnect — the active
    // call-participation lookup below runs unconditionally, not just when a
    // call is in progress — and it widens exactly under load, when the Prisma
    // queue lengthens, i.e. when a burst of disconnects makes the loss most
    // likely.
    //
    // The reconnect-during-cleanup guard further down keeps its purpose: it now
    // governs the offline DB write and its broadcast alone. Deleting HERE is
    // what makes it correct rather than racy — a reconnect landing during the
    // cleanup re-registers itself afterwards, so there is no longer a delete
    // sequenced after someone else's fresher write.
    this.connectedUsers.delete(userIdOrToken);

    // CALL-RESILIENCE — call lifecycle on disconnect is owned by
    // CallEventsHandler's per-socket disconnect handler (reconnect grace for
    // answered calls, immediate leave pre-answer, shutdown guard). Leaving
    // calls here too marked answered CallSessions ended in DB while their P2P
    // media was still alive (socket blip / gateway restart on a single-device
    // user), defeating that grace window. Anonymous participants are the one
    // case that handler cannot resolve (its lookup is keyed on
    // participant.userId) and they get no reconnect grace (ADR-6) — the
    // immediate auto-leave stays for them only.
    if (isAnonymous) {
      try {
        const activeParticipations = await this.prisma.callParticipant.findMany({
          where: {
            // Audit C5 (2026-07-02) — `{leftAt: null}` alone misses Mongo docs
            // whose leftAt field was never written (pre-C5 participants).
            OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
            participant: { id: userIdOrToken }
          },
          include: {
            callSession: true
          }
        });

        if (activeParticipations.length > 0) {
          logger.debug('disconnect-cleanup: active call participations found', {
            socketId: socket.id,
            userId: userIdOrToken,
            count: activeParticipations.length,
            callIds: activeParticipations.map((p: { callSessionId: string }) => p.callSessionId)
          });
        }

        for (const participation of activeParticipations) {
          try {
            const leftSession = await this.callService.leaveCall({
              callId: participation.callSessionId,
              userId: userIdOrToken,
              participantId: participation.participantId,
              // CALL-RESILIENCE (Vague 43) — this loop only ever runs on socket
              // `disconnect` (see the comment above), never a deliberate
              // call:leave/call:end. Mirrors CallEventsHandler
              // .leaveParticipationAndBroadcast's identical Vague 42 fix: without
              // this hint, leaveCall() defaults to endReason 'completed',
              // misrecording an involuntary drop as a normal hangup.
              endReasonHint: CallEndReason.connectionLost
            });
            // CALL-RESILIENCE (Vague 44) — leaveCall alone never told the other
            // party the guest left: this loop is the only cleanup path for
            // anonymous participants (CallEventsHandler's own disconnect flow
            // is keyed on participant.userId, always null here), and it never
            // broadcast PARTICIPANT_LEFT/call:ended, leaving the other side's
            // UI "in call" until CallCleanupService's ~120s GC.
            await this.broadcastCallParticipantLeft?.({
              leftSession,
              participation: participation as unknown as DisconnectParticipation,
              userId: userIdOrToken
            });
          } catch (error) {
            logger.error('error auto-leaving call on disconnect', { callId: participation.callSessionId, error });
            // Parity with the registered-user path: a rejected leaveCall used
            // to leave this participation open until the ~120s GC. The
            // fallback itself never rejects, but a missing/failing injection
            // must not abort the loop over the remaining participations.
            try {
              await this.forceCleanupCallParticipant?.({
                participation: participation as unknown as DisconnectParticipation,
                userId: userIdOrToken,
                leaveError: error
              });
            } catch (forceError) {
              logger.error('force cleanup failed after leaveCall error on disconnect', {
                callId: participation.callSessionId,
                error: forceError
              });
            }
          }
        }
      } catch (error) {
        logger.error('error checking/leaving active calls on disconnect', { userId: userIdOrToken, error });
      }
    }

    // Guard: a new socket may have reconnected while async cleanup (the
    // anonymous call-participation lookup above awaits Prisma) was in
    // progress. That reconnect's own auth flow already broadcast the correct
    // isOnline:true and repopulated userSockets/connectedUsers — broadcasting
    // isOnline:false below would be a stale last-write-wins clobber of both
    // the room presence event and the DB flag. Bail out entirely in that case.
    //
    // Governs the offline write and its broadcast ONLY: the registry delete now
    // happens above, before the cleanup, so a reconnect that lands here has
    // already re-registered itself and there is nothing left to un-do.
    const stillHasSockets = (this.userSockets.get(userIdOrToken)?.size ?? 0) > 0;
    if (stillHasSockets) {
      return;
    }

    try {
      if (isAnonymous) {
        await this.maintenanceService.updateAnonymousOnlineStatus(userIdOrToken, false, true);
      } else {
        await this.maintenanceService.updateUserOnlineStatus(userIdOrToken, false, true);
      }
    } catch (error) {
      logger.error('error updating offline status on disconnect', { userId: userIdOrToken, error });
    }
  }

  async handleHeartbeat(socket: Socket, data?: { clientTime?: number }): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;

    const serverTime = new Date().toISOString();
    const latencyHintMs = data?.clientTime !== undefined
      ? Date.now() - data.clientTime
      : undefined;

    // Emit ACK before the async DB write so clients get RTT data immediately
    socket.emit(SERVER_EVENTS.HEARTBEAT_ACK, { serverTime, latencyHintMs });

    try {
      const user = this.connectedUsers.get(userIdOrToken);
      if (!user) return;

      // Throttled 60s inside StatusService — a passive-connected socket keeps
      // lastActiveAt fresh (at most one DB write per minute) so it stays
      // 'online' under the 5min anti-stale guard of the 1/3/5 presence rule.
      // No per-beat unthrottled Prisma write here.
      this.statusService.noteHeartbeat(userIdOrToken, user.isAnonymous);
    } catch (error) {
      logger.debug('heartbeat presence refresh failed (best-effort)', { userId: userIdOrToken, error });
    }
  }

  // Engine-level pong (Socket.IO ping/pong, every ~25s on EVERY client
  // platform — `pingInterval: 25000`). C'est le SEUL chemin de rafraichissement
  // de presence sur lequel on puisse compter pour tous les clients : Android
  // n'a jamais emis de heartbeat applicatif, et sans ce chemin un
  // connecte-passif tomberait au-dela de la garde anti-stale de 5 min de la
  // regle de presence 1/3/5 — affiche hors ligne alors que sa socket est vivante.
  // Throttled 60s inside StatusService: at most one DB write + broadcast/min.
  //
  // `CLIENT_EVENTS.HEARTBEAT` ci-dessus ne subsiste que pour iOS (30s, AVEC
  // `clientTime`), qui s'en sert pour le RTT rendu dans `heartbeat:ack`. Le web
  // en emettait un a 90s, NU : aucun `latencyHintMs` calculable, aucun ecouteur
  // pour l'ack, et un `noteHeartbeat` que ce pong-ci avait deja appele 3,6x plus
  // souvent. Il a ete retire (cycle 78) ; la presence web ne tient plus qu'ici.
  handleEnginePong(socket: Socket): void {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;

    const user = this.connectedUsers.get(userIdOrToken);
    if (!user) return;

    try {
      this.statusService.noteHeartbeat(userIdOrToken, user.isAnonymous);
    } catch (error) {
      logger.debug('engine pong presence refresh failed (best-effort)', { userId: userIdOrToken, error });
    }
  }

  // Retries beyond the initial attempt for a rejected conversation room join.
  // Total attempts per room = 1 + JOIN_RETRY_ATTEMPTS. Bounded so a permanently
  // broken adapter can never spin forever; each retry re-attempts only the rooms
  // that STILL failed, so a room that joined on the first try is never re-joined.
  private static readonly JOIN_RETRY_ATTEMPTS = 2;

  /**
   * Joins the socket to each conversation room, retrying only the rooms whose
   * join rejected (transient adapter hiccup). Returns the conversation ids that
   * remained un-joined after all retries were exhausted.
   *
   * A failed-and-un-retried join is silent message loss: the delivery gate
   * (`connectedUsers.has(userId)`) treats the recipient as online and skips the
   * offline queue, yet the missed room means the live `message:new` never
   * arrives either. Retrying closes the common transient case.
   *
   * Sert les DEUX portes d'authentification — l'inscrite sur toutes ses
   * conversations, l'invitée de lien partagé sur son unique room. La porte
   * invitée a longtemps appelé un `socket.join` nu : la garde de parité de
   * `AuthHandler.test.ts` compare désormais le nombre de tentatives des deux
   * portes, pour qu'un réessai ajouté d'un seul côté ne puisse plus tenir.
   */
  private async _joinConversationRoomsWithRetry(socket: Socket, conversationIds: string[]): Promise<string[]> {
    const maxAttempts = 1 + AuthHandler.JOIN_RETRY_ATTEMPTS;
    let pending = conversationIds;
    for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt++) {
      const results = await Promise.allSettled(pending.map(id => socket.join(ROOMS.conversation(id))));
      pending = pending.filter((_, i) => results[i].status === 'rejected');
    }
    return pending;
  }

  private async _joinUserConversations(socket: Socket, userId: string, isAnonymous: boolean): Promise<void> {
    try {
      let conversations: { conversationId: string }[] = [];

      if (isAnonymous) {
        conversations = await this.prisma.participant.findMany({
          where: { id: userId, isActive: true },
          select: { conversationId: true }
        });
      } else {
        conversations = await this.prisma.participant.findMany({
          where: { userId: userId, isActive: true },
          select: { conversationId: true }
        });
      }

      const conversationIds = conversations.map(conv => conv.conversationId);
      const stillFailed = await this._joinConversationRoomsWithRetry(socket, conversationIds);
      if (stillFailed.length > 0) {
        // Escalated to error: after retries, these room joins are genuinely
        // broken. Because delivery gates the offline queue purely on
        // `connectedUsers.has(userId)`, this recipient now looks online but is
        // absent from these rooms — a message sent to them lands nowhere (no
        // live emit, no offline enqueue) until a later reconnect re-joins them.
        logger.error('conversation room joins failed after retries — recipient may miss live messages until reconnect', {
          userId,
          failed: stillFailed.length,
          total: conversationIds.length,
          conversationIds: stillFailed,
        });
      }
      logger.debug('user joined conversation rooms', { userId, count: conversationIds.length - stillFailed.length });
    } catch (error) {
      logger.error('error joining conversations for user', { userId, error });
    }
  }
}
