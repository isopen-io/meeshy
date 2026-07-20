/**
 * Pure mapper: a Prisma call-participant row → the wire `CallParticipant` DTO
 * broadcast over Socket.IO.
 *
 * Three call-flow sites (call:initiated replay on reconnect, call:initiate
 * ACK/broadcast, call:participant-joined) previously inlined an identical
 * mapping. Centralising it here removes the triplication and — crucially —
 * routes `displayName` through the blank-aware SSOT
 * {@link resolveParticipantDisplayName} (local → account, blank/whitespace
 * treated as absent), the same source of truth the message/conversation routes
 * adopted in #2025. The raw `||` chain it replaces leaked a whitespace-only
 * local displayName (a truthy string) and a blank account displayName to native
 * clients that don't share the web trim.
 *
 * `username` and `avatar` keep their exact prior behavior (account username →
 * local displayName fallback; account-first avatar order) to guarantee this is
 * a pure refactor for those fields.
 */

import { resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import type { CallParticipant, ConnectionQuality, ParticipantRole } from '@meeshy/shared/types/video-call';

export type CallParticipantRow = {
  readonly id: string;
  readonly callSessionId: string;
  readonly participantId?: string | null;
  readonly role: ParticipantRole;
  readonly joinedAt: Date;
  readonly leftAt?: Date | null;
  readonly isAudioEnabled: boolean;
  readonly isVideoEnabled: boolean;
  readonly connectionQuality?: unknown;
  readonly participant?: {
    readonly userId?: string | null;
    readonly displayName?: string | null;
    readonly avatar?: string | null;
    readonly user?: {
      readonly username?: string | null;
      readonly displayName?: string | null;
      readonly avatar?: string | null;
    } | null;
  } | null;
};

export const toCallParticipantView = (row: CallParticipantRow): CallParticipant => ({
  id: row.id,
  callSessionId: row.callSessionId,
  userId: row.participant?.userId || row.participantId,
  role: row.role,
  joinedAt: row.joinedAt,
  leftAt: row.leftAt,
  isAudioEnabled: row.isAudioEnabled,
  isVideoEnabled: row.isVideoEnabled,
  connectionQuality: row.connectionQuality as unknown as ConnectionQuality | null,
  username: row.participant?.user?.username || row.participant?.displayName,
  displayName: resolveParticipantDisplayName(row.participant) ?? undefined,
  avatar: row.participant?.user?.avatar || row.participant?.avatar,
});
