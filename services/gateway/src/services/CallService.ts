/**
 * CallService - Business logic for video/audio calls (Phase 1A: P2P MVP)
 *
 * Handles:
 * - Call initiation (P2P mode only)
 * - Participant joining/leaving
 * - Call state management
 * - Validation (DIRECT/GROUP conversations only)
 *
 * Unified Participant model: all calls use participantId
 */

import { PrismaClient, CallMode, CallStatus, CallEndReason, ParticipantRole, Prisma } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { TURNCredentialService } from './TURNCredentialService';

const TERMINAL_STATUSES: CallStatus[] = [
  CallStatus.ended,
  CallStatus.missed,
  CallStatus.rejected,
  CallStatus.failed
];

const ACTIVE_STATUSES: CallStatus[] = [
  CallStatus.initiated,
  CallStatus.ringing,
  CallStatus.connecting,
  CallStatus.active,
  CallStatus.reconnecting
];

// Type for CallSession with populated participants
type CallSessionWithParticipants = Prisma.CallSessionGetPayload<{
  include: {
    participants: {
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true;
                username: true;
                displayName: true;
                avatar: true;
              };
            };
          };
        };
      };
    };
    initiator: {
      select: {
        id: true;
        username: true;
        displayName: true;
        avatar: true;
      };
    };
    conversation: {
      select: {
        id: true;
        identifier: true;
        type: true;
      };
    };
  };
}>;

const callSessionInclude = {
  participants: {
    include: {
      participant: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          }
        }
      }
    }
  },
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
      identifier: true,
      type: true
    }
  }
} as const;

interface InitiateCallData {
  conversationId: string;
  initiatorId: string;
  participantId: string;
  type: 'video' | 'audio';
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    screenShareEnabled?: boolean;
  };
}

interface JoinCallData {
  callId: string;
  userId: string;
  participantId: string;
  isAnonymous?: boolean;
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  };
}

interface LeaveCallData {
  callId: string;
  userId: string;
  participantId: string;
}

export class CallService {
  private turnCredentialService: TURNCredentialService;
  private heartbeats: Map<string, Map<string, number>> = new Map();

  constructor(private prisma: PrismaClient) {
    this.turnCredentialService = new TURNCredentialService();
  }

  /**
   * Generate ICE servers with per-user TURN credentials
   */
  generateIceServers(userId: string): any[] {
    return this.turnCredentialService.generateCredentials(userId);
  }

  /**
   * Record a heartbeat from a participant
   */
  recordHeartbeat(callId: string, participantId: string): void {
    if (!this.heartbeats.has(callId)) {
      this.heartbeats.set(callId, new Map());
    }
    this.heartbeats.get(callId)!.set(participantId, Date.now());
  }

  /**
   * Get last heartbeat timestamp for a participant
   */
  getLastHeartbeat(callId: string, participantId: string): number | undefined {
    return this.heartbeats.get(callId)?.get(participantId);
  }

  /**
   * Clear heartbeat tracking for a call
   */
  clearHeartbeats(callId: string): void {
    this.heartbeats.delete(callId);
  }

  /**
   * Get all participants with stale heartbeats (> maxAge ms ago)
   */
  getStaleHeartbeats(callId: string, maxAgeMs: number): string[] {
    const callHeartbeats = this.heartbeats.get(callId);
    if (!callHeartbeats) return [];

    const now = Date.now();
    const stale: string[] = [];
    for (const [participantId, lastBeat] of callHeartbeats) {
      if (now - lastBeat > maxAgeMs) {
        stale.push(participantId);
      }
    }
    return stale;
  }

