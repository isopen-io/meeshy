import { z } from 'zod';
import { CommonSchemas } from './validation-common.js';
import { userRoleEnum, UserSchemas } from './validation-user.js';
import { encryptionModeEnum, MessageSchemas } from './validation-message.js';

/**
 * Schémas de conversation, d’appel et de participant anonyme.
 * Extrait de `validation.ts` (#19037), qui le ré-exporte.
 */

// =============================================================================
// CONVERSATION SCHEMAS
// =============================================================================

/**
 * Types de conversation
 */
export const conversationTypeEnum = z.enum(['direct', 'group', 'public', 'global', 'broadcast']);

/**
 * Statut de conversation
 */
const conversationStatusEnum = z.enum(['active', 'archived', 'deleted']);

/**
 * Visibilité de conversation
 */
const conversationVisibilityEnum = z.enum(['public', 'private', 'restricted']);

/**
 * Type de lien de conversation
 */
const conversationLinkTypeEnum = z.enum(['invite', 'share', 'embed']);

/**
 * Schémas pour les routes de conversations
 */
export const ConversationSchemas = {
  // Créer une conversation
  create: z.object({
    type: CommonSchemas.conversationType,
    title: CommonSchemas.conversationTitle.optional(),
    description: CommonSchemas.description,
    // Audit 2026-05-11 §H-Claim-3 — cap participantIds at 250.
    // Without an upper bound, the gateway's CONVERSATION_NEW emission loop
    // becomes a synchronous fanout amplifier (one io.to(...).emit() per
    // participant inside a Fastify request handler). 250 is generous for
    // any realistic group/public conversation creation flow; bulk-add
    // beyond that should go through a separate paged participant-add
    // endpoint that can yield to the event loop between batches.
    participantIds: z.array(z.string()).max(250, { message: 'Au maximum 250 participants à la création — utiliser l\'ajout incrémental au-delà' }).optional().default([]),
    communityId: z.string().optional(),
    identifier: CommonSchemas.conversationIdentifier,
    // #12966 — un tête-à-tête que le serveur lit, à côté d'un tête-à-tête
    // chiffré de bout en bout avec la même personne. Absent : la demande d'un
    // ancien client, inchangée.
    plaintext: z.boolean().optional(),
    // Directive porteur du 2026-11-01 — le mode se choisit à la création ;
    // absent : `server`, le serveur chiffre toujours au repos.
    encryptionMode: z.enum(['server', 'hybrid', 'e2ee']).optional(),
  }),
  
  // Mettre à jour une conversation
  update: z.object({
    title: CommonSchemas.conversationTitle.optional(),
    description: CommonSchemas.description,
    type: CommonSchemas.conversationType.optional(),
    avatar: z.string().nullable().optional(),
    banner: z.string().nullable().optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit être fourni pour la mise à jour',
  }),
  
  // Envoyer un message
  sendMessage: z.object({
    content: CommonSchemas.messageContent,
    originalLanguage: CommonSchemas.language.optional().default('fr'),
    messageType: CommonSchemas.messageType.optional().default('text'),
    replyToId: z.string().optional(),
  }),
  
  // Éditer un message
  editMessage: z.object({
    content: CommonSchemas.messageContent,
    originalLanguage: CommonSchemas.language.optional(),
  }),
  
  // Ajouter un participant
  addParticipant: z.object({
    userId: z.string().min(1, 'userId requis'),
  }),
  
  // Recherche
  search: z.object({
    q: z.string().min(1, 'Terme de recherche requis'),
  }),
  
  // Filtres participants
  participantsFilters: z.object({
    onlineOnly: z.string().optional(),
    role: z.string().optional(),
    search: z.string().optional(),
    limit: z.string().optional().transform((val) => parseInt(val || '50', 10)),
  }),

  // ===== SCHEMAS COMPLETS POUR RÉPONSES API =====

  // Permissions d'un participant
  participantPermissions: z.object({
    canInvite: z.boolean(),
    canRemove: z.boolean(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    canModerate: z.boolean(),
  }),

  // Participant de conversation
  participant: z.object({
    userId: z.string(),
    role: userRoleEnum,
    joinedAt: z.iso.datetime(),
    isActive: z.boolean(),
    permissions: z.object({
      canInvite: z.boolean(),
      canRemove: z.boolean(),
      canEdit: z.boolean(),
      canDelete: z.boolean(),
      canModerate: z.boolean(),
    }).nullable().optional(),
  }),

  // Paramètres de conversation
  settings: z.object({
    allowAnonymous: z.boolean(),
    requireApproval: z.boolean(),
    maxParticipants: z.number().nullable().optional(),
    autoArchive: z.boolean().nullable().optional(),
    translationEnabled: z.boolean(),
    defaultLanguage: z.string().nullable().optional(),
    allowedLanguages: z.array(z.string()).nullable().optional(),
  }),

  // Lien de partage
  link: z.object({
    id: z.string(),
    type: conversationLinkTypeEnum,
    url: z.string(),
    expiresAt: z.iso.datetime().nullable().optional(),
    maxUses: z.number().nullable().optional(),
    currentUses: z.number(),
    isActive: z.boolean(),
    createdBy: z.string(),
    createdAt: z.iso.datetime(),
    allowAnonymousMessages: z.boolean().nullable().optional(),
    allowAnonymousFiles: z.boolean().nullable().optional(),
    allowViewHistory: z.boolean().nullable().optional(),
    requireNickname: z.boolean().nullable().optional(),
    requireEmail: z.boolean().nullable().optional(),
  }),

  // Statistiques de conversation
  stats: z.object({
    totalMessages: z.number(),
    totalParticipants: z.number(),
    activeParticipants: z.number(),
    messagesLast24h: z.number(),
    messagesLast7days: z.number(),
    averageResponseTime: z.number(),
    lastActivity: z.iso.datetime(),
    topLanguages: z.array(z.object({
      language: z.string(),
      messageCount: z.number(),
      percentage: z.number(),
    })),
  }),

  // Conversation minimale (pour listes)
  minimal: z.object({
    id: z.string(),
    identifier: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    type: conversationTypeEnum,
    avatar: z.string().nullable().optional(),
    memberCount: z.number(),
    lastMessage: MessageSchemas.minimal.nullable().optional(),
    lastMessageAt: z.iso.datetime().nullable().optional(),
    unreadCount: z.number().nullable().optional(),
  }),

  // Conversation complète (réponse API)
  full: z.object({
    id: z.string(),
    identifier: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    type: conversationTypeEnum,
    status: conversationStatusEnum,
    visibility: conversationVisibilityEnum,
    image: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    banner: z.string().nullable().optional(),
    communityId: z.string().nullable().optional(),
    isActive: z.boolean(),
    memberCount: z.number(),
    participants: z.array(z.object({
      userId: z.string(),
      role: userRoleEnum,
      joinedAt: z.iso.datetime(),
      isActive: z.boolean(),
      permissions: z.object({
        canInvite: z.boolean(),
        canRemove: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
        canModerate: z.boolean(),
      }).nullable().optional(),
    })).optional(),
    lastMessage: MessageSchemas.minimal.nullable().optional(),
    lastMessageAt: z.iso.datetime().nullable().optional(),
    messageCount: z.number().nullable().optional(),
    unreadCount: z.number().nullable().optional(),
    encryptionMode: encryptionModeEnum.nullable().optional(),
    encryptionEnabledAt: z.iso.datetime().nullable().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastActivityAt: z.iso.datetime().nullable().optional(),
    createdBy: z.string().nullable().optional(),
    createdByUser: UserSchemas.minimal.nullable().optional(),
  }),
};

// =============================================================================
// CALL SESSION SCHEMAS
// =============================================================================

/**
 * Type d'appel (alias pour compatibilité gateway)
 * Utilise 'audio' au lieu de 'voice' pour cohérence avec WebRTC
 */
export const callTypeEnum = z.enum(['audio', 'video']);

// `CallParticipantSchemas` a été retiré le 2026-08-13 : il n'avait AUCUNE
// référence dans le dépôt et décrivait une entité qui n'a jamais existé —
// `status`, `duration`, `isMuted`, `isVideoOff` n'ont aucun équivalent sur le
// modèle Prisma `CallParticipant` (qui porte `isAudioEnabled`, `isVideoEnabled`,
// `leftAt`). Le décrire à nouveau demande de partir du modèle, pas de ce texte.

// =============================================================================
// ANONYMOUS PARTICIPANT SCHEMAS
// =============================================================================

/**
 * Schémas pour les participants anonymes
 */
export const AnonymousParticipantSchemas = {
  // Participant complet
  full: z.object({
    id: z.string(),
    conversationId: z.string(),
    sessionId: z.string(),
    nickname: z.string().nullable().optional(),
    language: z.string(),
    email: z.email().nullable().optional(),
    avatarColor: z.string().nullable().optional(),
    isActive: z.boolean(),
    lastActiveAt: z.iso.datetime().nullable().optional(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    messageCount: z.number(),
    createdAt: z.iso.datetime(),
  }),

  // Rejoindre en anonyme
  join: z.object({
    nickname: z.string().min(2).max(30).optional(),
    // `.max(6)` : parité avec `CommonSchemas.language` (code 639-3 régionalisé).
    language: z.string().min(2).max(6).default('fr'),
    email: z.email().optional(),
  }),
};
