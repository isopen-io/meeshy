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

import { formatClock } from './duration-format.js';

export type CallSummaryOutcome = 'completed' | 'missed' | 'rejected' | 'failed';
export type CallSummaryMediaType = 'audio' | 'video';
export type CallNetworkQuality = 'excellent' | 'good' | 'fair' | 'poor';

const NETWORK_QUALITIES: ReadonlySet<string> = new Set([
  'excellent',
  'good',
  'fair',
  'poor'
]);

/**
 * Structured, machine-readable facts about a terminated call, persisted on the
 * call-summary `Message.metadata` so clients (iOS/web) can render a rich,
 * actionable bubble WITHOUT re-fetching the call: direction is derived per
 * viewer from `initiatorId`, the media glyph from `callType`, the tint/red from
 * `outcome`, and the "duration · data · quality" line from the remaining fields.
 *
 * `kind: 'call'` discriminates this payload from any future structured metadata.
 */
export interface CallSummaryMetadata {
  readonly kind: 'call';
  /** CallSession id — lets the client re-join an active call or call back. */
  readonly callId: string;
  /** User id of the call initiator — the client compares it to the current
   * user to render "outgoing" (emitted) vs "incoming" (received). */
  readonly initiatorId: string;
  readonly callType: CallSummaryMediaType;
  readonly outcome: CallSummaryOutcome;
  readonly durationSeconds: number;
  /**
   * Total bytes transferred (sent + received). `null` when never measured
   * (e.g. missed/rejected calls carried no media). `estimated` is true when
   * the value was derived from duration×bitrate rather than WebRTC counters,
   * so the client can prefix it with "~".
   */
  readonly bytesTotal: number | null;
  readonly bytesEstimated: boolean;
  /** Overall network quality tier, or `null` when never measured. */
  readonly networkQuality: CallNetworkQuality | null;
}

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
  /**
   * Language-neutral key used by clients to render localized label.
   * Pattern: `{outcome}_{callType}` e.g. "completed_video", "missed_audio".
   * Replaces the former French hardcoded `content` string.
   */
  readonly contentKey: string;
  /**
   * Fallback human-readable label in French (kept for backward compat with
   * gateway message body until all clients consume `contentKey`).
   * @deprecated Use `contentKey` for new rendering code.
   */
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

/**
 * Format a duration in seconds as "M:SS" (or "H:MM:SS" past an hour), with the
 * leading minutes zero-padded so a 4m32s call reads "04:32" (matches the
 * product spec). Negative or non-finite inputs clamp to "00:00".
 *
 * Delegates to the canonical {@link formatClock} (single source of truth for
 * MM:SS / H:MM:SS rendering across shared, web and gateway).
 */
export function formatCallDuration(seconds: number): string {
  return formatClock(seconds, { padMinutes: true });
}

const normalizeMediaType = (callType?: string | null): CallSummaryMediaType =>
  callType === 'video' ? 'video' : 'audio';

/**
 * Stable i18n key for a call outcome + media type combination.
 * Clients (iOS/web) use this to look up the localized string in their own
 * translation bundle rather than relying on a server-side French label.
 * Format: `call_{outcome}_{callType}` — never changes, safe to persist.
 */
export function callContentKey(outcome: CallSummaryOutcome, callType: CallSummaryMediaType): string {
  return `call_${outcome}_${callType}`;
}

const FRENCH_LABELS: Record<string, (duration: number) => string> = {
  call_completed_video: d => `Appel vidéo · ${formatCallDuration(d)}`,
  call_completed_audio: d => `Appel audio · ${formatCallDuration(d)}`,
  call_missed_video: _ => 'Appel vidéo manqué',
  call_missed_audio: _ => 'Appel audio manqué',
  call_rejected_video: _ => 'Appel refusé',
  call_rejected_audio: _ => 'Appel refusé',
  call_failed_video: _ => 'Appel vidéo interrompu',
  call_failed_audio: _ => 'Appel audio interrompu',
};

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
  const key = callContentKey(outcome, callType);
  const labelFn = FRENCH_LABELS[key];
  return labelFn ? labelFn(durationSeconds) : key;
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
    contentKey: callContentKey(outcome, callType),
    content: contentFor(outcome, callType, durationSeconds)
  };
}

export interface CallSummaryMetadataInput extends CallSummaryInput {
  readonly callId: string;
  readonly initiatorId: string;
  /** Cumulative bytes sent during the call (WebRTC counter), if measured. */
  readonly bytesSent?: number | null;
  /** Cumulative bytes received during the call (WebRTC counter), if measured. */
  readonly bytesReceived?: number | null;
  /** Overall network quality tier, if measured. */
  readonly networkQuality?: string | null;
}