  /**
   * Update call status with validation (state machine transition)
   */
  async updateCallStatus(callId: string, newStatus: CallStatus, endReason?: CallEndReason): Promise<CallSessionWithParticipants> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId }
    });

    if (!call) {
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    if (TERMINAL_STATUSES.includes(call.status)) {
      logger.warn('Call already in terminal state', { callId, currentStatus: call.status, requestedStatus: newStatus });
      return this.getCallSession(callId);
    }

    const updateData: Prisma.CallSessionUpdateInput = { status: newStatus };

    if (TERMINAL_STATUSES.includes(newStatus)) {
      const now = new Date();
      updateData.endedAt = now;
      updateData.duration = Math.floor((now.getTime() - call.startedAt.getTime()) / 1000);
      if (endReason) {
        updateData.endReason = endReason;
      }
    }

    if (newStatus === CallStatus.active && !call.answeredAt) {
      updateData.answeredAt = new Date();
    }

    await this.prisma.callSession.update({
      where: { id: callId },
      data: updateData
    });

    logger.info('Call status updated', { callId, from: call.status, to: newStatus, endReason });

    return this.getCallSession(callId);
  }

  /**
   * Initiate a new video call
   * - Validates conversation exists and type is DIRECT or GROUP
   * - Creates CallSession with mode='p2p' and status='initiated'
   * - Creates CallParticipant for initiator
   * - Returns CallSession with participants
   */
  async initiateCall(data: InitiateCallData): Promise<CallSessionWithParticipants> {
    const { conversationId, initiatorId, participantId, type, settings } = data;

    logger.info('📞 Initiating call', { conversationId, initiatorId, type });

    // Validate conversation exists
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true, identifier: true }
    });

    if (!conversation) {
      logger.error('❌ Conversation not found', { conversationId });
      throw new Error(`${CALL_ERROR_CODES.CONVERSATION_NOT_FOUND}: Conversation not found`);
    }

    // Validate conversation type (only DIRECT and GROUP support video calls)
    if (conversation.type !== 'direct' && conversation.type !== 'group') {
      logger.error('❌ Video calls not supported for this conversation type', {
        conversationId,
        type: conversation.type
      });
      throw new Error(
        `${CALL_ERROR_CODES.VIDEO_CALLS_NOT_SUPPORTED}: Video calls are only supported for DIRECT and GROUP conversations`
      );
    }

    // Check if user is participant of conversation
    const membership = await this.prisma.participant.findFirst({
      where: {
        conversationId,
        id: participantId,
        isActive: true
      }
    });

    if (!membership) {
      logger.error('❌ User is not a participant in conversation', {
        conversationId,
        initiatorId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    // IMPROVEMENT: Clean up any zombie calls before initiating new call
    // This prevents orphan calls from blocking new calls
    const activeCall = await this.prisma.callSession.findFirst({
      where: {
        conversationId,
        status: { in: ACTIVE_STATUSES }
      },
      include: {
        participants: true
      }
    });

    if (activeCall) {
      // Check if all participants have left (zombie call)
      const activeParticipants = activeCall.participants.filter(p => !p.leftAt);

      if (activeParticipants.length === 0) {
        // Zombie call - force cleanup before starting new call
        logger.warn('⚠️ Found zombie call, cleaning up before new call', {
          conversationId,
          zombieCallId: activeCall.id,
          callStatus: activeCall.status
        });

        const now = new Date();
        const duration = Math.floor((now.getTime() - activeCall.startedAt.getTime()) / 1000);

        await this.prisma.callSession.update({
          where: { id: activeCall.id },
          data: {
            status: CallStatus.ended,
            endedAt: now,
            duration,
            endReason: CallEndReason.garbageCollected
          }
        });

        this.clearHeartbeats(activeCall.id);

        logger.info('Zombie call cleaned up', { zombieCallId: activeCall.id });
      } else {
        // Real active call with participants
        logger.error('❌ Call already active', { conversationId, callId: activeCall.id });
        throw new Error(`${CALL_ERROR_CODES.CALL_ALREADY_ACTIVE}: A call is already active in this conversation`);
      }
    }

    // Create call session with participant in a transaction
    const callSession = await this.prisma.$transaction(async (tx) => {
      // Create call session
      const session = await tx.callSession.create({
        data: {
          conversationId,
          initiatorId,
          mode: CallMode.p2p, // Phase 1A: P2P only
          status: CallStatus.initiated,
          metadata: {
            type, // 'video' or 'audio'
            ...settings
          }
        }
      });

      // Create participant for initiator
      await tx.callParticipant.create({
        data: {
          callSessionId: session.id,
          participantId,
          role: ParticipantRole.initiator,
          isAudioEnabled: settings?.audioEnabled ?? true,
          isVideoEnabled: type === 'video' ? (settings?.videoEnabled ?? true) : false
        }
      });

      return session;
    });

    logger.info('✅ Call initiated successfully', {
      callId: callSession.id,
      conversationId,
      initiatorId
    });

    // Fetch and return complete call session with participants
    return this.getCallSession(callSession.id);
  }

  /**
   * Join an existing call
   * - Validates call exists and status is 'initiated' or 'active'
   * - Validates user is participant of conversation
   * - Creates CallParticipant for joiner
   * - Updates call status to 'active' if was 'initiated'
   * - CVE-005: Returns dynamic TURN credentials via TURNCredentialService
   * - Returns updated CallSession with ICE servers
   */
  async joinCall(data: JoinCallData): Promise<{
    callSession: CallSessionWithParticipants;
    iceServers: RTCIceServer[]
  }> {
    const { callId, userId, participantId, settings } = data;

    logger.info('📞 User joining call', { callId, userId });

    // Validate call exists
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: { conversation: true, participants: true }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Validate call is not ended
    if (call.status === CallStatus.ended) {
      logger.error('❌ Call has ended', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_ENDED}: This call has already ended`);
    }

    // Check if user is participant of conversation
    const membership = await this.prisma.participant.findFirst({
      where: {
        conversationId: call.conversationId,
        id: participantId,
        isActive: true
      }
    });

    if (!membership) {
      logger.error('❌ User is not a participant in conversation', {
        conversationId: call.conversationId,
        userId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    // Check if user is already in the call
    const existingParticipant = call.participants.find(
      (p) => p.participantId === participantId && !p.leftAt
    );

    if (existingParticipant) {
      logger.warn('⚠️ User already in call', { callId, userId });
      // CVE-005: Return current state with dynamic ICE servers
      const iceServers = this.turnCredentialService.generateCredentials(userId);
      const callSession = await this.getCallSession(callId);
      return {
        callSession,
        iceServers
      };
    }

    // Phase 1A: Enforce P2P mode (max 2 participants)
    const activeParticipants = call.participants.filter((p) => !p.leftAt);
    if (activeParticipants.length >= 2) {
      logger.error('❌ Max participants reached for P2P call', {
        callId,
        activeParticipants: activeParticipants.length
      });
      throw new Error(
        `${CALL_ERROR_CODES.MAX_PARTICIPANTS_REACHED}: Maximum participants (2) reached for P2P calls`
      );
    }

    // Join call in transaction
    await this.prisma.$transaction(async (tx) => {
      // Create participant
      await tx.callParticipant.create({
        data: {
          callSessionId: callId,
          participantId,
          role: ParticipantRole.participant,
          isAudioEnabled: settings?.audioEnabled ?? true,
          isVideoEnabled: settings?.videoEnabled ?? true
        }
      });

      // Transition: initiated/ringing → connecting (WebRTC negotiation starts)
      if (call.status === CallStatus.initiated || call.status === CallStatus.ringing) {
        await tx.callSession.update({
          where: { id: callId },
          data: {
            status: CallStatus.connecting,
            answeredAt: new Date()
          }
        });
      }
    });

    logger.info('✅ User joined call successfully', { callId, userId });

    // CVE-005: Generate dynamic TURN credentials for this user
    const iceServers = this.turnCredentialService.generateCredentials(userId);

    const callSession = await this.getCallSession(callId);

    return {
      callSession,
      iceServers
    };
  }

  /**
   * Leave a call
   * - Updates CallParticipant.leftAt
   * - If last participant, end call (status='ended', endedAt=now)
   * - Returns updated CallSession
   */
  async leaveCall(data: LeaveCallData): Promise<CallSessionWithParticipants> {
    const { callId, userId, participantId } = data;

    logger.info('📞 User leaving call', { callId, userId });

    // Find the call participant
    const callParticipant = await this.prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        participantId,
        leftAt: null
      }
    });

    if (!callParticipant) {
      logger.error('❌ Participant not found or already left', { callId, userId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: You are not in this call`);
    }

    // Get call with all participants
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: { participants: true }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    const leftAt = new Date();

    // Check if this is the last active participant
    const activeParticipants = call.participants.filter((p) => !p.leftAt && p.id !== callParticipant.id);
    const isLastParticipant = activeParticipants.length === 0;

    // Update in transaction
    await this.prisma.$transaction(async (tx) => {
      // Update participant left time
      await tx.callParticipant.update({
        where: { id: callParticipant.id },
        data: { leftAt }
      });

      // If last participant, end the call
      if (isLastParticipant) {
        const duration = Math.floor(
          (leftAt.getTime() - call.startedAt.getTime()) / 1000
        );

        await tx.callSession.update({
          where: { id: callId },
          data: {
            status: CallStatus.ended,
            endedAt: leftAt,
            duration
          }
        });

        logger.info('✅ Call ended - last participant left', { callId, duration });
      }
    });

    logger.info('✅ User left call successfully', { callId, userId });

    return this.getCallSession(callId);
  }

  /**
   * Get call session details with participants
   * CVE-003: Added authorization check - requestingUserId parameter
   *
   * @param callId - Call session ID
   * @param requestingParticipantId - Optional participant ID requesting access (for authorization check)
   */
  async getCallSession(callId: string, requestingParticipantId?: string): Promise<CallSessionWithParticipants> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: callSessionInclude
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // CVE-003: Authorization check if requestingParticipantId provided
    if (requestingParticipantId) {
      // Check if user is a participant in the call
      const isCallParticipant = call.participants.some((p) => p.participantId === requestingParticipantId);

      // If not a participant, check if they're a member of the conversation
      if (!isCallParticipant) {
        const isMember = await this.prisma.participant.findFirst({
          where: {
            conversationId: call.conversationId,
            id: requestingParticipantId,
            isActive: true
          }
        });

        if (!isMember) {
          logger.warn('❌ Unauthorized call access attempt', {
            callId,
            participantId: requestingParticipantId,
            conversationId: call.conversationId
          });
          throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You do not have access to this call`);
        }
      }
    }

    return call;
  }

  /**
   * End call (force end by moderator or system)
   * CVE-004: Added authorization check - only initiator or moderators can end calls
   *
   * @param callId - Call session ID
   * @param endedBy - User ID attempting to end the call
   * @param participantId - Participant ID of the user ending the call
   * @param isAnonymous - Whether the user is anonymous (anonymous users CANNOT end calls)
   */
  async endCall(callId: string, endedBy: string, participantId: string, isAnonymous?: boolean, reason?: string): Promise<CallSessionWithParticipants> {
    logger.info('Ending call', { callId, endedBy, isAnonymous, reason });

    // CVE-004: Anonymous users cannot end calls for everyone
    if (isAnonymous) {
      logger.warn('⚠️ Anonymous user attempted to end call', { callId, userId: endedBy });
      throw new Error(`${CALL_ERROR_CODES.PERMISSION_DENIED}: Anonymous users cannot end calls. Use leave instead.`);
    }

    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true
      }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    if (call.status === CallStatus.ended) {
      logger.warn('⚠️ Call already ended', { callId });
      return this.getCallSession(callId);
    }

    // CVE-004: Verify user has permission to end the call (initiator or moderator role)
    const userParticipant = call.participants.find(p => p.participantId === participantId && !p.leftAt);

    if (!userParticipant) {
      logger.error('❌ User not in call', { callId, endedBy });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not in this call`);
    }

    // P2P: ANY active participant can end the call (spec C4 fix)
    // SFU (Phase 2): only initiator/moderator can end for everyone

    const endedAt = new Date();
    const duration = call.answeredAt
      ? Math.floor((endedAt.getTime() - call.answeredAt.getTime()) / 1000)
      : 0;

    const endReason = this.resolveEndReason(reason);

    await this.prisma.$transaction(async (tx) => {
      await tx.callParticipant.updateMany({
        where: {
          callSessionId: callId,
          leftAt: null
        },
        data: { leftAt: endedAt }
      });

      await tx.callSession.update({
        where: { id: callId },
        data: {
          status: CallStatus.ended,
          endedAt,
          duration,
          endReason,
          metadata: {
            ...(call.metadata as Record<string, unknown>),
            endedBy
          }
        }
      });
    });

    this.clearHeartbeats(callId);

    logger.info('Call ended successfully', { callId, duration, endedBy, endReason });

    return this.getCallSession(callId);
  }

  /**
   * Get active call for conversation
   */
  async getActiveCallForConversation(conversationId: string): Promise<CallSessionWithParticipants | null> {
    const call = await this.prisma.callSession.findFirst({
      where: {
        conversationId,
        status: { in: ACTIVE_STATUSES }
      },
      include: callSessionInclude
    });

    return call;
  }

  /**
   * Update participant media state (audio/video toggle)
   */
  async updateParticipantMedia(
    callId: string,
    participantId: string,
    mediaType: 'audio' | 'video',
    enabled: boolean
  ): Promise<CallSessionWithParticipants> {
    logger.info('📞 Updating participant media state', {
      callId,
      participantId,
      mediaType,
      enabled
    });

    // Find the call participant
    const callParticipant = await this.prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        participantId,
        leftAt: null
      }
    });

    if (!callParticipant) {
      logger.error('❌ Participant not found or already left', { callId, participantId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: You are not in this call`);
    }

    // Update media state
    await this.prisma.callParticipant.update({
      where: { id: callParticipant.id },
      data:
        mediaType === 'audio'
          ? { isAudioEnabled: enabled }
          : { isVideoEnabled: enabled }
    });

    logger.info('✅ Participant media state updated', {
      callId,
      participantId,
      mediaType,
      enabled
    });

    return this.getCallSession(callId);
  }

  /**
   * Marquer un appel comme manqué
   * À appeler quand un appel n'est pas répondu après un timeout
   */
  async markCallAsMissed(callId: string): Promise<CallSessionWithParticipants> {
    logger.info('📞 Marking call as missed', { callId });

    const callSession = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true,
        initiator: true
      }
    });

    if (!callSession) {
      logger.error('❌ Call session not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Mettre à jour le statut de l'appel
    const now = new Date();
    const duration = Math.floor((now.getTime() - callSession.startedAt.getTime()) / 1000);

    await this.prisma.callSession.update({
      where: { id: callId },
      data: {
        status: CallStatus.missed,
        endedAt: now,
        duration,
        endReason: CallEndReason.missed
      }
    });

    this.clearHeartbeats(callId);

    logger.info('Call marked as missed', { callId, duration });

    return this.getCallSession(callId);
  }

  /**
   * Marquer un appel comme rejeté
   * À appeler quand un participant rejette l'appel
   */
  async markCallAsRejected(callId: string): Promise<CallSessionWithParticipants> {
    logger.info('📞 Marking call as rejected', { callId });

    const callSession = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true
      }
    });

    if (!callSession) {
      logger.error('❌ Call session not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Mettre à jour le statut de l'appel
    const now = new Date();
    const duration = Math.floor((now.getTime() - callSession.startedAt.getTime()) / 1000);

    await this.prisma.callSession.update({
      where: { id: callId },
      data: {
        status: CallStatus.rejected,
        endedAt: now,
        duration,
        endReason: CallEndReason.rejected
      }
    });

    this.clearHeartbeats(callId);

    logger.info('Call marked as rejected', { callId, duration });

    return this.getCallSession(callId);
  }

  /**
   * Récupérer les participants d'un appel qui n'ont pas rejoint
   */
  async getUnrespondedParticipants(callId: string): Promise<string[]> {
    const callSession = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true,
        conversation: {
          include: {
            participants: {
              where: {
                isActive: true
              },
              select: {
                id: true,
                userId: true
              }
            }
          }
        }
      }
    });

    if (!callSession) {
      return [];
    }

    // Récupérer les IDs des participants qui ont déjà rejoint l'appel
    const joinedParticipantIds = callSession.participants.map(p => p.participantId);

    // Récupérer tous les membres de la conversation
    const conversationParticipantIds = callSession.conversation.participants.map(m => m.userId).filter(Boolean) as string[];

    // Exclure l'initiateur et ceux qui ont rejoint
    const unrespondedUserIds = conversationParticipantIds.filter(
      userId => userId !== callSession.initiatorId && !callSession.conversation.participants
        .filter(p => joinedParticipantIds.includes(p.id))
        .some(p => p.userId === userId)
    );

    return unrespondedUserIds;
  }

  /**
   * Resolve a string reason to a Prisma CallEndReason enum
   */
  private resolveEndReason(reason?: string): CallEndReason {
    switch (reason) {
      case 'missed': return CallEndReason.missed;
      case 'rejected': return CallEndReason.rejected;
      case 'failed': return CallEndReason.failed;
      case 'connectionLost': return CallEndReason.connectionLost;
      case 'heartbeatTimeout': return CallEndReason.heartbeatTimeout;
      case 'garbageCollected': return CallEndReason.garbageCollected;
      default: return CallEndReason.completed;
    }
  }
}
