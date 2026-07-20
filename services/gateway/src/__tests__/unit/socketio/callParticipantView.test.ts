/**
 * toCallParticipantView — pure mapper from a Prisma call-participant row to the
 * wire `CallParticipant` DTO emitted over Socket.IO (call:initiated replay,
 * call:initiate ACK/broadcast, call:participant-joined).
 *
 * The three call-flow sites previously inlined an identical mapping whose
 * `displayName` used a raw `||` chain. That leaked a whitespace-only local
 * displayName (a truthy string) and a blank account displayName to native
 * clients — the same bug class fixed for the message/conversation routes in
 * #2025. This mapper routes `displayName` through the blank-aware SSOT
 * `resolveParticipantDisplayName` (local → account, blank treated as absent)
 * while preserving the exact `username`/`avatar` behavior of the call sites.
 */

import { describe, it, expect } from '@jest/globals';
import { toCallParticipantView } from '../../../socketio/callParticipantView';

const baseRow = () => ({
  id: 'cp-1',
  callSessionId: 'cs-1',
  participantId: 'participant-1',
  role: 'participant' as const,
  joinedAt: new Date('2026-07-20T10:00:00.000Z'),
  leftAt: undefined,
  isAudioEnabled: true,
  isVideoEnabled: false,
  connectionQuality: null,
  participant: {
    userId: 'user-1',
    displayName: null as string | null,
    avatar: null as string | null,
    user: {
      username: 'alice',
      displayName: null as string | null,
      avatar: null as string | null,
    },
  },
});

describe('toCallParticipantView', () => {
  it('prefers the local participant displayName over the account displayName', () => {
    const row = baseRow();
    row.participant.displayName = 'Local Alice';
    row.participant.user.displayName = 'Account Alice';

    expect(toCallParticipantView(row).displayName).toBe('Local Alice');
  });

  it('falls back to the account displayName when the local one is an empty string', () => {
    const row = baseRow();
    row.participant.displayName = '';
    row.participant.user.displayName = 'Account Alice';

    expect(toCallParticipantView(row).displayName).toBe('Account Alice');
  });

  it('treats a whitespace-only local displayName as absent (no leak to clients)', () => {
    const row = baseRow();
    row.participant.displayName = '   ';
    row.participant.user.displayName = 'Account Alice';

    expect(toCallParticipantView(row).displayName).toBe('Account Alice');
  });

  it('omits displayName (undefined) when both local and account names are blank', () => {
    const row = baseRow();
    row.participant.displayName = '  ';
    row.participant.user.displayName = '';

    expect(toCallParticipantView(row).displayName).toBeUndefined();
  });

  it('omits displayName (undefined) when there is no linked participant at all', () => {
    const row = { ...baseRow(), participant: null };

    expect(toCallParticipantView(row).displayName).toBeUndefined();
  });

  it('preserves the account-first avatar order used by call flows', () => {
    const row = baseRow();
    row.participant.avatar = 'local-avatar.png';
    row.participant.user.avatar = 'account-avatar.png';

    expect(toCallParticipantView(row).avatar).toBe('account-avatar.png');
  });

  it('preserves the username fallback (account username → local displayName)', () => {
    const row = baseRow();
    row.participant.user.username = 'alice';
    row.participant.displayName = 'Local Alice';

    expect(toCallParticipantView(row).username).toBe('alice');
  });

  it('passes through identity, role, media flags, quality and userId fallback', () => {
    const quality = { latency: 30, packetLoss: 0.01, bandwidth: 900 };
    const row = { ...baseRow(), connectionQuality: quality };
    row.participant.userId = 'user-1';

    const view = toCallParticipantView(row);

    expect(view.id).toBe('cp-1');
    expect(view.callSessionId).toBe('cs-1');
    expect(view.role).toBe('participant');
    expect(view.isAudioEnabled).toBe(true);
    expect(view.isVideoEnabled).toBe(false);
    expect(view.connectionQuality).toEqual(quality);
    expect(view.userId).toBe('user-1');
  });

  it('falls back to participantId when the linked participant has no userId', () => {
    const row = baseRow();
    row.participant.userId = undefined as unknown as string;

    expect(toCallParticipantView(row).userId).toBe('participant-1');
  });
});
