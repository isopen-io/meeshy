import { describe, it, expect } from 'vitest'
import {
  ParticipantSchema,
  ParticipantTypeEnum,
  ParticipantPermissionsSchema,
  AnonymousSessionSchema,
  AnonymousSessionDetailsSchema,
  AnonymousProfileSchema,
  AnonymousRightsOverrideSchema,
  DEFAULT_USER_PERMISSIONS,
  DEFAULT_ANONYMOUS_PERMISSIONS,
} from '../../types/participant'

const validPermissions = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
}

const validAnonymousSession = {
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
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439012',
    type: 'user' as const,
    userId: '507f1f77bcf86cd799439013',
    displayName: 'John Doe',
    role: 'member',
    language: 'en',
    permissions: validPermissions,
    isActive: true,
    isOnline: false,
    joinedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ParticipantTypeEnum', () => {
  it('should accept valid types', () => {
    expect(ParticipantTypeEnum.parse('user')).toBe('user')
    expect(ParticipantTypeEnum.parse('anonymous')).toBe('anonymous')
    expect(ParticipantTypeEnum.parse('bot')).toBe('bot')
  })

  it('should reject invalid types', () => {
    expect(() => ParticipantTypeEnum.parse('admin')).toThrow()
    expect(() => ParticipantTypeEnum.parse('')).toThrow()
    expect(() => ParticipantTypeEnum.parse('USER')).toThrow()
    expect(() => ParticipantTypeEnum.parse(123)).toThrow()
    expect(() => ParticipantTypeEnum.parse(null)).toThrow()
  })
})

describe('ParticipantPermissionsSchema', () => {
  it('should accept all true permissions', () => {
    const result = ParticipantPermissionsSchema.parse(validPermissions)
    expect(result.canSendMessages).toBe(true)
    expect(result.canSendFiles).toBe(true)
    expect(result.canSendImages).toBe(true)
    expect(result.canSendVideos).toBe(true)
    expect(result.canSendAudios).toBe(true)
    expect(result.canSendLocations).toBe(true)
    expect(result.canSendLinks).toBe(true)
  })

  it('should accept all false permissions', () => {
    const allFalse = {
      canSendMessages: false,
      canSendFiles: false,
      canSendImages: false,
      canSendVideos: false,
      canSendAudios: false,
      canSendLocations: false,
      canSendLinks: false,
    }
    const result = ParticipantPermissionsSchema.parse(allFalse)
    expect(result.canSendMessages).toBe(false)
    expect(result.canSendLinks).toBe(false)
  })

  it('should accept mixed permissions', () => {
    const mixed = {
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: true,
      canSendVideos: false,
      canSendAudios: false,
      canSendLocations: false,
      canSendLinks: false,
    }
    const result = ParticipantPermissionsSchema.parse(mixed)
    expect(result.canSendMessages).toBe(true)
    expect(result.canSendFiles).toBe(false)
  })

  it('should reject missing fields', () => {
    expect(() => ParticipantPermissionsSchema.parse({ canSendMessages: true })).toThrow()
    expect(() => ParticipantPermissionsSchema.parse({})).toThrow()
  })

  it('should reject non-boolean values', () => {
    const invalid = { ...validPermissions, canSendMessages: 'yes' }
    expect(() => ParticipantPermissionsSchema.parse(invalid)).toThrow()
  })

  it('should strip extra fields', () => {
    const withExtra = { ...validPermissions, extraField: true }
    const result = ParticipantPermissionsSchema.parse(withExtra)
    expect((result as Record<string, unknown>)['extraField']).toBeUndefined()
  })

  it('should roundtrip all 7 fields correctly', () => {
    const result = ParticipantPermissionsSchema.parse(validPermissions)
    const keys = Object.keys(result)
    expect(keys).toHaveLength(7)
    expect(keys).toContain('canSendMessages')
    expect(keys).toContain('canSendFiles')
    expect(keys).toContain('canSendImages')
    expect(keys).toContain('canSendVideos')
    expect(keys).toContain('canSendAudios')
    expect(keys).toContain('canSendLocations')
    expect(keys).toContain('canSendLinks')
  })
})

