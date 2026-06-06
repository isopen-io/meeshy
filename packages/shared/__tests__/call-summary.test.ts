import { describe, it, expect } from 'vitest';
import {
  buildCallSummary,
  formatCallDuration,
  callSummaryClientMessageId,
  type CallSummaryInput
} from '../utils/call-summary';

const makeInput = (overrides: Partial<CallSummaryInput> = {}): CallSummaryInput => ({
  status: 'ended',
  endReason: 'completed',
  callType: 'audio',
  durationSeconds: 0,
  ...overrides
});

describe('formatCallDuration', () => {
  it('zero-pads minutes and seconds below an hour', () => {
    expect(formatCallDuration(0)).toBe('00:00');
    expect(formatCallDuration(5)).toBe('00:05');
    expect(formatCallDuration(59)).toBe('00:59');
    expect(formatCallDuration(60)).toBe('01:00');
    expect(formatCallDuration(272)).toBe('04:32');
    expect(formatCallDuration(599)).toBe('09:59');
  });

  it('renders hours past 3600 seconds', () => {
    expect(formatCallDuration(3600)).toBe('1:00:00');
    expect(formatCallDuration(3661)).toBe('1:01:01');
    expect(formatCallDuration(7322)).toBe('2:02:02');
  });

  it('clamps negative and non-finite durations to 00:00', () => {
    expect(formatCallDuration(-10)).toBe('00:00');
    expect(formatCallDuration(NaN)).toBe('00:00');
    expect(formatCallDuration(Infinity)).toBe('00:00');
  });

  it('floors fractional seconds', () => {
    expect(formatCallDuration(272.9)).toBe('04:32');
  });
});

describe('buildCallSummary — completed calls', () => {
  it('labels a completed audio call with its duration', () => {
    const summary = buildCallSummary(makeInput({ callType: 'audio', durationSeconds: 272 }));
    expect(summary).toEqual({
      outcome: 'completed',
      callType: 'audio',
      durationSeconds: 272,
      content: 'Appel audio · 04:32'
    });
  });

  it('labels a completed video call with its duration', () => {
    const summary = buildCallSummary(makeInput({ callType: 'video', durationSeconds: 65 }));
    expect(summary?.content).toBe('Appel vidéo · 01:05');
    expect(summary?.callType).toBe('video');
  });

  it('treats an unknown/absent media type as audio', () => {
    expect(buildCallSummary(makeInput({ callType: null }))?.callType).toBe('audio');
    expect(buildCallSummary(makeInput({ callType: 'screenshare' }))?.callType).toBe('audio');
  });

  it('infers completed from status=ended even without an end reason', () => {
    const summary = buildCallSummary(makeInput({ endReason: null, durationSeconds: 10 }));
    expect(summary?.outcome).toBe('completed');
    expect(summary?.content).toBe('Appel audio · 00:10');
  });
});

describe('buildCallSummary — missed / rejected / failed', () => {
  it('labels a missed audio call (no duration)', () => {
    const summary = buildCallSummary(makeInput({ status: 'missed', endReason: 'missed', durationSeconds: 0 }));
    expect(summary?.outcome).toBe('missed');
    expect(summary?.content).toBe('Appel audio manqué');
  });

  it('labels a missed video call from the media type', () => {
    const summary = buildCallSummary(makeInput({ status: 'missed', endReason: 'missed', callType: 'video' }));
    expect(summary?.content).toBe('Appel vidéo manqué');
  });

  it('labels a rejected call without a media type qualifier', () => {
    const summary = buildCallSummary(makeInput({ status: 'rejected', endReason: 'rejected', callType: 'video' }));
    expect(summary?.outcome).toBe('rejected');
    expect(summary?.content).toBe('Appel refusé');
  });

  it('maps failed/connectionLost/heartbeatTimeout to an interrupted label', () => {
    for (const endReason of ['failed', 'connectionLost', 'heartbeatTimeout']) {
      const summary = buildCallSummary(makeInput({ status: 'ended', endReason, callType: 'video' }));
      expect(summary?.outcome).toBe('failed');
      expect(summary?.content).toBe('Appel vidéo interrompu');
    }
  });

  it('honours rejected precedence over missed when both could match', () => {
    const summary = buildCallSummary(makeInput({ status: 'rejected', endReason: 'missed' }));
    expect(summary?.outcome).toBe('rejected');
  });
});

describe('buildCallSummary — suppressed cases (returns null)', () => {
  it('suppresses garbage-collected phantom sessions', () => {
    expect(buildCallSummary(makeInput({ status: 'ended', endReason: 'garbageCollected' }))).toBeNull();
  });

  it('suppresses non-terminal states', () => {
    for (const status of ['initiated', 'ringing', 'connecting', 'active', 'reconnecting']) {
      expect(buildCallSummary(makeInput({ status, endReason: null }))).toBeNull();
    }
  });
});

describe('buildCallSummary — duration hygiene', () => {
  it('clamps negative duration to zero', () => {
    expect(buildCallSummary(makeInput({ durationSeconds: -5 }))?.durationSeconds).toBe(0);
  });

  it('defaults a missing duration to zero', () => {
    expect(buildCallSummary(makeInput({ durationSeconds: null }))?.durationSeconds).toBe(0);
  });
});

describe('callSummaryClientMessageId', () => {
  it('is deterministic and namespaced per call', () => {
    expect(callSummaryClientMessageId('abc123')).toBe('call-summary:abc123');
    expect(callSummaryClientMessageId('abc123')).toBe(callSummaryClientMessageId('abc123'));
    expect(callSummaryClientMessageId('a')).not.toBe(callSummaryClientMessageId('b'));
  });
});
