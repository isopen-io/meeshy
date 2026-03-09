import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { canAccessConversation } from '../../../routes/conversations/utils/access-control';

const VALID_CONVERSATION_ID = '507f1f77bcf86cd799439011';
const VALID_USER_ID = '507f1f77bcf86cd799439022';
const VALID_PARTICIPANT_ID = '507f1f77bcf86cd799439033';

function createMockPrisma() {
  return {
    participant: {
      findFirst: jest.fn<any>(),
    },
    conversation: {
      findFirst: jest.fn<any>(),
    },
  } as any;
}

function createAuthContext(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isAnonymous: false,
    userId: VALID_USER_ID,
    participantId: undefined,
    ...overrides,
  };
}

describe('canAccessConversation', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  describe('unauthenticated users', () => {
    it('should return false when not authenticated', async () => {
      const auth = createAuthContext({ isAuthenticated: false });
      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'some-id');
      expect(result).toBe(false);
    });

    it('should not query the database when not authenticated', async () => {
      const auth = createAuthContext({ isAuthenticated: false });
      await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'some-id');
      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('global "meeshy" conversation', () => {
    it('should deny anonymous users when identifier is "meeshy"', async () => {
      const auth = createAuthContext({ isAnonymous: true });
      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'meeshy');
      expect(result).toBe(false);
    });

    it('should deny anonymous users when conversationId is "meeshy"', async () => {
      const auth = createAuthContext({ isAnonymous: true });
      const result = await canAccessConversation(mockPrisma, auth, 'meeshy', 'other');
      expect(result).toBe(false);
    });

    it('should allow registered users who are active participants (identifier match)', async () => {
      const auth = createAuthContext();
      mockPrisma.participant.findFirst.mockResolvedValue({ id: VALID_PARTICIPANT_ID, isActive: true });

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'meeshy');

      expect(result).toBe(true);
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: {
          conversationId: VALID_CONVERSATION_ID,
          userId: VALID_USER_ID,
          isActive: true,
        },
      });
    });

    it('should allow registered users who are active participants (conversationId match)', async () => {
      const auth = createAuthContext();
      mockPrisma.participant.findFirst.mockResolvedValue({ id: VALID_PARTICIPANT_ID });

      const result = await canAccessConversation(mockPrisma, auth, 'meeshy', 'other');
      expect(result).toBe(true);
    });

    it('should deny registered users who are not participants of meeshy', async () => {
      const auth = createAuthContext();
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'meeshy');
      expect(result).toBe(false);
    });
  });

  describe('participantId-based access', () => {
    it('should allow access when participant is active and not banned', async () => {
      const auth = createAuthContext({ participantId: VALID_PARTICIPANT_ID });
      mockPrisma.participant.findFirst.mockResolvedValue({ id: VALID_PARTICIPANT_ID, isActive: true, bannedAt: null });

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'some-id');

      expect(result).toBe(true);
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: {
          id: VALID_PARTICIPANT_ID,
          conversationId: VALID_CONVERSATION_ID,
          isActive: true,
          bannedAt: null,
        },
      });
    });

    it('should deny access when participant not found', async () => {
      const auth = createAuthContext({ participantId: VALID_PARTICIPANT_ID });
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'some-id');
      expect(result).toBe(false);
    });

    it('should deny access when participant is banned', async () => {
      const auth = createAuthContext({ participantId: VALID_PARTICIPANT_ID });
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'some-id');
      expect(result).toBe(false);
    });

    it('should deny access when participant is inactive', async () => {
      const auth = createAuthContext({ participantId: VALID_PARTICIPANT_ID });
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'some-id');
      expect(result).toBe(false);
    });

    it('should take priority over userId-based lookup', async () => {
      const auth = createAuthContext({ participantId: VALID_PARTICIPANT_ID, userId: VALID_USER_ID });
      mockPrisma.participant.findFirst.mockResolvedValue({ id: VALID_PARTICIPANT_ID });

      await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'some-id');

      expect(mockPrisma.participant.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: VALID_PARTICIPANT_ID }),
        })
      );
    });
  });

  describe('userId fallback for registered users', () => {
    it('should allow access when user is active participant', async () => {
      const auth = createAuthContext({ participantId: undefined });
      mockPrisma.participant.findFirst.mockResolvedValue({ id: VALID_PARTICIPANT_ID });

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'regular-id');

      expect(result).toBe(true);
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: {
          conversationId: VALID_CONVERSATION_ID,
          userId: VALID_USER_ID,
          isActive: true,
        },
      });
    });

    it('should deny access when user is not a participant', async () => {
      const auth = createAuthContext({ participantId: undefined });
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'regular-id');
      expect(result).toBe(false);
    });

    it('should deny access for anonymous users without participantId', async () => {
      const auth = createAuthContext({ isAnonymous: true, participantId: undefined, userId: undefined });
      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'regular-id');
      expect(result).toBe(false);
    });

    it('should deny access when userId is undefined for non-anonymous user', async () => {
      const auth = createAuthContext({ participantId: undefined, userId: undefined });
      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'regular-id');
      expect(result).toBe(false);
    });
  });

  describe('mshy_ prefixed identifiers', () => {
    const MSHY_IDENTIFIER = 'mshy_abc123';

    it('should look up conversation first, then check participant by conversation.id', async () => {
      const auth = createAuthContext({ participantId: undefined });
      const mockConversation = { id: VALID_CONVERSATION_ID, identifier: MSHY_IDENTIFIER };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockPrisma.participant.findFirst.mockResolvedValue({ id: VALID_PARTICIPANT_ID });

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, MSHY_IDENTIFIER);

      expect(result).toBe(true);
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { id: VALID_CONVERSATION_ID },
            { identifier: MSHY_IDENTIFIER },
          ],
        },
      });
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: {
          conversationId: VALID_CONVERSATION_ID,
          userId: VALID_USER_ID,
          isActive: true,
        },
      });
    });

    it('should deny access when mshy_ conversation not found', async () => {
      const auth = createAuthContext({ participantId: undefined });
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, MSHY_IDENTIFIER);

      expect(result).toBe(false);
      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    });

    it('should deny access when user is not participant of mshy_ conversation', async () => {
      const auth = createAuthContext({ participantId: undefined });
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: VALID_CONVERSATION_ID });
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, MSHY_IDENTIFIER);
      expect(result).toBe(false);
    });

    it('should not use mshy_ path for anonymous users', async () => {
      const auth = createAuthContext({ isAnonymous: true, participantId: undefined, userId: undefined });

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, MSHY_IDENTIFIER);

      expect(result).toBe(false);
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
    });

    it('should bypass mshy_ path when participantId is present', async () => {
      const auth = createAuthContext({ participantId: VALID_PARTICIPANT_ID });
      mockPrisma.participant.findFirst.mockResolvedValue({ id: VALID_PARTICIPANT_ID });

      await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, MSHY_IDENTIFIER);

      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: VALID_PARTICIPANT_ID }),
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should return false when all auth fields are empty/undefined', async () => {
      const auth = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: undefined,
        participantId: undefined,
      };

      const result = await canAccessConversation(mockPrisma, auth, VALID_CONVERSATION_ID, 'some-id');
      expect(result).toBe(false);
    });

    it('should handle both conversationId and identifier being "meeshy"', async () => {
      const auth = createAuthContext({ isAnonymous: true });
      const result = await canAccessConversation(mockPrisma, auth, 'meeshy', 'meeshy');
      expect(result).toBe(false);
    });
  });
});
