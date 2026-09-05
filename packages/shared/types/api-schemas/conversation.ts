/**
 * Schémas d’API pour les conversations : participants, réglages, liens, statistiques, curseur de lecture.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/conversation
 */

import { messageMinimalSchema } from './message.js';
import { userMinimalSchema } from './user.js';

// =============================================================================
// CONVERSATION SCHEMAS
// =============================================================================

/**
 * Conversation participant schema with full user information
 */
export const conversationParticipantSchema = {
  type: 'object',
  description: 'Participant in a conversation with full user information',
  properties: {
    id: { type: 'string', description: 'User ID' },
    participantId: { type: 'string', nullable: true, description: 'Participant ID (unified model)' },
    userId: { type: 'string', nullable: true, description: 'User ID (null for anonymous participants)' },
    type: { type: 'string', enum: ['user', 'anonymous', 'bot'], description: 'Participant type (unified model)' },
    username: { type: 'string', description: 'Username' },
    firstName: { type: 'string', nullable: true, description: 'First name' },
    lastName: { type: 'string', nullable: true, description: 'Last name' },
    displayName: { type: 'string', nullable: true, description: 'Display name' },
    avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
    banner: { type: 'string', nullable: true, description: 'Profile banner URL' },
    role: {
      type: 'string',
      enum: ['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST'],
      description: 'Participant global role (aligned with Prisma enum UserRole)'
    },
    // Minuscules — c'est ainsi que `Participant.role` est stocké, comparé
    // (`role: { in: ['creator','admin','moderator'] }`) et écrit
    // (`role.toLowerCase()`). L'enum annonçait des MAJUSCULES : rien ne cassait,
    // `fast-json-stringify` ne validant pas les enums, mais l'inventaire OpenAPI
    // décrivait un format que le serveur n'émet jamais — et un client qui s'y
    // fierait comparerait sur la mauvaise casse.
    conversationRole: {
      type: 'string',
      enum: ['creator', 'admin', 'moderator', 'member'],
      nullable: true,
      description: 'Role in this specific conversation (lowercase, as stored)'
    },
    isOnline: { type: 'boolean', description: 'User is currently online' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last activity timestamp' },
    systemLanguage: { type: 'string', nullable: true, description: 'System language preference' },
    regionalLanguage: { type: 'string', nullable: true, description: 'Regional language' },
    customDestinationLanguage: { type: 'string', nullable: true, description: 'Custom destination language' },
    // PAS de `autoTranslateEnabled` : c'était un littéral `true` en dur, retiré
    // avec son producteur (#4643) — même défaut, même correctif que le profil
    // public (#4161). Le magasin réel de la préférence d'un utilisateur est
    // `UserPreferences.application`, jamais servi à un co-participant : la
    // directive de présence du 2026-08-25 ne fait aucune exception pour une
    // préférence personnelle sur la seule foi d'une conversation partagée.
    isActive: { type: 'boolean', description: 'Participant is active' },
    createdAt: { type: 'string', format: 'date-time', description: 'User creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'User last update timestamp' },
    joinedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Join timestamp' },
    isAnonymous: { type: 'boolean', nullable: true, description: 'Is anonymous participant' },
    permissions: {
      type: 'object',
      nullable: true,
      description: 'Participant permissions (content + conversation-level)',
      properties: {
        canSendMessages: { type: 'boolean', description: 'Can send messages' },
        canSendFiles: { type: 'boolean', description: 'Can send files' },
        canSendImages: { type: 'boolean', description: 'Can send images' },
        canSendVideos: { type: 'boolean', description: 'Can send videos' },
        canSendAudios: { type: 'boolean', description: 'Can send audio messages' },
        canSendLocations: { type: 'boolean', description: 'Can send locations' },
        canSendLinks: { type: 'boolean', description: 'Can send links' },
        canAccessAdmin: { type: 'boolean', description: 'Can access admin panel' },
        canManageUsers: { type: 'boolean', description: 'Can manage users' },
        canManageGroups: { type: 'boolean', description: 'Can manage groups' },
        canManageConversations: { type: 'boolean', description: 'Can manage conversations' },
        canViewAnalytics: { type: 'boolean', description: 'Can view analytics' },
        canModerateContent: { type: 'boolean', description: 'Can moderate content' },
        canViewAuditLogs: { type: 'boolean', description: 'Can view audit logs' },
        canManageNotifications: { type: 'boolean', description: 'Can manage notifications' },
        canManageTranslations: { type: 'boolean', description: 'Can manage translations' },
        canInvite: { type: 'boolean', description: 'Can invite others' },
        canRemove: { type: 'boolean', description: 'Can remove participants' },
        canEdit: { type: 'boolean', description: 'Can edit conversation' },
        canDelete: { type: 'boolean', description: 'Can delete messages' },
        canModerate: { type: 'boolean', description: 'Can moderate content (conversation level)' }
      }
    }
  }
} as const;

/**
 * Conversation settings schema
 */
export const conversationSettingsSchema = {
  type: 'object',
  description: 'Conversation configuration settings',
  properties: {
    allowAnonymous: { type: 'boolean', description: 'Allow anonymous participants' },
    requireApproval: { type: 'boolean', description: 'Require approval to join' },
    maxParticipants: { type: 'number', nullable: true, description: 'Maximum number of participants' },
    autoArchive: { type: 'boolean', nullable: true, description: 'Auto-archive after inactivity' },
    translationEnabled: { type: 'boolean', description: 'Enable automatic translation' },
    defaultLanguage: { type: 'string', nullable: true, description: 'Default conversation language' },
    allowedLanguages: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Allowed languages for messages'
    }
  }
} as const;

/**
 * Conversation link/share schema
 */
export const conversationLinkSchema = {
  type: 'object',
  description: 'Shareable link to join a conversation',
  properties: {
    id: { type: 'string', description: 'Link unique identifier' },
    type: {
      type: 'string',
      enum: ['invite', 'share', 'embed'],
      description: 'Link type'
    },
    url: { type: 'string', description: 'Full shareable URL' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Link expiration' },
    maxUses: { type: 'number', nullable: true, description: 'Maximum number of uses' },
    currentUses: { type: 'number', description: 'Current number of uses' },
    isActive: { type: 'boolean', description: 'Link is active' },
    createdBy: { type: 'string', description: 'User ID who created the link' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    // Anonymous permissions
    allowAnonymousMessages: { type: 'boolean', nullable: true, description: 'Allow anonymous messages' },
    allowAnonymousFiles: { type: 'boolean', nullable: true, description: 'Allow anonymous file uploads' },
    allowViewHistory: { type: 'boolean', nullable: true, description: 'Allow viewing message history' },
    requireNickname: { type: 'boolean', nullable: true, description: 'Require nickname to join' },
    requireEmail: { type: 'boolean', nullable: true, description: 'Require email to join' }
  }
} as const;

/**
 * Conversation statistics schema
 */
export const conversationStatsSchema = {
  type: 'object',
  description: 'Conversation activity statistics',
  properties: {
    totalMessages: { type: 'number', description: 'Total message count' },
    totalParticipants: { type: 'number', description: 'Total participant count' },
    activeParticipants: { type: 'number', description: 'Active participants (last 24h)' },
    messagesLast24h: { type: 'number', description: 'Messages in last 24 hours' },
    messagesLast7days: { type: 'number', description: 'Messages in last 7 days' },
    averageResponseTime: { type: 'number', description: 'Average response time (minutes)' },
    lastActivity: { type: 'string', format: 'date-time', description: 'Last activity timestamp' },
    topLanguages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          messageCount: { type: 'number' },
          percentage: { type: 'number' }
        }
      },
      description: 'Most used languages'
    },
    // `createdAt` et `translationStats` appartiennent à `ConversationStats`
    // (`types/conversation.ts`) depuis toujours ; ce schéma ne les déclarait
    // pas. Tant qu'aucune route ne l'employait, l'écart ne coûtait rien — mais
    // son PREMIER consommateur les aurait perdus en silence, puisqu'un objet
    // déclaré supprime tout champ non listé. Complété avec le type, pas
    // au-delà.
    createdAt: { type: 'string', format: 'date-time', description: 'Conversation creation timestamp' },
    translationStats: {
      type: 'object',
      description: 'Translation activity for this conversation',
      properties: {
        totalTranslations: { type: 'number' },
        cacheHitRate: { type: 'number' },
        averageTranslationTime: { type: 'number' },
        topLanguagePairs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              count: { type: 'number' }
            }
          }
        }
      }
    }
  }
} as const;

