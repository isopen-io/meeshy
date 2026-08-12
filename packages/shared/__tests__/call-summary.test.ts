import { describe, it, expect } from 'vitest';
import {
  buildCallSummary,
  buildCallSummaryMetadata,
  buildCallSummaryWithMetadata,
  buildLiveCallMetadata,
  buildGarbageCollectedConversion,
  formatCallDuration,
  formatCallDataSize,
  callSummaryClientMessageId,
  callContentKey,
  type CallSummaryInput,
  type CallSummaryMetadataInput
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
      contentKey: 'call_completed_audio',
      content: 'Appel audio · 04:32'
    });
  });

  it('exposes a stable contentKey for i18n consumers', () => {
    expect(callContentKey('completed', 'audio')).toBe('call_completed_audio');
    expect(callContentKey('missed', 'video')).toBe('call_missed_video');
    expect(callContentKey('rejected', 'audio')).toBe('call_rejected_audio');
    expect(callContentKey('failed', 'video')).toBe('call_failed_video');
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

const makeMetaInput = (
  overrides: Partial<CallSummaryMetadataInput> = {}
): CallSummaryMetadataInput => ({
  status: 'ended',
  endReason: 'completed',
  callType: 'video',
  durationSeconds: 272,
  callId: 'call_1',
  initiatorId: 'user_a',
  ...overrides
});

describe('formatCallDataSize', () => {
  it('renders sub-KB and zero as a floor of "0 KB"/"1 KB"', () => {
    expect(formatCallDataSize(0)).toBe('0 KB');
    expect(formatCallDataSize(-100)).toBe('0 KB');
    expect(formatCallDataSize(NaN)).toBe('0 KB');
    expect(formatCallDataSize(400)).toBe('1 KB');
  });

  it('renders KB below 1000 KB (decimal units)', () => {
    expect(formatCallDataSize(512_000)).toBe('512 KB');
    expect(formatCallDataSize(999_000)).toBe('999 KB');
  });

  it('renders MB with one decimal, trailing .0 stripped', () => {
    expect(formatCallDataSize(2_400_000)).toBe('2.4 MB');
    expect(formatCallDataSize(3_000_000)).toBe('3 MB');
  });

  it('renders GB past 1000 MB', () => {
    expect(formatCallDataSize(1_100_000_000)).toBe('1.1 GB');
  });

  it('promotes the unit when rounding crosses the boundary (no "1000 KB")', () => {
    expect(formatCallDataSize(999_700)).toBe('1 MB');   // 999.7 KB → 1 MB
    expect(formatCallDataSize(999_400)).toBe('999 KB');  // stays KB
    expect(formatCallDataSize(999_960_000)).toBe('1 GB'); // 999.96 MB → 1 GB
  });
});

describe('buildCallSummaryMetadata', () => {
  it('mirrors null gating from buildCallSummary', () => {
    expect(buildCallSummaryMetadata(makeMetaInput({ endReason: 'garbageCollected' }))).toBeNull();
    expect(buildCallSummaryMetadata(makeMetaInput({ status: 'ringing', endReason: null }))).toBeNull();
  });

  it('carries call facts for a completed call', () => {
    const meta = buildCallSummaryMetadata(makeMetaInput({
      callType: 'video',
      durationSeconds: 272,
      bytesSent: 1_000_000,
      bytesReceived: 1_400_000,
      networkQuality: 'good'
    }));
    expect(meta).toEqual({
      kind: 'call',
      callId: 'call_1',
      initiatorId: 'user_a',
      callType: 'video',
      outcome: 'completed',
      durationSeconds: 272,
      bytesTotal: 2_400_000,
      bytesEstimated: false,
      networkQuality: 'good'
    });
  });

  it('estimates data spent from duration when no bytes were measured', () => {
    const meta = buildCallSummaryMetadata(makeMetaInput({
      callType: 'audio',
      durationSeconds: 60,
      bytesSent: null,
      bytesReceived: null
    }));
    expect(meta?.bytesEstimated).toBe(true);
    expect(meta?.bytesTotal).toBe(25_000 * 60);
  });

  it('reports null data for missed calls and never estimates them', () => {
    const meta = buildCallSummaryMetadata(makeMetaInput({
      status: 'missed',
      endReason: 'missed',
      durationSeconds: 0
    }));
    expect(meta?.outcome).toBe('missed');
    expect(meta?.bytesTotal).toBeNull();
    expect(meta?.bytesEstimated).toBe(false);
  });

  it('rejects an unknown network quality value', () => {
    expect(buildCallSummaryMetadata(makeMetaInput({ networkQuality: 'amazing' }))?.networkQuality).toBeNull();
    expect(buildCallSummaryMetadata(makeMetaInput({ networkQuality: null }))?.networkQuality).toBeNull();
  });
});

describe('callSummaryClientMessageId', () => {
  it('is deterministic and namespaced per call', () => {
    expect(callSummaryClientMessageId('abc123')).toBe('call-summary:abc123');
    expect(callSummaryClientMessageId('abc123')).toBe(callSummaryClientMessageId('abc123'));
    expect(callSummaryClientMessageId('a')).not.toBe(callSummaryClientMessageId('b'));
  });
});

describe('buildCallSummaryWithMetadata', () => {
  it('returns null when the summary is suppressed (garbageCollected)', () => {
    const result = buildCallSummaryWithMetadata(makeMetaInput({ endReason: 'garbageCollected' }));
    expect(result).toBeNull();
  });

  it('returns null for a non-terminal status (ringing)', () => {
    const result = buildCallSummaryWithMetadata(makeMetaInput({ status: 'ringing', endReason: null }));
    expect(result).toBeNull();
  });

  it('returns both summary and metadata for a completed video call', () => {
    const result = buildCallSummaryWithMetadata(makeMetaInput({
      callType: 'video',
      durationSeconds: 272,
    }));
    expect(result).not.toBeNull();
    expect(result?.summary.durationSeconds).toBe(272);
    expect(result?.summary.callType).toBe('video');
    expect(result?.metadata.outcome).toBe('completed');
  });

  it('summary in combined result matches standalone buildCallSummary', () => {
    const input = makeMetaInput({ callType: 'audio', durationSeconds: 60 });
    const combined = buildCallSummaryWithMetadata(input);
    const standalone = buildCallSummary(input);
    expect(combined?.summary).toEqual(standalone);
  });

  it('metadata in combined result matches standalone buildCallSummaryMetadata', () => {
    const input = makeMetaInput({ callType: 'video', durationSeconds: 100, bytesSent: 500_000, bytesReceived: 300_000, networkQuality: 'good' });
    const combined = buildCallSummaryWithMetadata(input);
    const standalone = buildCallSummaryMetadata(input);
    expect(combined?.metadata).toEqual(standalone);
  });
});

describe('buildLiveCallMetadata — live (ongoing) call message', () => {
  it('builds the live audio metadata with a neutral outcome and no measurements', () => {
    const result = buildLiveCallMetadata({ callId: 'call_1', initiatorId: 'user_a', callType: 'audio' });
    expect(result.metadata).toEqual({
      kind: 'call-live',
      callId: 'call_1',
      initiatorId: 'user_a',
      callType: 'audio',
      outcome: 'completed',
      durationSeconds: 0,
      bytesTotal: null,
      bytesEstimated: false,
      networkQuality: null
    });
    expect(result.summary.contentKey).toBe('call_ongoing_audio');
    expect(result.summary.content).toBe('Appel audio en cours');
  });

  it('builds the live video label from the media type', () => {
    const result = buildLiveCallMetadata({ callId: 'call_1', initiatorId: 'user_a', callType: 'video' });
    expect(result.metadata.kind).toBe('call-live');
    expect(result.metadata.callType).toBe('video');
    expect(result.summary.contentKey).toBe('call_ongoing_video');
    expect(result.summary.content).toBe('Appel vidéo en cours');
  });

  it('treats an unknown/absent media type as audio', () => {
    expect(buildLiveCallMetadata({ callId: 'c', initiatorId: 'u', callType: null }).metadata.callType).toBe('audio');
    expect(buildLiveCallMetadata({ callId: 'c', initiatorId: 'u', callType: 'screenshare' }).metadata.callType).toBe('audio');
  });

  it('never carries endedByInitiator on a live message', () => {
    const result = buildLiveCallMetadata({ callId: 'c', initiatorId: 'u', callType: 'audio' });
    expect('endedByInitiator' in result.metadata).toBe(false);
  });
});

describe('endedByInitiator — cancelled-by-initiator discrimination', () => {
  const missedInput = (overrides: Partial<CallSummaryMetadataInput> = {}): CallSummaryMetadataInput =>
    makeMetaInput({ status: 'missed', endReason: 'missed', durationSeconds: 0, ...overrides });

  it('is true when a missed call was never answered and ended by the initiator', () => {
    const meta = buildCallSummaryMetadata(missedInput({ answeredAt: null, endedById: 'user_a' }));
    expect(meta?.outcome).toBe('missed');
    expect(meta?.endedByInitiator).toBe(true);
  });

  it('stays a plain missed call (key ABSENT) when someone else ended it', () => {
    const meta = buildCallSummaryMetadata(missedInput({ answeredAt: null, endedById: 'user_b' }));
    expect(meta && 'endedByInitiator' in meta).toBe(false);
  });

  it('stays a plain missed call (key ABSENT) when nobody is recorded as having ended it', () => {
    const meta = buildCallSummaryMetadata(missedInput({ answeredAt: null }));
    expect(meta && 'endedByInitiator' in meta).toBe(false);
  });

  it('is never set once the call was answered', () => {
    const meta = buildCallSummaryMetadata(missedInput({ answeredAt: new Date('2026-07-11T10:00:00Z'), endedById: 'user_a' }));
    expect(meta && 'endedByInitiator' in meta).toBe(false);
  });

  it('is never set for non-missed outcomes even if the initiator hung up', () => {
    for (const overrides of [
      { status: 'ended', endReason: 'completed', durationSeconds: 30 },
      { status: 'rejected', endReason: 'rejected' },
      { status: 'failed', endReason: 'failed' }
    ] satisfies Partial<CallSummaryMetadataInput>[]) {
      const meta = buildCallSummaryMetadata(makeMetaInput({ ...overrides, answeredAt: null, endedById: 'user_a' }));
      expect(meta && 'endedByInitiator' in meta).toBe(false);
    }
  });

  it('keeps the canonical terminal kind (bijection: terminal is always kind call)', () => {
    const meta = buildCallSummaryMetadata(missedInput({ answeredAt: null, endedById: 'user_a' }));
    expect(meta?.kind).toBe('call');
  });

  it('flows through buildCallSummaryWithMetadata identically', () => {
    const input = missedInput({ answeredAt: null, endedById: 'user_a' });
    expect(buildCallSummaryWithMetadata(input)?.metadata).toEqual(buildCallSummaryMetadata(input));
  });
});

describe('buildGarbageCollectedConversion — live message reaped as failed', () => {
  it('converts a live video call to the interrupted terminal state', () => {
    const result = buildGarbageCollectedConversion({ callId: 'call_1', initiatorId: 'user_a', callType: 'video' });
    expect(result.metadata).toEqual({
      kind: 'call',
      callId: 'call_1',
      initiatorId: 'user_a',
      callType: 'video',
      outcome: 'failed',
      durationSeconds: 0,
      bytesTotal: null,
      bytesEstimated: false,
      networkQuality: null
    });
    expect(result.summary.contentKey).toBe('call_failed_video');
    expect(result.summary.content).toBe('Appel vidéo interrompu');
  });

  it('converts a live audio call with the audio label', () => {
    const result = buildGarbageCollectedConversion({ callId: 'c', initiatorId: 'u', callType: 'audio' });
    expect(result.metadata.outcome).toBe('failed');
    expect(result.summary.content).toBe('Appel audio interrompu');
  });
});
