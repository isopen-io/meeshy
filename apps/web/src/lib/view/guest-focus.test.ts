import { describe, expect, test } from 'bun:test';

import type { AuthenticatedSession, GuestIdentity, SessionState } from '@/lib/api/session';

import { focusGuestOf, speaksAsGuest } from './guest-focus';

/**
 * SANS COMPTE, PAS DE STRUCTURE D'APPLICATION (#10100, décision porteur du
 * 2026-10-11) — un invité n'a qu'UNE conversation : la sienne, en focus. Un
 * COMPTE qui lit une conversation sous son identité anonyme (#8816) n'est pas
 * cet invité : il garde son application.
 */

const GUEST: GuestIdentity = { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-world', link: 'mshy_world', mayWrite: true };

const ACCOUNT = {
  status: 'authenticated',
  token: 'jwt',
  user: { id: 'u-1', username: 'awa', displayName: 'Awa' },
} as unknown as AuthenticatedSession;

describe('focusGuestOf', () => {
  test('un invité sans compte est en focus sur sa conversation', () => {
    const session: SessionState = { status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: 1 };
    expect(focusGuestOf(session)).toEqual(GUEST);
  });

  test('un compte sous son identité anonyme garde son application', () => {
    const session: SessionState = { status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: 1, account: ACCOUNT };
    expect(focusGuestOf(session)).toBeNull();
  });

  test('un compte, ou personne, n’est jamais en focus invité', () => {
    expect(focusGuestOf(ACCOUNT)).toBeNull();
    expect(focusGuestOf({ status: 'anonymous' })).toBeNull();
  });
});

describe('speaksAsGuest — qui parle à la passerelle en invité (#10205)', () => {
  test('toute session invitée présente le jeton d’invité, compte tenu ou non : la passerelle lui refuse membres, accusés et profils', () => {
    expect(speaksAsGuest({ status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: 1 })).toBe(true);
    expect(speaksAsGuest({ status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: 1, account: ACCOUNT })).toBe(true);
  });

  test('un compte ou personne ne parle pas en invité', () => {
    expect(speaksAsGuest(ACCOUNT)).toBe(false);
    expect(speaksAsGuest({ status: 'anonymous' })).toBe(false);
  });
});
