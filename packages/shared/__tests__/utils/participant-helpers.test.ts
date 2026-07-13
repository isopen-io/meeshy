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

  it('treats a blank local avatar as absent and falls back to the user avatar', () => {
    expect(resolveParticipantAvatar({ avatar: '', user: { avatar: 'user.jpg' } })).toBe(
      'user.jpg',
    );
    expect(
      resolveParticipantAvatar({ avatar: '   ', user: { avatar: 'user.jpg' } }),
    ).toBe('user.jpg');
  });

  it('returns null when both avatars are blank strings', () => {
    expect(resolveParticipantAvatar({ avatar: '', user: { avatar: '' } })).toBeNull();
    expect(resolveParticipantAvatar({ avatar: '  ', user: { avatar: null } })).toBeNull();
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