describe('AnonymousSessionDetailsSchema', () => {
  it('should accept minimal valid session (tokenHash + connectedAt)', () => {
    const minimal = {
      sessionTokenHash: 'abc123',
      connectedAt: new Date().toISOString(),
    }
    const result = AnonymousSessionDetailsSchema.parse(minimal)
    expect(result.sessionTokenHash).toBe('abc123')
    expect(result.connectedAt).toBeInstanceOf(Date)
    expect(result.ipAddress).toBeUndefined()
    expect(result.country).toBeUndefined()
    expect(result.deviceFingerprint).toBeUndefined()
  })

  it('should accept full session with all optional fields', () => {
    const full = {
      sessionTokenHash: 'hash123',
      ipAddress: '10.0.0.1',
      country: 'FR',
      deviceFingerprint: 'fp-xyz',
      connectedAt: '2026-01-01T00:00:00.000Z',
    }
    const result = AnonymousSessionDetailsSchema.parse(full)
    expect(result.ipAddress).toBe('10.0.0.1')
    expect(result.country).toBe('FR')
    expect(result.deviceFingerprint).toBe('fp-xyz')
  })

  it('should reject missing sessionTokenHash', () => {
    expect(() =>
      AnonymousSessionDetailsSchema.parse({ connectedAt: new Date().toISOString() })
    ).toThrow()
  })

  it('should reject missing connectedAt', () => {
    expect(() =>
      AnonymousSessionDetailsSchema.parse({ sessionTokenHash: 'abc' })
    ).toThrow()
  })

  it('should coerce string dates to Date objects', () => {
    const result = AnonymousSessionDetailsSchema.parse({
      sessionTokenHash: 'test',
      connectedAt: '2026-06-15T12:00:00Z',
    })
    expect(result.connectedAt).toBeInstanceOf(Date)
    expect(result.connectedAt.toISOString()).toBe('2026-06-15T12:00:00.000Z')
  })
})

describe('AnonymousProfileSchema', () => {
  it('should accept minimal valid profile (firstName, lastName, username)', () => {
    const result = AnonymousProfileSchema.parse({
      firstName: 'Jean',
      lastName: 'Dupont',
      username: 'jdupont',
    })
    expect(result.firstName).toBe('Jean')
    expect(result.lastName).toBe('Dupont')
    expect(result.username).toBe('jdupont')
    expect(result.email).toBeUndefined()
    expect(result.birthday).toBeUndefined()
  })

  it('should accept full profile with email and birthday', () => {
    const result = AnonymousProfileSchema.parse({
      firstName: 'Jean',
      lastName: 'Dupont',
      username: 'jdupont',
      email: 'jean@example.com',
      birthday: '1990-05-20T00:00:00Z',
    })
    expect(result.email).toBe('jean@example.com')
    expect(result.birthday).toBeInstanceOf(Date)
  })

  it('should reject missing firstName', () => {
    expect(() =>
      AnonymousProfileSchema.parse({ lastName: 'D', username: 'u' })
    ).toThrow()
  })

  it('should reject missing lastName', () => {
    expect(() =>
      AnonymousProfileSchema.parse({ firstName: 'J', username: 'u' })
    ).toThrow()
  })

  it('should reject missing username', () => {
    expect(() =>
      AnonymousProfileSchema.parse({ firstName: 'J', lastName: 'D' })
    ).toThrow()
  })

  it('should coerce birthday string to Date', () => {
    const result = AnonymousProfileSchema.parse({
      firstName: 'A',
      lastName: 'B',
      username: 'ab',
      birthday: '2000-01-15',
    })
    expect(result.birthday).toBeInstanceOf(Date)
  })
})

