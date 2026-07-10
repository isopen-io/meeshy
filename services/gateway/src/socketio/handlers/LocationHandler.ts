/**
 * Location Handler
 * Handles static and live location sharing events.
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
  LocationShareData,
  LocationSharedEventData,
  LocationLiveStartData,
  LocationLiveStartedEventData,
  LocationLiveUpdateData,
  LocationLiveUpdatedEventData,
  LocationLiveStopData,
  LocationLiveStoppedEventData,
} from '@meeshy/shared/types/socketio-events';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'LocationHandler' });

export interface LocationHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  normalizeConversationId: (conversationId: string) => Promise<string>;
}

export class LocationHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private normalizeConversationId: (conversationId: string) => Promise<string>;

  constructor(deps: LocationHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.normalizeConversationId = deps.normalizeConversationId;
  }

  async handleLocationShare(
    socket: Socket,
    data: LocationShareData,
    callback?: (response: SocketIOResponse<LocationSharedEventData>) => void
  ): Promise<void> {
    try {
      const context = this._getUserContext(socket);
      if (!context) {
        this._sendError(callback, 'User not authenticated');
        return;
      }

      if (!this._validateCoordinates(data.latitude, data.longitude)) {
        this._sendError(callback, 'Invalid coordinates');
        return;
      }

      const participantId = await this._resolveParticipantId(context, data.conversationId);
      if (!participantId) {
        this._sendError(callback, 'Not a participant in this conversation');
        return;
      }

      const normalizedId = await this.normalizeConversationId(data.conversationId);

      const eventData: LocationSharedEventData = {
        messageId: this._generateTempId(),
        conversationId: normalizedId,
        userId: context.userId,
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        accuracy: data.accuracy,
        placeName: data.placeName,
        address: data.address,
        timestamp: new Date(),
      };

      callback?.({ success: true, data: eventData });
      this.io.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.LOCATION_SHARED, eventData);
    } catch (error: unknown) {
      logger.error('Error handling location:share', error);
      this._sendError(callback, error instanceof Error ? error.message : 'Failed to share location');
    }
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

      if (!this._validateCoordinates(data.latitude, data.longitude)) {
        this._sendError(callback, 'Invalid coordinates');
        return;
      }

      if (!data.durationMinutes || data.durationMinutes <= 0 || data.durationMinutes > 480) {
        this._sendError(callback, 'Invalid duration (must be 1-480 minutes)');
        return;
      }

      const participantId = await this._resolveParticipantId(context, data.conversationId);
      if (!participantId) {
        this._sendError(callback, 'Not a participant in this conversation');
        return;
      }

      const normalizedId = await this.normalizeConversationId(data.conversationId);
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
      this.io.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);
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

      if (!this._validateCoordinates(data.latitude, data.longitude)) return;

      const participantId = await this._resolveParticipantId(context, data.conversationId);
      if (!participantId) return;

      const normalizedId = await this.normalizeConversationId(data.conversationId);

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

      this.io.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.LOCATION_LIVE_UPDATED, eventData);
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

      const participantId = await this._resolveParticipantId(context, data.conversationId);
      if (!participantId) return;

      const normalizedId = await this.normalizeConversationId(data.conversationId);

      const eventData: LocationLiveStoppedEventData = {
        conversationId: normalizedId,
        userId: context.userId,
        stoppedAt: new Date(),
      };

      this.io.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.LOCATION_LIVE_STOPPED, eventData);
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
    if (context.isAnonymous) return context.participantId;

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

  private _generateTempId(): string {
    return `loc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
