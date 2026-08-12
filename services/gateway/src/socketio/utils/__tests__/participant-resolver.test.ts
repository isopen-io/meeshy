import { resolveParticipant, resolveParticipantFromMessage } from '../participant-resolver';
import type { SocketUser, ConnectedUserResult } from '../socket-helpers';

jest.mock('../socket-helpers', () => ({
  getConnectedUser: jest.fn(),
}));

import { getConnectedUser } from '../socket-helpers';

const mockGetConnectedUser = getConnectedUser as jest.MockedFunction<typeof getConnectedUser>;

function makePrisma() {
  return {
    participant: { findFirst: jest.fn() },
    message: { findUnique: jest.fn() },
  } as any;
}

function makeConnectedUsers(): Map<string, SocketUser> {
  return new Map();
}

function makeUser(overrides: Partial<SocketUser> = {}): SocketUser {
  return {
    id: 'socket-id',
    socketId: 'socket-id',
    isAnonymous: false,
    language: 'fr',
    resolvedLanguages: ['fr'],
    ...overrides,
  };
}

function makeConnectedResult(overrides: Partial<SocketUser> = {}, realUserId = 'user-123'): ConnectedUserResult {
  return { user: makeUser(overrides), realUserId };
}

describe('resolveParticipant', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns null when user is not connected', async () => {
    mockGetConnectedUser.mockReturnValueOnce(null);

    const result = await resolveParticipant({
      prisma: makePrisma(),
      userIdOrToken: 'unknown-user',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toBeNull();
  });

  it('returns anonymous participant when active in the requested conversation', async () => {
    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ isAnonymous: true, participantId: 'part-123', displayName: 'Guest#42' }, 'anon-id')
    );

    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'part-123',
      displayName: 'Guest#42',
      nickname: null,
    });

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'anon-token',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toEqual({
      participantId: 'part-123',
      userId: 'anon-id',
      isAnonymous: true,
      displayName: 'Guest#42',
    });
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { id: 'part-123', conversationId: 'conv-1', isActive: true },
      select: { id: true, displayName: true, nickname: true },
    });
  });

  it('returns null when anonymous participant is not part of the requested conversation', async () => {
    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ isAnonymous: true, participantId: 'part-123', displayName: 'Guest#42' }, 'anon-id')
    );

    const prisma = makePrisma();
    // Anon is bound to conv-1 but requests conv-OTHER → no active row matches.
    prisma.participant.findFirst.mockResolvedValueOnce(null);

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'anon-token',
      conversationId: 'conv-OTHER',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toBeNull();
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { id: 'part-123', conversationId: 'conv-OTHER', isActive: true },
      select: { id: true, displayName: true, nickname: true },
    });
  });

  it('uses user.id as participantId when participantId is missing for anonymous user', async () => {
    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ id: 'anon-id', socketId: 'anon-id', isAnonymous: true, participantId: undefined, displayName: undefined }, 'anon-id')
    );

    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'anon-id',
      displayName: null,
      nickname: null,
    });

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'anon-token',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toEqual({
      participantId: 'anon-id',
      userId: 'anon-id',
      isAnonymous: true,
      displayName: 'Anonymous User',
    });
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { id: 'anon-id', conversationId: 'conv-1', isActive: true },
      select: { id: true, displayName: true, nickname: true },
    });
  });

  it('prefers the DB participant nickname over the in-memory display name for anonymous users', async () => {
    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ isAnonymous: true, participantId: 'part-123', displayName: 'stale-name' }, 'anon-id')
    );

    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'part-123',
      displayName: 'Fresh Display',
      nickname: 'FreshNick',
    });

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'anon-token',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result?.displayName).toBe('FreshNick');
  });

  it('returns null when registered user has no matching participant in conversation', async () => {
    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ userId: 'user-123' }, 'user-123')
    );

    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce(null);

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'user-123',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toBeNull();
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-123', conversationId: 'conv-1', isActive: true },
      select: { id: true, displayName: true, nickname: true },
    });
  });

  it('returns resolved participant for registered user with participant found', async () => {
    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ userId: 'user-123', displayName: 'Alice' }, 'user-123')
    );

    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'part-456',
      displayName: 'Alice Smith',
      nickname: 'AliceN',
    });

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'user-123',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toEqual({
      participantId: 'part-456',
      userId: 'user-123',
      isAnonymous: false,
      displayName: 'AliceN',
    });
  });

  it('falls back to user displayName when participant has no nickname or displayName', async () => {
    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ userId: 'user-123', displayName: 'Alice' }, 'user-123')
    );

    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'part-456',
      displayName: null,
      nickname: null,
    });

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'user-123',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result?.displayName).toBe('Alice');
  });

  it('falls back to Unknown User when all display names are missing', async () => {
    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ userId: 'user-123', displayName: undefined }, 'user-123')
    );

    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'part-456',
      displayName: null,
      nickname: null,
    });

    const result = await resolveParticipant({
      prisma,
      userIdOrToken: 'user-123',
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result?.displayName).toBe('Unknown User');
  });
});

describe('resolveParticipantFromMessage', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns null when message is not found', async () => {
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValueOnce(null);

    const result = await resolveParticipantFromMessage({
      prisma,
      userIdOrToken: 'user-123',
      messageId: 'msg-999',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toBeNull();
    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { id: 'msg-999' },
      select: { conversationId: true },
    });
  });

  it('delegates to resolveParticipant when message is found', async () => {
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValueOnce({ conversationId: 'conv-abc' });

    mockGetConnectedUser.mockReturnValueOnce(
      makeConnectedResult({ userId: 'user-123', displayName: 'Bob' }, 'user-123')
    );
    prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'part-789',
      displayName: 'Bob B',
      nickname: null,
    });

    const result = await resolveParticipantFromMessage({
      prisma,
      userIdOrToken: 'user-123',
      messageId: 'msg-1',
      connectedUsers: makeConnectedUsers(),
    });

    expect(result).toEqual({
      participantId: 'part-789',
      userId: 'user-123',
      isAnonymous: false,
      displayName: 'Bob B',
    });
  });
});
