/**
 * Coverage for CallEventsHandler offer-buffering helpers (§4.6):
 * - bufferOffer: stores latest offer per call, sweeps expired entries
 * - clearBufferedOffer: deletes the buffered entry
 * - bufferedOfferFor: returns offer if matching+fresh, null if expired/wrong target
 *
 * All three are private methods tested via (handler as any).
 *
 * @jest-environment node
 */

// ── module mocks (required by CallEventsHandler constructor) ──────────────────

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    initiateCall:             jest.fn<any>(),
    joinCall:                 jest.fn<any>(),
    leaveCall:                jest.fn<any>(),
    endCall:                  jest.fn<any>(),
    getCallSession:           jest.fn<any>(),
    generateIceServers:       jest.fn<any>().mockReturnValue([]),
    clearRingingTimeout:      jest.fn<any>(),
    scheduleRingingTimeout:   jest.fn<any>(),
    listHistory:              jest.fn<any>(),
    handleMissedCall:         jest.fn<any>(),
    createCallSummaryMessage: jest.fn<any>(),
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent:  jest.fn(),
  isValidationFailure:  jest.fn((r: any) => !r.success),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn<any>(), destroy: jest.fn<any>() }),
  checkSocketRateLimit: jest.fn<any>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS:   {},
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn<any>(), debug: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>() },
}));

// ── SUT ───────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CallEventsHandler } from '../../../socketio/CallEventsHandler';

// ── helpers ───────────────────────────────────────────────────────────────────

const makePrisma = () => ({
  callSession:     { findUnique: jest.fn<any>(), updateMany: jest.fn<any>() },
  callParticipant: { findMany: jest.fn<any>().mockResolvedValue([]) },
  participant:     { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  conversation:    { findUnique: jest.fn<any>().mockResolvedValue(null) },
  user:            { findUnique: jest.fn<any>().mockResolvedValue(null) },
} as any);

const makeSignal = (to: string, offerType = 'offer') => ({
  callId: 'call-1',
  signal: { type: offerType, to, sdp: 'v=0...' },
});

const makeHandler = () => new CallEventsHandler(makePrisma());

const CALL_ID    = 'call-123';
const USER_ID    = 'user-abc';
const PART_ID    = 'participant-xyz';
const OTHER_USER = 'user-other';

// ── bufferOffer ────────────────────────────────────────────────────────────────

describe('CallEventsHandler — bufferOffer (private)', () => {
  let handler: CallEventsHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = makeHandler();
  });

  it('stores an offer for a call', () => {
    const signal = makeSignal(USER_ID);
    (handler as any).bufferOffer(CALL_ID, signal);

    const stored = (handler as any).bufferedOffers.get(CALL_ID);
    expect(stored).toBeDefined();
    expect(stored.signal).toBe(signal);
  });

  it('overwrites a previous offer for the same call', () => {
    const first  = makeSignal(USER_ID);
    const second = makeSignal(PART_ID);
    (handler as any).bufferOffer(CALL_ID, first);
    (handler as any).bufferOffer(CALL_ID, second);

    const stored = (handler as any).bufferedOffers.get(CALL_ID);
    expect(stored.signal).toBe(second);
  });

  it('sweeps expired entries for OTHER calls when a new offer arrives', () => {
    const EXPIRED_CALL = 'call-expired';
    const now = Date.now();
    // Inject a stale entry directly
    (handler as any).bufferedOffers.set(EXPIRED_CALL, {
      signal: makeSignal(USER_ID),
      bufferedAt: now - 200_000, // older than OFFER_BUFFER_TTL_MS (150 000 ms)
    });

    // Buffer a fresh offer for a different call — triggers the sweep
    (handler as any).bufferOffer(CALL_ID, makeSignal(USER_ID));

    expect((handler as any).bufferedOffers.has(EXPIRED_CALL)).toBe(false);
    expect((handler as any).bufferedOffers.has(CALL_ID)).toBe(true);
  });

  it('keeps non-expired entries for other calls during sweep', () => {
    const OTHER_CALL = 'call-fresh';
    (handler as any).bufferedOffers.set(OTHER_CALL, {
      signal: makeSignal(USER_ID),
      bufferedAt: Date.now() - 1_000, // 1 s ago — still fresh
    });

    (handler as any).bufferOffer(CALL_ID, makeSignal(USER_ID));

    expect((handler as any).bufferedOffers.has(OTHER_CALL)).toBe(true);
  });
});

