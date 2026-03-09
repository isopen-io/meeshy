import { z } from 'zod'

export const ParticipantTypeEnum = z.enum(['user', 'anonymous', 'bot'])
export type ParticipantType = z.infer<typeof ParticipantTypeEnum>

export const ParticipantPermissionsSchema = z.object({
  canSendMessages: z.boolean(),
  canSendFiles: z.boolean(),
  canSendImages: z.boolean(),
  canSendVideos: z.boolean(),
  canSendAudios: z.boolean(),
  canSendLocations: z.boolean(),
  canSendLinks: z.boolean(),
})
export type ParticipantPermissions = z.infer<typeof ParticipantPermissionsSchema>

export const AnonymousSessionDetailsSchema = z.object({
  sessionTokenHash: z.string(),
  ipAddress: z.string().optional(),
  country: z.string().optional(),
  deviceFingerprint: z.string().optional(),
  connectedAt: z.coerce.date(),
})

export const AnonymousProfileSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  username: z.string(),
  email: z.string().optional(),
  birthday: z.coerce.date().optional(),
})
export type AnonymousProfile = z.infer<typeof AnonymousProfileSchema>

export const AnonymousRightsOverrideSchema = z.object({
  canSendMessages: z.boolean().optional(),
  canSendFiles: z.boolean().optional(),
  canSendImages: z.boolean().optional(),
  canSendVideos: z.boolean().optional(),
  canSendAudios: z.boolean().optional(),
  canSendLocations: z.boolean().optional(),
  canSendLinks: z.boolean().optional(),
})

export const AnonymousSessionSchema = z.object({
  shareLinkId: z.string(),
  session: AnonymousSessionDetailsSchema,
  profile: AnonymousProfileSchema,
  rights: AnonymousRightsOverrideSchema.optional(),
})
export type AnonymousSession = z.infer<typeof AnonymousSessionSchema>

const BaseParticipantSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  type: ParticipantTypeEnum,
  userId: z.string().optional(),
  displayName: z.string(),
  avatar: z.string().optional(),
  role: z.string().default('member'),
  language: z.string(),
  permissions: ParticipantPermissionsSchema,
  isActive: z.boolean(),
  isOnline: z.boolean(),
  joinedAt: z.coerce.date(),
  leftAt: z.coerce.date().optional(),
  bannedAt: z.coerce.date().optional(),
  nickname: z.string().optional(),
  lastActiveAt: z.coerce.date().optional(),
  sessionTokenHash: z.string().optional(),
  anonymousSession: AnonymousSessionSchema.optional(),
  user: z.any().optional(),
})

export const ParticipantSchema = BaseParticipantSchema.superRefine((data, ctx) => {
  if (data.type === 'anonymous' && !data.anonymousSession) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'anonymousSession is required for anonymous participants',
      path: ['anonymousSession'],
    })
  }
  if (data.type === 'user' && !data.userId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'userId is required for user participants',
      path: ['userId'],
    })
  }
})

export type Participant = z.infer<typeof BaseParticipantSchema>

export const DEFAULT_USER_PERMISSIONS: ParticipantPermissions = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
}

export const DEFAULT_ANONYMOUS_PERMISSIONS: ParticipantPermissions = {
  canSendMessages: true,
  canSendFiles: false,
  canSendImages: true,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
}
