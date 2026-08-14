/**
 * Location Handler
 * Handles live location sharing events.
 *
 * Real-time only — no Prisma persistence (no Location model in schema).
 * Validates participant membership, then broadcasts to conversation room.
 *
 * ─── Le registre des sessions ────────────────────────────────────────────────
 *
 * « Real-time only » ne veut pas dire « sans état ». Tant que le handler n'a
 * gardé AUCUNE trace des partages en cours, `location:live-stopped` n'était émis
 * que par un `location:live-stop` EXPLICITE, et trois fins de vie n'en
 * produisaient donc aucun :
 *
 *   1. le socket du partageur meurt (arrêt forcé, crash, perte de réseau) — les
 *      pairs gardent une épingle qui se présente comme vivante, figée sur la
 *      dernière position connue, jusqu'à `expiresAt` : **jusqu'à 8 heures**
 *      (`durationMinutes` ≤ 480). Sur une fonction dont le contrat entier est
 *      « voici où je suis MAINTENANT », c'est un défaut de sécurité avant d'être
 *      un défaut d'affichage ;
 *   2. le terme lui-même — `expiresAt` était calculé, expédié, puis oublié : un
 *      indice que le serveur n'appliquait jamais ;
 *   3. et faute d'état, `socket.to(room)` ne touchant que les sockets présents à
 *      l'instant du départ, un participant qui ouvre la conversation ENSUITE
 *      n'apprenait jamais l'existence du partage.
 *
 * Le registre tient une entrée par `(conversationId, userId)` — un compte ne
 * partage qu'une position par conversation, et c'est le DERNIER appareil à
 * l'avoir démarrée qui en est propriétaire. Il est borné par le nombre de
 * partageurs connectés : la déconnexion ferme l'entrée, qui est donc son propre
 * ramasse-miettes.
 *
 * Une session INCONNUE n'est jamais une session TERMINÉE. Après un redémarrage
 * de la passerelle le registre est vide alors que des partages tournent : leurs
 * `live-update` continuent d'être relayés. Couper sur « pas d'entrée » ferait
 * mourir tout partage en cours à chaque déploiement.
 *
 * `conversation:leave` ne retracte RIEN, à l'inverse de la frappe : côté client
 * il signifie « j'ai quitté cet écran », pas « j'ai quitté le groupe » — un
 * partage légitimement poursuivi en arrière-plan y perdrait la vie.
 */

import type { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type {
  SocketIOResponse,
  LocationLiveStartData,
  LocationLiveStartedEventData,
  LocationLiveUpdateData,
  LocationLiveUpdatedEventData,
  LocationLiveStopData,
  LocationLiveStoppedEventData,
} from '@meeshy/shared/types/socketio-events';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';

const logger = enhancedLogger.child({ module: 'LocationHandler' });

export interface LocationHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  normalizeConversationId: (conversationId: string) => Promise<string>;
}

/** Un partage en cours, tel que le serveur le connaît. */
interface LiveLocationSession {
  readonly conversationId: string;
  readonly userId: string;
  readonly username: string;
  /** Le socket qui a démarré CE partage — le seul dont la mort le retire. */
  readonly socketId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly durationMinutes: number;
  readonly startedAt: Date;
  readonly expiresAt: Date;
}

// Préfixée par la longueur plutôt que jointe par un séparateur : les deux
// moitiés sont des identifiants opaques (ObjectId, ou jeton de session pour
// un anonyme), et aucun caractère ne peut être déclaré absent des deux.
const sessionKey = (conversationId: string, userId: string): string =>
  `${conversationId.length}:${conversationId}:${userId}`;

