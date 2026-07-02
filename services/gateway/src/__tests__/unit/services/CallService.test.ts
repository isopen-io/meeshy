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

import { describe, it, expect, beforeEach, jest, afterEach, beforeAll } from '@jest/globals';

// Mock call-summary utils
jest.mock('@meeshy/shared/utils/call-summary', () => ({
  buildCallSummaryWithMetadata: jest.fn(),
  callSummaryClientMessageId: jest.fn().mockReturnValue('summary-msg-id-123')
}));

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
    CALL_STATE_CONFLICT: 'CALL_STATE_CONFLICT',
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
import { CallMode, CallStatus, ParticipantRole, CallEndReason } from '@meeshy/shared/prisma/client';
import { buildCallSummaryWithMetadata } from '@meeshy/shared/utils/call-summary';

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
      findFirst: jest.fn() as MockFn,
      // Atomic active-call claim (see CallService.initiateCall/releaseActiveCallClaim).
      // Defaults to "claim won" so existing tests that don't exercise the
      // race path are unaffected.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) as MockFn
    },
    participant: {
      findFirst: jest.fn() as MockFn
    },
    callSession: {
      create: jest.fn() as MockFn,
      findUnique: jest.fn() as MockFn,
      findFirst: jest.fn() as MockFn,
      update: jest.fn() as MockFn,
      // Version-guarded writes (updateCallStatus/initiateCall zombie cleanup)
      // default to "lock won" so existing tests that don't exercise the race
      // path are unaffected — mirrors conversation.updateMany's default above.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) as MockFn
    },
    callParticipant: {
      create: jest.fn() as MockFn,
      findFirst: jest.fn() as MockFn,
      findMany: jest.fn() as MockFn,
      update: jest.fn() as MockFn,
      updateMany: jest.fn() as MockFn
    },
    message: {
      create: jest.fn() as MockFn
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
  participants?: Array<{ id: string; userId: string }>;
}

interface MockCallParticipant {
  id: string;
  callSessionId: string;
  participantId: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: Date;
  leftAt: Date | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  user?: MockUser;
  participant?: { userId: string; user: MockUser };
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
  version: number;
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
  version: 1,
  ...overrides
});

