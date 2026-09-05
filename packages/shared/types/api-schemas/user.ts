/**
 * Schémas d’API pour le domaine utilisateur : profil, permissions, statistiques, préférences.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/user
 */

// =============================================================================
// USER SCHEMAS
// =============================================================================

/**
 * User permissions object schema
 */
export const userPermissionsSchema = {
  type: 'object',
  description: 'User permissions based on role',
  properties: {
    canAccessAdmin: { type: 'boolean', description: 'Can access admin panel' },
    canManageUsers: { type: 'boolean', description: 'Can manage users' },
    canManageGroups: { type: 'boolean', description: 'Can manage groups' },
    canManageConversations: { type: 'boolean', description: 'Can manage conversations' },
    canViewAnalytics: { type: 'boolean', description: 'Can view analytics' },
    canModerateContent: { type: 'boolean', description: 'Can moderate content' },
    canViewAuditLogs: { type: 'boolean', description: 'Can view audit logs' },
    canManageNotifications: { type: 'boolean', description: 'Can manage notifications' },
    canManageTranslations: { type: 'boolean', description: 'Can manage translations' }
  }
} as const;

/**
 * User object schema for API responses
 * Contains all user fields returned by login, register, and profile endpoints
 */
export const userSchema = {
  type: 'object',
  description: 'User profile data',
  properties: {
    // Identity
    id: { type: 'string', description: 'User unique identifier (MongoDB ObjectId)' },
    username: { type: 'string', description: 'Unique username (2-16 characters)' },
    email: { type: 'string', format: 'email', description: 'Email address' },
    firstName: { type: 'string', description: 'First name' },
    lastName: { type: 'string', description: 'Last name' },
    displayName: { type: 'string', description: 'Display name shown to other users' },
    bio: { type: 'string', nullable: true, description: 'User biography' },
    avatar: { type: 'string', nullable: true, description: 'Avatar image URL' },
    banner: { type: 'string', nullable: true, description: 'Banner image URL' },
    phoneNumber: { type: 'string', nullable: true, description: 'Phone number in E.164 format (+33612345678)' },
    phoneCountryCode: { type: 'string', nullable: true, description: 'ISO 3166-1 alpha-2 country code (FR, US)' },

    // Role & Status
    role: {
      type: 'string',
      enum: ['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST'],
      description: 'User global role (aligned with Prisma enum UserRole)'
    },
    isActive: { type: 'boolean', description: 'Account active status' },
    deactivatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Account deactivation timestamp' },

    // Translation Settings
    systemLanguage: { type: 'string', description: 'Interface language (ISO 639-1: fr, en, es...)' },
    regionalLanguage: { type: 'string', description: 'Regional language for translations' },
    customDestinationLanguage: { type: 'string', nullable: true, description: 'Custom destination language' },
    autoTranslateEnabled: { type: 'boolean', description: 'Auto-translate messages' },

    // Presence
    isOnline: { type: 'boolean', description: 'Current online status' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last activity timestamp' },

    // Security - Verification Status
    emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Email verification timestamp' },
    phoneVerifiedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Phone verification timestamp' },
    twoFactorEnabledAt: { type: 'string', format: 'date-time', nullable: true, description: '2FA enabled timestamp' },
    lastPasswordChange: { type: 'string', format: 'date-time', nullable: true, description: 'Last password change timestamp' },

    // Security - Login Tracking
    lastLoginIp: { type: 'string', nullable: true, description: 'Last login IP address' },
    lastLoginLocation: { type: 'string', nullable: true, description: 'Last login location (City, Country)' },
    lastLoginDevice: { type: 'string', nullable: true, description: 'Last login device user agent' },

    // Timezone
    timezone: { type: 'string', nullable: true, description: 'User timezone (IANA: Europe/Paris)' },

    // Metadata
    profileCompletionRate: { type: 'number', nullable: true, description: 'Profile completion percentage (0-100)' },
    createdAt: { type: 'string', format: 'date-time', description: 'Account creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last profile update timestamp' },

    // Permissions
    permissions: userPermissionsSchema
  }
} as const;

/**
 * Minimal user schema for lists and references
 */
export const userMinimalSchema = {
  type: 'object',
  description: 'Minimal user data for lists and references',
  properties: {
    id: { type: 'string', description: 'User unique identifier' },
    userId: { type: 'string', nullable: true, description: 'Real User ID (when sender is a Participant)' },
    username: { type: 'string', description: 'Username' },
    displayName: { type: 'string', description: 'Display name' },
    avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
    isOnline: { type: 'boolean', description: 'Online status' },
    // A-t-il un compte ? `Participant.type` répond, et cette ligne est tout ce
    // qui manquait pour que la réponse ARRIVE : la requête chargeait déjà le
    // champ, le mapping l'étalait déjà, et fast-json-stringify le retirait
    // faute de déclaration. Le payload socket `message:new` le transporte
    // depuis toujours — cette déclaration met le chemin REST au même niveau.
    // Absent quand le schéma décrit un vrai `User` plutôt qu'un participant.
    type: {
      type: 'string',
      enum: ['user', 'anonymous', 'bot'],
      description: 'Participant kind — `anonymous` marks an author with no account'
    }
  }
} as const;

// =============================================================================
// USER STATS SCHEMAS
// =============================================================================

/**
 * User statistics schema
 */
export const userStatsSchema = {
  type: 'object',
  description: 'User activity statistics',
  properties: {
    id: { type: 'string', description: 'Stats record ID' },
    userId: { type: 'string', description: 'User ID' },

    // Message stats
    totalMessagesSent: { type: 'number', description: 'Total messages sent' },
    totalMessagesReceived: { type: 'number', description: 'Total messages received' },
    messagesThisWeek: { type: 'number', description: 'Messages sent this week' },
    messagesThisMonth: { type: 'number', description: 'Messages sent this month' },

    // Conversation stats
    totalConversations: { type: 'number', description: 'Total conversations' },
    activeConversations: { type: 'number', description: 'Active conversations' },
    publicConversationsCreated: { type: 'number', description: 'Public conversations created' },

    // Call stats
    totalCallsInitiated: { type: 'number', description: 'Calls initiated' },
    totalCallsReceived: { type: 'number', description: 'Calls received' },
    totalCallDuration: { type: 'number', description: 'Total call time (minutes)' },

    // Translation stats
    totalTranslationsRequested: { type: 'number', description: 'Translations requested' },
    topLanguagesPaired: { type: 'string', nullable: true, description: 'Top language pairs (JSON)' },

    // Social stats
    totalFriends: { type: 'number', description: 'Total friends' },
    communitiesJoined: { type: 'number', description: 'Communities joined' },
    communitiesCreated: { type: 'number', description: 'Communities created' },

    // Engagement
    averageResponseTime: { type: 'number', nullable: true, description: 'Avg response time (minutes)' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last activity' },
    streakDays: { type: 'number', description: 'Current activity streak' },

    createdAt: { type: 'string', format: 'date-time', description: 'Stats creation' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Stats last update' }
  }
} as const;

// =============================================================================
// USER PREFERENCE SCHEMAS
// =============================================================================

/**
 * User preference schema
 */
export const userPreferenceSchema = {
  type: 'object',
  description: 'User application preferences',
  properties: {
    id: { type: 'string', description: 'Preference ID' },
    userId: { type: 'string', description: 'User ID' },

    // Theme & Display
    theme: { type: 'string', enum: ['light', 'dark', 'system'], description: 'UI theme' },
    fontSize: { type: 'string', enum: ['small', 'medium', 'large'], description: 'Font size' },
    compactMode: { type: 'boolean', description: 'Compact message display' },

    // Privacy
    showOnlineStatus: { type: 'boolean', description: 'Show online status to others' },
    showLastSeen: { type: 'boolean', description: 'Show last seen timestamp' },
    showReadReceipts: { type: 'boolean', description: 'Send read receipts' },
    showTypingIndicator: { type: 'boolean', description: 'Show typing indicator' },

    // Media
    autoPlayMedia: { type: 'boolean', description: 'Auto-play media' },
    autoDownloadMedia: { type: 'boolean', description: 'Auto-download media' },
    mediaQuality: { type: 'string', enum: ['low', 'medium', 'high', 'original'], description: 'Media quality' },

    // Keyboard shortcuts
    enterToSend: { type: 'boolean', description: 'Enter key sends message' },

    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update' }
  }
} as const;

/**
 * Update user preference request schema
 */
export const updateUserPreferenceRequestSchema = {
  type: 'object',
  properties: {
    theme: { type: 'string', enum: ['light', 'dark', 'system'] },
    fontSize: { type: 'string', enum: ['small', 'medium', 'large'] },
    compactMode: { type: 'boolean' },
    showOnlineStatus: { type: 'boolean' },
    showLastSeen: { type: 'boolean' },
    showReadReceipts: { type: 'boolean' },
    showTypingIndicator: { type: 'boolean' },
    autoPlayMedia: { type: 'boolean' },
    autoDownloadMedia: { type: 'boolean' },
    mediaQuality: { type: 'string', enum: ['low', 'medium', 'high', 'original'] },
    enterToSend: { type: 'boolean' }
  }
} as const;

// `updateUserRequestSchema` était déclaré sous le bandeau « MAGIC LINK
// AUTHENTICATION SCHEMAS », qui ne le décrit pas : c’est le corps de
// `PATCH /users/me`. Il rejoint ici son domaine, sans une lettre de changée.

/**
 * Update user profile request body schema
 *
 * #4184 — ce contrat AJV doit décrire EXACTEMENT le même jeu de champs que le
 * validateur Zod frère, `updateUserProfileSchema`
 * (`packages/shared/utils/validation.ts`). Avant ce correctif les deux
 * divergeaient dans les DEUX sens : `avatar`/`timezone` figuraient ici sans
 * exister côté Zod — un client qui LIT ce schéma (doc OpenAPI générée) croit
 * ces deux champs acceptés par `PATCH /users/me`, et se fait rejeter en 400 à
 * l'exécution ; `email`/`phoneNumber`, eux, ne figuraient PAS ici mais
 * existaient côté Zod, qui les acceptait et les écrivait en base SANS aucune
 * preuve de possession — le vecteur de prise de contrôle de compte que #4184
 * ferme. `avatar` a sa route dédiée (`PATCH /users/me/avatar`) ; `timezone`
 * n'est lu par aucun handler de cette route ; `email`/`phoneNumber` passent
 * désormais exclusivement par `POST /users/me/change-email` / `/change-phone`
 * (`contact-change.ts`), qui prouvent la possession avant d'écrire.
 *
 * PAS de `additionalProperties: false` ici — décision mesurée, pas un oubli.
 * Fastify configure son AJV avec `removeAdditional: true`
 * (`@fastify/ajv-compiler`, défaut NON désactivé par `server.ts`), qui
 * SUPPRIME silencieusement toute clé interdite AVANT que le `preValidation`/
 * handler ne s'exécute — mesuré empiriquement sur la config AJV exacte de
 * `server.ts` : `additionalProperties: false` change une requête portant
 * `email` d'un statut 200 (SANS le champ) à... un statut 200 identique, la clé
 * ayant simplement disparu avant que quiconque ne s'en aperçoive. Le refus
 * EXPLICITE (400) qu'exige #4184 vient du `.strict()` de la couche Zod, qui
 * voit encore la clé — AJV ne la lui a pas retirée puisqu'elle n'est déclarée
 * NULLE PART ici, condition sous laquelle `removeAdditional` ne retire rien
 * (vérifié : seule la présence explicite de `additionalProperties: false`
 * déclenche la suppression silencieuse). Poser ce mot-clé ICI retirerait le
 * signal AVANT que Zod ne le voie et transformerait le refus en silence —
 * l'inverse du but recherché.
 */
export const updateUserRequestSchema = {
  type: 'object',
  properties: {
    firstName: { type: 'string', minLength: 1, maxLength: 50, description: 'First name' },
    lastName: { type: 'string', minLength: 1, maxLength: 50, description: 'Last name' },
    // PAS de `minLength` : `''` est une valeur PRODUIT valide (EFFACER le nom
    // d'affichage, cf. le handler `updateUserProfile`). `minLength: 1`
    // rejetait cette requête au niveau AJV — AVANT que Zod (sans borne basse
    // ici) n'ait la moindre chance de l'accepter. Divergence de la même
    // FAMILLE que celle d'`email`/`phoneNumber`/`avatar`/`timezone` ci-dessus
    // (#4184 § critère 2), révélée en corrigeant l'anti-témoin de
    // `profile.test.ts` qui la masquait depuis le début : le double
    // `additionalProperties: true` qu'il posait remplaçait CE schéma en bloc,
    // sans aucune borne, donc `displayName: ''` n'avait jamais traversé le
    // VRAI contrat AJV avant ce lot.
    displayName: { type: 'string', maxLength: 100, description: 'Display name (empty string clears it)' },
    bio: { type: 'string', maxLength: 500, description: 'User biography' },
    systemLanguage: { type: 'string', minLength: 2, maxLength: 5, description: 'System language code' },
    regionalLanguage: { type: 'string', maxLength: 5, description: 'Regional language code (empty string clears)' },
    customDestinationLanguage: { type: 'string', maxLength: 5, nullable: true, description: 'Custom destination language (empty string allowed)' },
    autoTranslateEnabled: { type: 'boolean', description: 'Enable auto-translation' },
    voicePublic: { type: 'boolean', description: 'Expose the cloned voice sample on the public profile' }
  }
} as const;
