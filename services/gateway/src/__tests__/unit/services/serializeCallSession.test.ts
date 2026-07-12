/**
 * serializeCallSession — wire-shaping for the REST active-call payload.
 *
 * `GET /conversations/:id/active-call` and `GET /calls/active` return the raw
 * Prisma `CallSession` (with `callSessionInclude`). Each participant is a
 * `CallParticipant` row whose identity lives at `participant.userId` /
 * `participant.user` and whose media state is `isAudioEnabled` /
 * `isVideoEnabled`. But `callSessionSchema.participants[]` (the response
 * serializer) whitelists the FLAT shape iOS decodes: top-level `userId`,
 * `user`, `isMuted`, `isVideoOff`. fast-json-stringify only whitelists (never
 * remaps), so the raw nested shape serialized to `{ id, role, joinedAt,
 * leftAt }` — dropping WHO is in the call and their media state. iOS
 * `ActiveCallParticipant.userId` is non-optional, so a registered-user call
 * made the entire `ActiveCallSession` decode throw → crash-recovery / rejoin
 * silently returned nothing.
 *
 * This serializer bridges the nested Prisma shape to the flat wire contract.
 */

import { describe, it, expect } from '@jest/globals';
import { serializeCallSession } from '../../../services/CallService';

const rawParticipant = (overrides: Record<string, unknown> = {}) => ({
  id: 'cp-1',
  callSessionId: '507f1f77bcf86cd799439011',
  participantId: '507f1f77bcf86cd799439055',
  role: 'initiator',
  joinedAt: new Date('2026-07-12T03:00:00.000Z'),
  leftAt: null,
  lastHeartbeatAt: null,
  isAudioEnabled: true,
  isVideoEnabled: false,
  analytics: { deviceModel: 'iPhone17,SECRET', codec: 'opus' },
  connectionQuality: null,
  participant: {
    id: '507f1f77bcf86cd799439055',
    userId: 'user-alice',
    user: { id: 'user-alice', username: 'alice', displayName: 'Alice', avatar: null },
  },
  ...overrides,
});

const rawSession = (participants: unknown[]) => ({
  id: '507f1f77bcf86cd799439011',
  conversationId: '507f1f77bcf86cd799439033',
  initiatorId: 'user-alice',
  mode: 'p2p',
  status: 'active',
  metadata: { type: 'video' },
  startedAt: new Date('2026-07-12T03:00:00.000Z'),
  participants,
});

describe('serializeCallSession', () => {
  it('returns null for a null session (no active call)', () => {
    expect(serializeCallSession(null)).toBeNull();
  });

  it('surfaces participant identity from participant.userId as top-level userId', () => {
    const out = serializeCallSession(rawSession([rawParticipant()])) as any;

    expect(out.participants[0].userId).toBe('user-alice');
  });

  it('surfaces participant.user as the top-level user the client decodes', () => {
    const out = serializeCallSession(rawSession([rawParticipant()])) as any;

    expect(out.participants[0].user).toEqual({
      id: 'user-alice',
      username: 'alice',
      displayName: 'Alice',
      avatar: null,
    });
  });

  it('maps media state (isAudioEnabled/isVideoEnabled) to isMuted/isVideoOff', () => {
    const out = serializeCallSession(rawSession([rawParticipant()])) as any;

    expect(out.participants[0].isMuted).toBe(false);
    expect(out.participants[0].isVideoOff).toBe(true);
  });

  it('drops per-participant analytics (privacy — never reshaped onto the wire object)', () => {
    const out = serializeCallSession(rawSession([rawParticipant()])) as any;

    expect(out.participants[0]).not.toHaveProperty('analytics');
  });

  it('falls back to participantId when the participant has no linked user (anonymous)', () => {
    const anon = rawParticipant({
      participant: { id: 'anon-participant-id', userId: null, user: null },
    });

    const out = serializeCallSession(rawSession([anon])) as any;

    expect(out.participants[0].userId).toBe('507f1f77bcf86cd799439055');
    expect(out.participants[0].user).toBeUndefined();
  });

  it('preserves the top-level session fields untouched', () => {
    const out = serializeCallSession(rawSession([rawParticipant()])) as any;

    expect(out.id).toBe('507f1f77bcf86cd799439011');
    expect(out.mode).toBe('p2p');
    expect(out.metadata).toEqual({ type: 'video' });
  });
});
