/**
 * CallService Unit Tests
 * Comprehensive tests for video/audio call management (Phase 1A: P2P MVP)
 *
 * Tests:
 * - Call initiation (validation, creation, error cases)
 * - Participant joining (P2P limits, status transitions)
 * - Participant leaving (cleanup, call ending)
 * - Call session retrieval (authorization checks)
 * - Force end call (permission checks)
 * - Active call queries
 * - Media state updates
 * - Missed/rejected call marking
 * - Unresponded participant retrieval
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Mock @meeshy/shared/types/video-call before importing CallService
jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_ERROR_CODES: {
    NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    PEER_CONNECTION_FAILED: 'PEER_CONNECTION_FAILED',
    ICE_CONNECTION_FAILED: 'ICE_CONNECTION_FAILED',
    SIGNAL_FAILED: 'SIGNAL_FAILED',
    MEDIA_PERMISSION_DENIED: 'MEDIA_PERMISSION_DENIED',
    CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
    NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
    CALL_NOT_FOUND: 'CALL_NOT_FOUND',
    CALL_ALREADY_ACTIVE: 'CALL_ALREADY_ACTIVE',
    CALL_ENDED: 'CALL_ENDED',
    MAX_PARTICIPANTS_REACHED: 'MAX_PARTICIPANTS_REACHED',
    FORCE_LEAVE_ERROR: 'FORCE_LEAVE_ERROR',
    INVALID_CALL_MODE: 'INVALID_CALL_MODE',
    UNSUPPORTED_CALL_TYPE: 'UNSUPPORTED_CALL_TYPE',
    ALREADY_IN_CALL: 'ALREADY_IN_CALL',
    NOT_IN_CALL: 'NOT_IN_CALL',
    MEDIA_TOGGLE_FAILED: 'MEDIA_TOGGLE_FAILED',
    VIDEO_CALLS_NOT_SUPPORTED: 'VIDEO_CALLS_NOT_SUPPORTED',
    BROWSER_NOT_SUPPORTED: 'BROWSER_NOT_SUPPORTED',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_SIGNAL: 'INVALID_SIGNAL',
    SIGNAL_SENDER_MISMATCH: 'SIGNAL_SENDER_MISMATCH',
    TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  }
}));

import { CallService } from '../../../services/CallService';
import { CallMode, CallStatus, ParticipantRole } from '@meeshy/shared/prisma/client';

// Mock logger to avoid console noise during tests
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock TURNCredentialService
jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({
    generateCredentials: jest.fn().mockReturnValue([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn.example.com:3478', username: 'test-user', credential: 'test-cred' }
    ]),
    isConfigured: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({
      configured: true,
      turnServersCount: 1,
      stunServersCount: 3,
      credentialTTL: 86400,
      hasCustomSecret: true
    })
  }))
}));

// Helper to create mock Prisma client with proper typing
const createMockPrisma = () => {
  // Use explicit typing to avoid Jest mock type inference issues
  type MockFn = jest.Mock<any>;

  return {
    conversation: {
      findUnique: jest.fn() as MockFn,
      findFirst: jest.fn() as MockFn
    },
    conversationMember: {
      findFirst: jest.fn() as MockFn
    },
    callSession: {
      create: jest.fn() as MockFn,
      findUnique: jest.fn() as MockFn,
      findFirst: jest.fn() as MockFn,
      update: jest.fn() as MockFn,
      updateMany: jest.fn() as MockFn
    },
    callParticipant: {
      create: jest.fn() as MockFn,
      findFirst: jest.fn() as MockFn,
      update: jest.fn() as MockFn,
      updateMany: jest.fn() as MockFn
    },
    $transaction: jest.fn() as MockFn
  };
};

// Types for mock data
interface MockUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

interface MockConversation {
  id: string;
  identifier: string;
  type: string;
  members?: Array<{ userId: string }>;
}

interface MockCallParticipant {
  id: string;
  callSessionId: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: Date;
  leftAt: Date | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  user?: MockUser;
}

interface MockCallSession {
  id: string;
  conversationId: string;
  initiatorId: string;
  mode: CallMode;
  status: CallStatus;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  metadata: Record<string, unknown>;
  participants: MockCallParticipant[];
  initiator?: MockUser;
  conversation?: MockConversation;
}

// Test data factories
const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: 'user-123',
  username: 'testuser',
  displayName: 'Test User',
  avatar: null,
  ...overrides
});

const createMockConversation = (overrides: Partial<MockConversation> = {}): MockConversation => ({
  id: 'conv-123',
  identifier: 'test-conversation',
  type: 'direct',
  ...overrides
});

const createMockCallSession = (overrides: Partial<MockCallSession> = {}): MockCallSession => ({
  id: 'call-123',
  conversationId: 'conv-123',
  initiatorId: 'user-123',
  mode: CallMode.p2p,
  status: CallStatus.initiated,
  startedAt: new Date(),
  answeredAt: null,
  endedAt: null,
  duration: null,
  metadata: { type: 'video' },
  participants: [],
  ...overrides
});

const createMockParticipant = (overrides: Partial<MockCallParticipant> = {}): MockCallParticipant => ({
  id: 'participant-123',
  callSessionId: 'call-123',
  userId: 'user-123',
  role: ParticipantRole.initiator,
  joinedAt: new Date(),
  leftAt: null,
  isAudioEnabled: true,
  isVideoEnabled: true,
  ...overrides
});

describe('CallService', () => {
  let callService: CallService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateCall', () => {
    const validInitiateData = {
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      type: 'video' as const,
      settings: {
        audioEnabled: true,
        videoEnabled: true
      }
    };

    it('should successfully initiate a video call', async () => {
      const mockConversation = createMockConversation();
      const mockCallSession = createMockCallSession({
        participants: [createMockParticipant()],
        initiator: createMockUser(),
        conversation: mockConversation
      });

      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callSession.findFirst.mockResolvedValue(null); // No active call
      mockPrisma.$transaction.mockResolvedValue(mockCallSession);
      mockPrisma.callSession.findUnique.mockResolvedValue(mockCallSession);

      const result = await callService.initiateCall(validInitiateData);

      expect(result).toBeDefined();
      expect(result.id).toBe('call-123');
      expect(result.mode).toBe(CallMode.p2p);
      expect(result.status).toBe(CallStatus.initiated);
      expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        select: { id: true, type: true, identifier: true }
      });
    });

    it('should successfully initiate an audio-only call', async () => {
      const audioCallData = {
        ...validInitiateData,
        type: 'audio' as const,
        settings: { audioEnabled: true, videoEnabled: false }
      };
      const mockConversation = createMockConversation();
      const mockCallSession = createMockCallSession({
        metadata: { type: 'audio', audioEnabled: true, videoEnabled: false },
        participants: [createMockParticipant({ isVideoEnabled: false })],
        initiator: createMockUser(),
        conversation: mockConversation
      });

      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callSession.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue(mockCallSession);
      mockPrisma.callSession.findUnique.mockResolvedValue(mockCallSession);

      const result = await callService.initiateCall(audioCallData);

      expect(result).toBeDefined();
      expect(result.metadata).toHaveProperty('type', 'audio');
    });

    it('should throw error when conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(callService.initiateCall(validInitiateData)).rejects.toThrow(
        'CONVERSATION_NOT_FOUND: Conversation not found'
      );
    });

    it('should throw error for PUBLIC conversation type', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(
        createMockConversation({ type: 'public' })
      );

      await expect(callService.initiateCall(validInitiateData)).rejects.toThrow(
        'VIDEO_CALLS_NOT_SUPPORTED: Video calls are only supported for DIRECT and GROUP conversations'
      );
    });

    it('should throw error for GLOBAL conversation type', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(
        createMockConversation({ type: 'global' })
      );

      await expect(callService.initiateCall(validInitiateData)).rejects.toThrow(
        'VIDEO_CALLS_NOT_SUPPORTED: Video calls are only supported for DIRECT and GROUP conversations'
      );
    });

    it('should allow calls in GROUP conversations', async () => {
      const mockConversation = createMockConversation({ type: 'group' });
      const mockCallSession = createMockCallSession({
        participants: [createMockParticipant()],
        initiator: createMockUser(),
        conversation: mockConversation
      });

      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callSession.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue(mockCallSession);
      mockPrisma.callSession.findUnique.mockResolvedValue(mockCallSession);

      const result = await callService.initiateCall(validInitiateData);

      expect(result).toBeDefined();
    });

    it('should throw error when user is not a conversation member', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
      mockPrisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(callService.initiateCall(validInitiateData)).rejects.toThrow(
        'NOT_A_PARTICIPANT: You are not a participant in this conversation'
      );
    });

    it('should throw error when call already active', async () => {
      const activeCall = createMockCallSession({
        status: CallStatus.active,
        participants: [createMockParticipant()]
      });

      mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callSession.findFirst.mockResolvedValue(activeCall);

      await expect(callService.initiateCall(validInitiateData)).rejects.toThrow(
        'CALL_ALREADY_ACTIVE: A call is already active in this conversation'
      );
    });

    it('should cleanup zombie call before initiating new call', async () => {
      const zombieCall = createMockCallSession({
        status: CallStatus.active,
        participants: [createMockParticipant({ leftAt: new Date() })] // All participants left
      });
      const newCall = createMockCallSession({
        id: 'call-new',
        participants: [createMockParticipant()],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callSession.findFirst.mockResolvedValue(zombieCall);
      mockPrisma.callSession.update.mockResolvedValue({ ...zombieCall, status: CallStatus.ended });
      mockPrisma.$transaction.mockResolvedValue(newCall);
      mockPrisma.callSession.findUnique.mockResolvedValue(newCall);

      const result = await callService.initiateCall(validInitiateData);

      expect(result.id).toBe('call-new');
      expect(mockPrisma.callSession.update).toHaveBeenCalledWith({
        where: { id: zombieCall.id },
        data: expect.objectContaining({
          status: CallStatus.ended,
          metadata: expect.objectContaining({ endReason: 'zombie_cleanup' })
        })
      });
    });
  });

  describe('joinCall', () => {
    const validJoinData = {
      callId: 'call-123',
      userId: 'user-456',
      settings: {
        audioEnabled: true,
        videoEnabled: true
      }
    };

    it('should successfully join an initiated call', async () => {
      const existingCall = createMockCallSession({
        status: CallStatus.initiated,
        participants: [createMockParticipant()],
        conversation: createMockConversation()
      });
      const updatedCall = {
        ...existingCall,
        status: CallStatus.active,
        participants: [
          createMockParticipant(),
          createMockParticipant({
            id: 'participant-456',
            userId: 'user-456',
            role: ParticipantRole.participant
          })
        ],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callSession.findUnique.mockResolvedValueOnce(existingCall);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-456',
        conversationId: 'conv-123',
        userId: 'user-456',
        isActive: true
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(updatedCall);

      const result = await callService.joinCall(validJoinData);

      expect(result.callSession).toBeDefined();
      expect(result.iceServers).toBeDefined();
      expect(result.iceServers.length).toBeGreaterThan(0);
    });

    it('should throw error when call not found', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.joinCall(validJoinData)).rejects.toThrow(
        'CALL_NOT_FOUND: Call session not found'
      );
    });

    it('should throw error when call has ended', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(
        createMockCallSession({ status: CallStatus.ended })
      );

      await expect(callService.joinCall(validJoinData)).rejects.toThrow(
        'CALL_ENDED: This call has already ended'
      );
    });

    it('should throw error when user not a conversation member', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(
        createMockCallSession({ conversation: createMockConversation() })
      );
      mockPrisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(callService.joinCall(validJoinData)).rejects.toThrow(
        'NOT_A_PARTICIPANT: You are not a participant in this conversation'
      );
    });

    it('should return current state when user already in call', async () => {
      const existingParticipant = createMockParticipant({
        userId: 'user-456',
        user: createMockUser({ id: 'user-456' })
      });
      const callWithUser = createMockCallSession({
        status: CallStatus.active,
        participants: [existingParticipant],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(callWithUser);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-456',
        conversationId: 'conv-123',
        userId: 'user-456',
        isActive: true
      });

      const result = await callService.joinCall(validJoinData);

      expect(result.callSession).toBeDefined();
      expect(result.iceServers).toBeDefined();
    });

    it('should throw error when max participants reached for P2P', async () => {
      const callWith2Participants = createMockCallSession({
        status: CallStatus.active,
        participants: [
          createMockParticipant({ userId: 'user-123' }),
          createMockParticipant({ id: 'participant-789', userId: 'user-789' })
        ],
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(callWith2Participants);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-456',
        conversationId: 'conv-123',
        userId: 'user-456',
        isActive: true
      });

      await expect(callService.joinCall(validJoinData)).rejects.toThrow(
        'MAX_PARTICIPANTS_REACHED: Maximum participants (2) reached for P2P calls'
      );
    });

    it('should update call status to active when joining initiated call', async () => {
      const initiatedCall = createMockCallSession({
        status: CallStatus.initiated,
        participants: [createMockParticipant()],
        conversation: createMockConversation()
      });
      const activeCall = {
        ...initiatedCall,
        status: CallStatus.active,
        answeredAt: new Date(),
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callSession.findUnique.mockResolvedValueOnce(initiatedCall);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-456',
        conversationId: 'conv-123',
        userId: 'user-456',
        isActive: true
      });
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
        await callback({
          callParticipant: { create: jest.fn() },
          callSession: { update: jest.fn() }
        });
      });
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(activeCall);

      const result = await callService.joinCall(validJoinData);

      expect(result.callSession.status).toBe(CallStatus.active);
    });

    it('should provide TURN credentials via TURNCredentialService', async () => {
      const existingCall = createMockCallSession({
        status: CallStatus.initiated,
        participants: [createMockParticipant()],
        conversation: createMockConversation(),
        initiator: createMockUser()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(existingCall);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-456',
        conversationId: 'conv-123',
        userId: 'user-456',
        isActive: true
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);

      const result = await callService.joinCall(validJoinData);

      expect(result.iceServers).toBeDefined();
      expect(result.iceServers).toContainEqual(
        expect.objectContaining({ urls: 'stun:stun.l.google.com:19302' })
      );
      expect(result.iceServers).toContainEqual(
        expect.objectContaining({
          urls: 'turn:turn.example.com:3478',
          username: expect.any(String),
          credential: expect.any(String)
        })
      );
    });
  });

  describe('leaveCall', () => {
    const validLeaveData = {
      callId: 'call-123',
      userId: 'user-123'
    };

    it('should successfully leave call', async () => {
      const participant = createMockParticipant();
      const callWithParticipants = createMockCallSession({
        status: CallStatus.active,
        participants: [
          participant,
          createMockParticipant({ id: 'participant-456', userId: 'user-456' })
        ]
      });
      const updatedCall = {
        ...callWithParticipants,
        participants: [
          { ...participant, leftAt: new Date() },
          createMockParticipant({
            id: 'participant-456',
            userId: 'user-456',
            user: createMockUser({ id: 'user-456' })
          })
        ],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callWithParticipants);
      mockPrisma.$transaction.mockResolvedValue(undefined);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(updatedCall);

      const result = await callService.leaveCall(validLeaveData);

      expect(result).toBeDefined();
    });

    it('should throw error when participant not found', async () => {
      mockPrisma.callParticipant.findFirst.mockResolvedValue(null);

      await expect(callService.leaveCall(validLeaveData)).rejects.toThrow(
        'CALL_NOT_FOUND: You are not in this call'
      );
    });

    it('should throw error when call not found', async () => {
      mockPrisma.callParticipant.findFirst.mockResolvedValue(createMockParticipant());
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.leaveCall(validLeaveData)).rejects.toThrow(
        'CALL_NOT_FOUND: Call session not found'
      );
    });

    it('should end call when last participant leaves', async () => {
      const participant = createMockParticipant();
      const callWithOneParticipant = createMockCallSession({
        status: CallStatus.active,
        participants: [participant]
      });
      const endedCall = {
        ...callWithOneParticipant,
        status: CallStatus.ended,
        endedAt: new Date(),
        participants: [{ ...participant, leftAt: new Date(), user: createMockUser() }],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callWithOneParticipant);
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
        const mockTx = {
          callParticipant: { update: jest.fn() },
          callSession: { update: jest.fn() }
        };
        await callback(mockTx);
        // Verify call session update was called with ended status
        expect(mockTx.callSession.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: CallStatus.ended })
          })
        );
      });
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(endedCall);

      const result = await callService.leaveCall(validLeaveData);

      expect(result.status).toBe(CallStatus.ended);
    });

    it('should not end call when other participants remain', async () => {
      const participant = createMockParticipant();
      const otherParticipant = createMockParticipant({
        id: 'participant-456',
        userId: 'user-456'
      });
      const callWithTwoParticipants = createMockCallSession({
        status: CallStatus.active,
        participants: [participant, otherParticipant]
      });
      const callAfterLeave = {
        ...callWithTwoParticipants,
        participants: [
          { ...participant, leftAt: new Date(), user: createMockUser() },
          { ...otherParticipant, user: createMockUser({ id: 'user-456' }) }
        ],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callWithTwoParticipants);
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
        const mockTx = {
          callParticipant: { update: jest.fn() },
          callSession: { update: jest.fn() }
        };
        await callback(mockTx);
        // Verify call session update was NOT called (call should not end)
        expect(mockTx.callSession.update).not.toHaveBeenCalled();
      });
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callAfterLeave);

      const result = await callService.leaveCall(validLeaveData);

      expect(result.status).toBe(CallStatus.active);
    });
  });

  describe('getCallSession', () => {
    it('should return call session by ID', async () => {
      const mockCall = createMockCallSession({
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);

      const result = await callService.getCallSession('call-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('call-123');
    });

    it('should throw error when call not found', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.getCallSession('invalid-call')).rejects.toThrow(
        'CALL_NOT_FOUND: Call session not found'
      );
    });

    it('should authorize access for call participant', async () => {
      const mockCall = createMockCallSession({
        participants: [
          createMockParticipant({ userId: 'user-123', user: createMockUser() })
        ],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);

      const result = await callService.getCallSession('call-123', 'user-123');

      expect(result).toBeDefined();
    });

    it('should authorize access for conversation member', async () => {
      const mockCall = createMockCallSession({
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);
      mockPrisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-456',
        conversationId: 'conv-123',
        userId: 'user-456',
        isActive: true
      });

      const result = await callService.getCallSession('call-123', 'user-456');

      expect(result).toBeDefined();
    });

    it('should throw error for unauthorized access (CVE-003)', async () => {
      const mockCall = createMockCallSession({
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);
      mockPrisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(callService.getCallSession('call-123', 'unauthorized-user')).rejects.toThrow(
        'NOT_A_PARTICIPANT: You do not have access to this call'
      );
    });
  });

  describe('endCall', () => {
    it('should successfully end call by initiator', async () => {
      const initiatorParticipant = createMockParticipant({
        role: ParticipantRole.initiator
      });
      const mockCall = createMockCallSession({
        status: CallStatus.active,
        participants: [initiatorParticipant]
      });
      const endedCall = {
        ...mockCall,
        status: CallStatus.ended,
        endedAt: new Date(),
        participants: [{ ...initiatorParticipant, leftAt: new Date(), user: createMockUser() }],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callSession.findUnique.mockResolvedValueOnce(mockCall);
      mockPrisma.$transaction.mockResolvedValue(undefined);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(endedCall);

      const result = await callService.endCall('call-123', 'user-123');

      expect(result.status).toBe(CallStatus.ended);
    });

    it('should throw error for anonymous users (CVE-004)', async () => {
      await expect(
        callService.endCall('call-123', 'anon-123', true)
      ).rejects.toThrow(
        'PERMISSION_DENIED: Anonymous users cannot end calls. Use leave instead.'
      );
    });

    it('should throw error when call not found', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.endCall('invalid-call', 'user-123')).rejects.toThrow(
        'CALL_NOT_FOUND: Call session not found'
      );
    });

    it('should return current state if call already ended', async () => {
      const endedCall = createMockCallSession({
        status: CallStatus.ended,
        participants: [createMockParticipant({ leftAt: new Date(), user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(endedCall);

      const result = await callService.endCall('call-123', 'user-123');

      expect(result.status).toBe(CallStatus.ended);
    });

    it('should throw error when user not in call', async () => {
      const mockCall = createMockCallSession({
        status: CallStatus.active,
        participants: [createMockParticipant({ userId: 'other-user' })]
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);

      await expect(callService.endCall('call-123', 'user-123')).rejects.toThrow(
        'NOT_A_PARTICIPANT: You are not in this call'
      );
    });

    it('should throw error when non-initiator tries to end call (CVE-004)', async () => {
      const participantRole = createMockParticipant({
        userId: 'user-456',
        role: ParticipantRole.participant
      });
      const mockCall = createMockCallSession({
        status: CallStatus.active,
        participants: [
          createMockParticipant({ role: ParticipantRole.initiator }),
          participantRole
        ]
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);

      await expect(callService.endCall('call-123', 'user-456')).rejects.toThrow(
        'PERMISSION_DENIED: Only the call initiator can end the call'
      );
    });
  });

  describe('getActiveCallForConversation', () => {
    it('should return active call for conversation', async () => {
      const activeCall = createMockCallSession({
        status: CallStatus.active,
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findFirst.mockResolvedValue(activeCall);

      const result = await callService.getActiveCallForConversation('conv-123');

      expect(result).toBeDefined();
      expect(result?.status).toBe(CallStatus.active);
    });

    it('should return null when no active call', async () => {
      mockPrisma.callSession.findFirst.mockResolvedValue(null);

      const result = await callService.getActiveCallForConversation('conv-123');

      expect(result).toBeNull();
    });

    it('should find initiated calls as active', async () => {
      const initiatedCall = createMockCallSession({
        status: CallStatus.initiated,
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findFirst.mockResolvedValue(initiatedCall);

      const result = await callService.getActiveCallForConversation('conv-123');

      expect(result).toBeDefined();
      expect(result?.status).toBe(CallStatus.initiated);
    });

    it('should find ringing calls as active', async () => {
      const ringingCall = createMockCallSession({
        status: CallStatus.ringing,
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findFirst.mockResolvedValue(ringingCall);

      const result = await callService.getActiveCallForConversation('conv-123');

      expect(result).toBeDefined();
      expect(result?.status).toBe(CallStatus.ringing);
    });
  });

  describe('updateParticipantMedia', () => {
    it('should update audio state', async () => {
      const participant = createMockParticipant({ isAudioEnabled: true });
      const updatedCall = createMockCallSession({
        participants: [{ ...participant, isAudioEnabled: false, user: createMockUser() }],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
      mockPrisma.callParticipant.update.mockResolvedValue({ ...participant, isAudioEnabled: false });
      mockPrisma.callSession.findUnique.mockResolvedValue(updatedCall);

      const result = await callService.updateParticipantMedia(
        'call-123',
        'user-123',
        'audio',
        false
      );

      expect(result).toBeDefined();
      expect(mockPrisma.callParticipant.update).toHaveBeenCalledWith({
        where: { id: participant.id },
        data: { isAudioEnabled: false }
      });
    });

    it('should update video state', async () => {
      const participant = createMockParticipant({ isVideoEnabled: true });
      const updatedCall = createMockCallSession({
        participants: [{ ...participant, isVideoEnabled: false, user: createMockUser() }],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
      mockPrisma.callParticipant.update.mockResolvedValue({ ...participant, isVideoEnabled: false });
      mockPrisma.callSession.findUnique.mockResolvedValue(updatedCall);

      const result = await callService.updateParticipantMedia(
        'call-123',
        'user-123',
        'video',
        false
      );

      expect(result).toBeDefined();
      expect(mockPrisma.callParticipant.update).toHaveBeenCalledWith({
        where: { id: participant.id },
        data: { isVideoEnabled: false }
      });
    });

    it('should throw error when participant not found', async () => {
      mockPrisma.callParticipant.findFirst.mockResolvedValue(null);

      await expect(
        callService.updateParticipantMedia('call-123', 'user-123', 'audio', false)
      ).rejects.toThrow('CALL_NOT_FOUND: You are not in this call');
    });
  });

  describe('markCallAsMissed', () => {
    it('should mark call as missed', async () => {
      const callSession = createMockCallSession({
        status: CallStatus.initiated,
        participants: [createMockParticipant()]
      });
      const missedCall = {
        ...callSession,
        status: CallStatus.missed,
        endedAt: new Date(),
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callSession);
      mockPrisma.callSession.update.mockResolvedValue(missedCall);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(missedCall);

      const result = await callService.markCallAsMissed('call-123');

      expect(result.status).toBe(CallStatus.missed);
      expect(mockPrisma.callSession.update).toHaveBeenCalledWith({
        where: { id: 'call-123' },
        data: expect.objectContaining({
          status: CallStatus.missed,
          metadata: expect.objectContaining({ endReason: 'missed' })
        })
      });
    });

    it('should throw error when call not found', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.markCallAsMissed('invalid-call')).rejects.toThrow(
        'CALL_NOT_FOUND: Call session not found'
      );
    });
  });

  describe('markCallAsRejected', () => {
    it('should mark call as rejected', async () => {
      const callSession = createMockCallSession({
        status: CallStatus.initiated,
        participants: [createMockParticipant()]
      });
      const rejectedCall = {
        ...callSession,
        status: CallStatus.rejected,
        endedAt: new Date(),
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callSession);
      mockPrisma.callSession.update.mockResolvedValue(rejectedCall);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(rejectedCall);

      const result = await callService.markCallAsRejected('call-123');

      expect(result.status).toBe(CallStatus.rejected);
      expect(mockPrisma.callSession.update).toHaveBeenCalledWith({
        where: { id: 'call-123' },
        data: expect.objectContaining({
          status: CallStatus.rejected,
          metadata: expect.objectContaining({ endReason: 'rejected' })
        })
      });
    });

    it('should throw error when call not found', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.markCallAsRejected('invalid-call')).rejects.toThrow(
        'CALL_NOT_FOUND: Call session not found'
      );
    });
  });

  describe('getUnrespondedParticipants', () => {
    it('should return users who have not joined the call', async () => {
      const callSession = createMockCallSession({
        participants: [createMockParticipant({ userId: 'user-123' })],
        conversation: {
          ...createMockConversation(),
          members: [
            { userId: 'user-123' },
            { userId: 'user-456' },
            { userId: 'user-789' }
          ]
        }
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);

      const result = await callService.getUnrespondedParticipants('call-123');

      expect(result).toContain('user-456');
      expect(result).toContain('user-789');
      expect(result).not.toContain('user-123'); // Initiator
    });

    it('should return empty array when call not found', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      const result = await callService.getUnrespondedParticipants('invalid-call');

      expect(result).toEqual([]);
    });

    it('should exclude initiator from unresponded list', async () => {
      const callSession = createMockCallSession({
        initiatorId: 'user-123',
        participants: [createMockParticipant({ userId: 'user-123' })],
        conversation: {
          ...createMockConversation(),
          members: [
            { userId: 'user-123' },
            { userId: 'user-456' }
          ]
        }
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);

      const result = await callService.getUnrespondedParticipants('call-123');

      expect(result).not.toContain('user-123');
      expect(result).toContain('user-456');
    });

    it('should return empty array when all participants have joined', async () => {
      const callSession = createMockCallSession({
        initiatorId: 'user-123',
        participants: [
          createMockParticipant({ userId: 'user-123' }),
          createMockParticipant({ id: 'participant-456', userId: 'user-456' })
        ],
        conversation: {
          ...createMockConversation(),
          members: [
            { userId: 'user-123' },
            { userId: 'user-456' }
          ]
        }
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);

      const result = await callService.getUnrespondedParticipants('call-123');

      expect(result).toEqual([]);
    });
  });
});

describe('CallService - Edge Cases', () => {
  let callService: CallService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  it('should handle concurrent join attempts gracefully', async () => {
    const existingCall = createMockCallSession({
      status: CallStatus.initiated,
      participants: [createMockParticipant()],
      conversation: createMockConversation()
    });

    mockPrisma.callSession.findUnique.mockResolvedValue(existingCall);
    mockPrisma.conversationMember.findFirst.mockResolvedValue({
      id: 'member-456',
      conversationId: 'conv-123',
      userId: 'user-456',
      isActive: true
    });

    // Simulate database constraint error on duplicate join
    mockPrisma.$transaction.mockRejectedValue(new Error('Unique constraint violation'));

    await expect(
      callService.joinCall({ callId: 'call-123', userId: 'user-456' })
    ).rejects.toThrow();
  });

  it('should handle null userId in participants', async () => {
    const callSession = createMockCallSession({
      participants: [
        createMockParticipant({ userId: 'user-123' }),
        { ...createMockParticipant({ id: 'participant-anon' }), userId: null as any }
      ],
      conversation: {
        ...createMockConversation(),
        members: [
          { userId: 'user-123' },
          { userId: 'user-456' }
        ]
      }
    });

    mockPrisma.callSession.findUnique.mockResolvedValue(callSession);

    const result = await callService.getUnrespondedParticipants('call-123');

    // Should handle null userId gracefully
    expect(result).toContain('user-456');
  });

  it('should calculate duration correctly on call end', async () => {
    const startTime = new Date(Date.now() - 60000); // 1 minute ago
    const participant = createMockParticipant({ role: ParticipantRole.initiator });
    const mockCall = createMockCallSession({
      status: CallStatus.active,
      startedAt: startTime,
      participants: [participant]
    });

    mockPrisma.callSession.findUnique.mockResolvedValueOnce(mockCall);
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
      const mockTx = {
        callParticipant: { updateMany: jest.fn() },
        callSession: {
          update: jest.fn().mockImplementation(({ data }) => {
            // Verify duration is approximately 60 seconds
            expect(data.duration).toBeGreaterThanOrEqual(59);
            expect(data.duration).toBeLessThanOrEqual(61);
          })
        }
      };
      await callback(mockTx);
    });
    mockPrisma.callSession.findUnique.mockResolvedValueOnce({
      ...mockCall,
      status: CallStatus.ended,
      duration: 60,
      participants: [{ ...participant, leftAt: new Date(), user: createMockUser() }],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });

    await callService.endCall('call-123', 'user-123');
  });
});

describe('CallService - Error Code Verification', () => {
  let callService: CallService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  it('should use CONVERSATION_NOT_FOUND error code', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null);

    await expect(
      callService.initiateCall({
        conversationId: 'invalid',
        initiatorId: 'user-123',
        type: 'video'
      })
    ).rejects.toThrow(/CONVERSATION_NOT_FOUND/);
  });

  it('should use VIDEO_CALLS_NOT_SUPPORTED error code', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(
      createMockConversation({ type: 'public' })
    );

    await expect(
      callService.initiateCall({
        conversationId: 'conv-123',
        initiatorId: 'user-123',
        type: 'video'
      })
    ).rejects.toThrow(/VIDEO_CALLS_NOT_SUPPORTED/);
  });

  it('should use NOT_A_PARTICIPANT error code', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
    mockPrisma.conversationMember.findFirst.mockResolvedValue(null);

    await expect(
      callService.initiateCall({
        conversationId: 'conv-123',
        initiatorId: 'user-123',
        type: 'video'
      })
    ).rejects.toThrow(/NOT_A_PARTICIPANT/);
  });

  it('should use CALL_ALREADY_ACTIVE error code', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
    mockPrisma.conversationMember.findFirst.mockResolvedValue({
      id: 'member-123',
      conversationId: 'conv-123',
      userId: 'user-123',
      isActive: true
    });
    mockPrisma.callSession.findFirst.mockResolvedValue(
      createMockCallSession({
        status: CallStatus.active,
        participants: [createMockParticipant()]
      })
    );

    await expect(
      callService.initiateCall({
        conversationId: 'conv-123',
        initiatorId: 'user-123',
        type: 'video'
      })
    ).rejects.toThrow(/CALL_ALREADY_ACTIVE/);
  });

  it('should use CALL_NOT_FOUND error code', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(null);

    await expect(
      callService.joinCall({ callId: 'invalid', userId: 'user-123' })
    ).rejects.toThrow(/CALL_NOT_FOUND/);
  });

  it('should use CALL_ENDED error code', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(
      createMockCallSession({ status: CallStatus.ended })
    );

    await expect(
      callService.joinCall({ callId: 'call-123', userId: 'user-123' })
    ).rejects.toThrow(/CALL_ENDED/);
  });

  it('should use MAX_PARTICIPANTS_REACHED error code', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(
      createMockCallSession({
        status: CallStatus.active,
        participants: [
          createMockParticipant(),
          createMockParticipant({ id: 'p2', userId: 'user-456' })
        ],
        conversation: createMockConversation()
      })
    );
    mockPrisma.conversationMember.findFirst.mockResolvedValue({
      id: 'member-789',
      conversationId: 'conv-123',
      userId: 'user-789',
      isActive: true
    });

    await expect(
      callService.joinCall({ callId: 'call-123', userId: 'user-789' })
    ).rejects.toThrow(/MAX_PARTICIPANTS_REACHED/);
  });

  it('should use PERMISSION_DENIED error code for anonymous end call', async () => {
    await expect(
      callService.endCall('call-123', 'anon-123', true)
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it('should use PERMISSION_DENIED error code for non-initiator end call', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(
      createMockCallSession({
        status: CallStatus.active,
        participants: [
          createMockParticipant({ role: ParticipantRole.initiator }),
          createMockParticipant({
            id: 'p2',
            userId: 'user-456',
            role: ParticipantRole.participant
          })
        ]
      })
    );

    await expect(
      callService.endCall('call-123', 'user-456')
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });
});