/** Approximate per-second byte rates per direction, used to ESTIMATE data spent
 * when the client never reported WebRTC byte counters. Mid-range of the values
 * observed across WhatsApp/Telegram (audio ~0.5–1 MB/min ≈ 12.5 KB/s; 1:1 video
 * ~5–6 MB/min ≈ 95 KB/s), summed for both directions. */
const ESTIMATED_BYTES_PER_SECOND: Record<CallSummaryMediaType, number> = {
  audio: 25_000,
  video: 190_000
};

const clampBytes = (value?: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;

const normalizeQuality = (quality?: string | null): CallNetworkQuality | null =>
  typeof quality === 'string' && NETWORK_QUALITIES.has(quality)
    ? (quality as CallNetworkQuality)
    : null;

/**
 * Resolve total data spent for the call. Prefers the exact sum of measured
 * WebRTC `bytesSent + bytesReceived`; falls back to a duration×rate ESTIMATE
 * (flagged `estimated: true`) only for completed calls with a positive
 * duration. Missed/rejected/failed calls (or zero-duration) report `null`.
 */
function resolveDataSpent(
  outcome: CallSummaryOutcome,
  callType: CallSummaryMediaType,
  durationSeconds: number,
  bytesSent?: number | null,
  bytesReceived?: number | null
): { bytesTotal: number | null; bytesEstimated: boolean } {
  const sent = clampBytes(bytesSent) ?? 0;
  const received = clampBytes(bytesReceived) ?? 0;
  const measured = sent + received;
  if (measured > 0) {
    return { bytesTotal: measured, bytesEstimated: false };
  }
  if (outcome === 'completed' && durationSeconds > 0) {
    return {
      bytesTotal: ESTIMATED_BYTES_PER_SECOND[callType] * durationSeconds,
      bytesEstimated: true
    };
  }
  return { bytesTotal: null, bytesEstimated: false };
}

/** Derive the structured metadata from an already-computed `CallSummary`. */
function metadataFromSummary(
  summary: CallSummary,
  input: CallSummaryMetadataInput
): CallSummaryMetadata {
  const { bytesTotal, bytesEstimated } = resolveDataSpent(
    summary.outcome,
    summary.callType,
    summary.durationSeconds,
    input.bytesSent,
    input.bytesReceived
  );
  return {
    kind: 'call',
    callId: input.callId,
    initiatorId: input.initiatorId,
    callType: summary.callType,
    outcome: summary.outcome,
    durationSeconds: summary.durationSeconds,
    bytesTotal,
    bytesEstimated,
    networkQuality: normalizeQuality(input.networkQuality)
  };
}

/**
 * Build the structured call metadata persisted on the summary `Message`, or
 * `null` when no summary should be created (same gating as `buildCallSummary`).
 * Pure: no I/O, deterministic for given inputs.
 */
export function buildCallSummaryMetadata(
  input: CallSummaryMetadataInput
): CallSummaryMetadata | null {
  const summary = buildCallSummary(input);
  return summary === null ? null : metadataFromSummary(summary, input);
}

/**
 * Build BOTH the human-readable summary (text `content`) and the structured
 * metadata in a single pass, sharing one `buildCallSummary` computation.
 * Returns `null` when no summary should be posted. Used by the gateway so it
 * does not compute the summary twice.
 */
export function buildCallSummaryWithMetadata(
  input: CallSummaryMetadataInput
): { summary: CallSummary; metadata: CallSummaryMetadata } | null {
  const summary = buildCallSummary(input);
  if (summary === null) {
    return null;
  }
  return { summary, metadata: metadataFromSummary(summary, input) };
}

/**
 * Format a byte count as a short, human-readable data size using DECIMAL units
 * (1 KB = 1000 B, matching how data plans / WhatsApp / Telegram report usage):
 * "0 KB", "512 KB", "2.4 MB", "1.1 GB". Sub-KB values round up to "1 KB" so a
 * non-zero call never reads "0 KB". Negative/non-finite inputs clamp to "0 KB".
 */
export function formatCallDataSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  const kb = bytes / 1000;
  if (kb < 1) {
    return '1 KB';
  }
  // Use the post-rounding value for the unit cutover so e.g. 999.7 KB promotes
  // to "1 MB" rather than printing "1000 KB".
  if (Math.round(kb) < 1000) {
    return `${Math.round(kb)} KB`;
  }
  const mb = bytes / 1_000_000;
  if (roundDecimal(mb) < 1000) {
    return `${formatDecimal(mb)} MB`;
  }
  const gb = bytes / 1_000_000_000;
  return `${formatDecimal(gb)} GB`;
}

/** One decimal place, half-away-from-zero. */
function roundDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** One decimal place, trailing ".0" stripped: 2.40 → "2.4", 3.00 → "3". */
function formatDecimal(value: number): string {
  const rounded = roundDecimal(value);
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
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
