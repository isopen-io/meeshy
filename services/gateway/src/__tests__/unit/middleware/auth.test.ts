import { describe, it, expect, beforeEach } from '@jest/globals'
import jwt from 'jsonwebtoken'
import { AuthMiddleware } from '../../../middleware/auth'
import { hashSessionToken } from '../../../utils/session-token'

const JWT_SECRET = 'test-secret-key'

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: overrides.userFindUnique ?? jest.fn().mockResolvedValue(null),
    },
    userSession: {
      findFirst: overrides.sessionFindFirst ?? jest.fn().mockResolvedValue(null),
      update: overrides.sessionUpdate ?? jest.fn().mockResolvedValue({}),
    },
    participant: {
      findFirst: overrides.participantFindFirst ?? jest.fn().mockResolvedValue(null),
    },
  } as unknown as ConstructorParameters<typeof AuthMiddleware>[0]
}

function createTestUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439011',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    avatar: null,
    role: 'USER',
    systemLanguage: 'en',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
    isOnline: true,
    lastActiveAt: new Date(),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function createTestParticipant(tokenHash: string, overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439022',
    conversationId: '507f1f77bcf86cd799439033',
    type: 'anonymous',
    displayName: 'AnonUser',
    avatar: null,
    role: 'member',
    language: 'es',
    permissions: {
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: true,
      canSendVideos: false,
      canSendAudios: false,
      canSendLocations: false,
      canSendLinks: false,
    },
    isActive: true,
    isOnline: false,
    lastActiveAt: new Date(),
    nickname: null,
    anonymousSession: {
      shareLinkId: '507f1f77bcf86cd799439044',
      session: {
        sessionTokenHash: tokenHash,
        connectedAt: new Date(),
      },
      profile: {
        firstName: 'Anon',
        lastName: 'User',
        username: 'anonuser',
      },
      rights: null,
    },
    ...overrides,
  }
}

function signJwt(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' })
}

