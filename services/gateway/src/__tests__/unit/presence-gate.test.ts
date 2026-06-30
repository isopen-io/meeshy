/**
 * Unit tests for viewerFromAuthContext — pure mapping from authContext to the
 * presence viewer used by the strict-channel gate.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { viewerFromAuthContext } from '../../routes/users/presence-gate';

describe('viewerFromAuthContext', () => {
  it('maps a registered user with a role to a viewer', () => {
    expect(
      viewerFromAuthContext({ type: 'user', userId: 'u1', registeredUser: { role: 'MODERATOR' } }),
    ).toEqual({ userId: 'u1', role: 'MODERATOR' });
  });

  it('returns null for an anonymous context', () => {
    expect(viewerFromAuthContext({ type: 'anonymous', userId: 'sess' })).toBeNull();
  });

  it('returns null when there is no auth context', () => {
    expect(viewerFromAuthContext(undefined)).toBeNull();
  });

  it('returns null for a registered context without a role', () => {
    expect(viewerFromAuthContext({ type: 'user', userId: 'u1', registeredUser: null })).toBeNull();
  });
});
