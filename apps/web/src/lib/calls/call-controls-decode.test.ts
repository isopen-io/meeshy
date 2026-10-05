import { describe, expect, test } from 'bun:test';

import { decodeControlAck, decodeInitiated, decodeMutedByModerator, decodeParticipantInvited, decodeReactionReceived, decodeSessionInitiator } from './call-decode';

/**
 * LES CHARGES DES CONTRÔLES D'APPEL (#8433, #8438, #8439), LUES SANS LES
 * CROIRE — la forme est celle de `@meeshy/shared/types/call-controls` ; une
 * charge mal formée rend `null` et le moteur l'ignore.
 */

const CALL = 'call-1';

describe('call:initiated d’une invitation (#8433)', () => {
  const base = { callId: CALL, conversationId: 'conv-1', type: 'audio', conversationType: 'direct', initiator: { userId: 'u-a', displayName: 'Ada' }, participants: [] };

  test('invitedBy nomme qui invite, et l’appel devient de groupe', () => {
    const decoded = decodeInitiated({ ...base, invitedBy: { userId: 'u-b', username: 'bruno', displayName: 'Bruno' }, isGroup: true });
    expect(decoded?.invitedBy).toEqual({ userId: 'u-b', name: 'Bruno', avatar: null });
    expect(decoded?.isGroup).toBe(true);
  });

  test('sans invitedBy, rien ne change', () => {
    const decoded = decodeInitiated(base);
    expect(decoded?.invitedBy).toBeNull();
    expect(decoded?.isGroup).toBe(false);
  });
});

describe('call:participant-invited', () => {
  test('lit l’invité et qui invite', () => {
    expect(
      decodeParticipantInvited({ callId: CALL, invitedBy: 'u-a', invitee: { userId: 'u-c', username: 'chloe', displayName: null, avatar: 'https://x/c.png' }, participantCount: 2, isGroup: true }),
    ).toEqual({ callId: CALL, invitedBy: 'u-a', invitee: { userId: 'u-c', name: 'chloe', avatar: 'https://x/c.png' } });
  });

  test('un invité sans identifiant est ignoré', () => {
    expect(decodeParticipantInvited({ callId: CALL, invitedBy: 'u-a', invitee: { username: 'x' } })).toBeNull();
  });
});

describe('call:muted-by-moderator', () => {
  test('lit l’appel et qui a coupé', () => {
    expect(decodeMutedByModerator({ callId: CALL, byUserId: 'u-a' })).toEqual({ callId: CALL, byUserId: 'u-a' });
    expect(decodeMutedByModerator({ callId: CALL })).toBeNull();
  });
});

describe('call:reaction-received', () => {
  test('lit une réaction de la liste fermée', () => {
    expect(decodeReactionReceived({ callId: CALL, userId: 'u-a', emoji: '🎉', at: '2026-09-27T10:00:00.000Z' })).toEqual({ callId: CALL, userId: 'u-a', emoji: '🎉' });
  });

  test('un emoji hors liste est refusé', () => {
    expect(decodeReactionReceived({ callId: CALL, userId: 'u-a', emoji: '💩' })).toBeNull();
  });
});

describe('l’accusé des contrôles (CallControlAck)', () => {
  test('succès', () => {
    expect(decodeControlAck({ success: true })).toEqual({ ok: true });
  });

  test('un code connu est rendu tel quel', () => {
    expect(decodeControlAck({ success: false, code: 'ALREADY_IN_CALL' })).toEqual({ ok: false, code: 'ALREADY_IN_CALL' });
  });

  test('pas d’accusé, ou un code inconnu, se lit INTERNAL_ERROR', () => {
    expect(decodeControlAck(null)).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
    expect(decodeControlAck({ success: false, code: 'NOPE' })).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
  });
});

describe('l’initiateur d’une session rendue par call:join', () => {
  test('lit initiatorId', () => {
    expect(decodeSessionInitiator({ initiatorId: 'u-a', participants: [] })).toBe('u-a');
    expect(decodeSessionInitiator({ participants: [] })).toBeNull();
    expect(decodeSessionInitiator(null)).toBeNull();
  });
});