const createMockParticipant = (overrides: Partial<MockCallParticipant> = {}): MockCallParticipant => ({
  id: 'participant-123',
  callSessionId: 'call-123',
  participantId: 'participant-123',
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
      participantId: 'participant-123',
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
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callParticipant.findMany.mockResolvedValue([]); // No stale participations
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

    it('audit C5: writes leftAt: null explicitly on the initiator\'s CallParticipant (see matching joinCall test — findFirst({leftAt: null}) never matches a field Prisma never wrote to the Mongo document)', async () => {
      const mockConversation = createMockConversation();
      const mockCallSession = createMockCallSession({
        participants: [createMockParticipant()],
        initiator: createMockUser(),
        conversation: mockConversation
      });

      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callParticipant.findMany.mockResolvedValue([]);
      mockPrisma.callSession.findFirst.mockResolvedValue(null);
      mockPrisma.callSession.findUnique.mockResolvedValue(mockCallSession);

      let capturedData: Record<string, unknown> | undefined;
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          callSession: { create: jest.fn().mockResolvedValue(mockCallSession) },
          callParticipant: {
            create: jest.fn().mockImplementation(({ data }: any) => {
              capturedData = data;
              return {};
            })
          }
        };
        return cb(tx);
      });

      await callService.initiateCall(validInitiateData);

      expect(capturedData).toHaveProperty('leftAt', null);
    });

    it('audit C5: phantom cleanup scans initiator participations matching leftAt null OR unset', async () => {
      const mockConversation = createMockConversation();
      const mockCallSession = createMockCallSession({
        participants: [createMockParticipant()],
        initiator: createMockUser(),
        conversation: mockConversation
      });

      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callParticipant.findMany.mockResolvedValue([]);
      mockPrisma.callSession.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue(mockCallSession);
      mockPrisma.callSession.findUnique.mockResolvedValue(mockCallSession);

      await callService.initiateCall(validInitiateData);

      expect(mockPrisma.callParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
            participant: { userId: 'user-123' }
          })
        })
      );
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
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callParticipant.findMany.mockResolvedValue([]); // No stale participations
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
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callParticipant.findMany.mockResolvedValue([]); // No stale participations
      mockPrisma.callSession.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue(mockCallSession);
      mockPrisma.callSession.findUnique.mockResolvedValue(mockCallSession);

      const result = await callService.initiateCall(validInitiateData);

      expect(result).toBeDefined();
    });

    it('should throw error when user is not a conversation member', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(callService.initiateCall(validInitiateData)).rejects.toThrow(
        'NOT_A_PARTICIPANT: You are not a participant in this conversation'
      );
    });

    it('should reject when participantId is undefined without querying Prisma (security regression guard)', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());

      await expect(
        callService.initiateCall({ ...validInitiateData, participantId: undefined })
      ).rejects.toThrow('NOT_A_PARTICIPANT: You are not a participant in this conversation');

      // `id: undefined` in a Prisma `where` clause is treated as an omitted
      // field (matches ANY participant), not "match nothing" — the guard
      // MUST short-circuit before the query is ever issued.
      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    });

    it('should throw error when call already active', async () => {
      const activeCall = createMockCallSession({
        status: CallStatus.active,
        participants: [createMockParticipant()]
      });

      mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callParticipant.findMany.mockResolvedValue([]); // No stale participations
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
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'member-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        isActive: true
      });
      mockPrisma.callParticipant.findMany.mockResolvedValue([]); // No stale participations
      mockPrisma.callSession.findFirst.mockResolvedValue(zombieCall);
      mockPrisma.callSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockResolvedValue(newCall);
      mockPrisma.callSession.findUnique.mockResolvedValue(newCall);

      const result = await callService.initiateCall(validInitiateData);

      expect(result.id).toBe('call-new');
      // Status-guarded (see CallService.initiateCall's doc comment): scoped to
      // status still in ACTIVE_STATUSES so a reconnecting last participant
      // can't be force-ended out from under itself.
      expect(mockPrisma.callSession.updateMany).toHaveBeenCalledWith({
        where: { id: zombieCall.id, status: { in: expect.arrayContaining([CallStatus.active]) } },
        data: expect.objectContaining({
          status: CallStatus.ended,
          endReason: 'garbageCollected'
        })
      });
    });
  });

  describe('joinCall', () => {
    const validJoinData = {
      callId: 'call-123',
      userId: 'user-456',
      participantId: 'participant-456',
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
      mockPrisma.participant.findFirst.mockResolvedValue({
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
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(callService.joinCall(validJoinData)).rejects.toThrow(
        'NOT_A_PARTICIPANT: You are not a participant in this conversation'
      );
    });

    it('should reject when participantId is undefined without querying Prisma (security regression guard)', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(
        createMockCallSession({ conversation: createMockConversation() })
      );

      await expect(
        callService.joinCall({ ...validJoinData, participantId: undefined })
      ).rejects.toThrow('NOT_A_PARTICIPANT: You are not a participant in this conversation');

      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    });

    it('should return current state when user already in call', async () => {
      const existingParticipant = createMockParticipant({
        participantId: 'participant-456',
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
      mockPrisma.participant.findFirst.mockResolvedValue({
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
      mockPrisma.participant.findFirst.mockResolvedValue({
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
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'member-456',
        conversationId: 'conv-123',
        userId: 'user-456',
        isActive: true
      });
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
        await callback({
          callParticipant: { create: jest.fn() },
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
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
      mockPrisma.participant.findFirst.mockResolvedValue({
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
      userId: 'user-123',
      participantId: 'participant-123'
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

    it('audit C5: finds the leaver matching leftAt null OR unset (Mongo missing-field docs)', async () => {
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
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callWithParticipants);
      mockPrisma.$transaction.mockResolvedValue(undefined);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(updatedCall);

      await callService.leaveCall(validLeaveData);

      expect(mockPrisma.callParticipant.findFirst).toHaveBeenCalledWith({
        where: {
          callSessionId: 'call-123',
          participantId: 'participant-123',
          OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
        }
      });
    });

    it('should throw error when participant not found and call session missing', async () => {
      // CALL-FIX 2026-06-06 — leaveCall is now idempotent: a missing active
      // CallParticipant row no longer throws on its own. It only throws when the
      // call session itself cannot be found (terminal CALL_NOT_FOUND).
      mockPrisma.callParticipant.findFirst.mockResolvedValue(null);
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.leaveCall(validLeaveData)).rejects.toThrow(
        'CALL_NOT_FOUND: Call session not found'
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
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
        };
        await callback(mockTx);
        // Verify the version-guarded call session update was called with ended status
        expect(mockTx.callSession.updateMany).toHaveBeenCalledWith(
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
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
        };
        await callback(mockTx);
        // Verify call session update was NOT called (call should not end)
        expect(mockTx.callSession.updateMany).not.toHaveBeenCalled();
      });
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callAfterLeave);

      const result = await callService.leaveCall(validLeaveData);

      expect(result.status).toBe(CallStatus.active);
    });

    it('should clear the leaving participant heartbeat from in-memory tracking when others remain', async () => {
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

      callService.recordHeartbeat(validLeaveData.callId, validLeaveData.participantId);
      callService.recordHeartbeat(validLeaveData.callId, otherParticipant.id);

      mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callWithTwoParticipants);
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
        const mockTx = {
          callParticipant: { update: jest.fn() },
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
        };
        await callback(mockTx);
      });
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callAfterLeave);

      await callService.leaveCall(validLeaveData);

      const remainingHeartbeats = (callService as any).heartbeats.get(validLeaveData.callId) as Map<string, number> | undefined;
      expect(remainingHeartbeats?.has(validLeaveData.participantId)).toBe(false);
      expect(remainingHeartbeats?.has(otherParticipant.id)).toBe(true);
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

    it('should authorize a user who is already in the call (fast path, no membership query)', async () => {
      const mockCall = createMockCallSession({
        participants: [
          createMockParticipant({
            participantId: 'participant-123',
            participant: { userId: 'user-789', user: createMockUser() }
          })
        ],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);

      const result = await callService.getCallSession('call-123', 'user-789');

      expect(result).toBeDefined();
      // The user maps to an existing CallParticipant → no conversation lookup.
      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    });

    it('should authorize a conversation member by USER id, not participant id (regression: Participant migration 403)', async () => {
      const mockCall = createMockCallSession({
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'participant-456',
        conversationId: 'conv-123',
        userId: 'user-456',
        isActive: true
      });

      // The REST route passes `authContext.userId`; a callee fetching the call to
      // answer it is not yet a CallParticipant and has no Participant row whose
      // `id` equals their `userId`. Membership MUST be resolved by `userId`.
      const result = await callService.getCallSession('call-123', 'user-456');

      expect(result).toBeDefined();
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: { conversationId: 'conv-123', userId: 'user-456', isActive: true }
      });
    });

    it('should throw error for unauthorized access (CVE-003)', async () => {
      const mockCall = createMockCallSession({
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(callService.getCallSession('call-123', 'user-stranger')).rejects.toThrow(
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

      const result = await callService.endCall('call-123', 'user-123', 'participant-123');

      expect(result.status).toBe(CallStatus.ended);
    });

    it('should throw error for anonymous users (CVE-004)', async () => {
      await expect(
        callService.endCall('call-123', 'anon-123', 'participant-anon', true)
      ).rejects.toThrow(
        'PERMISSION_DENIED: Anonymous users cannot end calls. Use leave instead.'
      );
    });

    it('clears a pending ringing timer on end (item I — REST DELETE never cleared it, leaving a stray timer)', async () => {
      jest.useFakeTimers();
      try {
        const staleTimerCallback = jest.fn();
        callService.scheduleRingingTimeout('call-123', staleTimerCallback);

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

        await callService.endCall('call-123', 'user-123', 'participant-123');

        jest.advanceTimersByTime(61_000);
        expect(staleTimerCallback).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should throw error when call not found', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.endCall('invalid-call', 'user-123', 'participant-123')).rejects.toThrow(
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

      const result = await callService.endCall('call-123', 'user-123', 'participant-123');

      expect(result.status).toBe(CallStatus.ended);
    });

    it('should return current state without overwriting when call already resolved to missed (duplicate call:end)', async () => {
      // Mirrors the real race: the ringing-timeout path (`markCallAsMissed`)
      // resolves the CallSession to `missed` WITHOUT touching participant
      // rows (see markCallAsMissed) — so a delayed/retried `call:end` from
      // the initiator still finds its own participant with `leftAt: null`.
      const missedCall = createMockCallSession({
        status: CallStatus.missed,
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(missedCall);

      const result = await callService.endCall('call-123', 'user-123', 'participant-123');

      expect(result.status).toBe(CallStatus.missed);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should return current state without overwriting when call already rejected (duplicate call:end)', async () => {
      const rejectedCall = createMockCallSession({
        status: CallStatus.rejected,
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(rejectedCall);

      const result = await callService.endCall('call-123', 'user-123', 'participant-123');

      expect(result.status).toBe(CallStatus.rejected);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw error when user not in call', async () => {
      const mockCall = createMockCallSession({
        status: CallStatus.active,
        participants: [createMockParticipant({ participantId: 'other-participant', userId: 'other-user' })]
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(mockCall);

      await expect(callService.endCall('call-123', 'user-123', 'participant-123')).rejects.toThrow(
        'NOT_A_PARTICIPANT: You are not in this call'
      );
    });

    it('should allow any active participant to end a P2P call (spec C4)', async () => {
      const participantRole = createMockParticipant({
        id: 'p2',
        participantId: 'participant-456',
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
      mockPrisma.$transaction.mockResolvedValue(undefined);

      await expect(
        callService.endCall('call-123', 'user-456', 'participant-456')
      ).resolves.toBeDefined();
    });

    it('audit C3/C4: resolves a pre-answer end (still ringing) as missed, not completed', async () => {
      const initiatorParticipant = createMockParticipant({
        role: ParticipantRole.initiator
      });
      const mockCall = createMockCallSession({
        status: CallStatus.ringing,
        answeredAt: null,
        participants: [initiatorParticipant]
      });
      const endedCall = {
        ...mockCall,
        status: CallStatus.missed,
        endedAt: new Date(),
        participants: [{ ...initiatorParticipant, leftAt: new Date(), user: createMockUser() }],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callSession.findUnique.mockResolvedValueOnce(mockCall);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.callSession.update.mockResolvedValue(undefined);
      mockPrisma.callParticipant.updateMany.mockResolvedValue(undefined);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(endedCall);

      await callService.endCall('call-123', 'user-123', 'participant-123');

      const updateCall = mockPrisma.callSession.updateMany.mock.calls[0];
      expect(updateCall[0].data.status).toBe(CallStatus.missed);
      expect(updateCall[0].data.endReason).toBe(CallEndReason.missed);
      expect(updateCall[0].data.duration).toBe(0);
    });

    it('audit C3/C4: preserves an explicit reason (rejected) while still marking status missed pre-answer', async () => {
      const initiatorParticipant = createMockParticipant({
        role: ParticipantRole.initiator
      });
      const mockCall = createMockCallSession({
        status: CallStatus.ringing,
        answeredAt: null,
        participants: [initiatorParticipant]
      });
      const endedCall = {
        ...mockCall,
        status: CallStatus.missed,
        endedAt: new Date(),
        participants: [{ ...initiatorParticipant, leftAt: new Date(), user: createMockUser() }],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callSession.findUnique.mockResolvedValueOnce(mockCall);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.callSession.update.mockResolvedValue(undefined);
      mockPrisma.callParticipant.updateMany.mockResolvedValue(undefined);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(endedCall);

      await callService.endCall('call-123', 'user-123', 'participant-123', false, 'rejected');

      const updateCall = mockPrisma.callSession.updateMany.mock.calls[0];
      expect(updateCall[0].data.status).toBe(CallStatus.missed);
      expect(updateCall[0].data.endReason).toBe(CallEndReason.rejected);
    });

    it('audit C3/C4: an answered call still ends as completed regardless of pre-answer logic', async () => {
      const initiatorParticipant = createMockParticipant({
        role: ParticipantRole.initiator
      });
      const mockCall = createMockCallSession({
        status: CallStatus.active,
        answeredAt: new Date(),
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
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.callSession.update.mockResolvedValue(undefined);
      mockPrisma.callParticipant.updateMany.mockResolvedValue(undefined);
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(endedCall);

      await callService.endCall('call-123', 'user-123', 'participant-123');

      const updateCall = mockPrisma.callSession.updateMany.mock.calls[0];
      expect(updateCall[0].data.status).toBe(CallStatus.ended);
      expect(updateCall[0].data.endReason).toBe(CallEndReason.completed);
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

    it('audit C5: looks up the active participant matching leftAt null OR unset (100% media-toggle no-op in prod)', async () => {
      const participant = createMockParticipant({ isAudioEnabled: true });
      const updatedCall = createMockCallSession({
        participants: [{ ...participant, isAudioEnabled: false, user: createMockUser() }],
        initiator: createMockUser(),
        conversation: createMockConversation()
      });

      mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
      mockPrisma.callParticipant.update.mockResolvedValue({ ...participant, isAudioEnabled: false });
      mockPrisma.callSession.findUnique.mockResolvedValue(updatedCall);

      await callService.updateParticipantMedia('call-123', 'user-123', 'audio', false);

      expect(mockPrisma.callParticipant.findFirst).toHaveBeenCalledWith({
        where: {
          callSessionId: 'call-123',
          participantId: 'user-123',
          OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
        }
      });
    });

    it('should throw error when participant not found and call session missing', async () => {
      // CALL-FIX 2026-06-06 — updateParticipantMedia is now tolerant: a missing
      // active CallParticipant row no longer throws (the toggle still broadcasts).
      // It falls through to getCallSession, which is the path that raises
      // CALL_NOT_FOUND when the call session itself cannot be resolved.
      mockPrisma.callParticipant.findFirst.mockResolvedValue(null);
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(
        callService.updateParticipantMedia('call-123', 'user-123', 'audio', false)
      ).rejects.toThrow('CALL_NOT_FOUND: Call session not found');
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
      mockPrisma.callSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(missedCall);

      const result = await callService.markCallAsMissed('call-123');

      expect(result.status).toBe(CallStatus.missed);
      expect(mockPrisma.callSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'call-123', status: { in: [CallStatus.initiated, CallStatus.ringing] } },
        data: expect.objectContaining({
          status: CallStatus.missed,
          endReason: 'missed'
        })
      });
    });

    it('returns current state without releasing claims when it loses the race to a concurrent terminal write', async () => {
      // Two writers can both pass the top-of-function status guard (both read
      // `ringing`) then race on the write itself — e.g. the ringing-timeout
      // handler's own atomic updateMany resolves the row to `missed` a beat
      // before this path's updateMany runs. The status-scoped where clause
      // then matches zero rows; count === 0 must short-circuit rather than
      // re-run clearHeartbeats/releaseActiveCallClaim on stale assumptions.
      const callSession = createMockCallSession({
        status: CallStatus.ringing,
        participants: [createMockParticipant()]
      });
      const raceWinnerCall = {
        ...callSession,
        status: CallStatus.missed,
        endedAt: new Date(),
        participants: [createMockParticipant({ user: createMockUser() })],
        initiator: createMockUser(),
        conversation: createMockConversation()
      };

      mockPrisma.callSession.findUnique.mockResolvedValueOnce(callSession);
      mockPrisma.callSession.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.callSession.findUnique.mockResolvedValueOnce(raceWinnerCall);

      const result = await callService.markCallAsMissed('call-123');

      expect(result.status).toBe(CallStatus.missed);
      expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('should throw error when call not found', async () => {
      mockPrisma.callSession.findUnique.mockResolvedValue(null);

      await expect(callService.markCallAsMissed('invalid-call')).rejects.toThrow(
        'CALL_NOT_FOUND: Call session not found'
      );
    });

    it('clears a pending ringing timer when marking missed (item I)', async () => {
      jest.useFakeTimers();
      try {
        const staleTimerCallback = jest.fn();
        callService.scheduleRingingTimeout('call-123', staleTimerCallback);

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
        mockPrisma.callSession.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.callSession.findUnique.mockResolvedValueOnce(missedCall);

        await callService.markCallAsMissed('call-123');

        jest.advanceTimersByTime(61_000);
        expect(staleTimerCallback).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getUnrespondedParticipants', () => {
    it('should return users who have not joined the call', async () => {
      const callSession = createMockCallSession({
        participants: [createMockParticipant({ participantId: 'p-123', userId: 'user-123' })],
        conversation: {
          ...createMockConversation(),
          participants: [
            { id: 'p-123', userId: 'user-123' },
            { id: 'p-456', userId: 'user-456' },
            { id: 'p-789', userId: 'user-789' }
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
        participants: [createMockParticipant({ participantId: 'p-123', userId: 'user-123' })],
        conversation: {
          ...createMockConversation(),
          participants: [
            { id: 'p-123', userId: 'user-123' },
            { id: 'p-456', userId: 'user-456' }
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
          createMockParticipant({ participantId: 'p-123', userId: 'user-123' }),
          createMockParticipant({ id: 'cp-456', participantId: 'p-456', userId: 'user-456' })
        ],
        conversation: {
          ...createMockConversation(),
          participants: [
            { id: 'p-123', userId: 'user-123' },
            { id: 'p-456', userId: 'user-456' }
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
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456',
      conversationId: 'conv-123',
      userId: 'user-456',
      isActive: true
    });

    // Simulate database constraint error on duplicate join
    mockPrisma.$transaction.mockRejectedValue(new Error('Unique constraint violation'));

    await expect(
      callService.joinCall({ callId: 'call-123', userId: 'user-456', participantId: 'participant-456' })
    ).rejects.toThrow();
  });

  it('should handle null userId in participants', async () => {
    const callSession = createMockCallSession({
      participants: [
        createMockParticipant({ participantId: 'p-123', userId: 'user-123' }),
        { ...createMockParticipant({ id: 'participant-anon', participantId: 'p-anon' }), userId: null as any }
      ],
      conversation: {
        ...createMockConversation(),
        participants: [
          { id: 'p-123', userId: 'user-123' },
          { id: 'p-456', userId: 'user-456' }
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
    const participant = createMockParticipant({ participantId: 'participant-123', role: ParticipantRole.initiator });
    const mockCall = createMockCallSession({
      status: CallStatus.active,
      startedAt: startTime,
      answeredAt: startTime,
      participants: [participant]
    });

    mockPrisma.callSession.findUnique.mockResolvedValueOnce(mockCall);
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
      const mockTx = {
        callParticipant: { updateMany: jest.fn() },
        callSession: {
          updateMany: jest.fn().mockImplementation(({ data }) => {
            // Verify duration is approximately 60 seconds
            expect(data.duration).toBeGreaterThanOrEqual(59);
            expect(data.duration).toBeLessThanOrEqual(61);
            return { count: 1 };
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

    await callService.endCall('call-123', 'user-123', 'participant-123');
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
        participantId: 'participant-123',
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
        participantId: 'participant-123',
        type: 'video'
      })
    ).rejects.toThrow(/VIDEO_CALLS_NOT_SUPPORTED/);
  });

  it('should use NOT_A_PARTICIPANT error code', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    await expect(
      callService.initiateCall({
        conversationId: 'conv-123',
        initiatorId: 'user-123',
        participantId: 'participant-123',
        type: 'video'
      })
    ).rejects.toThrow(/NOT_A_PARTICIPANT/);
  });

  it('should use CALL_ALREADY_ACTIVE error code', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(createMockConversation());
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-123',
      conversationId: 'conv-123',
      userId: 'user-123',
      isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]); // No stale participations
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
        participantId: 'participant-123',
        type: 'video'
      })
    ).rejects.toThrow(/CALL_ALREADY_ACTIVE/);
  });

  it('should use CALL_NOT_FOUND error code', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(null);

    await expect(
      callService.joinCall({ callId: 'invalid', userId: 'user-123', participantId: 'participant-123' })
    ).rejects.toThrow(/CALL_NOT_FOUND/);
  });

  it('should use CALL_ENDED error code', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(
      createMockCallSession({ status: CallStatus.ended })
    );

    await expect(
      callService.joinCall({ callId: 'call-123', userId: 'user-123', participantId: 'participant-123' })
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
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-789',
      conversationId: 'conv-123',
      userId: 'user-789',
      isActive: true
    });

    await expect(
      callService.joinCall({ callId: 'call-123', userId: 'user-789', participantId: 'participant-789' })
    ).rejects.toThrow(/MAX_PARTICIPANTS_REACHED/);
  });

  it('should use PERMISSION_DENIED error code for anonymous end call', async () => {
    await expect(
      callService.endCall('call-123', 'anon-123', 'participant-anon', true)
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it('should allow non-initiator participants to end a P2P call (spec C4)', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(
      createMockCallSession({
        status: CallStatus.active,
        participants: [
          createMockParticipant({ role: ParticipantRole.initiator }),
          createMockParticipant({
            id: 'p2',
            participantId: 'participant-456',
            userId: 'user-456',
            role: ParticipantRole.participant
          })
        ]
      })
    );
    mockPrisma.$transaction.mockResolvedValue(undefined);

    await expect(
      callService.endCall('call-123', 'user-456', 'participant-456')
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Gap-fill tests — bring CallService to ≥92% line+branch coverage
// ---------------------------------------------------------------------------

describe('CallService - Ringing Timeout & Heartbeat Utilities', () => {
  let callService: CallService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // scheduleRingingTimeout
  it('scheduleRingingTimeout: fires callback after 60 s', () => {
    const cb = jest.fn();
    callService.scheduleRingingTimeout('call-t1', cb);
    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('scheduleRingingTimeout: replaces existing timeout with new one', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    callService.scheduleRingingTimeout('call-t2', cb1);
    callService.scheduleRingingTimeout('call-t2', cb2); // replaces cb1
    jest.advanceTimersByTime(60_000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  // clearRingingTimeout
  it('clearRingingTimeout: prevents callback from firing', () => {
    const cb = jest.fn();
    callService.scheduleRingingTimeout('call-t3', cb);
    callService.clearRingingTimeout('call-t3');
    jest.advanceTimersByTime(60_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('clearRingingTimeout: no-op when no timeout exists for callId', () => {
    // should not throw
    expect(() => callService.clearRingingTimeout('call-nonexistent')).not.toThrow();
  });

  // generateIceServers
  it('generateIceServers: delegates to TURNCredentialService', () => {
    const servers = callService.generateIceServers('user-123');
    expect(servers).toBeDefined();
    expect(Array.isArray(servers)).toBe(true);
    expect(servers.length).toBeGreaterThan(0);
  });

  // clearHeartbeats
  it('clearHeartbeats: removes all heartbeats for the call', () => {
    callService.recordHeartbeat('call-hb3', 'p-1');
    callService.recordHeartbeat('call-hb3', 'p-2');
    callService.clearHeartbeats('call-hb3');
    expect(callService.hasHeartbeatData('call-hb3')).toBe(false);
  });

  it('clearHeartbeats: no-op when call has no heartbeats', () => {
    expect(() => callService.clearHeartbeats('call-no-hb')).not.toThrow();
  });

  // getStaleHeartbeats
  it('getStaleHeartbeats: returns empty array when no heartbeats for call', () => {
    const stale = callService.getStaleHeartbeats('call-s1', 5000);
    expect(stale).toEqual([]);
  });

  it('getStaleHeartbeats: returns participants whose heartbeat is older than maxAgeMs', () => {
    jest.useRealTimers(); // need real time for Date.now() comparison
    callService.recordHeartbeat('call-s2', 'p-old');
    // advance 200ms artificially by manually setting Date.now via a spy
    const realNow = Date.now;
    const future = Date.now() + 10_000;
    jest.spyOn(Date, 'now').mockReturnValue(future);
    const stale = callService.getStaleHeartbeats('call-s2', 5_000);
    expect(stale).toContain('p-old');
    jest.spyOn(Date, 'now').mockRestore();
    jest.useFakeTimers();
  });

  it('getStaleHeartbeats: does not return fresh heartbeats', () => {
    jest.useRealTimers();
    callService.recordHeartbeat('call-s3', 'p-fresh');
    const stale = callService.getStaleHeartbeats('call-s3', 60_000);
    expect(stale).not.toContain('p-fresh');
    jest.useFakeTimers();
  });

  // hasHeartbeatData
  it('hasHeartbeatData: returns false when no heartbeats exist for call', () => {
    expect(callService.hasHeartbeatData('call-no-data')).toBe(false);
  });

  it('hasHeartbeatData: returns true after at least one heartbeat recorded', () => {
    callService.recordHeartbeat('call-has-data', 'p-1');
    expect(callService.hasHeartbeatData('call-has-data')).toBe(true);
  });

  it('hasHeartbeatData: returns false after clearHeartbeats removes all data', () => {
    callService.recordHeartbeat('call-clear', 'p-1');
    callService.clearHeartbeats('call-clear');
    expect(callService.hasHeartbeatData('call-clear')).toBe(false);
  });

  // Debounced DB persistence
  it('recordHeartbeat: schedules a DB write after 30s debounce', async () => {
    mockPrisma.callParticipant.updateMany.mockResolvedValue({ count: 1 });

    callService.recordHeartbeat('call-db1', 'p-db1');

    // Not written immediately
    expect(mockPrisma.callParticipant.updateMany).not.toHaveBeenCalled();

    // Advance fake timers past the 30s debounce
    jest.advanceTimersByTime(31_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockPrisma.callParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ callSessionId: 'call-db1', participantId: 'p-db1' }),
        data: expect.objectContaining({ lastHeartbeatAt: expect.any(Date) })
      })
    );
  });

  it('recordHeartbeat: does not schedule duplicate DB writes for same call+participant', () => {
    callService.recordHeartbeat('call-dup', 'p-1');
    callService.recordHeartbeat('call-dup', 'p-1');
    callService.recordHeartbeat('call-dup', 'p-1');

    jest.advanceTimersByTime(31_000);

    // Only one timer was created so only one write
    expect(mockPrisma.callParticipant.updateMany).toHaveBeenCalledTimes(1);
  });

  it('clearHeartbeats: cancels pending DB write timer so no write fires', async () => {
    callService.recordHeartbeat('call-cancel', 'p-1');
    callService.clearHeartbeats('call-cancel');

    jest.advanceTimersByTime(31_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockPrisma.callParticipant.updateMany).not.toHaveBeenCalled();
  });
});

describe('CallService - updateCallStatus', () => {
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

  it('throws CALL_NOT_FOUND when call does not exist', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(null);
    await expect(callService.updateCallStatus('missing', CallStatus.active)).rejects.toThrow(
      'CALL_NOT_FOUND: Call session not found'
    );
  });

  it('returns current session without writing when call is already in terminal state', async () => {
    const terminalCall = createMockCallSession({
      status: CallStatus.ended,
      endedAt: new Date(),
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(terminalCall) // first lookup (status check)
      .mockResolvedValueOnce(terminalCall); // getCallSession
    const result = await callService.updateCallStatus('call-123', CallStatus.active);
    expect(result.status).toBe(CallStatus.ended);
    expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
  });

  it('sets endedAt and duration when transitioning to terminal status', async () => {
    const startedAt = new Date(Date.now() - 30_000);
    const activeCall = createMockCallSession({
      status: CallStatus.active,
      startedAt,
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });
    const endedCall = { ...activeCall, status: CallStatus.ended, endedAt: new Date(), duration: 30 };
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(activeCall)
      .mockResolvedValueOnce(endedCall);
    mockPrisma.callSession.updateMany.mockResolvedValue({ count: 1 });

    await callService.updateCallStatus('call-123', CallStatus.ended, CallEndReason.completed);

    expect(mockPrisma.callSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CallStatus.ended,
          endReason: CallEndReason.completed
        })
      })
    );
  });

  it('sets endedAt without endReason when no reason provided for terminal status', async () => {
    const activeCall = createMockCallSession({
      status: CallStatus.active,
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });
    const endedCall = { ...activeCall, status: CallStatus.ended, endedAt: new Date() };
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(activeCall)
      .mockResolvedValueOnce(endedCall);
    mockPrisma.callSession.updateMany.mockResolvedValue({ count: 1 });

    await callService.updateCallStatus('call-123', CallStatus.ended);

    const updateCall = mockPrisma.callSession.updateMany.mock.calls[0] as any;
    // endReason should not be in data since none provided
    expect(updateCall[0].data).not.toHaveProperty('endReason');
  });

  it('sets answeredAt when transitioning to active and call not yet answered', async () => {
    const initiatedCall = createMockCallSession({
      status: CallStatus.initiated,
      answeredAt: null,
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });
    const activeCall = { ...initiatedCall, status: CallStatus.active, answeredAt: new Date() };
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(initiatedCall)
      .mockResolvedValueOnce(activeCall);
    mockPrisma.callSession.updateMany.mockResolvedValue({ count: 1 });

    await callService.updateCallStatus('call-123', CallStatus.active);

    expect(mockPrisma.callSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CallStatus.active,
          answeredAt: expect.any(Date)
        })
      })
    );
  });

  it('does not set answeredAt when transitioning to active and call already answered', async () => {
    const alreadyAnswered = createMockCallSession({
      status: CallStatus.reconnecting,
      answeredAt: new Date(Date.now() - 5000),
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });
    const activeCall = { ...alreadyAnswered, status: CallStatus.active };
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(alreadyAnswered)
      .mockResolvedValueOnce(activeCall);
    mockPrisma.callSession.updateMany.mockResolvedValue({ count: 1 });

    await callService.updateCallStatus('call-123', CallStatus.active);

    const updateCall = mockPrisma.callSession.updateMany.mock.calls[0] as any;
    expect(updateCall[0].data).not.toHaveProperty('answeredAt');
  });
});

describe('CallService - initiateCall phantom cleanup & transaction', () => {
  let callService: CallService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  const validInitiateData = {
    conversationId: 'conv-123',
    initiatorId: 'user-123',
    participantId: 'participant-123',
    type: 'video' as const,
    settings: { audioEnabled: true, videoEnabled: true }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('phantom cleanup: force-ends stale participations before initiating', async () => {
    const staleCallId = 'stale-call-1';
    const staleStartedAt = new Date(Date.now() - 120_000);
    const staleParticipation = {
      id: 'stale-part-1',
      callSessionId: staleCallId,
      leftAt: null,
      callSession: { id: staleCallId, startedAt: staleStartedAt, conversationId: 'conv-other' }
    };
    const mockConversation = createMockConversation();
    const newCall = createMockCallSession({
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([staleParticipation]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null); // no active call in target conv

    let phantomTxCalled = false;
    let createTxCalled = false;
    mockPrisma.$transaction
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) => {
        phantomTxCalled = true;
        const tx = {
          callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
        };
        return cb(tx);
      })
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) => {
        createTxCalled = true;
        const session = { id: 'call-123' };
        const tx = {
          callSession: { create: jest.fn().mockResolvedValue(session) },
          callParticipant: { create: jest.fn().mockResolvedValue({}) }
        };
        return cb(tx);
      });
    mockPrisma.callSession.findUnique.mockResolvedValue(newCall);

    const result = await callService.initiateCall(validInitiateData);

    expect(phantomTxCalled).toBe(true);
    expect(createTxCalled).toBe(true);
    expect(result).toBeDefined();
  });

  it('phantom cleanup: uses `now` as fallback when staleSession.startedAt is null', async () => {
    const staleCallId = 'stale-call-null-ts';
    // startedAt is null on the embedded callSession
    const staleParticipation = {
      id: 'stale-part-null',
      callSessionId: staleCallId,
      leftAt: null,
      callSession: { id: staleCallId, startedAt: null, conversationId: 'conv-other' }
    };
    const mockConversation = createMockConversation();
    const newCall = createMockCallSession({
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([staleParticipation]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);

    mockPrisma.$transaction
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
        };
        return cb(tx);
      })
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) => {
        const session = { id: 'call-123' };
        const tx = {
          callSession: { create: jest.fn().mockResolvedValue(session) },
          callParticipant: { create: jest.fn().mockResolvedValue({}) }
        };
        return cb(tx);
      });
    mockPrisma.callSession.findUnique.mockResolvedValue(newCall);

    // Should not throw — `now` used as fallback for null startedAt
    const result = await callService.initiateCall(validInitiateData);
    expect(result).toBeDefined();
  });

  it('phantom cleanup: logs error and continues when cleanup transaction fails', async () => {
    const staleCallId = 'stale-call-err';
    const staleParticipation = {
      id: 'stale-part-err',
      callSessionId: staleCallId,
      leftAt: null,
      callSession: { id: staleCallId, startedAt: new Date(), conversationId: 'conv-other' }
    };
    const mockConversation = createMockConversation();
    const newCall = createMockCallSession({
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([staleParticipation]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);

    // First $transaction (phantom cleanup) throws; second (create call) succeeds
    mockPrisma.$transaction
      .mockRejectedValueOnce(new Error('DB error during phantom cleanup'))
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) => {
        const session = { id: 'call-new' };
        const tx = {
          callSession: { create: jest.fn().mockResolvedValue(session) },
          callParticipant: { create: jest.fn().mockResolvedValue({}) }
        };
        return cb(tx);
      });
    mockPrisma.callSession.findUnique.mockResolvedValue(newCall);

    // Should NOT throw — cleanup failure is logged and swallowed
    const result = await callService.initiateCall(validInitiateData);
    expect(result).toBeDefined();
  });

  it('session creation transaction: creates callSession and callParticipant', async () => {
    const mockConversation = createMockConversation();
    const createdSession = { id: 'call-new-tx' };
    const fullSession = createMockCallSession({
      id: 'call-new-tx',
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);

    let sessionCreated = false;
    let participantCreated = false;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callSession: { create: jest.fn().mockImplementation(() => { sessionCreated = true; return createdSession; }) },
        callParticipant: { create: jest.fn().mockImplementation(() => { participantCreated = true; return {}; }) }
      };
      return cb(tx);
    });
    mockPrisma.callSession.findUnique.mockResolvedValue(fullSession);

    await callService.initiateCall(validInitiateData);

    expect(sessionCreated).toBe(true);
    expect(participantCreated).toBe(true);
  });

  it('active-call claim race: unwinds the orphaned session when the atomic claim is lost', async () => {
    // Reproduces the TOCTOU window (audit 2026-07-02): the zombie/active-call
    // read above already passed (no active call), a session got created, but
    // a concurrent initiateCall for the same conversation won the atomic
    // Conversation.activeCallId claim first.
    const mockConversation = createMockConversation();
    const createdSession = { id: 'call-race-loser' };

    mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);

    let deletedParticipants = false;
    let deletedSession = false;
    mockPrisma.$transaction
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) =>
        cb({
          callSession: { create: jest.fn().mockResolvedValue(createdSession) },
          callParticipant: { create: jest.fn().mockResolvedValue({}) }
        })
      )
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) =>
        cb({
          callParticipant: { deleteMany: jest.fn().mockImplementation(() => { deletedParticipants = true; return { count: 1 }; }) },
          callSession: { delete: jest.fn().mockImplementation(() => { deletedSession = true; return createdSession; }) }
        })
      );

    // Lost the race: another caller already claimed the conversation's active-call slot.
    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 0 });

    await expect(callService.initiateCall(validInitiateData)).rejects.toThrow(
      'CALL_ALREADY_ACTIVE: A call is already active in this conversation'
    );

    // Prisma-on-MongoDB: `activeCallId: null` matches ONLY documents where
    // the field is explicitly null — NOT documents missing the field (every
    // conversation created before the claim was introduced, and every new
    // conversation Prisma creates while omitting unset optionals). Without
    // the `isSet: false` arm the claim can NEVER succeed on those documents
    // and every initiateCall fails CALL_ALREADY_ACTIVE (prod incident
    // 2026-07-02: 211/211 conversations lacked the field).
    expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conv-123',
        OR: [{ activeCallId: null }, { activeCallId: { isSet: false } }]
      },
      data: { activeCallId: 'call-race-loser' }
    });
    expect(deletedParticipants).toBe(true);
    expect(deletedSession).toBe(true);
  });

  it('active-call claim: wins atomically when no concurrent claim exists', async () => {
    const mockConversation = createMockConversation();
    const createdSession = { id: 'call-race-winner' };
    const fullSession = createMockCallSession({
      id: 'call-race-winner',
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({
        callSession: { create: jest.fn().mockResolvedValue(createdSession) },
        callParticipant: { create: jest.fn().mockResolvedValue({}) }
      })
    );
    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.callSession.findUnique.mockResolvedValue(fullSession);

    const result = await callService.initiateCall(validInitiateData);

    expect(result.id).toBe('call-race-winner');
    // Only the creation transaction ran — no compensating delete transaction.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('active-call claim self-heal: reclaims atomically when the holder call is terminal', async () => {
    // Prod incident 2026-07-02: a leaked claim (holder already `missed`)
    // blocked every initiateCall on the conversation. The claim must
    // self-heal: read the holder, see it is terminal, and compare-and-swap
    // the claim from the stale holder to the new session in ONE atomic write.
    const mockConversation = createMockConversation();
    const createdSession = { id: 'call-self-heal' };
    const fullSession = createMockCallSession({
      id: 'call-self-heal',
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({
        callSession: { create: jest.fn().mockResolvedValue(createdSession) },
        callParticipant: { create: jest.fn().mockResolvedValue({}) }
      })
    );
    // First claim attempt loses (stale claim in place), the compare-and-swap
    // against the terminal holder wins.
    mockPrisma.conversation.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    mockPrisma.conversation.findUnique
      .mockResolvedValueOnce(mockConversation)                    // type check
      .mockResolvedValueOnce({ activeCallId: 'stale-holder-1' }); // self-heal read
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce({ status: CallStatus.missed }) // holder status read
      .mockResolvedValueOnce(fullSession);                  // getCallSession

    const result = await callService.initiateCall(validInitiateData);

    expect(result.id).toBe('call-self-heal');
    expect(mockPrisma.conversation.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'conv-123', activeCallId: 'stale-holder-1' },
      data: { activeCallId: 'call-self-heal' }
    });
    // No compensating delete transaction — the session survived.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('active-call claim self-heal: still rejects when the holder call is genuinely active', async () => {
    const mockConversation = createMockConversation();
    const createdSession = { id: 'call-blocked' };

    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);

    let deletedSession = false;
    mockPrisma.$transaction
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) =>
        cb({
          callSession: { create: jest.fn().mockResolvedValue(createdSession) },
          callParticipant: { create: jest.fn().mockResolvedValue({}) }
        })
      )
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) =>
        cb({
          callParticipant: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          callSession: { delete: jest.fn().mockImplementation(() => { deletedSession = true; return createdSession; }) }
        })
      );

    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.conversation.findUnique
      .mockResolvedValueOnce(mockConversation)                   // type check
      .mockResolvedValueOnce({ activeCallId: 'live-holder-1' }); // self-heal read
    mockPrisma.callSession.findUnique.mockResolvedValueOnce({ status: CallStatus.active });

    await expect(callService.initiateCall(validInitiateData)).rejects.toThrow(
      'CALL_ALREADY_ACTIVE: A call is already active in this conversation'
    );
    // Compare-and-swap never attempted against a live holder.
    expect(mockPrisma.conversation.updateMany).toHaveBeenCalledTimes(1);
    expect(deletedSession).toBe(true);
  });

  it('active-call claim self-heal: retries the null-claim once when the claim vanished between attempts', async () => {
    // The holder released the claim between our failed claim and the
    // self-heal read (findUnique sees activeCallId: null). One retry of the
    // normal null/isSet claim closes the gap.
    const mockConversation = createMockConversation();
    const createdSession = { id: 'call-retry-win' };
    const fullSession = createMockCallSession({
      id: 'call-retry-win',
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({
        callSession: { create: jest.fn().mockResolvedValue(createdSession) },
        callParticipant: { create: jest.fn().mockResolvedValue({}) }
      })
    );
    mockPrisma.conversation.updateMany
      .mockResolvedValueOnce({ count: 0 })  // initial claim lost
      .mockResolvedValueOnce({ count: 1 }); // retry wins
    mockPrisma.conversation.findUnique
      .mockResolvedValueOnce(mockConversation)         // type check
      .mockResolvedValueOnce({ activeCallId: null });  // self-heal read
    mockPrisma.callSession.findUnique.mockResolvedValueOnce(fullSession); // getCallSession

    const result = await callService.initiateCall(validInitiateData);

    expect(result.id).toBe('call-retry-win');
    expect(mockPrisma.conversation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'conv-123',
        OR: [{ activeCallId: null }, { activeCallId: { isSet: false } }]
      },
      data: { activeCallId: 'call-retry-win' }
    });
  });
});

describe('CallService - joinCall already-in-call path', () => {
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

  it('returns existing session and ICE servers without creating new participant', async () => {
    const existingParticipant = createMockParticipant({
      participantId: 'participant-456',
      userId: 'user-456',
      leftAt: null
    });
    const callWithUser = createMockCallSession({
      status: CallStatus.active,
      participants: [existingParticipant],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });

    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce({ ...callWithUser, conversation: createMockConversation() })
      .mockResolvedValueOnce(callWithUser);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456', conversationId: 'conv-123', userId: 'user-456', isActive: true
    });

    const result = await callService.joinCall({
      callId: 'call-123',
      userId: 'user-456',
      participantId: 'participant-456'
    });

    // No new participant was created via $transaction
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(result.callSession).toBeDefined();
    expect(result.iceServers).toBeDefined();
    expect(result.iceServers.length).toBeGreaterThan(0);
  });
});

describe('CallService - leaveCall idempotent paths', () => {
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

  it('throws CALL_NOT_FOUND when participant missing and session also missing', async () => {
    mockPrisma.callParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.callSession.findUnique.mockResolvedValue(null);

    await expect(callService.leaveCall({
      callId: 'call-gone', userId: 'user-123', participantId: 'p-123'
    })).rejects.toThrow('CALL_NOT_FOUND: Call session not found');
  });

  it('returns existing session when call is already ended (idempotent)', async () => {
    const endedSession = createMockCallSession({
      status: CallStatus.ended,
      endedAt: new Date(),
      participants: [createMockParticipant({ leftAt: new Date() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });

    mockPrisma.callParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce({ ...endedSession, participants: endedSession.participants })
      .mockResolvedValueOnce(endedSession); // getCallSession

    const result = await callService.leaveCall({
      callId: 'call-123', userId: 'user-123', participantId: 'p-123'
    });

    expect(result.status).toBe(CallStatus.ended);
    // No DB writes
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns session unchanged when group call still has active participants (idempotent)', async () => {
    // Need at least 2 active participants (leftAt: null) so idemRemaining > 1 triggers the "group continues" path
    const activeParticipant1 = createMockParticipant({ id: 'p-other-1', userId: 'user-other-1', leftAt: null });
    const activeParticipant2 = createMockParticipant({ id: 'p-other-2', userId: 'user-other-2', leftAt: null });
    const groupSession = createMockCallSession({
      status: CallStatus.active,
      endedAt: null,
      participants: [activeParticipant1, activeParticipant2],
      initiator: createMockUser(),
      conversation: createMockConversation({ type: 'group' })
    });
    const fullSession = {
      ...groupSession,
      participants: [
        { ...activeParticipant1, user: createMockUser({ id: 'user-other-1' }) },
        { ...activeParticipant2, user: createMockUser({ id: 'user-other-2' }) }
      ],
      initiator: createMockUser(),
      conversation: createMockConversation({ type: 'group' })
    };

    mockPrisma.callParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(groupSession)
      .mockResolvedValueOnce(fullSession); // getCallSession
    mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'group' });

    const result = await callService.leaveCall({
      callId: 'call-123', userId: 'user-123', participantId: 'p-123'
    });

    expect(result).toBeDefined();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('force-ends direct call when participant not found (idempotent direct leave)', async () => {
    const directSession = createMockCallSession({
      status: CallStatus.active,
      endedAt: null,
      participants: [createMockParticipant({ leftAt: null })],
      initiator: createMockUser(),
      conversation: createMockConversation({ type: 'direct' })
    });
    const endedSession = {
      ...directSession,
      status: CallStatus.ended,
      endedAt: new Date(),
      participants: [createMockParticipant({ leftAt: new Date(), user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation({ type: 'direct' })
    };

    mockPrisma.callParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(directSession)
      .mockResolvedValueOnce(endedSession); // getCallSession after tx
    mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });

    let txCalled = false;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      txCalled = true;
      const tx = {
        callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
      };
      return cb(tx);
    });

    const result = await callService.leaveCall({
      callId: 'call-123', userId: 'user-123', participantId: 'p-123'
    });

    expect(txCalled).toBe(true);
    expect(result).toBeDefined();
  });

  it('force-ends when last participant in group (idempotent, no remaining active)', async () => {
    const groupSession = createMockCallSession({
      status: CallStatus.active,
      endedAt: null,
      // 0 remaining active participants (all already left)
      participants: [createMockParticipant({ leftAt: new Date() })],
      initiator: createMockUser(),
      conversation: createMockConversation({ type: 'group' })
    });
    const endedSession = {
      ...groupSession,
      status: CallStatus.ended,
      endedAt: new Date(),
      participants: [createMockParticipant({ leftAt: new Date(), user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation({ type: 'group' })
    };

    mockPrisma.callParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(groupSession)
      .mockResolvedValueOnce(endedSession);
    mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'group' });

    let txCalled = false;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      txCalled = true;
      const tx = {
        callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
      };
      return cb(tx);
    });

    await callService.leaveCall({
      callId: 'call-123', userId: 'user-other', participantId: 'p-other'
    });

    expect(txCalled).toBe(true);
  });

  it('force-ends with missed status for pre-answered call (idempotent)', async () => {
    const ringingSession = createMockCallSession({
      status: CallStatus.ringing,
      endedAt: null,
      participants: [],
      initiator: createMockUser(),
      conversation: createMockConversation({ type: 'direct' })
    });
    const missedSession = {
      ...ringingSession,
      status: CallStatus.missed,
      endedAt: new Date(),
      participants: [createMockParticipant({ leftAt: new Date(), user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation({ type: 'direct' })
    };

    mockPrisma.callParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(ringingSession)
      .mockResolvedValueOnce(missedSession);
    mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });

    let capturedData: any = null;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        callSession: {
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            capturedData = data;
            return { count: 1 };
          })
        }
      };
      return cb(tx);
    });

    await callService.leaveCall({
      callId: 'call-123', userId: 'user-123', participantId: 'p-123'
    });

    expect(capturedData.status).toBe(CallStatus.missed);
    expect(capturedData.endReason).toBe(CallEndReason.missed);
  });
});

