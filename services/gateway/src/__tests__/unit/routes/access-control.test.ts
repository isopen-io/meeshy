import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { canAccessConversation, resolveCallerParticipant } from '../../../routes/conversations/utils/access-control';
import { findFirstIn, type MongoDocument } from '../../helpers/mongo-where';

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

  /**
   * Le filtre de bannissement, jugé sur des DOCUMENTS et non sur la forme de la
   * clause.
   *
   * Aucun des neuf créateurs de `Participant` n'écrit `bannedAt` : la colonne est
   * ABSENTE du document de tout participant jamais banni. Un double qui rend ce
   * qu'on lui dit de rendre ne peut pas voir qu'un filtre `{ bannedAt: null }`
   * n'apparie alors RIEN — d'où ce bloc, qui applique la clause à des lignes.
   *
   * Les trois états réels de la colonne :
   *  - absente        → l'immense majorité : rejoint par lien, invité, ajouté…
   *  - `null` écrit   → seul `resolveUnbanWrite` en produit (un débanni)
   *  - date           → banni ; `resolveBanWrite` écrit aussi `isActive: false`,
   *                     SAUF si une restauration de compte a rallumé `isActive`
   *                     (`routes/me/delete-account.ts` écrit `isActive: true`
   *                     sans regarder `bannedAt`) — c'est ce cas qui rend le
   *                     filtre porteur, et pas seulement redondant.
   */
  describe('participantId-based access — jugé sur des documents Mongo', () => {
    const participantRow = (overrides: MongoDocument = {}): MongoDocument => ({
      id: VALID_PARTICIPANT_ID,
      conversationId: VALID_CONVERSATION_ID,
      type: 'anonymous',
      isActive: true,
      ...overrides,
    });

    const prismaOver = (rows: readonly MongoDocument[]) =>
      ({ participant: { findFirst: findFirstIn(rows) }, conversation: { findFirst: jest.fn<any>() } }) as any;

    it('admet un participant anonyme fraîchement joint, dont la colonne bannedAt est ABSENTE', async () => {
      const auth = createAuthContext({ isAnonymous: true, participantId: VALID_PARTICIPANT_ID });

      const result = await canAccessConversation(
        prismaOver([participantRow()]),
        auth,
        VALID_CONVERSATION_ID,
        'some-id'
      );

      expect(result).toBe(true);
    });

    it('admet un participant débanni, dont la colonne bannedAt vaut null', async () => {
      const auth = createAuthContext({ isAnonymous: true, participantId: VALID_PARTICIPANT_ID });

      const result = await canAccessConversation(
        prismaOver([participantRow({ bannedAt: null })]),
        auth,
        VALID_CONVERSATION_ID,
        'some-id'
      );

      expect(result).toBe(true);
    });

    it('refuse un participant banni resté actif — la garde reste porteuse', async () => {
      const auth = createAuthContext({ isAnonymous: true, participantId: VALID_PARTICIPANT_ID });

      const result = await canAccessConversation(
        prismaOver([participantRow({ bannedAt: new Date('2026-01-01T00:00:00Z') })]),
        auth,
        VALID_CONVERSATION_ID,
        'some-id'
      );

      expect(result).toBe(false);
    });

    it('refuse un participant inactif dont la colonne bannedAt est absente', async () => {
      const auth = createAuthContext({ isAnonymous: true, participantId: VALID_PARTICIPANT_ID });

      const result = await canAccessConversation(
        prismaOver([participantRow({ isActive: false })]),
        auth,
        VALID_CONVERSATION_ID,
        'some-id'
      );

      expect(result).toBe(false);
    });

    it("refuse une ligne d'une AUTRE conversation", async () => {
      const auth = createAuthContext({ isAnonymous: true, participantId: VALID_PARTICIPANT_ID });

      const result = await canAccessConversation(
        prismaOver([participantRow({ conversationId: '507f1f77bcf86cd7994390ff' })]),
        auth,
        VALID_CONVERSATION_ID,
        'some-id'
      );

      expect(result).toBe(false);
    });
  });

  describe('participantId-based access', () => {
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

describe('resolveCallerParticipant', () => {
  const ROWS: MongoDocument[] = [
    { id: VALID_PARTICIPANT_ID, userId: null, conversationId: VALID_CONVERSATION_ID, isActive: true },
    { id: 'participant-of-the-account', userId: VALID_USER_ID, conversationId: VALID_CONVERSATION_ID, isActive: true },
    { id: 'participant-qui-est-parti', userId: 'user-parti', conversationId: VALID_CONVERSATION_ID, isActive: false },
    { id: 'participant-banni', userId: null, conversationId: VALID_CONVERSATION_ID, isActive: true, bannedAt: new Date('2026-01-01') },
  ];

  function prismaOverRows() {
    return { participant: { findFirst: jest.fn<any>(findFirstIn(ROWS)) } } as any;
  }

  it('résout un participant SANS COMPTE par son Participant.id', async () => {
    const prisma = prismaOverRows();
    const auth = { participantId: VALID_PARTICIPANT_ID, userId: VALID_PARTICIPANT_ID };

    await expect(resolveCallerParticipant(prisma, auth, VALID_CONVERSATION_ID))
      .resolves.toEqual(expect.objectContaining({ id: VALID_PARTICIPANT_ID }));
  });

  it('ne compare JAMAIS un Participant.id à la colonne userId', async () => {
    // Le piège au complet : `authContext.userId` VAUT le `Participant.id` pour un
    // anonyme (middleware/auth.ts). Une garde qui filtre `userId` avec cette
    // valeur n'apparie rien — c'est le 403 que payait tout invité de lien partagé.
    const prisma = prismaOverRows();
    const auth = { participantId: VALID_PARTICIPANT_ID, userId: VALID_PARTICIPANT_ID };

    await resolveCallerParticipant(prisma, auth, VALID_CONVERSATION_ID);

    const where = prisma.participant.findFirst.mock.calls[0][0].where;
    expect(where.userId).toBeUndefined();
    expect(where.id).toBe(VALID_PARTICIPANT_ID);
  });

  it('résout un utilisateur enregistré par sa colonne userId', async () => {
    const prisma = prismaOverRows();
    const auth = { userId: VALID_USER_ID };

    await expect(resolveCallerParticipant(prisma, auth, VALID_CONVERSATION_ID))
      .resolves.toEqual(expect.objectContaining({ id: 'participant-of-the-account' }));
  });

  it('refuse un participant banni, dont la colonne bannedAt est renseignée', async () => {
    const prisma = prismaOverRows();
    const auth = { participantId: 'participant-banni', userId: 'participant-banni' };

    await expect(resolveCallerParticipant(prisma, auth, VALID_CONVERSATION_ID)).resolves.toBeNull();
  });

  it('refuse une appartenance inactive', async () => {
    const prisma = prismaOverRows();
    const auth = { userId: 'user-parti' };

    await expect(resolveCallerParticipant(prisma, auth, VALID_CONVERSATION_ID)).resolves.toBeNull();
  });

  it('refuse un contexte sans aucune des deux identités, sans toucher la base', async () => {
    const prisma = prismaOverRows();

    await expect(resolveCallerParticipant(prisma, {}, VALID_CONVERSATION_ID)).resolves.toBeNull();
    await expect(resolveCallerParticipant(prisma, undefined, VALID_CONVERSATION_ID)).resolves.toBeNull();
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
  });
});