// ── clearBufferedOffer ────────────────────────────────────────────────────────

describe('CallEventsHandler — clearBufferedOffer (private)', () => {
  let handler: CallEventsHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = makeHandler();
  });

  it('removes an existing buffered offer', () => {
    (handler as any).bufferOffer(CALL_ID, makeSignal(USER_ID));
    expect((handler as any).bufferedOffers.has(CALL_ID)).toBe(true);

    (handler as any).clearBufferedOffer(CALL_ID);

    expect((handler as any).bufferedOffers.has(CALL_ID)).toBe(false);
  });

  it('is a no-op when there is no offer for the call', () => {
    expect(() => {
      (handler as any).clearBufferedOffer('nonexistent-call');
    }).not.toThrow();
  });
});

// ── bufferedOfferFor ──────────────────────────────────────────────────────────

describe('CallEventsHandler — bufferedOfferFor (private)', () => {
  let handler: CallEventsHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = makeHandler();
  });

  it('returns null when there is no buffered offer for the call', () => {
    const result = (handler as any).bufferedOfferFor(CALL_ID, USER_ID, null);
    expect(result).toBeNull();
  });

  it('returns the offer when signal.to matches joiningUserId', () => {
    const signal = makeSignal(USER_ID);
    (handler as any).bufferOffer(CALL_ID, signal);

    const result = (handler as any).bufferedOfferFor(CALL_ID, USER_ID, null);

    expect(result).toBe(signal);
  });

  it('returns the offer when signal.to matches joiningParticipantId', () => {
    const signal = makeSignal(PART_ID);
    (handler as any).bufferOffer(CALL_ID, signal);

    const result = (handler as any).bufferedOfferFor(CALL_ID, USER_ID, PART_ID);

    expect(result).toBe(signal);
  });

  it('returns null when signal.to does not match either ID', () => {
    const signal = makeSignal(OTHER_USER);
    (handler as any).bufferOffer(CALL_ID, signal);

    const result = (handler as any).bufferedOfferFor(CALL_ID, USER_ID, PART_ID);

    expect(result).toBeNull();
  });

  it('returns null and removes entry when buffered offer is expired', () => {
    const now = Date.now();
    (handler as any).bufferedOffers.set(CALL_ID, {
      signal: makeSignal(USER_ID),
      bufferedAt: now - 200_000, // past TTL
    });

    const result = (handler as any).bufferedOfferFor(CALL_ID, USER_ID, null);

    expect(result).toBeNull();
    expect((handler as any).bufferedOffers.has(CALL_ID)).toBe(false);
  });

  it('does NOT remove the entry on a successful read (non-consuming)', () => {
    const signal = makeSignal(USER_ID);
    (handler as any).bufferOffer(CALL_ID, signal);

    (handler as any).bufferedOfferFor(CALL_ID, USER_ID, null);
    // Entry must still be present for a second read (e.g. if the socket churns again)
    const again = (handler as any).bufferedOfferFor(CALL_ID, USER_ID, null);

    expect(again).toBe(signal);
  });

  it('returns null when joiningParticipantId is null and userId does not match', () => {
    const signal = makeSignal(PART_ID); // signal addressed to a participantId
    (handler as any).bufferOffer(CALL_ID, signal);

    const result = (handler as any).bufferedOfferFor(CALL_ID, USER_ID, null);

    expect(result).toBeNull();
  });
});