describe('CallService - markCallAsMissed non-ringing guard', () => {
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

  it('returns current session without writing when call is already active', async () => {
    const activeCall = createMockCallSession({
      status: CallStatus.active,
      answeredAt: new Date(),
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(activeCall)  // markCallAsMissed lookup
      .mockResolvedValueOnce(activeCall); // getCallSession

    const result = await callService.markCallAsMissed('call-123');

    expect(result.status).toBe(CallStatus.active);
    expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
    // An active call legitimately holds the conversation's active-call
    // claim — the guard path must NOT strip it.
    expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('returns current session without writing when call is already missed', async () => {
    const missedCall = createMockCallSession({
      status: CallStatus.missed,
      endedAt: new Date(),
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(missedCall)
      .mockResolvedValueOnce(missedCall);

    const result = await callService.markCallAsMissed('call-123');

    expect(result.status).toBe(CallStatus.missed);
    expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
  });

  it('releases the stale active-call claim when the call is already missed (ringing-timeout race)', async () => {
    // Prod incident 2026-07-02 21:30Z: the ringing-timeout handler wins the
    // atomic updateMany to `missed` FIRST, then calls markCallAsMissed via
    // handleMissedCall — which hit this guard and returned before
    // releaseActiveCallClaim, leaving Conversation.activeCallId pointing at
    // the missed call. Every subsequent initiateCall on the conversation was
    // rejected CALL_ALREADY_ACTIVE for minutes.
    const missedCall = createMockCallSession({
      status: CallStatus.missed,
      endedAt: new Date(),
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    });
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(missedCall)
      .mockResolvedValueOnce(missedCall);

    await callService.markCallAsMissed('call-123');

    expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv-123', activeCallId: 'call-123' },
      data: { activeCallId: null }
    });
  });

  it('marks ringing call as missed (allowed)', async () => {
    const ringingCall = createMockCallSession({
      status: CallStatus.ringing,
      participants: [createMockParticipant()],
      initiator: createMockUser()
    });
    const missedCall = {
      ...ringingCall,
      status: CallStatus.missed,
      endedAt: new Date(),
      participants: [createMockParticipant({ user: createMockUser() })],
      initiator: createMockUser(),
      conversation: createMockConversation()
    };
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(ringingCall)
      .mockResolvedValueOnce(missedCall);
    mockPrisma.callSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await callService.markCallAsMissed('call-123');

    expect(result.status).toBe(CallStatus.missed);
    expect(mockPrisma.callSession.updateMany).toHaveBeenCalled();
  });
});

describe('CallService - resolveEndReason private method', () => {
  let callService: CallService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  const resolve = (service: CallService, reason?: string) =>
    (service as any).resolveEndReason(reason);

  it('returns missed for "missed"', () => {
    expect(resolve(callService, 'missed')).toBe(CallEndReason.missed);
  });

  it('returns rejected for "rejected"', () => {
    expect(resolve(callService, 'rejected')).toBe(CallEndReason.rejected);
  });

  it('returns failed for "failed"', () => {
    expect(resolve(callService, 'failed')).toBe(CallEndReason.failed);
  });

  it('returns connectionLost for "connectionLost"', () => {
    expect(resolve(callService, 'connectionLost')).toBe(CallEndReason.connectionLost);
  });

  it('returns heartbeatTimeout for "heartbeatTimeout"', () => {
    expect(resolve(callService, 'heartbeatTimeout')).toBe(CallEndReason.heartbeatTimeout);
  });

  it('returns garbageCollected for "garbageCollected"', () => {
    expect(resolve(callService, 'garbageCollected')).toBe(CallEndReason.garbageCollected);
  });

  it('returns completed for unknown reason (default)', () => {
    expect(resolve(callService, 'unknown-reason')).toBe(CallEndReason.completed);
  });

  it('returns completed for undefined reason', () => {
    expect(resolve(callService, undefined)).toBe(CallEndReason.completed);
  });
});

describe('CallService - persistCallStats', () => {
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

  it('returns early without update when findUnique resolves null (call not found)', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(null);

    await callService.persistCallStats('missing-call', { bytesSent: 1000, bytesReceived: 500 });

    expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
  });

  it('returns early without update when findUnique rejects (network error → null via .catch)', async () => {
    // The .catch(() => null) in persistCallStats converts rejection to null
    mockPrisma.callSession.findUnique.mockRejectedValue(new Error('DB connection lost'));

    await callService.persistCallStats('call-123', { bytesSent: 1000 });

    expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
  });

  it('updates bytesSent/bytesReceived when new total exceeds stored total', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: 100,
      bytesReceived: 200
    });
    mockPrisma.callSession.update.mockResolvedValue({});

    await callService.persistCallStats('call-123', { bytesSent: 500, bytesReceived: 600 });

    expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bytesSent: 500, bytesReceived: 600 })
      })
    );
  });

  it('does not update when new total does not exceed stored total', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: 1000,
      bytesReceived: 2000
    });

    await callService.persistCallStats('call-123', { bytesSent: 100, bytesReceived: 200 });

    expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
  });

  it('updates networkQuality when a valid level is provided', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: null,
      bytesReceived: null
    });
    mockPrisma.callSession.update.mockResolvedValue({});

    await callService.persistCallStats('call-123', { level: 'excellent' });

    expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ networkQuality: 'excellent' })
      })
    );
  });

  it('does not update for invalid quality level', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: null,
      bytesReceived: null
    });

    await callService.persistCallStats('call-123', { level: 'unknown' as any });

    expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
  });

  it('catches and logs when update fails (.catch handler) — Error instance branch', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: 0,
      bytesReceived: 0
    });
    mockPrisma.callSession.update.mockRejectedValue(new Error('update failed'));

    // Should NOT throw — the .catch swallows the error
    await expect(
      callService.persistCallStats('call-123', { bytesSent: 500, bytesReceived: 600 })
    ).resolves.toBeUndefined();
  });

  it('catches and logs when update fails with non-Error — String(error) branch', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: 0,
      bytesReceived: 0
    });
    // Throw a non-Error (string) to exercise the String(error) branch
    mockPrisma.callSession.update.mockRejectedValue('plain string error');

    await expect(
      callService.persistCallStats('call-123', { bytesSent: 500, bytesReceived: 600 })
    ).resolves.toBeUndefined();
  });

  it('returns early with no-op when data object is empty (no valid stats)', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: null,
      bytesReceived: null
    });

    await callService.persistCallStats('call-123', { bytesSent: -1, bytesReceived: -1, level: 'bad' as any });

    expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
  });

  it('uses fallback 0 when current.bytesSent/bytesReceived are null', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: null,
      bytesReceived: null
    });
    mockPrisma.callSession.update.mockResolvedValue({});

    await callService.persistCallStats('call-123', { bytesSent: 100, bytesReceived: 200 });

    // currentTotal = null??0 + null??0 = 0; 100+200 > 0 → update
    expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bytesSent: 100, bytesReceived: 200 })
      })
    );
  });

  it('uses reportSent with null reportReceived (only bytesSent provided) — ??current.bytesReceived branch', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: 0,
      bytesReceived: 500
    });
    mockPrisma.callSession.update.mockResolvedValue({});

    // Only bytesSent provided → reportReceived is null → nextReceived = null ?? current.bytesReceived ?? 0 = 500
    // currentTotal = 0 + 500 = 500; nextSent + nextReceived = 1000 + 500 = 1500 > 500 → update
    await callService.persistCallStats('call-123', { bytesSent: 1000 });

    expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bytesSent: 1000, bytesReceived: 500 })
      })
    );
  });

  it('uses null reportSent with reportReceived provided — ??current.bytesSent branch', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: 200,
      bytesReceived: 0
    });
    mockPrisma.callSession.update.mockResolvedValue({});

    // Only bytesReceived provided → reportSent is null → nextSent = null ?? current.bytesSent ?? 0 = 200
    // currentTotal = 200 + 0 = 200; nextSent + nextReceived = 200 + 800 = 1000 > 200 → update
    await callService.persistCallStats('call-123', { bytesReceived: 800 });

    expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bytesSent: 200, bytesReceived: 800 })
      })
    );
  });

  it('uses ??0 fallback when both reportSent=null and current.bytesSent=null', async () => {
    // current has null bytes — exercises the ??0 fallback on both lines 1176-1177
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: null,
      bytesReceived: null
    });
    mockPrisma.callSession.update.mockResolvedValue({});

    // Only bytesReceived provided, both current values null → nextSent = null ?? null ?? 0 = 0
    // nextReceived = 500 (not null); currentTotal = null??0 + null??0 = 0; 0+500 > 0 → update
    await callService.persistCallStats('call-123', { bytesReceived: 500 });

    expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bytesSent: 0, bytesReceived: 500 })
      })
    );
  });

  it('uses ??0 fallback for nextReceived when reportReceived=null and current.bytesReceived=null (line 1177)', async () => {
    // current.bytesReceived is null; only bytesSent provided → reportReceived is null
    // → nextReceived = null (reportReceived) ?? null (current.bytesReceived) ?? 0 = 0
    mockPrisma.callSession.findUnique.mockResolvedValue({
      bytesSent: null,
      bytesReceived: null
    });
    mockPrisma.callSession.update.mockResolvedValue({});

    // Only bytesSent provided → reportReceived=null; current.bytesReceived=null → nextReceived=??0=0
    // nextSent=500, nextReceived=0; currentTotal=0; 500+0>0 → update
    await callService.persistCallStats('call-123', { bytesSent: 500 });

    expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bytesSent: 500, bytesReceived: 0 })
      })
    );
  });

  it('updates networkQuality good, fair, and poor levels', async () => {
    for (const level of ['good', 'fair', 'poor'] as const) {
      mockPrisma.callSession.findUnique.mockResolvedValue({ bytesSent: null, bytesReceived: null });
      mockPrisma.callSession.update.mockResolvedValue({});

      await callService.persistCallStats('call-123', { level });

      expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ networkQuality: level }) })
      );
      jest.clearAllMocks();
    }
  });
});

