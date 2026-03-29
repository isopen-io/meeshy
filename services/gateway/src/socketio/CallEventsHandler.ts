/**
 * CallEventsHandler - Socket.IO event handler for video/audio calls (Phase 1A: P2P MVP)
 *
 * Handles:
 * - Call initiation
 * - Participant joining/leaving
 * - WebRTC signaling (SDP, ICE candidates)
 * - Media state toggles (audio/video)
 * - Broadcasting events to participants
 */

import { Socket } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { CallService } from '../services/CallService';
import { NotificationService } from '../services/notifications/NotificationService';
import { logger } from '../utils/logger';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../middleware/validation';
import {
  socketInitiateCallSchema,
  socketJoinCallSchema,
  socketLeaveCallSchema,
  socketSignalSchema,
  socketMediaToggleSchema,
  socketEndCallSchema,
  socketHeartbeatSchema,
  socketQualityReportSchema,
  socketReconnectingSchema,
  socketReconnectedSchema
} from '../validation/call-schemas';
import { getSocketRateLimiter, checkSocketRateLimit, SOCKET_RATE_LIMITS } from '../utils/socket-rate-limiter';
import type {
  CallInitiateEvent,
  CallInitiatedEvent,
  CallJoinEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallSignalEvent,
  CallEndedEvent,
  CallMediaToggleEvent,
  CallError,
  CallHeartbeatEvent,
  CallQualityReportEvent,
  CallReconnectingEvent,
  CallReconnectedEvent,
  CallInitiateAck,
  CallJoinAck,
  CallEndReason,
} from '@meeshy/shared/types/video-call';

// ICE servers configuration (STUN/TURN)
const ICE_SERVERS_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
    // TODO: Add TURN servers for production
    // {
    //   urls: 'turn:turn.meeshy.me:3478',
    //   username: 'username',
    //   credential: 'password'
    // }
  ]
};

export class CallEventsHandler {
  private callService: CallService;
  private notificationService: NotificationService | null = null;
  private rateLimiter = getSocketRateLimiter();

  constructor(private prisma: PrismaClient) {
    this.callService = new CallService(prisma);
  }

  private async resolveParticipantId(userId: string, conversationId: string): Promise<string | null> {
    const participant = await this.prisma.participant.findFirst({
      where: { userId, conversationId, isActive: true },
      select: { id: true }
    });
    return participant?.id ?? null;
  }