/**
 * Full conversation schema for API responses
 * Aligned with schema.prisma Conversation model
 */
export const conversationSchema = {
  type: 'object',
  description: 'Conversation with participants, messages, and metadata',
  properties: {
    // Identifiers
    id: { type: 'string', description: 'Conversation unique identifier (MongoDB ObjectId)' },
    identifier: { type: 'string', nullable: true, description: 'Human-readable identifier for URLs' },

    // Metadata
    title: { type: 'string', nullable: true, description: 'Conversation title/name' },
    description: { type: 'string', nullable: true, description: 'Conversation description' },
    type: {
      type: 'string',
      enum: ['direct', 'group', 'public', 'global', 'broadcast'],
      description: 'Conversation type'
    },
    status: {
      type: 'string',
      enum: ['active', 'archived', 'deleted'],
      description: 'Conversation status'
    },
    visibility: {
      type: 'string',
      enum: ['public', 'private', 'restricted'],
      description: 'Conversation visibility'
    },
    image: { type: 'string', nullable: true, description: 'Conversation image URL' },
    avatar: { type: 'string', nullable: true, description: 'Conversation avatar URL' },
    banner: { type: 'string', nullable: true, description: 'Conversation banner URL' },

    // Community
    communityId: { type: 'string', nullable: true, description: 'Parent community ID' },
    isActive: { type: 'boolean', description: 'Conversation is active' },
    memberCount: { type: 'number', description: 'Number of members (capped at 199 for non platform admins)' },
    memberCountCapped: { type: 'boolean', nullable: true, description: 'True when memberCount is capped at 199 — display "199+"' },

    // Participants
    participants: {
      type: 'array',
      items: conversationParticipantSchema,
      description: 'Conversation participants'
    },

    // Last message
    lastMessage: { ...messageMinimalSchema, nullable: true, description: 'Most recent message' },
    lastMessageAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last message timestamp' },
    messageCount: { type: 'number', nullable: true, description: 'Total message count' },
    unreadCount: { type: 'number', nullable: true, description: 'Unread message count for current user' },

    // Encryption
    encryptionMode: {
      type: 'string',
      enum: ['server', 'e2ee', 'hybrid'],
      nullable: true,
      description: 'Encryption mode'
    },
    encryptionEnabledAt: { type: 'string', format: 'date-time', nullable: true, description: 'Encryption enabled timestamp' },
    encryptionEnabledBy: {
      type: 'string',
      nullable: true,
      description: 'User ID who enabled encryption (for audit purposes)'
    },
    serverEncryptionKeyId: {
      type: 'string',
      nullable: true,
      description: 'Server-side encryption key ID for key rotation'
    },

    // Permissions & Restrictions
    isAnnouncementChannel: {
      type: 'boolean',
      nullable: true,
      description: 'Announcement-only mode (only creator/admins can write)',
      default: false
    },
    isArchived: {
      type: 'boolean',
      nullable: true,
      description: 'Conversation is archived (use status=archived instead)',
      deprecated: true
    },
    defaultWriteRole: {
      type: 'string',
      enum: ['everyone', 'member', 'moderator', 'admin', 'creator'],
      nullable: true,
      description: 'Minimum role required to send messages'
    },
    slowModeSeconds: {
      type: 'number',
      nullable: true,
      description: 'Minimum seconds between messages per user (0 = disabled)',
      default: 0
    },

    // Configuration
    encryptionProtocol: {
      type: 'string',
      nullable: true,
      description: 'Encryption protocol used (aes-256-gcm, signal_v3)'
    },
    autoTranslateEnabled: {
      type: 'boolean',
      nullable: true,
      description: 'Auto-translation enabled (disabled for E2EE conversations)'
    },

    // Statistics
    stats: { ...conversationStatsSchema, nullable: true, description: 'Conversation statistics' },

    // Settings
    settings: { ...conversationSettingsSchema, nullable: true, description: 'Conversation settings' },

    // Links
    links: {
      type: 'array',
      items: conversationLinkSchema,
      nullable: true,
      description: 'Shareable links'
    },

    // Timestamps
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
    lastActivityAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last activity timestamp' },

    // Creator
    createdBy: { type: 'string', nullable: true, description: 'Creator user ID' },
    createdByUser: { ...userMinimalSchema, nullable: true, description: 'Creator user info' },

    // Appartenance de l'APPELANT — jumeau des mêmes clés dans
    // `conversationMinimalSchema`, où le commentaire complet explique pourquoi
    // leur absence rendait les conversations non modifiables. `GET
    // /conversations/:id` résolvait déjà le rang (`callerConversationRole`) pour
    // décider du plafond d'effectif, et le jetait faute d'être déclaré ici.
    currentUserRole: {
      type: 'string',
      nullable: true,
      description: "Rang de l'appelant DANS cette conversation (creator/admin/moderator/member), null s'il n'en est pas membre"
    },
    currentUserJoinedAt: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: "Date d'adhésion de l'appelant à cette conversation"
    }
  }
} as const;