describe('CallService - leaveCall wasPreAnswered=false branch (active call)', () => {
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

  it('ends call with status=ended and endReason=completed when active call (wasPreAnswered=false)', async () => {
    const participant = createMockParticipant({ userId: 'user-123', participantId: 'participant-123' });
    const activeCall = createMockCallSession({
      status: CallStatus.active, // NOT initiated/ringing/connecting
      participants: [participant]
    });
    const endedCall = {
      ...activeCall,
      status: CallStatus.ended,
      endedAt: new Date(),
      participants: [{ ...participant, leftAt: new Date(), user: createMockUser() }],
      initiator: createMockUser(),
      conversation: createMockConversation()
    };

    mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(activeCall)
      .mockResolvedValueOnce(endedCall);
    mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });

    let capturedStatus: string | undefined;
    let capturedReason: string | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: { update: jest.fn().mockResolvedValue({}) },
        callSession: {
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            capturedStatus = data.status;
            capturedReason = data.endReason;
            return { count: 1 };
          })
        }
      };
      return cb(tx);
    });

    await callService.leaveCall({ callId: 'call-123', userId: 'user-123', participantId: 'participant-123' });

    expect(capturedStatus).toBe(CallStatus.ended);
    expect(capturedReason).toBe(CallEndReason.completed);
  });

  it('ends call with status=missed and endReason=missed when ringing call (wasPreAnswered=true)', async () => {
    const participant = createMockParticipant({ userId: 'user-123', participantId: 'participant-123' });
    const ringingCall = createMockCallSession({
      status: CallStatus.ringing,
      participants: [participant]
    });
    const missedCall = {
      ...ringingCall,
      status: CallStatus.missed,
      endedAt: new Date(),
      participants: [{ ...participant, leftAt: new Date(), user: createMockUser() }],
      initiator: createMockUser(),
      conversation: createMockConversation()
    };

    mockPrisma.callParticipant.findFirst.mockResolvedValue(participant);
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(ringingCall)
      .mockResolvedValueOnce(missedCall);
    mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });

    let capturedStatus: string | undefined;
    let capturedReason: string | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: { update: jest.fn().mockResolvedValue({}) },
        callSession: {
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            capturedStatus = data.status;
            capturedReason = data.endReason;
            return { count: 1 };
          })
        }
      };
      return cb(tx);
    });

    await callService.leaveCall({ callId: 'call-123', userId: 'user-123', participantId: 'participant-123' });

    expect(capturedStatus).toBe(CallStatus.missed);
    expect(capturedReason).toBe(CallEndReason.missed);
  });
});

