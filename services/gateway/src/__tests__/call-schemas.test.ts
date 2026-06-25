/**
 * Call Validation Schemas Tests
 * Tests Zod schemas for all call-related Socket.IO events
 */

import {
  socketInitiateCallSchema,
  socketJoinCallSchema,
  socketSignalSchema,
  socketEndCallSchema,
  socketHeartbeatSchema,
  socketQualityReportSchema,
  socketReconnectingSchema,
  socketReconnectedSchema,
  socketTranscriptionSegmentSchema,
  socketMediaToggleSchema,
  socketCallBackgroundedSchema,
  socketCallForegroundedSchema,
  socketCallScreenCaptureDetectedSchema,
} from '../validation/call-schemas';

const validMongoId = '507f1f77bcf86cd799439011';

describe('Call Validation Schemas', () => {
  describe('socketSignalSchema', () => {
    it('validates offer with SDP', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'v=0\r\no=- 1234 1 IN IP4 0.0.0.0\r\nm=audio 9 RTP/AVP 0\r\n',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates ice-restart with SDP', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'ice-restart',
          from: 'user-1',
          to: 'user-2',
          sdp: 'v=0\r\no=- 5678 2 IN IP4 0.0.0.0\r\nm=audio 9 RTP/AVP 0\r\n',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates ice-candidate', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'ice-candidate',
          from: 'user-1',
          to: 'user-2',
          candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 5000 typ host',
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects offer without SDP', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects SDP > 50KB', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'x'.repeat(51_000),
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects SDP missing v=0 version field (RFC 4566 structural check)', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'm=audio 9 RTP/AVP 0\r\n',
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects SDP missing m= media line (RFC 4566 structural check)', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'v=0\r\no=- 1234 1 IN IP4 0.0.0.0\r\n',
        },
      });
      expect(result.success).toBe(false);
    });

    it('accepts empty string as ICE end-of-candidates marker (RFC 8445 §8.2.1)', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'ice-candidate',
          from: 'user-1',
          to: 'user-2',
          candidate: '',
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects ICE candidate missing "candidate:" prefix (RFC 8445)', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'ice-candidate',
          from: 'user-1',
          to: 'user-2',
          candidate: 'not-a-valid-ice-line',
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown signal type', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'unknown-type',
          from: 'user-1',
          to: 'user-2',
          sdp: 'test',
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid MongoDB callId', () => {
      const result = socketSignalSchema.safeParse({
        callId: 'not-a-mongo-id',
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'v=0',
        },
      });
      expect(result.success).toBe(false);
    });

    // §3.5 — the negotiation epoch MUST survive validation. Zod strips
    // undeclared keys by default, which is exactly why a NON-declared field
    // would be lost on the opaque relay. Proving both halves here documents
    // the mechanism and guards against a regression that silently drops the
    // epoch (which would re-open the stale-offer race the field prevents).
    it('preserves negotiationId on offer (not stripped by validation)', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'v=0\r\no=- 1234 1 IN IP4 0.0.0.0\r\nm=audio 9 RTP/AVP 0\r\n',
          negotiationId: 7,
        },
      });
      expect(result.success).toBe(true);
      expect(result.success && result.data.signal.negotiationId).toBe(7);
    });

    it('preserves negotiationId on ice-candidate', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'ice-candidate',
          from: 'user-1',
          to: 'user-2',
          candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 5000 typ host',
          negotiationId: 3,
        },
      });
      expect(result.success).toBe(true);
      expect(result.success && result.data.signal.negotiationId).toBe(3);
    });

    it('accepts a signal without negotiationId (older clients ⇒ epoch absent)', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'v=0\r\nm=audio 9 RTP/AVP 0\r\n',
        },
      });
      expect(result.success).toBe(true);
      expect(result.success && result.data.signal.negotiationId).toBeUndefined();
    });

    it('rejects a negative negotiationId', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'v=0\r\n',
          negotiationId: -1,
        },
      });
      expect(result.success).toBe(false);
    });

    it('strips an undeclared field (documents the stripping the epoch avoids)', () => {
      const result = socketSignalSchema.safeParse({
        callId: validMongoId,
        signal: {
          type: 'offer',
          from: 'user-1',
          to: 'user-2',
          sdp: 'v=0\r\nm=audio 9 RTP/AVP 0\r\n',
          someUndeclaredField: 'value',
        },
      });
      expect(result.success).toBe(true);
      expect(result.success && (result.data.signal as Record<string, unknown>).someUndeclaredField).toBeUndefined();
    });
  });

  describe('socketHeartbeatSchema', () => {
    it('validates valid heartbeat', () => {
      const result = socketHeartbeatSchema.safeParse({ callId: validMongoId });
      expect(result.success).toBe(true);
    });

    it('rejects missing callId', () => {
      const result = socketHeartbeatSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('socketQualityReportSchema', () => {
    it('validates full quality report', () => {
      const result = socketQualityReportSchema.safeParse({
        callId: validMongoId,
        stats: {
          packetLoss: 2.5,
          rtt: 120,
          bitrate: { audio: 64, video: 500 },
          jitter: 15,
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates minimal quality report', () => {
      const result = socketQualityReportSchema.safeParse({
        callId: validMongoId,
        stats: {
          packetLoss: 0,
          rtt: 50,
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative packet loss', () => {
      const result = socketQualityReportSchema.safeParse({
        callId: validMongoId,
        stats: { packetLoss: -1, rtt: 50 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects packet loss > 100', () => {
      const result = socketQualityReportSchema.safeParse({
        callId: validMongoId,
        stats: { packetLoss: 101, rtt: 50 },
      });
      expect(result.success).toBe(false);
    });

    it('accepts availableOutgoingBitrateBps when present', () => {
      const result = socketQualityReportSchema.safeParse({
        callId: validMongoId,
        stats: { packetLoss: 2.5, rtt: 80, availableOutgoingBitrateBps: 1_500_000 },
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative availableOutgoingBitrateBps', () => {
      const result = socketQualityReportSchema.safeParse({
        callId: validMongoId,
        stats: { packetLoss: 2.5, rtt: 80, availableOutgoingBitrateBps: -1 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('socketReconnectingSchema', () => {
    it('validates reconnecting event', () => {
      const result = socketReconnectingSchema.safeParse({
        callId: validMongoId,
        participantId: 'part-1',
        attempt: 1,
      });
      expect(result.success).toBe(true);
    });

    it('rejects attempt > 10', () => {
      const result = socketReconnectingSchema.safeParse({
        callId: validMongoId,
        participantId: 'part-1',
        attempt: 11,
      });
      expect(result.success).toBe(false);
    });

    it('rejects attempt < 1', () => {
      const result = socketReconnectingSchema.safeParse({
        callId: validMongoId,
        participantId: 'part-1',
        attempt: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('socketEndCallSchema', () => {
    it('validates end with reason', () => {
      const result = socketEndCallSchema.safeParse({
        callId: validMongoId,
        reason: 'completed',
      });
      expect(result.success).toBe(true);
    });

    it('validates end without reason', () => {
      const result = socketEndCallSchema.safeParse({ callId: validMongoId });
      expect(result.success).toBe(true);
    });

    it('rejects reason > 50 chars', () => {
      const result = socketEndCallSchema.safeParse({
        callId: validMongoId,
        reason: 'x'.repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it('rejects reason with uppercase letters (whitelist: lowercase + underscore only)', () => {
      const result = socketEndCallSchema.safeParse({
        callId: validMongoId,
        reason: 'UserHangup',
      });
      expect(result.success).toBe(false);
    });

    it('rejects reason with special characters that could carry XSS payload', () => {
      const result = socketEndCallSchema.safeParse({
        callId: validMongoId,
        reason: '<script>alert(1)</script>',
      });
      expect(result.success).toBe(false);
    });

    it('accepts known CallEndReason values that match the whitelist', () => {
      const validReasons = ['completed', 'missed', 'failed', 'garbage_collected', 'heartbeat_timeout'];
      for (const reason of validReasons) {
        const result = socketEndCallSchema.safeParse({ callId: validMongoId, reason });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('socketTranscriptionSegmentSchema', () => {
    it('validates transcription segment', () => {
      const result = socketTranscriptionSegmentSchema.safeParse({
        callId: validMongoId,
        segment: {
          text: 'Hello world',
          speakerId: 'user-1',
          startMs: 0,
          endMs: 1500,
          isFinal: true,
          confidence: 0.95,
          language: 'en',
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty text', () => {
      const result = socketTranscriptionSegmentSchema.safeParse({
        callId: validMongoId,
        segment: {
          text: '',
          speakerId: 'user-1',
          startMs: 0,
          endMs: 1000,
          isFinal: false,
          confidence: 0.5,
          language: 'fr',
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects confidence > 1', () => {
      const result = socketTranscriptionSegmentSchema.safeParse({
        callId: validMongoId,
        segment: {
          text: 'Test',
          speakerId: 'user-1',
          startMs: 0,
          endMs: 500,
          isFinal: true,
          confidence: 1.5,
          language: 'en',
        },
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('socketCallBackgroundedSchema', () => {
  const validMongoId2 = '507f1f77bcf86cd799439011';
  const validParticipantId = '507f1f77bcf86cd799439012';

  it('validates with required fields', () => {
    const result = socketCallBackgroundedSchema.safeParse({
      callId: validMongoId2,
      participantId: validParticipantId,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing participantId', () => {
    const result = socketCallBackgroundedSchema.safeParse({
      callId: validMongoId2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid callId', () => {
    const result = socketCallBackgroundedSchema.safeParse({
      callId: 'not-a-mongo-id',
      participantId: validParticipantId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty participantId', () => {
    const result = socketCallBackgroundedSchema.safeParse({
      callId: validMongoId2,
      participantId: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('socketCallForegroundedSchema', () => {
  const validMongoId2 = '507f1f77bcf86cd799439011';
  const validParticipantId = '507f1f77bcf86cd799439012';

  it('validates with required fields', () => {
    const result = socketCallForegroundedSchema.safeParse({
      callId: validMongoId2,
      participantId: validParticipantId,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing participantId', () => {
    const result = socketCallForegroundedSchema.safeParse({
      callId: validMongoId2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid callId', () => {
    const result = socketCallForegroundedSchema.safeParse({
      callId: 'short',
      participantId: validParticipantId,
    });
    expect(result.success).toBe(false);
  });
});

describe('socketCallScreenCaptureDetectedSchema', () => {
  const validMongoId2 = '507f1f77bcf86cd799439011';
  const validParticipantId = '507f1f77bcf86cd799439012';

  it('validates isCapturing: true', () => {
    const result = socketCallScreenCaptureDetectedSchema.safeParse({
      callId: validMongoId2,
      participantId: validParticipantId,
      isCapturing: true,
    });
    expect(result.success).toBe(true);
  });

  it('validates isCapturing: false', () => {
    const result = socketCallScreenCaptureDetectedSchema.safeParse({
      callId: validMongoId2,
      participantId: validParticipantId,
      isCapturing: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing isCapturing', () => {
    const result = socketCallScreenCaptureDetectedSchema.safeParse({
      callId: validMongoId2,
      participantId: validParticipantId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean isCapturing', () => {
    const result = socketCallScreenCaptureDetectedSchema.safeParse({
      callId: validMongoId2,
      participantId: validParticipantId,
      isCapturing: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing participantId', () => {
    const result = socketCallScreenCaptureDetectedSchema.safeParse({
      callId: validMongoId2,
      isCapturing: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('Type Guard Tests (video-call.ts)', () => {
  // Import after mocks to avoid issues
  const { isActiveCall, isP2PCall, determineCallMode } = require('@meeshy/shared/types/video-call');

  describe('isActiveCall', () => {
    it('returns true for active states', () => {
      expect(isActiveCall({ status: 'active' })).toBe(true);
      expect(isActiveCall({ status: 'ringing' })).toBe(true);
      expect(isActiveCall({ status: 'connecting' })).toBe(true);
      expect(isActiveCall({ status: 'reconnecting' })).toBe(true);
    });

    it('returns false for terminal states', () => {
      expect(isActiveCall({ status: 'ended' })).toBe(false);
      expect(isActiveCall({ status: 'missed' })).toBe(false);
      expect(isActiveCall({ status: 'rejected' })).toBe(false);
      expect(isActiveCall({ status: 'failed' })).toBe(false);
      expect(isActiveCall({ status: 'initiated' })).toBe(false);
    });
  });

  describe('isP2PCall', () => {
    it('returns true for p2p mode', () => {
      expect(isP2PCall({ mode: 'p2p' })).toBe(true);
    });

    it('returns false for sfu mode', () => {
      expect(isP2PCall({ mode: 'sfu' })).toBe(false);
    });
  });

  describe('determineCallMode', () => {
    it('returns p2p for 2 or fewer participants', () => {
      expect(determineCallMode(1)).toBe('p2p');
      expect(determineCallMode(2)).toBe('p2p');
    });

    it('returns sfu for 3+ participants', () => {
      expect(determineCallMode(3)).toBe('sfu');
      expect(determineCallMode(10)).toBe('sfu');
    });
  });
});