describe('AnonymousRightsOverrideSchema', () => {
  it('should accept empty object (all fields optional)', () => {
    const result = AnonymousRightsOverrideSchema.parse({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('should accept partial overrides', () => {
    const result = AnonymousRightsOverrideSchema.parse({ canSendFiles: true, canSendVideos: true })
    expect(result.canSendFiles).toBe(true)
    expect(result.canSendVideos).toBe(true)
    expect(result.canSendMessages).toBeUndefined()
  })

  it('should accept all fields set', () => {
    const all = {
      canSendMessages: false,
      canSendFiles: true,
      canSendImages: false,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: false,
      canSendLinks: true,
    }
    const result = AnonymousRightsOverrideSchema.parse(all)
    expect(result.canSendLinks).toBe(true)
    expect(result.canSendMessages).toBe(false)
  })

  it('should reject non-boolean values', () => {
    expect(() => AnonymousRightsOverrideSchema.parse({ canSendMessages: 'true' })).toThrow()
  })
})

describe('AnonymousSessionSchema', () => {
  it('should accept a complete session with profile', () => {
    const result = AnonymousSessionSchema.parse(validAnonymousSession)
    expect(result.shareLinkId).toBe('507f1f77bcf86cd799439014')
    expect(result.profile.firstName).toBe('Guest')
    expect(result.session.sessionTokenHash).toBe('a'.repeat(64))
  })

  it('should accept session with rights override', () => {
    const withRights = {
      ...validAnonymousSession,
      rights: { canSendFiles: true, canSendVideos: true },
    }
    const result = AnonymousSessionSchema.parse(withRights)
    expect(result.rights?.canSendFiles).toBe(true)
    expect(result.rights?.canSendVideos).toBe(true)
  })

  it('should accept session without rights (rights is optional)', () => {
    const result = AnonymousSessionSchema.parse(validAnonymousSession)
    expect(result.rights).toBeUndefined()
  })

  it('should reject missing shareLinkId', () => {
    const { shareLinkId: _, ...noShareLink } = validAnonymousSession
    expect(() => AnonymousSessionSchema.parse(noShareLink)).toThrow()
  })

  it('should reject missing session', () => {
    const { session: _, ...noSession } = validAnonymousSession
    expect(() => AnonymousSessionSchema.parse(noSession)).toThrow()
  })

  it('should reject missing profile', () => {
    const { profile: _, ...noProfile } = validAnonymousSession
    expect(() => AnonymousSessionSchema.parse(noProfile)).toThrow()
  })
})

describe('ParticipantSchema', () => {
  it('should validate a registered user participant', () => {
    const result = ParticipantSchema.parse(makeParticipant())
    expect(result).toBeDefined()
    expect(result.type).toBe('user')
    expect(result.userId).toBe('507f1f77bcf86cd799439013')
  })

  it('should validate an anonymous participant with session', () => {
    const participant = makeParticipant({
      type: 'anonymous',
      userId: undefined,
      anonymousSession: validAnonymousSession,
    })
    const result = ParticipantSchema.parse(participant)
    expect(result.type).toBe('anonymous')
    expect(result.anonymousSession).toBeDefined()
  })

  it('should validate a bot participant without userId or anonymousSession', () => {
    const participant = makeParticipant({
      type: 'bot',
      userId: undefined,
    })
    const result = ParticipantSchema.parse(participant)
    expect(result.type).toBe('bot')
    expect(result.userId).toBeUndefined()
    expect(result.anonymousSession).toBeUndefined()
  })

  it('should reject participant without required fields', () => {
    expect(() => ParticipantSchema.parse({ id: '123' })).toThrow()
  })

  it('should reject anonymous participant without anonymousSession', () => {
    const participant = makeParticipant({
      type: 'anonymous',
      userId: undefined,
    })
    expect(() => ParticipantSchema.parse(participant)).toThrow()
  })

  it('should reject user participant without userId', () => {
    const participant = makeParticipant({ userId: undefined })
    expect(() => ParticipantSchema.parse(participant)).toThrow()
  })

  it('should default role to member when not provided', () => {
    const { role: _, ...noRole } = makeParticipant()
    const result = ParticipantSchema.parse(noRole)
    expect(result.role).toBe('member')
  })

  it('should accept custom role values', () => {
    const result = ParticipantSchema.parse(makeParticipant({ role: 'admin' }))
    expect(result.role).toBe('admin')
  })

  it('should accept optional leftAt field', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ leftAt: '2026-01-01T00:00:00Z' })
    )
    expect(result.leftAt).toBeInstanceOf(Date)
  })

  it('should accept optional bannedAt field', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ bannedAt: '2026-02-01T00:00:00Z' })
    )
    expect(result.bannedAt).toBeInstanceOf(Date)
  })

  it('should accept optional nickname field', () => {
    const result = ParticipantSchema.parse(makeParticipant({ nickname: 'JD' }))
    expect(result.nickname).toBe('JD')
  })

  it('should accept optional lastActiveAt field', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ lastActiveAt: '2026-03-01T12:00:00Z' })
    )
    expect(result.lastActiveAt).toBeInstanceOf(Date)
  })

  it('should accept optional avatar field', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ avatar: 'https://example.com/avatar.png' })
    )
    expect(result.avatar).toBe('https://example.com/avatar.png')
  })

  it('should accept optional sessionTokenHash field', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ sessionTokenHash: 'token-hash-value' })
    )
    expect(result.sessionTokenHash).toBe('token-hash-value')
  })

  it('should accept optional user field', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ user: { id: 'u1', name: 'Test' } })
    )
    expect(result.user).toBeDefined()
  })

  it('should coerce joinedAt string to Date', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ joinedAt: '2026-01-15T08:30:00Z' })
    )
    expect(result.joinedAt).toBeInstanceOf(Date)
    expect(result.joinedAt.toISOString()).toBe('2026-01-15T08:30:00.000Z')
  })

  it('should coerce leftAt string to Date', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ leftAt: '2026-06-01T00:00:00Z' })
    )
    expect(result.leftAt).toBeInstanceOf(Date)
  })

  it('should coerce bannedAt string to Date', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ bannedAt: '2026-07-01T00:00:00Z' })
    )
    expect(result.bannedAt).toBeInstanceOf(Date)
  })

  it('should coerce lastActiveAt string to Date', () => {
    const result = ParticipantSchema.parse(
      makeParticipant({ lastActiveAt: '2026-08-01T00:00:00Z' })
    )
    expect(result.lastActiveAt).toBeInstanceOf(Date)
  })

  it('should reject invalid type value', () => {
    expect(() => ParticipantSchema.parse(makeParticipant({ type: 'invalid' }))).toThrow()
  })

  it('should accept anonymous with admin rights override', () => {
    const participant = makeParticipant({
      type: 'anonymous',
      userId: undefined,
      anonymousSession: {
        ...validAnonymousSession,
        rights: { canSendFiles: true, canSendVideos: true },
      },
    })
    const result = ParticipantSchema.parse(participant)
    expect(result.anonymousSession?.rights?.canSendFiles).toBe(true)
  })

  it('should leave optional date fields undefined when not provided', () => {
    const result = ParticipantSchema.parse(makeParticipant())
    expect(result.leftAt).toBeUndefined()
    expect(result.bannedAt).toBeUndefined()
    expect(result.lastActiveAt).toBeUndefined()
  })

  it('should leave optional string fields undefined when not provided', () => {
    const result = ParticipantSchema.parse(makeParticipant())
    expect(result.nickname).toBeUndefined()
    expect(result.avatar).toBeUndefined()
    expect(result.sessionTokenHash).toBeUndefined()
  })
})

