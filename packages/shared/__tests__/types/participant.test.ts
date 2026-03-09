import { describe, it, expect } from 'vitest'
import { ParticipantSchema, ParticipantTypeEnum, ParticipantPermissionsSchema, AnonymousSessionSchema, DEFAULT_USER_PERMISSIONS, DEFAULT_ANONYMOUS_PERMISSIONS } from '../../types/participant'

describe('ParticipantSchema', () => {
  it('should validate a registered user participant', () => {
    const participant = {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      type: 'user' as const,
      userId: '507f1f77bcf86cd799439013',
      displayName: 'John Doe',
      role: 'member',
      language: 'en',
      permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canSendVideos: true, canSendAudios: true, canSendLocations: true, canSendLinks: true },
      isActive: true,
      isOnline: false,
      joinedAt: new Date().toISOString(),
    }
    expect(ParticipantSchema.parse(participant)).toBeDefined()
  })

  it('should validate an anonymous participant with session', () => {
    const participant = {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      type: 'anonymous' as const,
      displayName: 'Guest User',
      role: 'member',
      language: 'fr',
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: true, canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false },
      isActive: true,
      isOnline: true,
      joinedAt: new Date().toISOString(),
      anonymousSession: {
        shareLinkId: '507f1f77bcf86cd799439014',
        session: {
          sessionTokenHash: 'a'.repeat(64),
          ipAddress: '192.168.1.1',
          connectedAt: new Date().toISOString(),
        },
        profile: {
          firstName: 'Guest',
          lastName: 'User',
          username: 'guest_user',
        },
      },
    }
    expect(ParticipantSchema.parse(participant)).toBeDefined()
  })

  it('should reject participant without required fields', () => {
    expect(() => ParticipantSchema.parse({ id: '123' })).toThrow()
  })

  it('should reject anonymous participant without anonymousSession', () => {
    const participant = {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      type: 'anonymous' as const,
      displayName: 'Guest',
      role: 'member',
      language: 'fr',
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false, canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false },
      isActive: true,
      isOnline: false,
      joinedAt: new Date().toISOString(),
    }
    expect(() => ParticipantSchema.parse(participant)).toThrow()
  })

  it('should reject user participant without userId', () => {
    const participant = {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      type: 'user' as const,
      displayName: 'John',
      role: 'member',
      language: 'en',
      permissions: DEFAULT_USER_PERMISSIONS,
      isActive: true,
      isOnline: false,
      joinedAt: new Date().toISOString(),
    }
    expect(() => ParticipantSchema.parse(participant)).toThrow()
  })

  it('should validate anonymous with admin rights override', () => {
    const participant = {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      type: 'anonymous' as const,
      displayName: 'Guest',
      role: 'member',
      language: 'fr',
      permissions: DEFAULT_ANONYMOUS_PERMISSIONS,
      isActive: true,
      isOnline: false,
      joinedAt: new Date().toISOString(),
      anonymousSession: {
        shareLinkId: '507f1f77bcf86cd799439014',
        session: {
          sessionTokenHash: 'b'.repeat(64),
          connectedAt: new Date().toISOString(),
        },
        profile: { firstName: 'A', lastName: 'B', username: 'ab' },
        rights: { canSendFiles: true, canSendVideos: true },
      },
    }
    const result = ParticipantSchema.parse(participant)
    expect(result).toBeDefined()
  })
})

describe('ParticipantTypeEnum', () => {
  it('should accept valid types', () => {
    expect(ParticipantTypeEnum.parse('user')).toBe('user')
    expect(ParticipantTypeEnum.parse('anonymous')).toBe('anonymous')
    expect(ParticipantTypeEnum.parse('bot')).toBe('bot')
  })

  it('should reject invalid types', () => {
    expect(() => ParticipantTypeEnum.parse('admin')).toThrow()
  })
})

describe('DEFAULT_PERMISSIONS', () => {
  it('should give full permissions to users', () => {
    expect(DEFAULT_USER_PERMISSIONS.canSendMessages).toBe(true)
    expect(DEFAULT_USER_PERMISSIONS.canSendFiles).toBe(true)
    expect(DEFAULT_USER_PERMISSIONS.canSendVideos).toBe(true)
  })

  it('should give limited permissions to anonymous', () => {
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendMessages).toBe(true)
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendFiles).toBe(false)
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendVideos).toBe(false)
  })
})