describe('AuthMiddleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  describe('createAuthContext with no tokens', () => {
    it('returns unauthenticated context', async () => {
      const prisma = createMockPrisma()
      const middleware = new AuthMiddleware(prisma as never)

      const ctx = await middleware.createAuthContext()

      expect(ctx.type).toBe('anonymous')
      expect(ctx.isAuthenticated).toBe(false)
      expect(ctx.isAnonymous).toBe(true)
      expect(ctx.hasFullAccess).toBe(false)
      expect(ctx.canSendMessages).toBe(false)
      expect(ctx.displayName).toBe('Visiteur')
      expect(ctx.userId).toBe('anonymous')
    })
  })

  describe('createAuthContext with JWT', () => {
    it('returns user context for valid JWT', async () => {
      const user = createTestUser()
      const prisma = createMockPrisma({
        userFindUnique: jest.fn().mockResolvedValue(user),
      })
      const middleware = new AuthMiddleware(prisma as never)
      const token = signJwt(user.id)

      const ctx = await middleware.createAuthContext(`Bearer ${token}`)

      expect(ctx.type).toBe('user')
      expect(ctx.isAuthenticated).toBe(true)
      expect(ctx.isAnonymous).toBe(false)
      expect(ctx.hasFullAccess).toBe(true)
      expect(ctx.canSendMessages).toBe(true)
      expect(ctx.userId).toBe(user.id)
      expect(ctx.displayName).toBe('Test User')
      expect(ctx.userLanguage).toBe('fr')
      expect(ctx.jwtToken).toBe(token)
      expect(ctx.registeredUser).toBeDefined()
      expect(ctx.participantId).toBeUndefined()
    })

    it('uses customDestinationLanguage when available', async () => {
      const user = createTestUser({ customDestinationLanguage: 'de' })
      const prisma = createMockPrisma({
        userFindUnique: jest.fn().mockResolvedValue(user),
      })
      const middleware = new AuthMiddleware(prisma as never)
      const token = signJwt(user.id)

      const ctx = await middleware.createAuthContext(`Bearer ${token}`)

      expect(ctx.userLanguage).toBe('de')
    })

    it('throws for invalid JWT', async () => {
      const prisma = createMockPrisma()
      const middleware = new AuthMiddleware(prisma as never)

      await expect(
        middleware.createAuthContext('Bearer invalid.token.here')
      ).rejects.toThrow('Invalid JWT token')
    })

    it('throws when user not found', async () => {
      const prisma = createMockPrisma({
        userFindUnique: jest.fn().mockResolvedValue(null),
      })
      const middleware = new AuthMiddleware(prisma as never)
      const token = signJwt('507f1f77bcf86cd799439099')

      await expect(
        middleware.createAuthContext(`Bearer ${token}`)
      ).rejects.toThrow('Invalid JWT token')
    })

    it('throws when user is inactive', async () => {
      const user = createTestUser({ isActive: false })
      const prisma = createMockPrisma({
        userFindUnique: jest.fn().mockResolvedValue(user),
      })
      const middleware = new AuthMiddleware(prisma as never)
      const token = signJwt(user.id)

      await expect(
        middleware.createAuthContext(`Bearer ${token}`)
      ).rejects.toThrow('Invalid JWT token')
    })
  })

  describe('createAuthContext with session token', () => {
    it('returns anonymous context for valid session token', async () => {
      const rawToken = 'anon_123_abc_def'
      const tokenHash = hashSessionToken(rawToken)
      const participant = createTestParticipant(tokenHash)

      const prisma = createMockPrisma({
        participantFindFirst: jest.fn().mockResolvedValue(participant),
      })
      const middleware = new AuthMiddleware(prisma as never)

      const ctx = await middleware.createAuthContext(undefined, rawToken)

      expect(ctx.type).toBe('anonymous')
      expect(ctx.isAuthenticated).toBe(true)
      expect(ctx.isAnonymous).toBe(true)
      expect(ctx.hasFullAccess).toBe(false)
      expect(ctx.canSendMessages).toBe(true)
      expect(ctx.participantId).toBe(participant.id)
      expect(ctx.userId).toBe(participant.id)
      expect(ctx.userLanguage).toBe('es')
      expect(ctx.displayName).toBe('Anon User')
      expect(ctx.sessionToken).toBe(rawToken)
      expect(ctx.permissions).toBeDefined()
      expect(ctx.permissions!.canSendImages).toBe(true)
      expect(ctx.permissions!.canSendFiles).toBe(false)
      expect(ctx.anonymousUser).toBeDefined()
      expect(ctx.anonymousUser!.shareLinkId).toBe('507f1f77bcf86cd799439044')
    })

    it('looks up participant by sessionTokenHash', async () => {
      const rawToken = 'anon_test_token'
      const expectedHash = hashSessionToken(rawToken)
      const findFirst = jest.fn().mockResolvedValue(null)

      const prisma = createMockPrisma({ participantFindFirst: findFirst })
      const middleware = new AuthMiddleware(prisma as never)

      await expect(
        middleware.createAuthContext(undefined, rawToken)
      ).rejects.toThrow('Invalid session token')

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionTokenHash: expectedHash,
            type: 'anonymous',
            isActive: true,
          },
        })
      )
    })

    it('applies rights overrides from anonymousSession', async () => {
      const rawToken = 'anon_rights_test'
      const tokenHash = hashSessionToken(rawToken)
      const participant = createTestParticipant(tokenHash, {
        anonymousSession: {
          shareLinkId: '507f1f77bcf86cd799439044',
          session: { sessionTokenHash: tokenHash, connectedAt: new Date() },
          profile: { firstName: 'Rights', lastName: 'Test', username: 'rightstest' },
          rights: { canSendFiles: true, canSendVideos: true },
        },
      })

      const prisma = createMockPrisma({
        participantFindFirst: jest.fn().mockResolvedValue(participant),
      })
      const middleware = new AuthMiddleware(prisma as never)

      const ctx = await middleware.createAuthContext(undefined, rawToken)

      expect(ctx.permissions!.canSendFiles).toBe(true)
      expect(ctx.permissions!.canSendVideos).toBe(true)
      expect(ctx.permissions!.canSendMessages).toBe(true)
    })

    it('throws for unknown session token', async () => {
      const prisma = createMockPrisma({
        participantFindFirst: jest.fn().mockResolvedValue(null),
      })
      const middleware = new AuthMiddleware(prisma as never)

      await expect(
        middleware.createAuthContext(undefined, 'anon_unknown_token')
      ).rejects.toThrow('Invalid session token')
    })
  })

  describe('JWT takes priority over session token', () => {
    it('uses JWT path when both tokens provided', async () => {
      const user = createTestUser()
      const prisma = createMockPrisma({
        userFindUnique: jest.fn().mockResolvedValue(user),
      })
      const middleware = new AuthMiddleware(prisma as never)
      const token = signJwt(user.id)

      const ctx = await middleware.createAuthContext(`Bearer ${token}`, 'anon_session')

      expect(ctx.type).toBe('user')
      expect(ctx.isAuthenticated).toBe(true)
      expect(ctx.sessionToken).toBe('anon_session')
    })
  })
})
