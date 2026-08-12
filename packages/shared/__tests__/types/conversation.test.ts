import { describe, it, expect } from 'vitest';
import {
  isMemberAdmin,
  isMemberModerator,
  isMemberCreator,
  canParticipantSendMessage,
  canMemberSendMessage,
  type ConversationMember,
} from '../../types/conversation.js';
import type { Participant, ParticipantPermissions } from '../../types/participant.js';

const ALL_PERMS: ParticipantPermissions = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
};

const makeParticipant = (
  isActive: boolean,
  canSendMessages: boolean,
): Participant => ({
  id: 'p1',
  conversationId: 'c1',
  type: 'user',
  userId: 'u1',
  displayName: 'Alice',
  role: 'member',
  language: 'fr',
  permissions: { ...ALL_PERMS, canSendMessages },
  isActive,
  isOnline: true,
  joinedAt: new Date('2024-01-01'),
});

const makeMember = (
  isActive: boolean,
  canSendMessage: boolean,
): ConversationMember => ({
  id: 'm1',
  conversationId: 'c1',
  userId: 'u1',
  role: 'member',
  canSendMessage,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
  joinedAt: new Date('2024-01-01'),
  isActive,
});

describe('isMemberAdmin', () => {
  it('returns true for lowercase admin role', () => {
    expect(isMemberAdmin({ role: 'admin' })).toBe(true);
  });

  it('returns true for uppercase ADMIN (case-insensitive)', () => {
    expect(isMemberAdmin({ role: 'ADMIN' })).toBe(true);
  });

  it('returns false for moderator', () => {
    expect(isMemberAdmin({ role: 'moderator' })).toBe(false);
  });

  it('returns false for creator', () => {
    expect(isMemberAdmin({ role: 'creator' })).toBe(false);
  });

  it('returns false for member', () => {
    expect(isMemberAdmin({ role: 'member' })).toBe(false);
  });

  it('returns false for unknown role', () => {
    expect(isMemberAdmin({ role: 'guest' })).toBe(false);
  });
});

describe('isMemberModerator', () => {
  it('returns true for moderator role', () => {
    expect(isMemberModerator({ role: 'moderator' })).toBe(true);
  });

  it('returns true for admin (moderator or above)', () => {
    expect(isMemberModerator({ role: 'admin' })).toBe(true);
  });

  it('returns true for creator (highest member role)', () => {
    expect(isMemberModerator({ role: 'creator' })).toBe(true);
  });

  it('returns false for member role', () => {
    expect(isMemberModerator({ role: 'member' })).toBe(false);
  });

  it('returns false for unknown role (falls to 0 in hierarchy)', () => {
    expect(isMemberModerator({ role: 'guest' })).toBe(false);
  });
});

describe('isMemberCreator', () => {
  it('returns true for lowercase creator', () => {
    expect(isMemberCreator({ role: 'creator' })).toBe(true);
  });

  it('returns true for uppercase CREATOR (case-insensitive)', () => {
    expect(isMemberCreator({ role: 'CREATOR' })).toBe(true);
  });

  it('returns true for mixed-case Creator', () => {
    expect(isMemberCreator({ role: 'Creator' })).toBe(true);
  });

  it('returns false for admin', () => {
    expect(isMemberCreator({ role: 'admin' })).toBe(false);
  });

  it('returns false for moderator', () => {
    expect(isMemberCreator({ role: 'moderator' })).toBe(false);
  });

  it('returns false for member', () => {
    expect(isMemberCreator({ role: 'member' })).toBe(false);
  });
});

describe('canParticipantSendMessage', () => {
  it('returns true when participant is active and has canSendMessages', () => {
    expect(canParticipantSendMessage(makeParticipant(true, true))).toBe(true);
  });

  it('returns false when participant is not active (short-circuit)', () => {
    expect(canParticipantSendMessage(makeParticipant(false, true))).toBe(false);
  });

  it('returns false when participant lacks canSendMessages permission', () => {
    expect(canParticipantSendMessage(makeParticipant(true, false))).toBe(false);
  });

  it('returns false when both isActive and canSendMessages are false', () => {
    expect(canParticipantSendMessage(makeParticipant(false, false))).toBe(false);
  });
});

describe('canMemberSendMessage', () => {
  it('returns true when member is active and canSendMessage is true', () => {
    expect(canMemberSendMessage(makeMember(true, true))).toBe(true);
  });

  it('returns false when member is not active (short-circuit)', () => {
    expect(canMemberSendMessage(makeMember(false, true))).toBe(false);
  });

  it('returns false when member cannot send message', () => {
    expect(canMemberSendMessage(makeMember(true, false))).toBe(false);
  });

  it('returns false when both isActive and canSendMessage are false', () => {
    expect(canMemberSendMessage(makeMember(false, false))).toBe(false);
  });
});
