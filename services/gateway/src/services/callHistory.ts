/**
 * Call history — pure shaping helpers for `GET /api/v1/calls/history`.
 *
 * These functions are deliberately free of Prisma / IO so they can be unit
 * tested in isolation. `CallService.listHistory` runs the DB queries and feeds
 * the rows through `buildCallHistoryItem`.
 *
 * The `CallHistoryItem` shape is the REST contract for the call journal. It is
 * mirrored client-side by the SDK's `APICallRecord` (Swift Decodable) — see
 * `packages/MeeshySDK/.../Models/CallModels.swift`. Keep the two in sync.
 */

export type CallDirection = 'incoming' | 'outgoing' | 'missed';

export interface CallHistoryPeer {
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  phoneNumber: string | null;
  /**
   * Gated STRICT by `CallService.listHistory` via `applyPresenceVisibilityAsOffline`
   * (directive produit 2026-08-25) — `false` for a viewer who is neither this
   * peer, an ADMIN/BIGBOSS, nor their accepted friend. Non-nullable on the
   * wire (mirrored by the SDK's `APICallRecord.peer.isOnline: Bool`), so
   * "hidden" folds to `false`, never to `null`.
   */
  isOnline: boolean;
}

export interface CallHistoryItem {
  callId: string;
  conversationId: string;
  conversationType: string;
  conversationTitle: string | null;
  conversationAvatar: string | null;
  mode: string;
  status: string;
  endReason: string | null;
  /** Derived: outgoing if I initiated; else incoming if answered, missed otherwise. */
  direction: CallDirection;
  isVideo: boolean;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number;
  bytesSent: number | null;
  bytesReceived: number | null;
  /** The other party for a P2P/direct call; null for group calls. */
  peer: CallHistoryPeer | null;
}

/** The minimal `CallSession` projection the builder consumes. */
export interface CallHistoryRow {
  id: string;
  conversationId: string;
  mode: string;
  status: string;
  endReason: string | null;
  initiatorId: string;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  bytesSent: number | null;
  bytesReceived: number | null;
  metadata: unknown;
  conversation: { type: string; title: string | null; avatar: string | null };
}

/** Floor a finite, non-negative byte counter; anything else → null. */
export const clampNonNegativeInt = (value?: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/**
 * From the current user's vantage point:
 * - they started it → outgoing
 * - someone else started it, THEY personally joined it, and it was answered
 *   → incoming
 * - someone else started it and it was never answered → missed
 * - someone else started it, was answered by someone else, but THEY never
 *   personally joined it → missed, never "incoming"
 *
 * The last case matters for group conversations: a member who never joined
 * the call (declined, ignored, hit the `MAX_CALL_PARTICIPANTS` ceiling) has
 * no `CallParticipant` row for this call at all — the call never actually
 * reached their device. Without `userParticipated`, `answeredAt` alone (set
 * once, call-wide, by whichever participant answered) wrongly labelled that
 * bystander's history entry "incoming", claiming they received a call they
 * never did.
 */
export function deriveCallDirection(
  initiatorId: string,
  userId: string,
  answeredAt: Date | null,
  userParticipated: boolean
): CallDirection {
  if (initiatorId === userId) return 'outgoing';
  return answeredAt && userParticipated ? 'incoming' : 'missed';
}

/** A call was a video call when its initiation metadata recorded `type: 'video'`. */
export function callIsVideo(metadata: unknown): boolean {
  return (
    !!metadata &&
    typeof metadata === 'object' &&
    (metadata as { type?: unknown }).type === 'video'
  );
}

/**
 * Prefer the persisted `duration` (seconds); otherwise derive it from
 * answered→ended timestamps; otherwise 0 (e.g. a missed/unanswered call).
 */
export function deriveDurationSec(row: Pick<CallHistoryRow, 'duration' | 'answeredAt' | 'endedAt'>): number {
  const persisted = clampNonNegativeInt(row.duration);
  if (persisted !== null) return persisted;
  if (row.answeredAt && row.endedAt) {
    return Math.max(0, Math.floor((row.endedAt.getTime() - row.answeredAt.getTime()) / 1000));
  }
  return 0;
}

export function buildCallHistoryItem(
  row: CallHistoryRow,
  userId: string,
  peer: CallHistoryPeer | null,
  /** Does `userId` have their own `CallParticipant` row for this call? Irrelevant (and safe to pass `false`) when `userId` is the initiator. */
  userParticipated: boolean
): CallHistoryItem {
  return {
    callId: row.id,
    conversationId: row.conversationId,
    conversationType: row.conversation.type,
    conversationTitle: row.conversation.title ?? null,
    conversationAvatar: row.conversation.avatar ?? null,
    mode: row.mode,
    status: row.status,
    endReason: row.endReason ?? null,
    direction: deriveCallDirection(row.initiatorId, userId, row.answeredAt, userParticipated),
    isVideo: callIsVideo(row.metadata),
    startedAt: row.startedAt.toISOString(),
    answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationSec: deriveDurationSec(row),
    bytesSent: clampNonNegativeInt(row.bytesSent),
    bytesReceived: clampNonNegativeInt(row.bytesReceived),
    peer,
  };
}
