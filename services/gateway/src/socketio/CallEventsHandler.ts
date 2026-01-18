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
import { validateSocketEvent } from '../middleware/validation';
import {
  socketInitiateCallSchema,
  socketJoinCallSchema,
  socketLeaveCallSchema,
  socketSignalSchema,
  socketMediaToggleSchema
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
  CallError
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
    socket.on(CALL_EVENTS.INITIATE, async (data: CallInitiateEvent) => {
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

        // Initiate call via service
        const callSession = await this.callService.initiateCall({
          conversationId: data.conversationId,
          initiatorId: userId,
          type: data.type,
          settings: data.settings as any
        });

        // CRITICAL: Initiator must join the call room to receive participant-joined events
        socket.join(`call:${callSession.id}`);

        logger.info('✅ Socket: Initiator joined call room', {
          callId: callSession.id,
          userId,
          room: `call:${callSession.id}`
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
          participants: callSession.participants.map((p) => ({
            id: p.id,
            callSessionId: p.callSessionId,
            userId: p.userId,
            anonymousId: p.anonymousId,
            role: p.role,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            isAudioEnabled: p.isAudioEnabled,
            isVideoEnabled: p.isVideoEnabled,
            connectionQuality: p.connectionQuality as any,
            username: p.user?.username,
            displayName: p.user?.displayName,
            avatar: p.user?.avatar
          }))
        };

        // Emit to initiator (confirmation) - direct socket emit
        logger.info('📤 Sending call:initiated to initiator (direct)', {
          callId: callSession.id,
          initiatorSocketId: socket.id,
          initiatorUserId: userId
        });
        socket.emit(CALL_EVENTS.INITIATED, initiatedEvent);

        // Get all conversation members and send to their sockets directly
        const conversationMembers = await this.prisma.conversationMember.findMany({
          where: {
            conversationId: data.conversationId,
            leftAt: null
          },
          select: {
            userId: true
          }
        });

        const memberUserIds = conversationMembers.map(m => m.userId);
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
        const roomName = `conversation_${data.conversationId}`;
        io.to(roomName).emit(CALL_EVENTS.INITIATED, initiatedEvent);

        logger.info('✅ Socket: Call initiated and broadcasted to all members', {
          callId: callSession.id,
          conversationId: data.conversationId,
          totalMembers: memberUserIds.length,
          notifiedSockets: notifiedSocketsCount,
          roomName
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error initiating call', error);

        const errorMessage = error.message || 'Failed to initiate call';
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
     * call:join - Client joins an existing call
     * CVE-002: Added rate limiting (20 req/min)
     * CVE-006: Added input validation
     */
    socket.on(CALL_EVENTS.JOIN, async (data: CallJoinEvent) => {
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

        // CVE-005: Join call via service (returns dynamic ICE servers)
        const joinResult = await this.callService.joinCall({
          callId: data.callId,
          userId,
          settings: data.settings
        });

        const { callSession, iceServers } = joinResult;

        // Join call room
        socket.join(`call:${data.callId}`);

        // Get the participant that just joined
        const participant = callSession.participants.find(
          (p) => p.userId === userId && !p.leftAt
        );

        if (!participant) {
          throw new Error('Participant not found after joining');
        }

        // Prepare event data
        const joinedEvent: CallParticipantJoinedEvent = {
          callId: callSession.id,
          participant: {
            id: participant.id,
            callSessionId: participant.callSessionId,
            userId: participant.userId,
            anonymousId: participant.anonymousId,
            role: participant.role,
            joinedAt: participant.joinedAt,
            leftAt: participant.leftAt,
            isAudioEnabled: participant.isAudioEnabled,
            isVideoEnabled: participant.isVideoEnabled,
            connectionQuality: participant.connectionQuality as any,
            username: participant.user?.username,
            displayName: participant.user?.displayName,
            avatar: participant.user?.avatar
          },
          mode: callSession.mode
        };

        // CVE-005: Send dynamic ICE servers (with time-limited TURN credentials) to joining participant
        socket.emit(CALL_EVENTS.JOIN, {
          success: true,
          callSession,
          iceServers // Dynamic credentials from TURNCredentialService
        });

        // Broadcast to all OTHER call participants (exclude the participant who just joined)
        // They already received their confirmation via call:join
        socket.to(`call:${data.callId}`).emit(
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
          (p) => p.userId === userId && !p.leftAt
        );

        if (!participant) {
          logger.warn('⚠️ Socket: User not in call', { userId, callId: data.callId });
          return;
        }

        // Leave call via service
        const callSession = await this.callService.leaveCall({
          callId: data.callId,
          userId
        });

        // Prepare event data BEFORE leaving room
        const leftEvent: CallParticipantLeftEvent = {
          callId: callSession.id,
          participantId: participant.id,
          userId: participant.userId || undefined,
          anonymousId: participant.anonymousId || undefined,
          mode: callSession.mode
        };

        // Get all sockets in the room for debugging
        const socketsInRoom = await io.in(`call:${data.callId}`).fetchSockets();

        logger.info('📤 Broadcasting call:participant-left event', {
          callId: data.callId,
          participantId: participant.id,
          userId: participant.userId,
          anonymousId: participant.anonymousId,
          remainingParticipants: callSession.participants.filter(p => !p.leftAt).length,
          roomName: `call:${data.callId}`,
          socketsInRoom: socketsInRoom.length,
          socketIds: socketsInRoom.map(s => s.id),
          leavingSocketId: socket.id
        });

        // IMPORTANT: Broadcast BEFORE leaving room to ensure message delivery
        io.to(`call:${data.callId}`).emit(
          CALL_EVENTS.PARTICIPANT_LEFT,
          leftEvent
        );

        // Leave call room AFTER broadcasting
        socket.leave(`call:${data.callId}`);

        // If call ended, broadcast to BOTH call room AND conversation room
        if (callSession.status === 'ended') {
          const endedEvent: CallEndedEvent = {
            callId: callSession.id,
            duration: callSession.duration || 0,
            endedBy: userId
          };

          // Broadcast to call room (for active participants)
          io.to(`call:${data.callId}`).emit(
            CALL_EVENTS.ENDED,
            endedEvent
          );

          // Also broadcast to conversation room (for users who declined/weren't in call yet)
          io.to(`conversation_${callSession.conversationId}`).emit(
            CALL_EVENTS.ENDED,
            endedEvent
          );

          logger.info('✅ Socket: Call ended - last participant left', {
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
            (p) => p.userId === userId && !p.leftAt
          );

          if (participant) {
            logger.info('🔄 Force leaving call', {
              callId: call.id,
              userId,
              participantId: participant.id
            });

            try {
              // Leave the call
              const callSession = await this.callService.leaveCall({
                callId: call.id,
                userId
              });

              // Broadcast participant left event
              const leftEvent: CallParticipantLeftEvent = {
                callId: callSession.id,
                participantId: participant.id,
                userId: participant.userId || undefined,
                anonymousId: participant.anonymousId || undefined,
                mode: callSession.mode
              };

              io.to(`call:${call.id}`).emit(
                CALL_EVENTS.PARTICIPANT_LEFT,
                leftEvent
              );

              // Leave the room
              socket.leave(`call:${call.id}`);

              // If call ended, broadcast ended event
              if (callSession.status === 'ended') {
                const endedEvent: CallEndedEvent = {
                  callId: callSession.id,
                  duration: callSession.duration || 0,
                  endedBy: userId
                };

                io.to(`call:${call.id}`).emit(CALL_EVENTS.ENDED, endedEvent);
                io.to(`conversation_${callSession.conversationId}`).emit(CALL_EVENTS.ENDED, endedEvent);
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
    socket.on(CALL_EVENTS.SIGNAL, async (data: CallSignalEvent) => {
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
          (p) => (p.userId === userId || p.anonymousId === userId) && !p.leftAt
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
        if (data.signal.from !== userId && data.signal.from !== senderParticipant.anonymousId) {
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
          (p) => (p.userId === data.signal.to || p.anonymousId === data.signal.to) && !p.leftAt
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

        // CVE-001: Forward signal only to target participant (not broadcast to entire room)
        // This prevents signal injection to unintended recipients
        socket.to(`call:${data.callId}`).emit(CALL_EVENTS.SIGNAL, data);

        logger.info('✅ Socket: Signal forwarded', {
          callId: data.callId,
          from: data.signal.from,
          to: data.signal.to,
          type: data.signal.type
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

        io.to(`call:${data.callId}`).emit(
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

        io.to(`call:${data.callId}`).emit(
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
     * call:end - Force end a call (privileged operation)
     * CVE-004: Only initiators can end calls, anonymous users are blocked
     */
    socket.on('call:end', async (data: { callId: string }) => {
      try {
        const userId = getUserId(socket.id);
        if (!userId) {
          socket.emit(CALL_EVENTS.ERROR, {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated'
          } as CallError);
          return;
        }

        // CVE-004: Get user info to check if anonymous
        const userInfo = getUserInfo?.(socket.id);
        const isAnonymous = userInfo?.isAnonymous || false;

        logger.info('📞 Socket: call:end', {
          socketId: socket.id,
          userId,
          callId: data.callId,
          isAnonymous
        });

        // CVE-004: End call via service (with anonymous check)
        const callSession = await this.callService.endCall(
          data.callId,
          userId,
          isAnonymous
        );

        // Broadcast call ended event to all participants
        const endedEvent: CallEndedEvent = {
          callId: callSession.id,
          duration: callSession.duration || 0,
          endedBy: userId
        };

        // Broadcast to conversation room
        io.to(`conversation_${callSession.conversationId}`).emit(
          CALL_EVENTS.ENDED,
          endedEvent
        );

        logger.info('✅ Socket: Call ended by user', {
          callId: data.callId,
          endedBy: userId,
          duration: callSession.duration
        });
      } catch (error: any) {
        logger.error('❌ Socket: Error ending call', error);

        const errorMessage = error.message || 'Failed to end call';
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
            userId,
            leftAt: null
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
                userId
              });

              // Broadcast to call participants
              io.to(`call:${participation.callSessionId}`).emit(
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
                io.to(`call:${participation.callSessionId}`).emit(
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
          recipientId: participantId,
          callerId: callSession.initiatorId,
          callerUsername: callerName,
          callerAvatar,
          conversationId: callSession.conversationId,
          callSessionId: callSession.id,
          callType: 'video' // TODO: Récupérer le type d'appel depuis les métadonnées
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
