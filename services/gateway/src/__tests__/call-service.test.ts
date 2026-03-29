/**
 * CallService Unit Tests
 * Tests state machine transitions, heartbeat tracking, and call lifecycle
 */

import { CallStatus, CallEndReason } from '@meeshy/shared/prisma/client';

// Mock PrismaClient
const mockPrisma = {
  conversation: { findUnique: jest.fn() },
  participant: { findFirst: jest.fn() },
  callSession: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  callParticipant: {
    create: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};

// Mock TURNCredentialService
jest.mock('../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({
    generateCredentials: jest.fn().mockReturnValue([
      { urls: 'stun:stun.l.google.com:19302' }
    ]),
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CallService } from '../services/CallService';

function makeCallService() {
  return new CallService(mockPrisma as any);
}

function makeCallSession(overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439022',
    initiatorId: 'user-1',
    mode: 'p2p',
    status: CallStatus.active,
    startedAt: new Date('2026-03-29T10:00:00Z'),
    answeredAt: new Date('2026-03-29T10:00:05Z'),
    endedAt: null,
    duration: null,
    endReason: null,
    transcriptionEnabled: false,
    metadata: {},
    participants: [],
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cp-1',
    callSessionId: '507f1f77bcf86cd799439011',
    participantId: 'part-1',
    role: 'initiator',
    joinedAt: new Date(),
    leftAt: null,
    isAudioEnabled: true,
    isVideoEnabled: true,
    connectionQuality: null,
    ...overrides,
  };
}

