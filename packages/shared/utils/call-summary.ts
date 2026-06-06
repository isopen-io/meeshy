/**
 * Call summary system-message builder (Phase P3).
 *
 * When a 1:1 WebRTC call reaches a terminal state, the gateway posts a
 * `messageType: 'system'` message into the conversation summarising the call
 * ("Appel vidéo · 04:32", "Appel audio manqué", "Appel refusé"). This module
 * owns the PURE mapping from the call's terminal facts (status, end reason,
 * media type, duration) to that user-facing label.
 *
 * It is intentionally framework-free and side-effect-free so it can be unit
 * tested in isolation and reused identically by any caller (gateway today,
 * potentially a future analytics path). Persistence + Socket.IO fanout live in
 * the gateway (`CallService.createCallSummaryMessage`).
 *
 * Source of truth for the status/end-reason vocabularies:
 *   packages/shared/types/video-call.ts (`CallStatus`, `CallEndReason`).
 */

export type CallSummaryOutcome = 'completed' | 'missed' | 'rejected' | 'failed';
export type CallSummaryMediaType = 'audio' | 'video';

export interface CallSummaryInput {
  /** Terminal `CallStatus` (e.g. 'ended' | 'missed' | 'rejected' | 'failed'). */
  readonly status: string;
  /** `CallEndReason` if known (e.g. 'completed' | 'missed' | 'rejected' | ...). */
  readonly endReason?: string | null;
  /**
   * Media type of the call. Read from `CallSession.metadata.type`
   * ('video' | 'audio'); anything that is not 'video' is treated as audio.
   */
  readonly callType?: string | null;
  /** Call duration in seconds (0 when the call was never answered). */
  readonly durationSeconds?: number | null;
}

export interface CallSummary {
  readonly outcome: CallSummaryOutcome;
  readonly callType: CallSummaryMediaType;
  /** Non-negative, integer-clamped duration in seconds. */
  readonly durationSeconds: number;
  /** Human-readable French label, e.g. "Appel vidéo · 04:32". */
  readonly content: string;
}

/** End reasons that represent server-side housekeeping, never user-facing. */
const SILENT_END_REASONS: ReadonlySet<string> = new Set([
  'garbageCollected'
]);

const FAILURE_END_REASONS: ReadonlySet<string> = new Set([
  'failed',
  'connectionLost',
  'heartbeatTimeout'
]);

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

/**
 * Format a duration in seconds as "M:SS" (or "H:MM:SS" past an hour), with the
 * leading minutes zero-padded so a 4m32s call reads "04:32" (matches the
 * product spec). Negative or non-finite inputs clamp to "00:00".
 */
export function formatCallDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  }
  return `${pad2(minutes)}:${pad2(secs)}`;
}

const normalizeMediaType = (callType?: string | null): CallSummaryMediaType =>
  callType === 'video' ? 'video' : 'audio';

const mediaLabel = (callType: CallSummaryMediaType): string =>
  callType === 'video' ? 'Appel vidéo' : 'Appel audio';

/**
 * Resolve the user-facing outcome from the terminal status + end reason.
 * Returns `null` when the call should NOT produce a summary message:
 *   - non-terminal states (still ringing/active),
 *   - silent housekeeping reasons (garbage collection of phantom sessions).
 *
 * Precedence: rejected > missed > failed > completed. Both `status` and
 * `endReason` are consulted because different gateway paths populate them
 * differently (some set only the status, some only the reason).
 */
function resolveOutcome(status: string, endReason?: string | null): CallSummaryOutcome | null {
  if (endReason && SILENT_END_REASONS.has(endReason)) {
    return null;
  }
  if (status === 'rejected' || endReason === 'rejected') {
    return 'rejected';
  }
  if (status === 'missed' || endReason === 'missed') {
    return 'missed';
  }
  if (status === 'failed' || (endReason != null && FAILURE_END_REASONS.has(endReason))) {
    return 'failed';
  }
  if (status === 'ended' || endReason === 'completed') {
    return 'completed';
  }
  return null;
}

function contentFor(outcome: CallSummaryOutcome, callType: CallSummaryMediaType, durationSeconds: number): string {
  switch (outcome) {
    case 'completed':
      return `${mediaLabel(callType)} · ${formatCallDuration(durationSeconds)}`;
    case 'missed':
      return `${mediaLabel(callType)} manqué`;
    case 'rejected':
      return 'Appel refusé';
    case 'failed':
      return `${mediaLabel(callType)} interrompu`;
  }
}

/**
 * Build the call summary, or `null` when no system message should be created.
 * Pure: no I/O, no clock, deterministic for given inputs.
 */
export function buildCallSummary(input: CallSummaryInput): CallSummary | null {
  const outcome = resolveOutcome(input.status, input.endReason);
  if (outcome === null) {
    return null;
  }
  const callType = normalizeMediaType(input.callType);
  const durationSeconds = Number.isFinite(input.durationSeconds ?? NaN)
    ? Math.max(0, Math.floor(input.durationSeconds as number))
    : 0;
  return {
    outcome,
    callType,
    durationSeconds,
    content: contentFor(outcome, callType, durationSeconds)
  };
}

/**
 * Deterministic `clientMessageId` for a call's summary message. Combined with
 * the partial unique index on `Message(conversationId, clientMessageId)`, this
 * gives DB-level idempotency: every terminal path can call the creation method,
 * but only the first persists — duplicates raise P2002 and are swallowed.
 */
export function callSummaryClientMessageId(callId: string): string {
  return `call-summary:${callId}`;
}
