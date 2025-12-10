/**
 * CallService - Business logic for video/audio calls (Phase 1A: P2P MVP)
 *
 * Handles:
 * - Call initiation (P2P mode only)
 * - Participant joining/leaving
 * - Call state management
 * - Validation (DIRECT/GROUP conversations only)
 */

import { PrismaClient, CallMode, CallStatus, ParticipantRole, Prisma } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { TURNCredentialService } from './TURNCredentialService';

// Type for CallSession with populated participants
type CallSessionWithParticipants = Prisma.CallSessionGetPayload<{
  include: {
    participants: {
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

interface InitiateCallData {
  conversationId: string;
  initiatorId: string;
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
  isAnonymous?: boolean;
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  };
}

interface LeaveCallData {
  callId: string;
  userId: string;
}

export class CallService {
  private turnCredentialService: TURNCredentialService;

  constructor(private prisma: PrismaClient) {
    this.turnCredentialService = new TURNCredentialService();
  }

  /**
   * Initiate a new video call
   * - Validates conversation exists and type is DIRECT or GROUP
   * - Creates CallSession with mode='p2p' and status='initiated'
   * - Creates CallParticipant for initiator
   * - Returns CallSession with participants
   */
  async initiateCall(data: InitiateCallData): Promise<CallSessionWithParticipants> {
    const { conversationId, initiatorId, type, settings } = data;

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

    // Check if user is member of conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: initiatorId,
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
        status: { in: ['initiated', 'ringing', 'active'] }
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
            metadata: {
              ...(activeCall.metadata as any),
              endReason: 'zombie_cleanup'
            }
          }
        });

        logger.info('✅ Zombie call cleaned up', { zombieCallId: activeCall.id });
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
          userId: initiatorId,
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
    const { callId, userId, settings } = data;

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

    // Check if user is member of conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId: call.conversationId,
        userId,
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
      (p) => p.userId === userId && !p.leftAt
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
          userId,
          role: ParticipantRole.participant,
          isAudioEnabled: settings?.audioEnabled ?? true,
          isVideoEnabled: settings?.videoEnabled ?? true
        }
      });

      // Update call status to 'active' if it was 'initiated'
      if (call.status === CallStatus.initiated) {
        await tx.callSession.update({
          where: { id: callId },
          data: {
            status: CallStatus.active,
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
    const { callId, userId } = data;

    logger.info('📞 User leaving call', { callId, userId });

    // Find the participant
    const participant = await this.prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        userId,
        leftAt: null
      }
    });

    if (!participant) {
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
    const activeParticipants = call.participants.filter((p) => !p.leftAt && p.id !== participant.id);
    const isLastParticipant = activeParticipants.length === 0;

    // Update in transaction
    await this.prisma.$transaction(async (tx) => {
      // Update participant left time
      await tx.callParticipant.update({
        where: { id: participant.id },
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
   * @param requestingUserId - Optional user ID requesting access (for authorization check)
   */
  async getCallSession(callId: string, requestingUserId?: string): Promise<CallSessionWithParticipants> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: {
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
      }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // CVE-003: Authorization check if requestingUserId provided
    if (requestingUserId) {
      // Check if user is a participant in the call
      const isParticipant = call.participants.some((p) => p.userId === requestingUserId);

      // If not a participant, check if they're a member of the conversation
      if (!isParticipant) {
        const isMember = await this.prisma.conversationMember.findFirst({
          where: {
            conversationId: call.conversationId,
            userId: requestingUserId,
            isActive: true
          }
        });

        if (!isMember) {
          logger.warn('❌ Unauthorized call access attempt', {
            callId,
            userId: requestingUserId,
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
   * @param isAnonymous - Whether the user is anonymous (anonymous users CANNOT end calls)
   */
  async endCall(callId: string, endedBy: string, isAnonymous?: boolean): Promise<CallSessionWithParticipants> {
    logger.info('📞 Ending call', { callId, endedBy, isAnonymous });

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
    const userParticipant = call.participants.find(p => p.userId === endedBy && !p.leftAt);

    if (!userParticipant) {
      logger.error('❌ User not in call', { callId, endedBy });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not in this call`);
    }

    // Only initiator can end the call (in P2P mode)
    // In future SFU mode, add moderator role check
    if (userParticipant.role !== ParticipantRole.initiator) {
      logger.warn('⚠️ Non-initiator attempted to end call', {
        callId,
        userId: endedBy,
        role: userParticipant.role
      });
      throw new Error(`${CALL_ERROR_CODES.PERMISSION_DENIED}: Only the call initiator can end the call`);
    }

    const endedAt = new Date();
    const duration = Math.floor((endedAt.getTime() - call.startedAt.getTime()) / 1000);

    // End call in transaction
    await this.prisma.$transaction(async (tx) => {
      // Update all active participants
      await tx.callParticipant.updateMany({
        where: {
          callSessionId: callId,
          leftAt: null
        },
        data: { leftAt: endedAt }
      });

      // Update call status
      await tx.callSession.update({
        where: { id: callId },
        data: {
          status: CallStatus.ended,
          endedAt,
          duration,
          metadata: {
            ...(call.metadata as any),
            endedBy
          }
        }
      });
    });

    logger.info('✅ Call ended successfully', { callId, duration, endedBy });

    return this.getCallSession(callId);
  }

  /**
   * Get active call for conversation
   */
  async getActiveCallForConversation(conversationId: string): Promise<CallSessionWithParticipants | null> {
    const call = await this.prisma.callSession.findFirst({
      where: {
        conversationId,
        status: { in: [CallStatus.initiated, CallStatus.ringing, CallStatus.active] }
      },
      include: {
        participants: {
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
      }
    });

    return call;
  }

  /**
   * Update participant media state (audio/video toggle)
   */
  async updateParticipantMedia(
    callId: string,
    userId: string,
    mediaType: 'audio' | 'video',
    enabled: boolean
  ): Promise<CallSessionWithParticipants> {
    logger.info('📞 Updating participant media state', {
      callId,
      userId,
      mediaType,
      enabled
    });

    // Find the participant
    const participant = await this.prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        userId,
        leftAt: null
      }
    });

    if (!participant) {
      logger.error('❌ Participant not found or already left', { callId, userId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: You are not in this call`);
    }

    // Update media state
    await this.prisma.callParticipant.update({
      where: { id: participant.id },
      data:
        mediaType === 'audio'
          ? { isAudioEnabled: enabled }
          : { isVideoEnabled: enabled }
    });

    logger.info('✅ Participant media state updated', {
      callId,
      userId,
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
        metadata: {
          ...(callSession.metadata as any),
          endReason: 'missed'
        }
      }
    });

    logger.info('✅ Call marked as missed', { callId, duration });

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
        metadata: {
          ...(callSession.metadata as any),
          endReason: 'rejected'
        }
      }
    });

    logger.info('✅ Call marked as rejected', { callId, duration });

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
            members: {
              where: {
                isActive: true
              },
              select: {
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
    const joinedUserIds = callSession.participants.map(p => p.userId).filter(Boolean) as string[];

    // Récupérer tous les membres de la conversation
    const conversationMemberIds = callSession.conversation.members.map(m => m.userId);

    // Exclure l'initiateur et ceux qui ont rejoint
    const unrespondedUserIds = conversationMemberIds.filter(
      userId => userId !== callSession.initiatorId && !joinedUserIds.includes(userId)
    );

    return unrespondedUserIds;
  }
}