export class LocationHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private normalizeConversationId: (conversationId: string) => Promise<string>;
  private rateLimiter = getSocketRateLimiter();
  private sessions = new Map<string, LiveLocationSession>();
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(deps: LocationHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.normalizeConversationId = deps.normalizeConversationId;
  }

  async handleLiveLocationStart(
    socket: Socket,
    data: LocationLiveStartData,
    callback?: (response: SocketIOResponse<LocationLiveStartedEventData>) => void
  ): Promise<void> {
    try {
      const context = this._getUserContext(socket);
      if (!context) {
        this._sendError(callback, 'User not authenticated');
        return;
      }

      const allowed = await this.rateLimiter.checkLimit(context.userId, SOCKET_RATE_LIMITS.LOCATION_LIVE_START);
      if (!allowed) {
        this._sendError(callback, 'Rate limit exceeded');
        return;
      }

      if (!this._validateCoordinates(data.latitude, data.longitude)) {
        this._sendError(callback, 'Invalid coordinates');
        return;
      }

      if (!data.durationMinutes || data.durationMinutes <= 0 || data.durationMinutes > 480) {
        this._sendError(callback, 'Invalid duration (must be 1-480 minutes)');
        return;
      }

      const normalizedId = await this.normalizeConversationId(data.conversationId);

      const participantId = await this._resolveParticipantId(context, normalizedId);
      if (!participantId) {
        this._sendError(callback, 'Not a participant in this conversation');
        return;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + data.durationMinutes * 60_000);

      const eventData: LocationLiveStartedEventData = {
        conversationId: normalizedId,
        userId: context.userId,
        username: context.displayName,
        latitude: data.latitude,
        longitude: data.longitude,
        durationMinutes: data.durationMinutes,
        expiresAt,
        startedAt: now,
      };

      this._openSession({
        conversationId: normalizedId,
        userId: context.userId,
        username: context.displayName,
        socketId: socket.id,
        latitude: data.latitude,
        longitude: data.longitude,
        durationMinutes: data.durationMinutes,
        startedAt: now,
        expiresAt,
      });

      callback?.({ success: true, data: eventData });
      // Diffuser aux AUTRES participants uniquement (socket.to, pas io.to) : le
      // partageur connaît déjà sa propre session via l'ACK ci-dessus, et les
      // clients traitent tout LOCATION_LIVE_* reçu comme l'état d'un pair DISTANT
      // (cf. StatusHandler typing + CallEventsHandler media-toggle). Un self-echo
      // ferait apparaître le partageur comme un partageur distant sur sa carte.
      socket.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);
    } catch (error: unknown) {
      logger.error('Error handling location:live-start', error);
      this._sendError(callback, error instanceof Error ? error.message : 'Failed to start live location');
    }
  }

  async handleLiveLocationUpdate(
    socket: Socket,
    data: LocationLiveUpdateData
  ): Promise<void> {
    try {
      const context = this._getUserContext(socket);
      if (!context) return;

      const allowed = await this.rateLimiter.checkLimit(context.userId, SOCKET_RATE_LIMITS.LOCATION_LIVE_UPDATE);
      if (!allowed) return;

      if (!this._validateCoordinates(data.latitude, data.longitude)) return;

      const normalizedId = await this.normalizeConversationId(data.conversationId);

      const participantId = await this._resolveParticipantId(context, normalizedId);
      if (!participantId) return;

      const now = new Date();
      const key = sessionKey(normalizedId, context.userId);
      const session = this.sessions.get(key);
      // Passé le terme, la position n'est plus relayée. Sans cette borne le
      // retrait diffusé à l'expiration serait défait par la mise à jour
      // suivante : le pair recevrait un `stopped`, puis un `updated` qui
      // recrée l'épingle. Une session inconnue, elle, passe (cf. l'en-tête).
      if (session && now >= session.expiresAt) return;
      if (session) {
        // La dernière position connue est ce que le rattrapage rejouera : sans
        // ce rafraîchissement, un arrivant recevrait le point de DÉPART, qui
        // peut avoir des heures.
        this.sessions.set(key, { ...session, latitude: data.latitude, longitude: data.longitude });
      }

      const eventData: LocationLiveUpdatedEventData = {
        conversationId: normalizedId,
        userId: context.userId,
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        accuracy: data.accuracy,
        speed: data.speed,
        heading: data.heading,
        timestamp: now,
      };

      // Aux autres participants uniquement — le partageur est la source des
      // updates, un self-echo n'aurait aucune valeur (cf. handleLiveLocationStart).
      socket.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.LOCATION_LIVE_UPDATED, eventData);
    } catch (error: unknown) {
      logger.error('Error handling location:live-update', error);
    }
  }

  async handleLiveLocationStop(
    socket: Socket,
    data: LocationLiveStopData
  ): Promise<void> {
    try {
      const context = this._getUserContext(socket);
      if (!context) return;

      const allowed = await this.rateLimiter.checkLimit(context.userId, SOCKET_RATE_LIMITS.LOCATION_LIVE_STOP);
      if (!allowed) return;

      const normalizedId = await this.normalizeConversationId(data.conversationId);

      const participantId = await this._resolveParticipantId(context, normalizedId);
      if (!participantId) return;

      this._closeSession(sessionKey(normalizedId, context.userId));

      const eventData: LocationLiveStoppedEventData = {
        conversationId: normalizedId,
        userId: context.userId,
        stoppedAt: new Date(),
      };

      // Aux autres participants uniquement (cf. handleLiveLocationStart).
      socket.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.LOCATION_LIVE_STOPPED, eventData);
    } catch (error: unknown) {
      logger.error('Error handling location:live-stop', error);
    }
  }

  /**
   * Retire les partages que CE socket portait. Jumeau exact du `typing:stop`
   * de `StatusHandler.handleSocketDisconnecting` — la position en direct était
   * le seul état éphémère par socket à ne pas l'avoir.
   *
   * Synchrone À DESSEIN : le point d'appel est `disconnecting`, la dernière
   * fenêtre où le socket est encore dans ses rooms. Rien ici n'a besoin de la
   * base — le registre porte déjà tout — et une seule `await` suffirait à
   * laisser la diffusion partir après la sortie des rooms.
   *
   * La propriété est portée par la session, pas par le compte : un second
   * appareil qui a repris le partage de la même conversation en est devenu
   * propriétaire, et la mort du premier ne le retire donc pas.
   */
  handleSocketDisconnecting(socketId: string): void {
    const now = new Date();
    for (const [key, session] of [...this.sessions]) {
      if (session.socketId !== socketId) continue;
      // Une entrée SURVIT à son terme — c'est elle qui fait taire les
      // `live-update` d'après, et c'est cette déconnexion qui la ramasse. Mais
      // son retrait a déjà été diffusé par la minuterie : le rediffuser ici
      // annoncerait deux fois la même fin.
      const wasLive = now < session.expiresAt;
      this._closeSession(key);
      if (wasLive) this._broadcastStopped(session);
    }
  }

  /**
   * Rejoue les partages en cours au socket qui entre dans la conversation.
   *
   * Le seul rattrapage possible : `location:live-started` n'existe pas en
   * version « snapshot », et les clients savent déjà le traiter. La position
   * servie est la DERNIÈRE connue, pas celle du départ.
   *
   * Le partageur ne se reçoit jamais lui-même : les clients lisent tout
   * `LOCATION_LIVE_*` comme l'état d'un pair DISTANT, un self-echo le ferait
   * apparaître comme partageur distant sur sa propre carte (même raison que
   * `socket.to` plutôt que `io.to` dans les trois diffusions).
   */
  replayLiveLocationsTo(socket: Socket, conversationId: string): void {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;
    const joiner = getConnectedUser(userIdOrToken, this.connectedUsers);
    if (!joiner) return;

    const now = new Date();
    for (const session of this.sessions.values()) {
      if (session.conversationId !== conversationId) continue;
      if (session.userId === joiner.realUserId) continue;
      if (now >= session.expiresAt) continue;

      const eventData: LocationLiveStartedEventData = {
        conversationId: session.conversationId,
        userId: session.userId,
        username: session.username,
        latitude: session.latitude,
        longitude: session.longitude,
        durationMinutes: session.durationMinutes,
        expiresAt: session.expiresAt,
        startedAt: session.startedAt,
      };
      socket.emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);
    }
  }

  /** Désarme les minuteries — arrêt de la passerelle, et isolation des tests. */
  dispose(): void {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.sessions.clear();
  }

  private _openSession(session: LiveLocationSession): void {
    const key = sessionKey(session.conversationId, session.userId);
    // Un redémarrage remplace la session précédente : sa minuterie doit mourir
    // avec elle, sinon l'ancien terme retirerait le NOUVEAU partage.
    this._closeSession(key);
    this.sessions.set(key, session);

    const timer = setTimeout(() => {
      this.expiryTimers.delete(key);
      // L'entrée SURVIT à son terme, elle n'est pas supprimée ici : c'est elle
      // qui fait taire les `live-update` d'après (cf. handleLiveLocationUpdate).
      // La déconnexion du partageur est ce qui la ramasse.
      this._broadcastStopped(session);
    }, Math.max(0, session.expiresAt.getTime() - session.startedAt.getTime()));
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
    this.expiryTimers.set(key, timer);
  }

  private _closeSession(key: string): void {
    const timer = this.expiryTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(key);
    }
    this.sessions.delete(key);
  }

  /**
   * Diffusion À TOUTE la room, partageur inclus — la seule des quatre à ne pas
   * passer par `socket.to`. Elle porte une décision du SERVEUR (le terme est
   * atteint, ou le socket est mort), pas le geste d'un pair : le partageur doit
   * l'apprendre pour cesser d'émettre. Les clients rangent les
   * `LOCATION_LIVE_*` par `userId` de pair distant, où sa propre entrée n'existe
   * pas — un self-echo de `stopped` y est donc sans effet, et il est le seul
   * point d'accroche possible pour un client qui voudra arrêter sa minuterie.
   */
  private _broadcastStopped(session: LiveLocationSession): void {
    const eventData: LocationLiveStoppedEventData = {
      conversationId: session.conversationId,
      userId: session.userId,
      stoppedAt: new Date(),
    };
    this.io.to(ROOMS.conversation(session.conversationId)).emit(
      SERVER_EVENTS.LOCATION_LIVE_STOPPED,
      eventData
    );
  }

  private _getUserContext(socket: Socket): { userId: string; isAnonymous: boolean; participantId?: string; displayName: string } | null {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return null;

    const result = getConnectedUser(userIdOrToken, this.connectedUsers);
    if (!result) return null;

    return {
      userId: result.realUserId,
      isAnonymous: result.user.isAnonymous,
      participantId: result.user.participantId,
      displayName: result.user.displayName || 'Unknown',
    };
  }

  private async _resolveParticipantId(
    context: { userId: string; isAnonymous: boolean; participantId?: string },
    conversationId: string
  ): Promise<string | undefined> {
    if (context.isAnonymous) {
      if (!context.participantId) return undefined;
      const participant = await this.prisma.participant.findFirst({
        where: { id: context.participantId, conversationId, isActive: true },
        select: { id: true },
      });
      return participant?.id;
    }

    const participant = await this.prisma.participant.findFirst({
      where: { userId: context.userId, conversationId, isActive: true },
      select: { id: true },
    });
    return participant?.id;
  }

  private _validateCoordinates(latitude: number, longitude: number): boolean {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  private _sendError<T>(callback: ((response: SocketIOResponse<T>) => void) | undefined, message: string): void {
    callback?.({ success: false, error: message });
  }
}
