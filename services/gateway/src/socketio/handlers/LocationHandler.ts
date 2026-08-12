/**
 * Location Handler
 * Handles live location sharing events.
 *
 * Real-time only — no Prisma persistence (no Location model in schema).
 * Validates participant membership, then broadcasts to conversation room.
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

export class LocationHandler {
  private prisma: PrismaClient;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private normalizeConversationId: (conversationId: string) => Promise<string>;
  private rateLimiter = getSocketRateLimiter();

  constructor(deps: LocationHandlerDependencies) {
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

      const eventData: LocationLiveUpdatedEventData = {
        conversationId: normalizedId,
        userId: context.userId,
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        accuracy: data.accuracy,
        speed: data.speed,
        heading: data.heading,
        timestamp: new Date(),
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
