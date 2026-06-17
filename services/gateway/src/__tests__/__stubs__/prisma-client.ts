/**
 * Stub for @meeshy/shared/prisma/client in test environments where
 * `prisma generate` has not been run (no .prisma/client generated).
 *
 * NOTE: This stub is used in ALL Jest runs via moduleNameMapper, even in CI
 * where the real Prisma client is generated. Production code that references
 * Prisma enums at module load time (not inside mocks) therefore uses these
 * stub values. Keep all schema enums in sync with schema.prisma.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// All enums from packages/shared/prisma/schema.prisma — keep in sync.
export const UserRole = {
  USER: 'USER', ADMIN: 'ADMIN', MODERATOR: 'MODERATOR',
  BIGBOSS: 'BIGBOSS', AUDIT: 'AUDIT', ANALYST: 'ANALYST',
} as const;

export const CallStatus = {
  initiated: 'initiated', ringing: 'ringing', connecting: 'connecting',
  active: 'active', reconnecting: 'reconnecting', ended: 'ended',
  missed: 'missed', rejected: 'rejected', failed: 'failed',
} as const;

export const CallMode = { p2p: 'p2p', sfu: 'sfu' } as const;

export const CallEndReason = {
  completed: 'completed', missed: 'missed', rejected: 'rejected',
  failed: 'failed', connectionLost: 'connectionLost',
  heartbeatTimeout: 'heartbeatTimeout', garbageCollected: 'garbageCollected',
} as const;

export const ParticipantRole = { initiator: 'initiator', participant: 'participant' } as const;

export const PostType = { POST: 'POST', REEL: 'REEL', STORY: 'STORY', STATUS: 'STATUS' } as const;

export const PostVisibility = {
  PUBLIC: 'PUBLIC', FRIENDS: 'FRIENDS', COMMUNITY: 'COMMUNITY',
  PRIVATE: 'PRIVATE', EXCEPT: 'EXCEPT', ONLY: 'ONLY',
} as const;

export const TrackingTargetType = {
  POST: 'POST', REEL: 'REEL', STORY: 'STORY', STATUS: 'STATUS',
  CONVERSATION: 'CONVERSATION', PROFILE: 'PROFILE', EXTERNAL: 'EXTERNAL',
} as const;

export const TranscriptionSource = { client: 'client', server: 'server' } as const;

export const DeletionRequestStatus = {
  PENDING_EMAIL_CONFIRMATION: 'PENDING_EMAIL_CONFIRMATION',
  CONFIRMED: 'CONFIRMED', GRACE_PERIOD_EXPIRED: 'GRACE_PERIOD_EXPIRED',
  CANCELLED: 'CANCELLED', COMPLETED: 'COMPLETED',
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Prisma = {
  PrismaClientKnownRequestError: class extends Error {
    code: string;
    constructor(message: string, opts: { code: string; clientVersion: string }) {
      super(message);
      this.code = opts.code;
    }
  },
  PrismaClientValidationError: class extends Error {},
  // Runtime identity function — Prisma.validator<T>() returns (v: T) => T
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validator: () => (value: any) => value,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