describe('CallService', () => {
  let service: CallService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeCallService();
  });

  describe('heartbeat tracking', () => {
    it('records and retrieves heartbeat timestamps', () => {
      const callId = 'call-1';
      const participantId = 'part-1';

      service.recordHeartbeat(callId, participantId);
      const lastBeat = service.getLastHeartbeat(callId, participantId);

      expect(lastBeat).toBeDefined();
      expect(typeof lastBeat).toBe('number');
      expect(Date.now() - lastBeat!).toBeLessThan(100);
    });

    it('returns undefined for unknown call', () => {
      expect(service.getLastHeartbeat('unknown', 'unknown')).toBeUndefined();
    });

    it('clears heartbeats for a call', () => {
      service.recordHeartbeat('call-1', 'part-1');
      service.clearHeartbeats('call-1');

      expect(service.getLastHeartbeat('call-1', 'part-1')).toBeUndefined();
    });

    it('detects stale heartbeats', async () => {
      const callId = 'call-1';
      service.recordHeartbeat(callId, 'part-1');

      // Simulate time passing by directly manipulating the Map
      const heartbeats = (service as any).heartbeats;
      heartbeats.get(callId)!.set('part-1', Date.now() - 70_000);

      const stale = service.getStaleHeartbeats(callId, 60_000);
      expect(stale).toContain('part-1');
    });

    it('returns empty array when all heartbeats are fresh', () => {
      service.recordHeartbeat('call-1', 'part-1');
      const stale = service.getStaleHeartbeats('call-1', 60_000);
      expect(stale).toHaveLength(0);
    });
  });

  describe('updateCallStatus', () => {
    it('transitions from connecting to active and sets answeredAt', async () => {
      const callSession = makeCallSession({
        status: CallStatus.connecting,
        answeredAt: null
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);
      mockPrisma.callSession.update.mockResolvedValue({ ...callSession, status: CallStatus.active });

      // Mock getCallSession (called at the end)
      const fullSession = { ...callSession, status: CallStatus.active, participants: [], initiator: {}, conversation: {} };
      mockPrisma.callSession.findUnique
        .mockResolvedValueOnce(callSession)
        .mockResolvedValueOnce(fullSession);

      await service.updateCallStatus(callSession.id, CallStatus.active);

      expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: callSession.id },
          data: expect.objectContaining({
            status: CallStatus.active,
            answeredAt: expect.any(Date)
          })
        })
      );
    });

    it('sets endedAt and duration for terminal states', async () => {
      const callSession = makeCallSession({ status: CallStatus.active });

      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);
      mockPrisma.callSession.update.mockResolvedValue({ ...callSession, status: CallStatus.ended });
      mockPrisma.callSession.findUnique
        .mockResolvedValueOnce(callSession)
        .mockResolvedValueOnce({ ...callSession, status: CallStatus.ended, participants: [], initiator: {}, conversation: {} });

      await service.updateCallStatus(callSession.id, CallStatus.ended, CallEndReason.completed);

      expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CallStatus.ended,
            endedAt: expect.any(Date),
            duration: expect.any(Number),
            endReason: CallEndReason.completed
          })
        })
      );
    });

    it('is idempotent for already-terminal states', async () => {
      const callSession = makeCallSession({ status: CallStatus.ended });

      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);
      mockPrisma.callSession.findUnique
        .mockResolvedValueOnce(callSession)
        .mockResolvedValueOnce({ ...callSession, participants: [], initiator: {}, conversation: {} });

      await service.updateCallStatus(callSession.id, CallStatus.active);

      expect(mockPrisma.callSession.update).not.toHaveBeenCalled();
    });
  });

  describe('endCall — any participant can end P2P', () => {
    it('allows non-initiator participant to end call', async () => {
      const callSession = makeCallSession({
        status: CallStatus.active,
        participants: [
          makeParticipant({ role: 'initiator', participantId: 'part-initiator' }),
          makeParticipant({ id: 'cp-2', role: 'participant', participantId: 'part-joiner' }),
        ],
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);
      mockPrisma.callParticipant.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.callSession.update.mockResolvedValue({ ...callSession, status: CallStatus.ended });
      mockPrisma.callSession.findUnique
        .mockResolvedValueOnce(callSession)
        .mockResolvedValueOnce({ ...callSession, status: CallStatus.ended, participants: [], initiator: {}, conversation: {} });

      const result = await service.endCall(
        callSession.id,
        'user-joiner',
        'part-joiner',
        false,
        'completed'
      );

      expect(mockPrisma.callSession.update).toHaveBeenCalled();
    });

    it('rejects anonymous users from ending calls', async () => {
      await expect(
        service.endCall('call-1', 'anon-user', 'part-1', true)
      ).rejects.toThrow('PERMISSION_DENIED');
    });

    it('is idempotent for already-ended calls', async () => {
      const callSession = makeCallSession({ status: CallStatus.ended });
      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);
      mockPrisma.callSession.findUnique
        .mockResolvedValueOnce(callSession)
        .mockResolvedValueOnce({ ...callSession, participants: [], initiator: {}, conversation: {} });

      const result = await service.endCall(
        callSession.id, 'user-1', 'part-1', false
      );

      expect(mockPrisma.callParticipant.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('joinCall — transitions to connecting', () => {
    it('sets status to connecting when joining from initiated', async () => {
      const callSession = makeCallSession({
        status: CallStatus.initiated,
        answeredAt: null,
        participants: [],
      });

      mockPrisma.callSession.findUnique.mockResolvedValue(callSession);
      mockPrisma.participant.findFirst.mockResolvedValue({ id: 'part-2' });
      mockPrisma.callParticipant.create.mockResolvedValue({});
      mockPrisma.callSession.update.mockResolvedValue({ ...callSession, status: CallStatus.connecting });
      mockPrisma.callSession.findUnique
        .mockResolvedValueOnce(callSession)
        .mockResolvedValueOnce({
          ...callSession,
          status: CallStatus.connecting,
          participants: [makeParticipant({ participantId: 'part-2', participant: { userId: 'user-2', user: {} } })],
          initiator: {},
          conversation: {}
        });

      const result = await service.joinCall({
        callId: callSession.id,
        userId: 'user-2',
        participantId: 'part-2',
      });

      expect(mockPrisma.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CallStatus.connecting,
          })
        })
      );
      expect(result.iceServers).toBeDefined();
    });
  });
});

describe('CallService — resolveEndReason (private)', () => {
  it('maps known reasons correctly', () => {
    const service = makeCallService();
    // Access private method via cast
    const resolve = (service as any).resolveEndReason.bind(service);

    expect(resolve('missed')).toBe(CallEndReason.missed);
    expect(resolve('rejected')).toBe(CallEndReason.rejected);
    expect(resolve('failed')).toBe(CallEndReason.failed);
    expect(resolve('connectionLost')).toBe(CallEndReason.connectionLost);
    expect(resolve('heartbeatTimeout')).toBe(CallEndReason.heartbeatTimeout);
    expect(resolve('garbageCollected')).toBe(CallEndReason.garbageCollected);
    expect(resolve(undefined)).toBe(CallEndReason.completed);
    expect(resolve('unknown')).toBe(CallEndReason.completed);
  });
});
