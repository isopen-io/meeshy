/**
 * Unit tests for socketio/utils/participant-resolver.ts
 * Covers: resolveParticipant, resolveParticipantFromMessage
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  resolveParticipant,
  resolveParticipantFromMessage,
} from '../../../socketio/utils/participant-resolver';

jest.mock('../../../socketio/utils/socket-helpers', () => ({
  getConnectedUser: jest.fn(),
}));

import { getConnectedUser } from '../../../socketio/utils/socket-helpers';

function makePrisma(): any {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

function makeConnectedUsers(): Map<string, any> {
  return new Map();
}

const BASE_USER = {
  id: 'user-1',
  socketId: 'sock-1',
  isAnonymous: false,
  language: 'fr',
  resolvedLanguages: ['fr'],
  userId: 'user-1',
};

// ── resolveParticipant ─────────────────────────────────────────────────────

describe('resolveParticipant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when user not in connectedUsers', async () => {
    (getConnectedUser as jest.Mock).mockReturnValueOnce(null);

    const result = await resolveParticipant({
      prisma: makePrisma(),
      userIdOrToken: 'unknown',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toBeNull();
  });

  it('returns anonymous participant directly when user is anonymous', async () => {
    const anonUser = {
      ...BASE_USER,
      isAnonymous: true,
      participantId: 'part-anon',
      displayName: 'Anon User',
    };
    (getConnectedUser as jest.Mock).mockReturnValueOnce({ user: anonUser, realUserId: 'sess-token' });

    const prisma = makePrisma();
    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'sess-token',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).not.toBeNull();
    expect(result!.isAnonymous).toBe(true);
    expect(result!.participantId).toBe('part-anon');
    expect(result!.displayName).toBe('Anon User');
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
  });

  it('uses user.id as participantId when anonymous user has no participantId', async () => {
    const anonUser = { ...BASE_USER, isAnonymous: true, participantId: undefined };
    (getConnectedUser as jest.Mock).mockReturnValueOnce({ user: anonUser, realUserId: 'user-1' });

    const result = await resolveParticipant({
      prisma: makePrisma(),
      userIdOrToken: 'user-1',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result!.participantId).toBe('user-1');
  });

  it('returns null when registered user has no participant in conversation', async () => {
    (getConnectedUser as jest.Mock).mockReturnValueOnce({ user: BASE_USER, realUserId: 'user-1' });
    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce(null);

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'user-1',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toBeNull();
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', conversationId: 'conv-1', isActive: true },
      select: { id: true, displayName: true, nickname: true },
    });
  });

  it('returns full resolution for registered user with participant', async () => {
    (getConnectedUser as jest.Mock).mockReturnValueOnce({ user: BASE_USER, realUserId: 'user-1' });
    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'part-1',
      displayName: 'Alice',
      nickname: 'Ali',
    });

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'user-1',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).not.toBeNull();
    expect(result!.participantId).toBe('part-1');
    expect(result!.userId).toBe('user-1');
    expect(result!.isAnonymous).toBe(false);
    expect(result!.displayName).toBe('Ali');
  });

  it('falls back to user.userId for the DB query', async () => {
    const userWithUserId = { ...BASE_USER, userId: 'real-user-id' };
    (getConnectedUser as jest.Mock).mockReturnValueOnce({ user: userWithUserId, realUserId: 'sock-id' });
    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({ id: 'part-2', displayName: 'Bob', nickname: null });

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'sock-id',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'real-user-id' }) })
    );
    expect(result!.displayName).toBe('Bob');
  });
});

// ── resolveParticipantFromMessage ─────────────────────────────────────────

describe('resolveParticipantFromMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when message not found', async () => {
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValueOnce(null);

    const result = await resolveParticipantFromMessage({
      prisma,
      userIdOrToken: 'user-1',
      messageId: 'msg-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toBeNull();
  });

  it('delegates to resolveParticipant with the message conversationId', async () => {
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValueOnce({ conversationId: 'conv-from-msg' });

    // resolveParticipant will call getConnectedUser — make it return null for simplicity
    (getConnectedUser as jest.Mock).mockReturnValueOnce(null);

    const result = await resolveParticipantFromMessage({
      prisma,
      userIdOrToken: 'user-1',
      messageId: 'msg-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      select: { conversationId: true },
    });
    // null because getConnectedUser returned null in the delegated call
    expect(result).toBeNull();
  });

  it('returns full resolution when message and participant found', async () => {
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValueOnce({ conversationId: 'conv-99' });
    (getConnectedUser as jest.Mock).mockReturnValueOnce({ user: BASE_USER, realUserId: 'user-1' });
    prisma.participant.findFirst.mockResolvedValueOnce({ id: 'part-99', displayName: 'Carol', nickname: null });

    const result = await resolveParticipantFromMessage({
      prisma,
      userIdOrToken: 'user-1',
      messageId: 'msg-99',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).not.toBeNull();
    expect(result!.participantId).toBe('part-99');
  });
});