describe('DEFAULT_PERMISSIONS', () => {
  it('should give full permissions to users (all 7 true)', () => {
    expect(DEFAULT_USER_PERMISSIONS.canSendMessages).toBe(true)
    expect(DEFAULT_USER_PERMISSIONS.canSendFiles).toBe(true)
    expect(DEFAULT_USER_PERMISSIONS.canSendImages).toBe(true)
    expect(DEFAULT_USER_PERMISSIONS.canSendVideos).toBe(true)
    expect(DEFAULT_USER_PERMISSIONS.canSendAudios).toBe(true)
    expect(DEFAULT_USER_PERMISSIONS.canSendLocations).toBe(true)
    expect(DEFAULT_USER_PERMISSIONS.canSendLinks).toBe(true)
  })

  it('should give restricted permissions to anonymous (messages + images only)', () => {
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendMessages).toBe(true)
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendFiles).toBe(false)
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendImages).toBe(true)
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendVideos).toBe(false)
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendAudios).toBe(false)
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendLocations).toBe(false)
    expect(DEFAULT_ANONYMOUS_PERMISSIONS.canSendLinks).toBe(false)
  })

  it('should validate user permissions against ParticipantPermissionsSchema', () => {
    const result = ParticipantPermissionsSchema.parse(DEFAULT_USER_PERMISSIONS)
    expect(result).toEqual(DEFAULT_USER_PERMISSIONS)
  })

  it('should validate anonymous permissions against ParticipantPermissionsSchema', () => {
    const result = ParticipantPermissionsSchema.parse(DEFAULT_ANONYMOUS_PERMISSIONS)
    expect(result).toEqual(DEFAULT_ANONYMOUS_PERMISSIONS)
  })
})