describe('CallService - joinCall settings branches', () => {
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

  it('uses settings.audioEnabled=false when explicitly provided', async () => {
    const existingCall = createMockCallSession({
      status: CallStatus.initiated,
      participants: [createMockParticipant()],
      conversation: createMockConversation()
    });
    const updatedCall = {
      ...existingCall,
      status: CallStatus.connecting,
      initiator: createMockUser(),
      conversation: createMockConversation()
    };

    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(existingCall)
      .mockResolvedValueOnce(updatedCall);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456', conversationId: 'conv-123', userId: 'user-456', isActive: true
    });

    let capturedAudio: boolean | undefined;
    let capturedVideo: boolean | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            capturedAudio = data.isAudioEnabled;
            capturedVideo = data.isVideoEnabled;
            return {};
          })
        },
        callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
      };
      return cb(tx);
    });

    await callService.joinCall({
      callId: 'call-123',
      userId: 'user-456',
      participantId: 'participant-456',
      settings: { audioEnabled: false, videoEnabled: false }
    });

    expect(capturedAudio).toBe(false);
    expect(capturedVideo).toBe(false);
  });

  it('audit C5: writes leftAt: null explicitly on the joiner\'s CallParticipant (MongoDB has no missing-vs-null distinction at the Prisma query-engine level; later findFirst({leftAt: null}) lookups only match a field that was actually written)', async () => {
    const existingCall = createMockCallSession({
      status: CallStatus.initiated,
      participants: [createMockParticipant()],
      conversation: createMockConversation()
    });
    const updatedCall = {
      ...existingCall,
      status: CallStatus.connecting,
      initiator: createMockUser(),
      conversation: createMockConversation()
    };

    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(existingCall)
      .mockResolvedValueOnce(updatedCall);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456', conversationId: 'conv-123', userId: 'user-456', isActive: true
    });

    let capturedData: Record<string, unknown> | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            capturedData = data;
            return {};
          })
        },
        callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
      };
      return cb(tx);
    });

    await callService.joinCall({
      callId: 'call-123',
      userId: 'user-456',
      participantId: 'participant-456'
    });

    expect(capturedData).toHaveProperty('leftAt', null);
  });

  it('item F: joining an initiated call transitions to RINGING without answeredAt (the real answer stamps both)', async () => {
    // Chaos-test 2 (callId 6a4690a2...): the callee early-joins DURING the
    // ring (Phase 2 — the offer must flow while ringing), and joinCall used
    // to stamp connecting+answeredAt before any pick-up. Consequences:
    // "ringing" was invisible server-side (item F), the boot rehydration
    // (initiated/ringing) had nothing to re-arm after a mid-ring restart, the
    // GC decayed the call to failed/91s instead of missed, and duration
    // included the ringing time. The SDP answer already stamps
    // active+answeredAt (updateCallStatus). FSM: initiated -> ringing -> active.
    const existingCall = createMockCallSession({
      status: CallStatus.initiated,
      participants: [createMockParticipant()],
      conversation: createMockConversation()
    });
    const updatedCall = {
      ...existingCall,
      status: CallStatus.ringing,
      initiator: createMockUser(),
      conversation: createMockConversation()
    };

    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(existingCall)
      .mockResolvedValueOnce(updatedCall);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456', conversationId: 'conv-123', userId: 'user-456', isActive: true
    });

    let capturedUpdate: Record<string, unknown> | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: { create: jest.fn().mockResolvedValue({}) },
        callSession: {
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            capturedUpdate = data;
            return { count: 1 };
          })
        }
      };
      return cb(tx);
    });

    await callService.joinCall({
      callId: 'call-123',
      userId: 'user-456',
      participantId: 'participant-456'
    });

    expect(capturedUpdate).toMatchObject({ status: CallStatus.ringing });
    expect(capturedUpdate).not.toHaveProperty('answeredAt');
  });

  it('does not update callSession when joining connecting call (not initiated/ringing)', async () => {
    const connectingCall = createMockCallSession({
      status: CallStatus.connecting,
      participants: [createMockParticipant()],
      conversation: createMockConversation()
    });
    const updatedCall = {
      ...connectingCall,
      initiator: createMockUser(),
      conversation: createMockConversation()
    };

    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(connectingCall)
      .mockResolvedValueOnce(updatedCall);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456', conversationId: 'conv-123', userId: 'user-456', isActive: true
    });

    let capturedUpdateData: Record<string, unknown> | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: { create: jest.fn().mockResolvedValue({}) },
        callSession: {
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            capturedUpdateData = data;
            return { count: 1 };
          })
        }
      };
      return cb(tx);
    });

    await callService.joinCall({
      callId: 'call-123',
      userId: 'user-456',
      participantId: 'participant-456'
    });

    // Status is 'connecting' already (not 'initiated'/'ringing'), so the
    // version-lock update must not also carry a status/answeredAt transition.
    expect(capturedUpdateData).not.toHaveProperty('status');
    expect(capturedUpdateData).not.toHaveProperty('answeredAt');
  });

  it('does not update callSession when joining active call (not initiated/ringing)', async () => {
    const activeCall = createMockCallSession({
      status: CallStatus.active,
      participants: [createMockParticipant()],
      conversation: createMockConversation()
    });
    const updatedCall = {
      ...activeCall,
      initiator: createMockUser(),
      conversation: createMockConversation()
    };

    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(activeCall)
      .mockResolvedValueOnce(updatedCall);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456', conversationId: 'conv-123', userId: 'user-456', isActive: true
    });

    let capturedUpdateData: Record<string, unknown> | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: { create: jest.fn().mockResolvedValue({}) },
        callSession: {
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            capturedUpdateData = data;
            return { count: 1 };
          })
        }
      };
      return cb(tx);
    });

    await callService.joinCall({
      callId: 'call-123',
      userId: 'user-456',
      participantId: 'participant-456'
    });

    // Status is 'active', not 'initiated'/'ringing', so the version-lock
    // update must not also carry a status/answeredAt transition.
    expect(capturedUpdateData).not.toHaveProperty('status');
    expect(capturedUpdateData).not.toHaveProperty('answeredAt');
  });
});