  private async resolveParticipantIdFromCall(userId: string, callId: string): Promise<string | null> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      select: { conversationId: true }
    });
    if (!call) return null;
    return this.resolveParticipantId(userId, call.conversationId);
  }

  /**
   * Resolve target userId to their socket IDs within a call room
   */
  private async resolveTargetSockets(
    io: any,
    callId: string,
    targetUserId: string,
    getUserId: (socketId: string) => string | undefined
  ): Promise<string[]> {
    const socketsInRoom = await io.in(ROOMS.call(callId)).fetchSockets();
    const targetSocketIds: string[] = [];
    for (const s of socketsInRoom) {
      const socketUserId = getUserId(s.id);
      if (socketUserId === targetUserId) {
        targetSocketIds.push(s.id);
      }
    }
    return targetSocketIds;
  }

  /**
   * Initialiser le service de notifications
   */
  setNotificationService(notificationService: NotificationService): void {
    this.notificationService = notificationService;
    logger.info('📢 CallEventsHandler: NotificationService initialized');
  }

  /**
   * Setup call-related event listeners on socket
   * CVE-004: Added getUserInfo callback to check if user is anonymous
   */
  setupCallEvents(
    socket: Socket,
    io: any,
    getUserId: (socketId: string) => string | undefined,
    getUserInfo?: (socketId: string) => { id: string; isAnonymous: boolean } | undefined
  ): void {
    /**
     * call:initiate - Client initiates a new call
     * CVE-002: Added rate limiting (5 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.INITIATE, async (data: CallInitiateEvent, ack?: (response: CallInitiateAck) => void) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_INITIATE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketInitiateCallSchema, data);
        if (!validation.success) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: (validation as any).error,
            details: (validation as any).details
          } as any);
          return;
        }

        logger.info('📞 Socket: call:initiate', {
          socketId: socket.id,
          userId,
          conversationId: data.conversationId,
          type: data.type
        });

        // Resolve participantId from userId + conversationId
        const participantId = await this.resolveParticipantId(userId, data.conversationId);
        if (!participantId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation'
          } as CallError);
          return;
        }

        // Initiate call via service
        const callSession = await this.callService.initiateCall({
          conversationId: data.conversationId,
          initiatorId: userId,
          participantId,
          type: data.type,
          settings: data.settings as any
        });

        // CRITICAL: Initiator must join the call room to receive participant-joined events
        socket.join(ROOMS.call(callSession.id));

        logger.info('✅ Socket: Initiator joined call room', {
          callId: callSession.id,
          userId,
          room: ROOMS.call(callSession.id)
        });

        // Prepare event data
        const initiatedEvent: CallInitiatedEvent = {
          callId: callSession.id,
          conversationId: data.conversationId,
          mode: callSession.mode,
          initiator: {
            userId: callSession.initiator.id,
            username: callSession.initiator.username,
            avatar: callSession.initiator.avatar
          },
          participants: callSession.participants.map((p: any) => ({
            id: p.id,
            callSessionId: p.callSessionId,
            userId: p.participant?.userId || p.participantId,
            role: p.role,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            isAudioEnabled: p.isAudioEnabled,
            isVideoEnabled: p.isVideoEnabled,
            connectionQuality: p.connectionQuality as any,
            username: p.participant?.user?.username || p.participant?.displayName,
            displayName: p.participant?.displayName || p.participant?.user?.displayName,
            avatar: p.participant?.user?.avatar || p.participant?.avatar
          }))
        };

        // ACK to initiator with callId and mode
        ack?.({ success: true, data: { callId: callSession.id, mode: callSession.mode } });

        // Also emit call:initiated to initiator socket
        socket.emit(CALL_EVENTS.INITIATED, initiatedEvent);

        // Get all conversation participants and send to their sockets directly
        const conversationParticipants = await this.prisma.participant.findMany({
          where: {
            conversationId: data.conversationId,
            isActive: true,
            userId: { not: null }
          },
          select: {
            userId: true
          }
        });

        const memberUserIds = conversationParticipants.map(p => p.userId!).filter(Boolean);
        logger.info('📋 Conversation members to notify', {
          conversationId: data.conversationId,
          memberUserIds
        });

        // Send call:initiated to ALL member sockets (not just those in the room)
        const allSockets = await io.fetchSockets();
        let notifiedSocketsCount = 0;

        for (const memberSocket of allSockets) {
          const socketUserId = getUserId(memberSocket.id);
          if (socketUserId && memberUserIds.includes(socketUserId)) {
            memberSocket.emit(CALL_EVENTS.INITIATED, initiatedEvent);
            notifiedSocketsCount++;
            logger.debug('📤 Sent call:initiated to member socket', {
              socketId: memberSocket.id,
              userId: socketUserId
            });
          }
        }

        // ALSO broadcast to conversation room for backwards compatibility
        const roomName = ROOMS.conversation(data.conversationId);
        io.to(roomName).emit(CALL_EVENTS.INITIATED, initiatedEvent);

        logger.info('✅ Socket: Call initiated and broadcasted to all members', {
          callId: callSession.id,
          conversationId: data.conversationId,
          totalMembers: memberUserIds.length,
          notifiedSockets: notifiedSocketsCount,
          roomName
        });
      } catch (error: any) {
        logger.error('Error initiating call', error);

        const errorMessage = error.message || 'Failed to initiate call';
        const errorCode = errorMessage.split(':')[0];
        const message = errorMessage.includes(':')
          ? errorMessage.split(':').slice(1).join(':').trim()
          : errorMessage;

        ack?.({ success: false, error: { code: errorCode, message } });
        socket.emit(CALL_EVENTS.ERROR, { code: errorCode, message } as CallError);
      }
    });

    /**
     * call:join - Client joins an existing call
     * CVE-002: Added rate limiting (20 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.JOIN, async (data: CallJoinEvent, ack?: (response: CallJoinAck) => void) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_JOIN,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketJoinCallSchema, data);
        if (!validation.success) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: (validation as any).error,
            details: (validation as any).details
          } as any);
          return;
        }

        logger.info('📞 Socket: call:join', {
          socketId: socket.id,
          userId,
          callId: data.callId
        });

        // Resolve participantId from userId + callId
        const joinParticipantId = await this.resolveParticipantIdFromCall(userId, data.callId);
        if (!joinParticipantId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation'
          } as CallError);
          return;
        }

        // CVE-005: Join call via service (returns dynamic ICE servers)
        const joinResult = await this.callService.joinCall({
          callId: data.callId,
          userId,
          participantId: joinParticipantId,
          settings: data.settings
        });

        const { callSession, iceServers } = joinResult;

        // Join call room
        socket.join(ROOMS.call(data.callId));

        // Get the participant that just joined
        const participant = callSession.participants.find(
          (p: any) => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
        );

        if (!participant) {
          throw new Error('Participant not found after joining');
        }

        // Prepare event data
        const pAny = participant as any;
        const joinedEvent: CallParticipantJoinedEvent = {
          callId: callSession.id,
          participant: {
            id: participant.id,
            callSessionId: participant.callSessionId,
            userId: pAny.participant?.userId || participant.participantId,
            role: participant.role,
            joinedAt: participant.joinedAt,
            leftAt: participant.leftAt,
            isAudioEnabled: participant.isAudioEnabled,
            isVideoEnabled: participant.isVideoEnabled,
            connectionQuality: participant.connectionQuality as any,
            username: pAny.participant?.user?.username || pAny.participant?.displayName,
            displayName: pAny.participant?.displayName || pAny.participant?.user?.displayName,
            avatar: pAny.participant?.user?.avatar || pAny.participant?.avatar
          },
          mode: callSession.mode
        };

        // ACK with call session and ICE servers (with time-limited TURN credentials)
        ack?.({ success: true, data: { callSession: callSession as any, iceServers } });

        // Broadcast to all OTHER call participants (exclude the participant who just joined)
        // They already received their confirmation via call:join
        socket.to(ROOMS.call(data.callId)).emit(
          CALL_EVENTS.PARTICIPANT_JOINED,
          joinedEvent
        );

        logger.info('✅ Socket: User joined call', {
          callId: data.callId,
          userId,
          participantId: participant.id
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error joining call', error);

        const errorMessage = error.message || 'Failed to join call';
        const errorCode = errorMessage.split(':')[0];
        const message = errorMessage.includes(':')
          ? errorMessage.split(':').slice(1).join(':').trim()
          : errorMessage;

        socket.emit(CALL_EVENTS.ERROR, {
          code: errorCode,
          message
        } as CallError);
      }
    });

    /**
     * call:leave - Client leaves a call
     * CVE-002: Added rate limiting (20 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.LEAVE, async (data: { callId: string }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_LEAVE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketLeaveCallSchema, data);
        if (!validation.success) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: (validation as any).error,
            details: (validation as any).details
          } as any);
          return;
        }

        logger.info('📞 Socket: call:leave', {
          socketId: socket.id,
          userId,
          callId: data.callId
        });

        // Find participant before leaving
        const callBefore = await this.callService.getCallSession(data.callId);
        const participant = callBefore.participants.find(
          (p: any) => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
        );

        if (!participant) {
          logger.warn('⚠️ Socket: User not in call', { userId, callId: data.callId });
          return;
        }

        // Resolve participantId from userId + callId
        const leaveParticipantId = await this.resolveParticipantIdFromCall(userId, data.callId);

        // Leave call via service
        const callSession = await this.callService.leaveCall({
          callId: data.callId,
          userId,
          participantId: leaveParticipantId || userId
        });

        // Prepare event data BEFORE leaving room
        const leftEvent: CallParticipantLeftEvent = {
          callId: callSession.id,
          participantId: participant.id,
          userId: (participant as any).participant?.userId || participant.participantId,
          mode: callSession.mode
        };

        // Get all sockets in the room for debugging
        const socketsInRoom = await io.in(ROOMS.call(data.callId)).fetchSockets();

        logger.info('📤 Broadcasting call:participant-left event', {
          callId: data.callId,
          participantId: participant.id,
          userId: (participant as any).participant?.userId || participant.participantId,
          remainingParticipants: callSession.participants.filter(p => !p.leftAt).length,
          roomName: ROOMS.call(data.callId),
          socketsInRoom: socketsInRoom.length,
          socketIds: socketsInRoom.map(s => s.id),
          leavingSocketId: socket.id
        });

        // IMPORTANT: Broadcast BEFORE leaving room to ensure message delivery
        io.to(ROOMS.call(data.callId)).emit(
          CALL_EVENTS.PARTICIPANT_LEFT,
          leftEvent
        );

        // Leave call room AFTER broadcasting
        socket.leave(ROOMS.call(data.callId));

        // If call ended, broadcast to BOTH call room AND conversation room
        if (callSession.status === 'ended') {
          const endedEvent: CallEndedEvent = {
            callId: callSession.id,
            duration: callSession.duration || 0,
            endedBy: userId,
            reason: (callSession.endReason || 'completed') as CallEndReason
          };

          io.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.ENDED, endedEvent);
          io.to(ROOMS.conversation(callSession.conversationId)).emit(CALL_EVENTS.ENDED, endedEvent);

          logger.info('Call ended - last participant left', {
            callId: data.callId,
            duration: callSession.duration
          });
        } else {
          logger.info('✅ Socket: User left call', {
            callId: data.callId,
            userId
          });
        }
      } catch (error: any) {
        logger.error('❌ Socket: Error leaving call', error);

        const errorMessage = error.message || 'Failed to leave call';
        const errorCode = errorMessage.split(':')[0];
        const message = errorMessage.includes(':')
          ? errorMessage.split(':').slice(1).join(':').trim()
          : errorMessage;

        socket.emit(CALL_EVENTS.ERROR, {
          code: errorCode,
          message
        } as CallError);
      }
    });

    /**
     * call:force-leave - Force cleanup of any active calls in a conversation
     * This is used when "call already active" error occurs to cleanup stale calls
     */
    socket.on('call:force-leave', async (data: { conversationId: string }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        logger.info('📞 Socket: call:force-leave', {
          socketId: socket.id,
          userId,
          conversationId: data.conversationId
        });

        // Find any active calls in this conversation
        const activeCalls = await this.prisma.callSession.findMany({
          where: {
            conversationId: data.conversationId,
            status: { in: ['initiated', 'ringing', 'active'] }
          },
          include: {
            participants: true
          }
        });

        // Force leave each active call where user is a participant
        for (const call of activeCalls) {
          const participant = call.participants.find(
            (p: any) => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
          );

          if (participant) {
            logger.info('🔄 Force leaving call', {
              callId: call.id,
              userId,
              participantId: participant.id
            });

            try {
              // Resolve participantId for cleanup
              const cleanupParticipantId = await this.resolveParticipantIdFromCall(userId, call.id);

              // Leave the call
              const callSession = await this.callService.leaveCall({
                callId: call.id,
                userId,
                participantId: cleanupParticipantId || userId
              });

              // Broadcast participant left event
              const leftEvent: CallParticipantLeftEvent = {
                callId: callSession.id,
                participantId: participant.id,
                userId: (participant as any).participant?.userId || participant.participantId,
                mode: callSession.mode
              };

              io.to(ROOMS.call(call.id)).emit(
                CALL_EVENTS.PARTICIPANT_LEFT,
                leftEvent
              );

              // Leave the room
              socket.leave(ROOMS.call(call.id));

              if (callSession.status === 'ended') {
                const endedEvent: CallEndedEvent = {
                  callId: callSession.id,
                  duration: callSession.duration || 0,
                  endedBy: userId,
                  reason: (callSession.endReason || 'completed') as CallEndReason
                };

                io.to(ROOMS.call(call.id)).emit(CALL_EVENTS.ENDED, endedEvent);
                io.to(ROOMS.conversation(callSession.conversationId)).emit(CALL_EVENTS.ENDED, endedEvent);
              }
            } catch (leaveError) {
              logger.error('❌ Error force leaving call', { callId: call.id, error: leaveError });
            }
          }
        }

        logger.info('✅ Force cleanup completed', {
          conversationId: data.conversationId,
          userId,
          callsProcessed: activeCalls.length
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error force leaving calls', error);
        socket.emit(CALL_EVENTS.ERROR, {
          code: 'FORCE_LEAVE_ERROR',
          message: error.message || 'Failed to force leave calls'
        } as CallError);
      }
    });

    /**
     * call:signal - WebRTC signaling (SDP offer/answer, ICE candidates)
     * CVE-001: Added WebRTC signal validation with size limits
     * CVE-002: Added rate limiting (100 req/10s)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.SIGNAL, async (data: CallSignalEvent, ack?: (response: { success: boolean }) => void) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check (strict for signals to prevent spam)
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.CALL_SIGNAL,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-001 & CVE-006: Validate signal data structure and size
        const validation = validateSocketEvent(socketSignalSchema, data);
        if (!validation.success) {
          logger.warn('Invalid WebRTC signal', {
            userId,
            error: (validation as any).error,
            details: (validation as any).details
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.INVALID_SIGNAL,
            message: (validation as any).error,
            details: (validation as any).details
          } as any);
          return;
        }

        logger.info('📞 Socket: call:signal', {
          socketId: socket.id,
          userId,
          callId: data.callId,
          signalType: data.signal.type,
          from: data.signal.from,
          to: data.signal.to
        });

        // CVE-001: Verify sender is actually a participant in the call
        const callSession = await this.callService.getCallSession(data.callId);
        const senderParticipant = callSession.participants.find(
          (p: any) => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
        );

        if (!senderParticipant) {
          logger.warn('⚠️ Socket: Sender not a participant in call', {
            userId,
            callId: data.callId
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not in this call'
          } as CallError);
          return;
        }

        // CVE-001: Verify signal.from matches the authenticated user
        if (data.signal.from !== userId && data.signal.from !== senderParticipant.participantId) {
          logger.warn('⚠️ Socket: Signal sender mismatch', {
            userId,
            signalFrom: data.signal.from,
            callId: data.callId
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.SIGNAL_SENDER_MISMATCH,
            message: 'Signal sender does not match authenticated user'
          });
          return;
        }

        // CVE-001: Find and validate target participant
        const targetParticipant = callSession.participants.find(
          (p: any) => ((p.participant?.userId || p.participantId) === data.signal.to) && !p.leftAt
        );

        if (!targetParticipant) {
          logger.warn('⚠️ Socket: Target participant not found', {
            callId: data.callId,
            targetId: data.signal.to
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.TARGET_NOT_FOUND,
            message: 'Target participant not found in call'
          });
          return;
        }

        // TARGETED EMIT: Forward signal ONLY to the target participant's sockets
        // Resolves target userId to their socketIds within the call room
        const targetUserId = (targetParticipant as any).participant?.userId || targetParticipant.participantId;
        const targetSocketIds = await this.resolveTargetSockets(io, data.callId, targetUserId, getUserId);

        if (targetSocketIds.length === 0) {
          logger.warn('Target participant has no active sockets', {
            callId: data.callId,
            targetUserId
          });
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.TARGET_NOT_FOUND,
            message: 'Target participant has no active connection'
          });
          ack?.({ success: false });
          return;
        }

        for (const targetSocketId of targetSocketIds) {
          io.to(targetSocketId).emit(CALL_EVENTS.SIGNAL, data);
        }

        // Transition to active on first successful signal exchange
        if (data.signal.type === 'answer') {
          await this.callService.updateCallStatus(data.callId, 'active' as any).catch(() => {});
        }

        ack?.({ success: true });

        logger.info('Signal forwarded (targeted)', {
          callId: data.callId,
          from: data.signal.from,
          to: targetUserId,
          type: data.signal.type,
          targetSockets: targetSocketIds.length
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error forwarding signal', error);

        socket.emit(CALL_EVENTS.ERROR, {
          code: 'SIGNAL_FAILED',
          message: 'Failed to forward WebRTC signal'
        } as CallError);
      }
    });

    /**
     * call:toggle-audio - Toggle audio on/off
     * CVE-002: Added rate limiting (50 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.TOGGLE_AUDIO, async (data: CallMediaToggleEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.MEDIA_TOGGLE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketMediaToggleSchema, data);
        if (!validation.success) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: (validation as any).error,
            details: (validation as any).details
          } as any);
          return;
        }

        logger.info('📞 Socket: call:toggle-audio', {
          socketId: socket.id,
          userId,
          callId: data.callId,
          enabled: data.enabled
        });

        // Update participant media state
        await this.callService.updateParticipantMedia(
          data.callId,
          userId,
          'audio',
          data.enabled
        );

        // Broadcast to all call participants
        const toggleEvent: CallMediaToggleEvent = {
          callId: data.callId,
          participantId: userId,
          mediaType: 'audio',
          enabled: data.enabled
        };

        io.to(ROOMS.call(data.callId)).emit(
          CALL_EVENTS.MEDIA_TOGGLED,
          toggleEvent
        );

        logger.info('✅ Socket: Audio toggled', {
          callId: data.callId,
          userId,
          enabled: data.enabled
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error toggling audio', error);

        socket.emit(CALL_EVENTS.ERROR, {
          code: 'MEDIA_TOGGLE_FAILED',
          message: 'Failed to toggle audio'
        } as CallError);
      }
    });

    /**
     * call:toggle-video - Toggle video on/off
     * CVE-002: Added rate limiting (50 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.TOGGLE_VIDEO, async (data: CallMediaToggleEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-002: Rate limiting check
        const rateLimitPassed = await checkSocketRateLimit(
          socket,
          userId,
          SOCKET_RATE_LIMITS.MEDIA_TOGGLE,
          this.rateLimiter,
          CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) return;

        // CVE-006: Validate input data
        const validation = validateSocketEvent(socketMediaToggleSchema, data);
        if (!validation.success) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: (validation as any).error,
            details: (validation as any).details
          } as any);
          return;
        }

        logger.info('📞 Socket: call:toggle-video', {
          socketId: socket.id,
          userId,
          callId: data.callId,
          enabled: data.enabled
        });

        // Update participant media state
        await this.callService.updateParticipantMedia(
          data.callId,
          userId,
          'video',
          data.enabled
        );

        // Broadcast to all call participants
        const toggleEvent: CallMediaToggleEvent = {
          callId: data.callId,
          participantId: userId,
          mediaType: 'video',
          enabled: data.enabled
        };

        io.to(ROOMS.call(data.callId)).emit(
          CALL_EVENTS.MEDIA_TOGGLED,
          toggleEvent
        );

        logger.info('✅ Socket: Video toggled', {
          callId: data.callId,
          userId,
          enabled: data.enabled
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error toggling video', error);

        socket.emit(CALL_EVENTS.ERROR, {
          code: 'MEDIA_TOGGLE_FAILED',
          message: 'Failed to toggle video'
        } as CallError);
      }
    });

    /**
     * call:end - End a call (ANY active participant can end in P2P)
     * CVE-004: Anonymous users still blocked
     */
    socket.on(CALL_EVENTS.END, async (data: { callId: string; reason?: string }, ack?: (response: { success: boolean }) => void) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          ack?.({ success: false });
          return;
        }

        // Rate limiting
        const rateLimitPassed = await checkSocketRateLimit(
          socket, userId, SOCKET_RATE_LIMITS.CALL_LEAVE, this.rateLimiter, CALL_EVENTS.ERROR
        );
        if (!rateLimitPassed) { ack?.({ success: false }); return; }

        // Validate
        const validation = validateSocketEvent(socketEndCallSchema, data);
        if (!validation.success) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.VALIDATION_ERROR,
            message: (validation as any).error
          } as any);
          ack?.({ success: false });
          return;
        }

        const userInfo = getUserInfo?.(socket.id);
        const isAnonymous = userInfo?.isAnonymous || false;

        const endParticipantId = await this.resolveParticipantIdFromCall(userId, data.callId);
        if (!endParticipantId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
            message: 'You are not a participant in this conversation'
          } as CallError);
          ack?.({ success: false });
          return;
        }

        const callSession = await this.callService.endCall(
          data.callId, userId, endParticipantId, isAnonymous, data.reason
        );

        const endReason = (callSession.endReason || 'completed') as CallEndReason;

        const endedEvent: CallEndedEvent = {
          callId: callSession.id,
          duration: callSession.duration || 0,
          endedBy: userId,
          reason: endReason
        };

        // Broadcast to both call room and conversation room
        io.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.ENDED, endedEvent);
        io.to(ROOMS.conversation(callSession.conversationId)).emit(CALL_EVENTS.ENDED, endedEvent);

        // Cleanup: remove all sockets from call room
        const socketsInCallRoom = await io.in(ROOMS.call(data.callId)).fetchSockets();
        for (const s of socketsInCallRoom) {
          s.leave(ROOMS.call(data.callId));
        }

        ack?.({ success: true });

        logger.info('Call ended by user', {
          callId: data.callId,
          endedBy: userId,
          duration: callSession.duration,
          reason: endReason
        });
      } catch (error: any) {
        logger.error('Error ending call', error);
        const errorMessage = error.message || 'Failed to end call';
        const errorCode = errorMessage.split(':')[0];
        const message = errorMessage.includes(':')
          ? errorMessage.split(':').slice(1).join(':').trim()
          : errorMessage;
        ack?.({ success: false });
        socket.emit(CALL_EVENTS.ERROR, { code: errorCode, message } as CallError);
      }
    });

    /**
     * call:heartbeat - Fire-and-forget heartbeat to prevent zombie calls
     */
    socket.on(CALL_EVENTS.HEARTBEAT, async (data: CallHeartbeatEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        const validation = validateSocketEvent(socketHeartbeatSchema, data);
        if (!validation.success) return;

        const participantId = await this.resolveParticipantIdFromCall(userId, data.callId);
        if (participantId) {
          this.callService.recordHeartbeat(data.callId, participantId);
        }
      } catch (error) {
        logger.error('Error recording heartbeat', { error });
      }
    });

    /**
     * call:quality-report - Fire-and-forget quality stats
     */
    socket.on(CALL_EVENTS.QUALITY_REPORT, async (data: CallQualityReportEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        const validation = validateSocketEvent(socketQualityReportSchema, data);
        if (!validation.success) return;

        // Check quality thresholds and emit alerts if needed
        const { stats } = data;
        if (stats.rtt > 300 || stats.packetLoss > 5) {
          const participantId = await this.resolveParticipantIdFromCall(userId, data.callId);
          if (participantId) {
            const metric = stats.rtt > 300 ? 'rtt' : 'packetLoss';
            const value = metric === 'rtt' ? stats.rtt : stats.packetLoss;
            const threshold = metric === 'rtt' ? 300 : 5;

            io.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.QUALITY_ALERT, {
              callId: data.callId,
              participantId,
              metric,
              value,
              threshold
            });
          }
        }
      } catch (error) {
        logger.error('Error processing quality report', { error });
      }
    });

    /**
     * call:reconnecting - Client notifies server of ICE restart attempt
     */
    socket.on(CALL_EVENTS.RECONNECTING, async (data: CallReconnectingEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        const validation = validateSocketEvent(socketReconnectingSchema, data);
        if (!validation.success) return;

        await this.callService.updateCallStatus(data.callId, 'reconnecting' as any).catch(() => {});

        logger.info('Call reconnecting', {
          callId: data.callId,
          participantId: data.participantId,
          attempt: data.attempt
        });
      } catch (error) {
        logger.error('Error handling reconnecting', { error });
      }
    });

    /**
     * call:reconnected - Client notifies server of successful reconnection
     */
    socket.on(CALL_EVENTS.RECONNECTED, async (data: CallReconnectedEvent) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        const validation = validateSocketEvent(socketReconnectedSchema, data);
        if (!validation.success) return;

        await this.callService.updateCallStatus(data.callId, 'active' as any).catch(() => {});

        logger.info('Call reconnected', {
          callId: data.callId,
          participantId: data.participantId
        });
      } catch (error) {
        logger.error('Error handling reconnected', { error });
      }
    });

    /**
     * Handle disconnect - auto-leave any active calls
     */
    const originalDisconnect = socket.on.bind(socket);
    originalDisconnect('disconnect', async () => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) return;

        logger.info('📞 Socket: disconnect - checking for active calls', {
          socketId: socket.id,
          userId
        });

        // Find any active calls the user is in
        const activeParticipations = await this.prisma.callParticipant.findMany({
          where: {
            leftAt: null,
            participant: { userId }
          },
          include: {
            callSession: true
          }
        });

        // Leave all active calls (IMPORTANT FIX: force cleanup even on errors)
        for (const participation of activeParticipations) {
          if (participation.callSession.status !== 'ended') {
            try {
              // Try normal leave flow first
              await this.callService.leaveCall({
                callId: participation.callSessionId,
                userId,
                participantId: participation.participantId
              });

              // Broadcast to call participants
              io.to(ROOMS.call(participation.callSessionId)).emit(
                CALL_EVENTS.PARTICIPANT_LEFT,
                {
                  callId: participation.callSessionId,
                  participantId: participation.id,
                  mode: participation.callSession.mode
                } as CallParticipantLeftEvent
              );

              logger.info('✅ Socket: Auto-left call on disconnect', {
                callId: participation.callSessionId,
                userId
              });
            } catch (leaveError) {
              // IMPORTANT FIX: Force cleanup even if leaveCall fails
              // This prevents zombie calls when DB errors or validation fails
              logger.error('❌ Socket: Error in leaveCall, forcing direct cleanup', {
                callId: participation.callSessionId,
                userId,
                error: leaveError
              });

              try {
                const now = new Date();

                // Force update participant and potentially end call
                await this.prisma.$transaction(async (tx) => {
                  // Mark participant as left
                  await tx.callParticipant.update({
                    where: { id: participation.id },
                    data: { leftAt: now }
                  });

                  // Check if this was the last participant
                  const remainingParticipants = await tx.callParticipant.count({
                    where: {
                      callSessionId: participation.callSessionId,
                      leftAt: null
                    }
                  });

                  // If last participant, force end the call
                  if (remainingParticipants === 0) {
                    const call = await tx.callSession.findUnique({
                      where: { id: participation.callSessionId }
                    });

                    if (call) {
                      const duration = Math.floor((now.getTime() - call.startedAt.getTime()) / 1000);

                      await tx.callSession.update({
                        where: { id: participation.callSessionId },
                        data: {
                          status: 'ended',
                          endedAt: now,
                          duration
                        }
                      });

                      logger.info('✅ Socket: Force-ended call after disconnect error', {
                        callId: participation.callSessionId,
                        duration
                      });
                    }
                  }
                });

                // Still broadcast events even after force cleanup
                io.to(ROOMS.call(participation.callSessionId)).emit(
                  CALL_EVENTS.PARTICIPANT_LEFT,
                  {
                    callId: participation.callSessionId,
                    participantId: participation.id,
                    mode: participation.callSession.mode
                  } as CallParticipantLeftEvent
                );

                logger.info('✅ Socket: Force cleanup successful on disconnect', {
                  callId: participation.callSessionId,
                  userId
                });
              } catch (forceError) {
                // Even force cleanup failed - log but don't crash
                logger.error('❌ Socket: Force cleanup also failed', {
                  callId: participation.callSessionId,
                  userId,
                  error: forceError
                });
              }
            }
          }
        }
      } catch (error) {
        logger.error('❌ Socket: Error handling disconnect for calls', error);
      }
    });
  }

  /**
   * Créer des notifications pour les participants qui n'ont pas répondu à un appel
   */
  async createMissedCallNotifications(callId: string): Promise<void> {
    if (!this.notificationService) {
      logger.warn('⚠️ NotificationService not initialized, cannot create missed call notifications');
      return;
    }

    try {
      // Récupérer les informations de l'appel
      const callSession = await this.prisma.callSession.findUnique({
        where: { id: callId },
        include: {
          initiator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          conversation: {
            select: {
              id: true,
              identifier: true
            }
          }
        }
      });

      if (!callSession) {
        logger.warn('⚠️ Call session not found for missed call notifications', { callId });
        return;
      }

      // Récupérer les participants qui n'ont pas rejoint l'appel
      const unrespondedParticipants = await this.callService.getUnrespondedParticipants(callId);

      if (unrespondedParticipants.length === 0) {
        logger.info('📢 No unresponded participants for missed call notifications', { callId });
        return;
      }

      // Créer une notification pour chaque participant qui n'a pas répondu
      const callerName = callSession.initiator.displayName || callSession.initiator.username;
      const callerAvatar = callSession.initiator.avatar || undefined;

      for (const participantId of unrespondedParticipants) {
        await this.notificationService.createMissedCallNotification({
          recipientUserId: participantId,
          callerId: callSession.initiatorId,
          conversationId: callSession.conversationId,
          callSessionId: callSession.id,
          callType: 'video', // TODO: Récupérer le type d'appel depuis les métadonnées
        });
      }

      logger.info('📢 Missed call notifications created', {
        callId,
        recipientCount: unrespondedParticipants.length
      });
    } catch (error) {
      logger.error('❌ Error creating missed call notifications:', error);
    }
  }

  /**
   * Marquer un appel comme manqué et créer les notifications
   */
  async handleMissedCall(callId: string): Promise<void> {
    try {
      // Marquer l'appel comme manqué
      await this.callService.markCallAsMissed(callId);

      // Créer les notifications pour les participants qui n'ont pas répondu
      await this.createMissedCallNotifications(callId);

      logger.info('✅ Missed call handled', { callId });
    } catch (error) {
      logger.error('❌ Error handling missed call:', error);
    }
  }
}