/**
 * Conversation member schema for minimal conversation
 */
export const conversationParticipantMinimalSchema = {
  type: 'object',
  description: 'Conversation member data',
  properties: {
    id: { type: 'string', description: 'Membership ID' },
    conversationId: { type: 'string', description: 'Conversation ID' },
    userId: { type: 'string', nullable: true, description: 'User ID' },
    type: { type: 'string', nullable: true, description: 'Participant type (registered/anonymous)' },
    displayName: { type: 'string', nullable: true, description: 'Display name' },
    avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
    banner: { type: 'string', nullable: true, description: 'Profile banner URL (flattened top-level for DM surfacing)' },
    role: { type: 'string', description: 'Member role' },
    language: { type: 'string', nullable: true, description: 'Preferred language' },
    nickname: { type: 'string', nullable: true, description: 'Nickname in conversation' },
    isOnline: { type: 'boolean', nullable: true, description: 'Online status' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last active timestamp' },
    permissions: {
      type: 'object',
      nullable: true,
      description: 'Participant permissions (content + conversation-level)',
      properties: {
        canSendMessages: { type: 'boolean', description: 'Can send messages' },
        canSendFiles: { type: 'boolean', description: 'Can send files' },
        canSendImages: { type: 'boolean', description: 'Can send images' },
        canSendVideos: { type: 'boolean', description: 'Can send videos' },
        canSendAudios: { type: 'boolean', description: 'Can send audio messages' },
        canSendLocations: { type: 'boolean', description: 'Can send locations' },
        canSendLinks: { type: 'boolean', description: 'Can send links' },
        canAccessAdmin: { type: 'boolean', description: 'Can access admin panel' },
        canManageUsers: { type: 'boolean', description: 'Can manage users' },
        canManageGroups: { type: 'boolean', description: 'Can manage groups' },
        canManageConversations: { type: 'boolean', description: 'Can manage conversations' },
        canViewAnalytics: { type: 'boolean', description: 'Can view analytics' },
        canModerateContent: { type: 'boolean', description: 'Can moderate content' },
        canViewAuditLogs: { type: 'boolean', description: 'Can view audit logs' },
        canManageNotifications: { type: 'boolean', description: 'Can manage notifications' },
        canManageTranslations: { type: 'boolean', description: 'Can manage translations' },
        canInvite: { type: 'boolean', description: 'Can invite others' },
        canRemove: { type: 'boolean', description: 'Can remove participants' },
        canEdit: { type: 'boolean', description: 'Can edit conversation' },
        canDelete: { type: 'boolean', description: 'Can delete messages' },
        canModerate: { type: 'boolean', description: 'Can moderate content (conversation level)' }
      }
    },
    joinedAt: { type: 'string', format: 'date-time', description: 'Join timestamp' },
    isActive: { type: 'boolean', description: 'Is active member' },
    user: {
      type: 'object',
      nullable: true,
      description: 'User info',
      properties: {
        id: { type: 'string', description: 'User ID' },
        username: { type: 'string', description: 'Username' },
        displayName: { type: 'string', nullable: true, description: 'Display name' },
        firstName: { type: 'string', nullable: true, description: 'First name' },
        lastName: { type: 'string', nullable: true, description: 'Last name' },
        avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
        banner: { type: 'string', nullable: true, description: 'Profile banner URL' },
        isOnline: { type: 'boolean', description: 'Online status' },
        lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last active timestamp' }
      }
    }
  }
} as const;

/**
 * Minimal conversation schema for lists
 */
export const conversationMinimalSchema = {
  type: 'object',
  description: 'Minimal conversation data for lists',
  properties: {
    id: { type: 'string', description: 'Conversation ID' },
    identifier: { type: 'string', nullable: true, description: 'Human-readable identifier' },
    title: { type: 'string', nullable: true, description: 'Conversation title' },
    description: { type: 'string', nullable: true, description: 'Conversation description' },
    type: { type: 'string', description: 'Conversation type' },
    avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
    banner: { type: 'string', nullable: true, description: 'Banner URL' },
    isActive: { type: 'boolean', description: 'Is conversation active' },
    communityId: { type: 'string', nullable: true, description: 'Community ID if linked' },
    memberCount: { type: 'number', description: 'Member count (capped at 199 for non platform admins)' },
    memberCountCapped: { type: 'boolean', nullable: true, description: 'True when memberCount is capped at 199 — display "199+"' },
    lastMessage: { ...messageMinimalSchema, nullable: true, description: 'Last message' },
    lastMessageAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last message timestamp' },
    // Prisme Linguistique de la ligne de liste. Sans ces deux déclarations,
    // fast-json-stringify les retirerait silencieusement du payload (même piège
    // que `_count` et `location` plus haut) et l'aperçu resterait dans la langue
    // de l'expéditeur alors que le serveur l'a bel et bien traduit.
    // `lastMessageTranslations` est une carte `{ langue: aperçu tronqué }`
    // restreinte aux langues du LECTEUR : clés dynamiques, d'où
    // `additionalProperties`.
    lastMessageOriginalLanguage: {
      type: 'string',
      nullable: true,
      description: "Langue d'origine du dernier message (le contenu de `lastMessage.content`)"
    },
    lastMessageTranslations: {
      type: 'object',
      nullable: true,
      additionalProperties: { type: 'string' },
      description:
        "Aperçus traduits du dernier message, restreints aux langues du prisme du lecteur — `{ langue: texte tronqué }`. null si aucune traduction utile (le client affiche alors l'original)."
    },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    unreadCount: { type: 'number', nullable: true, description: 'Unread count' },
    // Le pont ✦ (G-123, tasks/lentille-implementation-contract.md §3.2).
    // ABSENT — jamais `null`, jamais un objet vide — quand `unreadCount === 0`
    // ou que le serveur n'a rien à annoncer : un client ancien qui ignore ce
    // champ ne voit rien de nouveau. `fast-json-stringify` STRIPPE tout champ
    // non déclaré ici (même piège historique que `customName`/`reaction`), donc
    // sans cette entrée le mapper aurait beau poser `bridge`, la route
    // l'aurait renvoyé absent du fil.
    bridge: {
      type: 'object',
      description: 'Pont ✦ précalculé serveur sur les messages non lus (ABSENT si unreadCount === 0)',
      properties: {
        kind: { type: 'string', enum: ['agent', 'fallback'], description: 'Étage : agent (phrase) ou fallback (données)' },
        unreadCount: { type: 'number', description: 'Compteur autoritatif — dupliqué ici pour que le pont se lise seul' },
        suggestedMode: { type: 'string', enum: ['focal', 'resume'], description: 'Décision d’orchestrateur précalculée (A6)' },
        isComplete: { type: 'boolean', description: 'ABSENT = complet ; false si la fenêtre calculée est plus petite que unreadCount' },
        data: {
          type: 'object',
          description: 'Étage déterministe (kind === fallback) — données, formatées par le client',
          properties: {
            authors: { type: 'array', items: { type: 'string' }, description: 'Deux auteurs nommés au plus' },
            extraAuthorCount: { type: 'number', description: 'Le "+N" au-delà des deux auteurs nommés' },
            messageCount: { type: 'number', description: 'Nombre de messages non lus couverts par le pont' },
            mediaCounts: {
              type: 'object',
              description: 'Décompte des pièces jointes par famille',
              properties: {
                images: { type: 'number' },
                audio: { type: 'number' },
                files: { type: 'number' }
              }
            }
          }
        },
        text: { type: 'string', description: 'Étage agent (kind === agent) — phrase déjà traduite dans la langue du lecteur' },
        translations: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Paire Prisme du texte agent — mêmes règles que lastMessageTranslations'
        },
        originalLanguage: { type: 'string', description: 'Langue d’origine du texte agent' }
      }
    },
    // Horloge du curseur de lecture — voyage À CÔTÉ du pont (le contrat gelé
    // §3.2 ne le porte pas). ABSENT sans curseur, jamais fabriqué (REV-4).
    lastReadAt: { type: 'string', format: 'date-time', description: 'Dernière lecture connue du lecteur pour cette conversation (ABSENT si inconnue)' },
    members: {
      type: 'array',
      items: conversationParticipantMinimalSchema,
      description: 'Conversation members (limited)'
    },
    participants: {
      type: 'array',
      items: conversationParticipantMinimalSchema,
      description: 'Conversation participants (limited) — used by iOS SDK for DM name resolution'
    },
    // Appartenance de l'APPELANT à cette conversation, calculée serveur.
    // `GET /conversations/search` retourne aussi les salons `public`/`global`
    // dont il n'est PAS membre (elle sert la recherche globale) ; sur décision
    // du user (2026-08-19) elle n'y émet plus AUCUN participant, et ce drapeau
    // est le seul signal d'appartenance. L'heuristique cliente qu'il remplace
    // lisait le tableau `participants`, tronqué à cinq : dans un salon public
    // de cinquante membres, un membre légitime n'y figure pas et son propre
    // salon disparaissait de sa recherche. Même piège que `cursorPagination`
    // ci-dessous : non déclaré ici, `fast-json-stringify` le retire du fil.
    isMember: {
      type: 'boolean',
      description: "L'appelant est un participant actif de cette conversation (ABSENT sur les routes qui ne le calculent pas)"
    },
    // Le RANG de l'appelant dans cette conversation, calculé serveur
    // (`currentUserRoleMap`, routes/conversations/core.ts). Troisième victime du
    // même piège que `cursorPagination` et `isMember` ci-dessus, et la plus
    // coûteuse : non déclaré ici, `fast-json-stringify` le retirait du fil, si
    // bien qu'AUCUN client n'a jamais connu son rang. Tout ce qui en dépend
    // retombait sur `member` — l'entrée « Réglages » iOS
    // (`ConversationInfoSheet.canManageMembers`), la section de permissions, le
    // bouton d'ajout de membre, les actions de rang — et le créateur d'un groupe
    // ne pouvait donc rien y modifier. Garde : `conversation-wire-fields.test.ts`,
    // qui sérialise au lieu de lire le schéma.
    //
    // Minuscules, comme la colonne `Participant.role` en base ('creator',
    // 'admin', 'moderator', 'member') — pas d'`enum` ici : le rang voyage tel
    // que la base le stocke, et un enum ne servirait que la documentation.
    currentUserRole: {
      type: 'string',
      nullable: true,
      description: "Rang de l'appelant DANS cette conversation (creator/admin/moderator/member), null s'il n'en est pas membre"
    },
    // Borne l'historique visible d'un membre arrivé en cours de route — iOS le
    // passe en `memberJoinedAt` au ConversationViewModel.
    currentUserJoinedAt: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: "Date d'adhésion de l'appelant à cette conversation"
    },
    // Réglages du conteneur. L'écran de réglages iOS construit ses valeurs
    // « originales » depuis la conversation de la LISTE : absents du fil, ils y
    // arrivaient à leur valeur par défaut, et l'écran affichait « tout le monde
    // peut écrire » sur un canal d'annonces.
    defaultWriteRole: {
      type: 'string',
      enum: ['everyone', 'member', 'moderator', 'admin', 'creator'],
      nullable: true,
      description: 'Minimum role required to send messages'
    },
    isAnnouncementChannel: {
      type: 'boolean',
      nullable: true,
      description: 'Announcement-only mode (only creator/admins can write)'
    },
    slowModeSeconds: {
      type: 'number',
      nullable: true,
      description: 'Minimum seconds between messages per user (0 = disabled)'
    },
    autoTranslateEnabled: {
      type: 'boolean',
      nullable: true,
      description: 'Auto-translation enabled (disabled for E2EE conversations)'
    },
    userPreferences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          isPinned: { type: 'boolean', description: 'Is pinned by user' },
          isMuted: { type: 'boolean', description: 'Is muted by user' },
          isArchived: { type: 'boolean', description: 'Is archived by user' },
          tags: { type: 'array', items: { type: 'string' }, description: 'User-defined tags' },
          categoryId: { type: 'string', nullable: true, description: 'Category ID for organization' },
          customName: { type: 'string', nullable: true, description: 'User-defined custom conversation name (drives DM display name)' },
          reaction: { type: 'string', nullable: true, description: 'User reaction/emoji for conversation' }
        }
      },
      description: 'User preferences for this conversation'
    },
    anonymousParticipants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Participant ID' },
          username: { type: 'string', description: 'Anonymous username' },
          firstName: { type: 'string', nullable: true, description: 'First name' },
          lastName: { type: 'string', nullable: true, description: 'Last name' },
          isOnline: { type: 'boolean', description: 'Online status' }
        }
      },
      description: 'Anonymous participants'
    }
  }
} as const;

// =============================================================================
// CONVERSATION READ CURSOR SCHEMAS
// =============================================================================

/**
 * Read cursor schema (tracks read position)
 */
export const conversationReadCursorSchema = {
  type: 'object',
  description: 'User read position in conversation',
  properties: {
    id: { type: 'string', description: 'Cursor ID' },
    conversationId: { type: 'string', description: 'Conversation ID' },
    userId: { type: 'string', description: 'User ID' },
    lastReadMessageId: { type: 'string', nullable: true, description: 'Last read message ID' },
    lastReadAt: { type: 'string', format: 'date-time', description: 'Last read timestamp' },
    unreadCount: { type: 'number', description: 'Unread message count' }
  }
} as const;