describe('CallService - joinCall version-lock race', () => {
  let callService: CallService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  const joinData = {
    callId: 'call-123',
    userId: 'user-456',
    participantId: 'participant-456'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('retries once and succeeds when a concurrent joiner wins the first version claim', async () => {
    // Reproduces the TOCTOU window (audit 2026-07-02): both joiners read the
    // same `activeParticipants.length < 2` snapshot; the version-guarded
    // update forces exactly one to lose, and the loser retries against fresh
    // state instead of silently exceeding the P2P cap.
    const initiatedCall = createMockCallSession({
      status: CallStatus.initiated,
      version: 5,
      participants: [createMockParticipant()],
      conversation: createMockConversation()
    });
    const activeCall = {
      ...initiatedCall,
      status: CallStatus.active,
      initiator: createMockUser(),
      conversation: createMockConversation()
    };

    // First read (attempt 0) sees version 5; retry (attempt 1) must re-fetch
    // and see the version a concurrent winner already bumped to 6.
    mockPrisma.callSession.findUnique
      .mockResolvedValueOnce(initiatedCall)
      .mockResolvedValueOnce({ ...initiatedCall, version: 6 })
      .mockResolvedValueOnce(activeCall);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456', conversationId: 'conv-123', userId: 'user-456', isActive: true
    });

    mockPrisma.$transaction
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) =>
        cb({
          callParticipant: { create: jest.fn().mockResolvedValue({}) },
          // Lost the race: a concurrent joiner already bumped the version.
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
        })
      )
      .mockImplementationOnce(async (cb: (tx: any) => Promise<any>) =>
        cb({
          callParticipant: { create: jest.fn().mockResolvedValue({}) },
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
        })
      );

    const result = await callService.joinCall(joinData);

    expect(result.callSession).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('throws CALL_STATE_CONFLICT when the version conflict persists after one retry', async () => {
    const initiatedCall = createMockCallSession({
      status: CallStatus.initiated,
      version: 5,
      participants: [createMockParticipant()],
      conversation: createMockConversation()
    });

    mockPrisma.callSession.findUnique.mockResolvedValue(initiatedCall);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'member-456', conversationId: 'conv-123', userId: 'user-456', isActive: true
    });
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({
        callParticipant: { create: jest.fn().mockResolvedValue({}) },
        callSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
      })
    );

    await expect(callService.joinCall(joinData)).rejects.toThrow(
      'CALL_STATE_CONFLICT: Call state changed concurrently, please retry'
    );

    // One initial attempt + one retry, then give up.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe('CallService - initiateCall audio type (isVideoEnabled=false branch)', () => {
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

  it('uses default audioEnabled=true when settings not provided (??true branch)', async () => {
    const mockConversation = createMockConversation();
    const newCall = createMockCallSession({
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);

    let capturedAudioEnabled: boolean | undefined;
    let capturedVideoEnabled: boolean | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const session = { id: 'call-no-settings' };
      const tx = {
        callSession: { create: jest.fn().mockResolvedValue(session) },
        callParticipant: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            capturedAudioEnabled = data.isAudioEnabled;
            capturedVideoEnabled = data.isVideoEnabled;
            return {};
          })
        }
      };
      return cb(tx);
    });
    mockPrisma.callSession.findUnique.mockResolvedValue(newCall);

    await callService.initiateCall({
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      participantId: 'participant-123',
      type: 'video'
      // settings: undefined (not provided)
    });

    // settings undefined → settings?.audioEnabled = undefined → ?? true
    expect(capturedAudioEnabled).toBe(true);
    // type='video' AND settings?.videoEnabled = undefined → ?? true
    expect(capturedVideoEnabled).toBe(true);
  });

  it('sets isVideoEnabled=false when type=audio in participant creation', async () => {
    const mockConversation = createMockConversation();
    const newCall = createMockCallSession({
      participants: [createMockParticipant()],
      initiator: createMockUser(),
      conversation: mockConversation
    });

    mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'participant-123', conversationId: 'conv-123', userId: 'user-123', isActive: true
    });
    mockPrisma.callParticipant.findMany.mockResolvedValue([]);
    mockPrisma.callSession.findFirst.mockResolvedValue(null);

    let capturedVideoEnabled: boolean | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const session = { id: 'call-audio' };
      const tx = {
        callSession: { create: jest.fn().mockResolvedValue(session) },
        callParticipant: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            capturedVideoEnabled = data.isVideoEnabled;
            return {};
          })
        }
      };
      return cb(tx);
    });
    mockPrisma.callSession.findUnique.mockResolvedValue(newCall);

    await callService.initiateCall({
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      participantId: 'participant-123',
      type: 'audio', // NOT video
      settings: { audioEnabled: true, videoEnabled: true }
    });

    // type='audio' → isVideoEnabled=false regardless of settings
    expect(capturedVideoEnabled).toBe(false);
  });
});

