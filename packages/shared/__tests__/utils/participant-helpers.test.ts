import { describe, it, expect } from 'vitest';
import {
  resolveParticipantAvatar,
  resolveParticipantDisplayName,
} from '../../utils/participant-helpers.js';

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

describe('resolveParticipantDisplayName', () => {
  it('returns the participant-local displayName first, even when a user displayName exists', () => {
    expect(
      resolveParticipantDisplayName({ displayName: 'Local', user: { displayName: 'Account' } }),
    ).toBe('Local');
  });

  it('falls back to the linked user displayName when the local one is null', () => {
    expect(
      resolveParticipantDisplayName({ displayName: null, user: { displayName: 'Account' } }),
    ).toBe('Account');
  });

  it('falls back to the linked user displayName when the local one is undefined', () => {
    expect(resolveParticipantDisplayName({ user: { displayName: 'Account' } })).toBe('Account');
  });

  it('treats a blank local displayName as absent and falls back to the user displayName', () => {
    expect(
      resolveParticipantDisplayName({ displayName: '', user: { displayName: 'Account' } }),
    ).toBe('Account');
    expect(
      resolveParticipantDisplayName({ displayName: '   ', user: { displayName: 'Account' } }),
    ).toBe('Account');
  });

  it('returns null when both displayNames are blank strings', () => {
    expect(resolveParticipantDisplayName({ displayName: '', user: { displayName: '' } })).toBeNull();
    expect(
      resolveParticipantDisplayName({ displayName: '  ', user: { displayName: null } }),
    ).toBeNull();
  });

  it('returns null when neither displayName is present', () => {
    expect(
      resolveParticipantDisplayName({ displayName: null, user: { displayName: null } }),
    ).toBeNull();
  });

  it('returns null when the user relation is null', () => {
    expect(resolveParticipantDisplayName({ displayName: null, user: null })).toBeNull();
  });

  it('is null-safe for a null or undefined participant', () => {
    expect(resolveParticipantDisplayName(null)).toBeNull();
    expect(resolveParticipantDisplayName(undefined)).toBeNull();
  });
});
