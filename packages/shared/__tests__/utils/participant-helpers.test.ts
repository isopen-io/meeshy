import { describe, it, expect } from 'vitest';
import { resolveParticipantAvatar } from '../../utils/participant-helpers.js';

describe('resolveParticipantAvatar', () => {
  it('returns the participant-local avatar first, even when a user avatar exists', () => {
    expect(
      resolveParticipantAvatar({ avatar: 'local.jpg', user: { avatar: 'user.jpg' } }),
    ).toBe('local.jpg');
  });

  it('falls back to the linked user avatar when the local avatar is null', () => {
    expect(resolveParticipantAvatar({ avatar: null, user: { avatar: 'user.jpg' } })).toBe(
      'user.jpg',
    );
  });

  it('falls back to the linked user avatar when the local avatar is undefined', () => {
    expect(resolveParticipantAvatar({ user: { avatar: 'user.jpg' } })).toBe('user.jpg');
  });

  it('returns null when neither avatar is present', () => {
    expect(resolveParticipantAvatar({ avatar: null, user: { avatar: null } })).toBeNull();
  });

  it('returns null when the user relation is null', () => {
    expect(resolveParticipantAvatar({ avatar: null, user: null })).toBeNull();
  });

  it('is null-safe for a null or undefined participant', () => {
    expect(resolveParticipantAvatar(null)).toBeNull();
    expect(resolveParticipantAvatar(undefined)).toBeNull();
  });
});