describe('CallService - createCallSummaryMessage', () => {
  let callService: CallService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  const mockBuildCallSummary = buildCallSummaryWithMetadata as jest.MockedFunction<typeof buildCallSummaryWithMetadata>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when call session not found', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue(null);

    const result = await callService.createCallSummaryMessage('missing-call');

    expect(result).toBeNull();
  });

  it('callType is null when metadata.type is not a string (line 1240: null branch)', async () => {
    // metadata.type is a number, not a string → callType = null
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      status: CallStatus.ended,
      endReason: CallEndReason.completed,
      duration: 60,
      metadata: { type: 42 }, // not a string
      bytesSent: null,
      bytesReceived: null,
      networkQuality: null
    });
    mockBuildCallSummary.mockReturnValue(null as any);

    const result = await callService.createCallSummaryMessage('call-123');

    expect(result).toBeNull();
    // buildCallSummaryWithMetadata should have been called with callType=null
    expect(mockBuildCallSummary).toHaveBeenCalledWith(
      expect.objectContaining({ callType: null })
    );
  });

  it('callType is string when metadata.type is a valid string', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      status: CallStatus.ended,
      endReason: CallEndReason.completed,
      duration: 60,
      metadata: { type: 'video' }, // valid string
      bytesSent: null,
      bytesReceived: null,
      networkQuality: null
    });
    mockBuildCallSummary.mockReturnValue(null as any);

    await callService.createCallSummaryMessage('call-123');

    expect(mockBuildCallSummary).toHaveBeenCalledWith(
      expect.objectContaining({ callType: 'video' })
    );
  });

  it('returns null when buildCallSummaryWithMetadata returns null (non-terminal status)', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      status: CallStatus.active,
      endReason: null,
      duration: null,
      metadata: { type: 'video' },
      bytesSent: null,
      bytesReceived: null,
      networkQuality: null
    });
    mockBuildCallSummary.mockReturnValue(null as any);

    const result = await callService.createCallSummaryMessage('call-123');

    expect(result).toBeNull();
  });

  it('returns null when initiator has no participant row', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      status: CallStatus.ended,
      endReason: CallEndReason.completed,
      duration: 60,
      metadata: { type: 'video' },
      bytesSent: null,
      bytesReceived: null,
      networkQuality: null
    });
    mockBuildCallSummary.mockReturnValue({
      summary: { content: 'Appel vidéo · 01:00', outcome: 'completed', callType: 'video' },
      metadata: { callId: 'call-123' }
    } as any);
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const result = await callService.createCallSummaryMessage('call-123');

    expect(result).toBeNull();
  });

  it('creates and returns the summary message (callMetadata non-null path)', async () => {
    const callData = {
      id: 'call-123',
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      status: CallStatus.ended,
      endReason: CallEndReason.completed,
      duration: 60,
      metadata: { type: 'video' },
      bytesSent: 1000,
      bytesReceived: 2000,
      networkQuality: 'good'
    };
    mockPrisma.callSession.findUnique.mockResolvedValue(callData);
    mockBuildCallSummary.mockReturnValue({
      summary: { content: 'Appel vidéo · 01:00', outcome: 'completed', callType: 'video' },
      metadata: { callId: 'call-123', duration: 60 } // non-null callMetadata
    } as any);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: 'participant-123' });
    const mockMessage = { id: 'msg-summary-123', content: 'Appel vidéo · 01:00' };
    mockPrisma.message.create.mockResolvedValue(mockMessage);

    const result = await callService.createCallSummaryMessage('call-123');

    expect(result).toBe(mockMessage);
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-123',
          content: 'Appel vidéo · 01:00',
          messageType: 'system',
          metadata: expect.objectContaining({ callId: 'call-123' })
        })
      })
    );
  });

  it('uses undefined when callMetadata is null (line 1288: ??undefined branch)', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      status: CallStatus.ended,
      endReason: CallEndReason.completed,
      duration: 60,
      metadata: { type: 'video' },
      bytesSent: null,
      bytesReceived: null,
      networkQuality: null
    });
    mockBuildCallSummary.mockReturnValue({
      summary: { content: 'Appel vidéo · 01:00', outcome: 'completed', callType: 'video' },
      metadata: null // null callMetadata → ?? undefined
    } as any);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: 'participant-123' });
    const mockMessage = { id: 'msg-null-meta', content: 'Appel vidéo · 01:00' };
    mockPrisma.message.create.mockResolvedValue(mockMessage);

    const result = await callService.createCallSummaryMessage('call-123');

    expect(result).toBe(mockMessage);
    // metadata should be undefined in the create call
    const createCall = (mockPrisma.message.create as jest.MockedFunction<any>).mock.calls[0][0];
    expect(createCall.data.metadata).toBeUndefined();
  });

  it('returns null when message.create fails with P2002 (duplicate idempotent)', async () => {
    const { Prisma } = await import('@meeshy/shared/prisma/client');
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      status: CallStatus.ended,
      endReason: CallEndReason.completed,
      duration: 60,
      metadata: { type: 'video' },
      bytesSent: null,
      bytesReceived: null,
      networkQuality: null
    });
    mockBuildCallSummary.mockReturnValue({
      summary: { content: 'Appel vidéo · 01:00', outcome: 'completed', callType: 'video' },
      metadata: null
    } as any);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: 'participant-123' });
    mockPrisma.message.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '5.0' })
    );

    const result = await callService.createCallSummaryMessage('call-123');

    expect(result).toBeNull();
  });

  it('re-throws when message.create fails with non-P2002 error', async () => {
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      conversationId: 'conv-123',
      initiatorId: 'user-123',
      status: CallStatus.ended,
      endReason: CallEndReason.completed,
      duration: 60,
      metadata: { type: 'video' },
      bytesSent: null,
      bytesReceived: null,
      networkQuality: null
    });
    mockBuildCallSummary.mockReturnValue({
      summary: { content: 'Appel vidéo · 01:00', outcome: 'completed', callType: 'video' },
      metadata: null
    } as any);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: 'participant-123' });
    mockPrisma.message.create.mockRejectedValue(new Error('DB connection lost'));

    await expect(callService.createCallSummaryMessage('call-123')).rejects.toThrow('DB connection lost');
  });
});
