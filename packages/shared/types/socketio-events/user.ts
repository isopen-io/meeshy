/**
 * Le domaine USER : profil propagé en temps réel, permissions et modèle
 * utilisateur transporté sur le socket.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Payload de `USER_UPDATED` — émis aux user-rooms de tous les contacts
 * (utilisateurs partageant au moins une conversation avec `userId`) quand un
 * profil change (displayName, avatar, banner, username). Delta léger : seuls
 * les champs modifiés sont présents dans `changes`, pas le user complet.
 * Voir tasks/socketio-events-cleanup.md #6.
 *
 * **Exception : les quatre composants du nom voyagent en GROUPE.** Dès que
 * `displayName`, `firstName`, `lastName` OU `username` change, les quatre sont
 * présents. Le nom RENDU par un client est `displayName > « Prénom Nom » >
 * username` ; un client ne stocke que le nom déjà composé, donc un delta
 * partiel (« firstName vaut désormais Bob ») est irrecomposable chez lui — il
 * lui manque toujours les autres composants. Le groupe entier lui permet
 * d'appliquer SON résolveur (`getUserDisplayName` web,
 * `APIConversationUser.name` iOS) sans qu'une quatrième copie de la règle
 * apparaisse côté serveur. La présence de `username` est donc le marqueur du
 * groupe : `avatar`/`banner` changent seuls, le nom jamais.
 *
 * `null` sur `displayName`/`firstName`/`lastName` signifie EFFACÉ, et c'est le
 * seul moyen pour le client de faire retomber le nom sur le composant suivant.
 * `username` est obligatoire côté base, donc jamais `null`.
 */
export interface UserUpdatedEventData {
  readonly userId: string;
  readonly changes: Readonly<{
    displayName?: string | null;
    avatar?: string | null;
    banner?: string | null;
    username?: string;
    firstName?: string | null;
    lastName?: string | null;
  }>;
}

export interface UserPermissions {
  readonly canAccessAdmin: boolean;
  readonly canManageUsers: boolean;
  readonly canManageGroups: boolean;
  readonly canManageConversations: boolean;
  readonly canViewAnalytics: boolean;
  readonly canModerateContent: boolean;
  readonly canViewAuditLogs: boolean;
  readonly canManageNotifications: boolean;
  readonly canManageTranslations: boolean;
}

/**
 * User type for Socket.IO communications
 * Aligned with schema.prisma User model
 */
export interface SocketIOUser {
  readonly id: string;
  readonly userId?: string; // User.id when sender is a Participant (post Participant model migration)
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phoneNumber?: string;
  readonly displayName?: string;
  readonly avatar?: string;
  readonly banner?: string;  // Profile banner/cover image
  readonly bio?: string;
  readonly role: string;
  readonly permissions?: UserPermissions;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date;
  readonly timezone?: string;  // IANA format (e.g., "America/New_York")

  // Blocked users
  readonly blockedUserIds?: readonly string[];

  // Language preferences
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage?: string;
  /**
   * Locale appareil persistée par le gateway (Prisme Linguistique étendu —
   * 4e priorité). Normalisée en ISO 639-1 par `normalizeLanguageCode`.
   * Source du write : header `X-Device-Locale` envoyé par les clients
   * (iOS `Locale.current.identifier`, web `navigator.language`).
   */
  readonly deviceLocale?: string;
  readonly autoTranslateEnabled: boolean;

  // Account status
  readonly isActive: boolean;
  readonly deactivatedAt?: Date;
  readonly deletedAt?: Date;
  readonly deletedBy?: string;

  // Verification statuses
  readonly emailVerifiedAt?: Date;
  readonly phoneVerifiedAt?: Date;
  readonly twoFactorEnabledAt?: Date;

  // Pending contact changes (awaiting verification)
  readonly pendingEmail?: string;
  readonly pendingPhone?: string;

  // Security fields
  readonly failedLoginAttempts?: number;
  readonly lockedUntil?: Date;
  readonly lockedReason?: string;
  readonly lastPasswordChange?: Date;
  readonly passwordResetAttempts?: number;
  readonly lastPasswordResetAttempt?: Date;

  // Login tracking
  readonly lastLoginIp?: string;
  readonly lastLoginLocation?: string;
  readonly lastLoginDevice?: string;

  // E2EE / Signal Protocol
  readonly encryptionPreference?: 'disabled' | 'optional' | 'always';
  readonly signalIdentityKeyPublic?: string;  // Base64 encoded
  readonly signalRegistrationId?: number;
  readonly signalPreKeyBundleVersion?: number;
  readonly lastKeyRotation?: Date;

  // Transcription settings (on-device)
  readonly autoTranscriptionEnabled?: boolean;  // Auto-transcribe audio/video when no transcription exists

  // Voice profile
  readonly voiceProfileConsentAt?: Date;
  readonly ageVerificationConsentAt?: Date;
  readonly birthDate?: Date;
  readonly voiceCloningEnabledAt?: Date;
  readonly voiceProfileUpdateNotifiedAt?: Date;

  // Metadata
  readonly profileCompletionRate?: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  /**
   * Nature du participant quand cet objet décrit l'AUTEUR d'un message plutôt
   * qu'un compte (`Participant.type`). C'est le discriminant qui fait foi pour
   * « cette personne a-t-elle un compte ? » — `isAnonymous` et `isMeeshyer`
   * ci-dessous ne sont que des replis hérités. Lire par `isAnonymousSender`
   * (`utils/sender-identity.ts`), jamais champ par champ.
   */
  readonly type?: 'user' | 'anonymous' | 'bot';

  // Compatibility flags
  readonly isAnonymous?: boolean;
  readonly isMeeshyer?: boolean;
}

// ===== TYPES DE CONFIGURATION =====

export interface UserLanguageConfig {
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage?: string;
  readonly autoTranslateEnabled: boolean;
}
