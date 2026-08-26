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
  /**
   * Voit les messages écrits AVANT son arrivée.
   *
   * Facultatif ici, et pas par confort : le champ a été ajouté après coup, donc
   * toute participation créée avant lui l'a ABSENT. Le rendre requis ferait
   * échouer la validation de la population existante. L'absence signifie « non
   * figé » — les lecteurs retombent sur le lien en direct.
   *
   * @see schema.prisma → ParticipantPermissions.canViewHistory
   */
  canViewHistory: z.boolean().optional(),
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

/**
 * Le delta qu'un hôte pose sur UN participant, par-dessus l'instantané du join.
 *
 * Chaque champ est un TROISIÈME état : `true` accorde, `false` retire, absent ne
 * dit rien et laisse la valeur du join s'appliquer.
 */
export const AnonymousRightsOverrideSchema = z.object({
  canSendMessages: z.boolean().optional(),
  canSendFiles: z.boolean().optional(),
  canSendImages: z.boolean().optional(),
  canSendVideos: z.boolean().optional(),
  canSendAudios: z.boolean().optional(),
  canSendLocations: z.boolean().optional(),
  canSendLinks: z.boolean().optional(),
  canViewHistory: z.boolean().optional(),
})
export type AnonymousRightsOverride = z.infer<typeof AnonymousRightsOverrideSchema>

/**
 * Ce qu'un visiteur entré par lien a le droit de faire — premier cercle de la
 * fiche de participant, visible de tout membre.
 *
 * C'est la résolution EFFECTIVE (`anonymousSession.rights ?? permissions`), pas
 * la configuration courante du lien : celle-ci a pu changer depuis l'arrivée, et
 * ne régit plus qui est déjà entré.
 *
 * @see services/gateway/src/services/participantRights.ts
 */
export const ParticipantEntryCapabilitiesSchema = ParticipantPermissionsSchema.extend({
  canViewHistory: z.boolean(),
})
export type ParticipantEntryCapabilities = z.infer<typeof ParticipantEntryCapabilitiesSchema>

/**
 * Les réglages du lien emprunté — second cercle, réservé aux administrateurs et
 * modérateurs de la conversation.
 *
 * Même raison que pour l'email : la salle contient d'autres visiteurs venus par
 * ce même lien, et sa configuration est celle de l'hôte, pas un renseignement sur
 * la personne. `allowedIpRanges` n'y figure volontairement pas — une règle de
 * pare-feu n'a aucune surface d'affichage.
 *
 * @see schema.prisma → ConversationShareLink
 */
export const ParticipantEntryLinkSchema = z.object({
  name: z.string().nullable(),
  isActive: z.boolean(),
  expiresAt: z.coerce.date().nullable(),
  maxUses: z.number().nullable(),
  currentUses: z.number(),
  requireNickname: z.boolean(),
  requireEmail: z.boolean(),
  requireBirthday: z.boolean(),
  allowedCountries: z.array(z.string()),
  allowedLanguages: z.array(z.string()),
})
export type ParticipantEntryLink = z.infer<typeof ParticipantEntryLinkSchema>

export const AnonymousSessionSchema = z.object({
  shareLinkId: z.string(),
  session: AnonymousSessionDetailsSchema,
  profile: AnonymousProfileSchema,
  rights: AnonymousRightsOverrideSchema.optional(),
})
export type AnonymousSession = z.infer<typeof AnonymousSessionSchema>

export const ParticipantUserSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().optional(),
  isOnline: z.boolean().optional(),
  lastActiveAt: z.coerce.date().optional(),
  systemLanguage: z.string().optional(),
  role: z.string().optional(),
})
export type ParticipantUser = z.infer<typeof ParticipantUserSchema>

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
  /**
   * Octroi d'historique par DATE posé par un administrateur de la conversation.
   * Facultatif : ajouté après coup, absent sur toute participation antérieure.
   * @see schema.prisma → Participant.historyVisibleFrom
   */
  historyVisibleFrom: z.coerce.date().nullable().optional(),
  nickname: z.string().optional(),
  lastActiveAt: z.coerce.date().optional(),
  sessionTokenHash: z.string().optional(),
  anonymousSession: AnonymousSessionSchema.optional(),
  user: ParticipantUserSchema.optional(),
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
