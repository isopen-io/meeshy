/**
 * Types unifies pour les utilisateurs Meeshy
 * Harmonisation Gateway - Frontend
 */

import type { PaginationMeta } from './pagination.js';

/**
 * Rôles utilisateur globaux (aligné avec Prisma enum UserRole)
 * @see schema.prisma UserRole enum
 */
export type UserRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'BIGBOSS' | 'AUDIT' | 'ANALYST';

/**
 * Permissions utilisateur
 */
export interface UserPermissions {
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canViewAuditLogs: boolean;
  canManageNotifications: boolean;
  canManageTranslations: boolean;
}

/**
 * DEPRECIE : L'interface User a ete supprimee
 * Utilisez SocketIOUser depuis socketio-events.ts a la place
 * @deprecated Utilisez SocketIOUser pour eviter la redondance
 */

/**
 * Alias pour SocketIOUser - Type principal recommande
 * Utilisez ce type pour tous les nouveaux developpements
 */
export type { SocketIOUser as UserUnified, SocketIOUser as User } from './socketio-events.js';

/**
 * Configuration des langues utilisateur
 */
export interface UserLanguageConfig {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  autoTranslateEnabled: boolean;
}

/**
 * Configuration de confidentialité et encryption utilisateur
 */
export interface UserPrivacyConfig {
  encryptionPreference: 'disabled' | 'optional' | 'always';
  autoTranscriptionEnabled: boolean;
}

/**
 * Statistiques utilisateur
 */
export interface UserStats {
  id: string;
  userId: string;
  messagesSent: number;
  messagesReceived: number;
  charactersTyped: number;
  imageMessagesSent: number;
  filesShared: number;
  conversationsJoined: number;
  communitiesCreated: number;
  friendsAdded: number;
  friendRequestsSent: number;
  translationsUsed: number;
  languagesDetected: number;
  autoTranslateTimeMinutes: number;
  totalOnlineTimeMinutes: number;
  sessionCount: number;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Preferences utilisateur
 */
export interface UserPreference {
  id: string;
  userId: string;
  key: string;
  value: string;
  valueType: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===== ADMIN USER MANAGEMENT TYPES =====

/**
 * Type pour les features utilisateur (provenant de UserFeature)
 */
export interface UserFeatureData {
  twoFactorEnabledAt: Date | null;
  autoTranslateEnabled: boolean;
  encryptionPreference: string;
  audioTranscriptionEnabledAt: Date | null;
}

/**
 * Type strict pour les donnees utilisateur completes (BACKEND ONLY)
 * Ne doit JAMAIS etre expose directement via l'API
 */
export interface FullUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  bio: string;
  email: string;
  phoneNumber: string | null;
  avatar: string | null;
  banner: string | null;
  role: string;
  isActive: boolean;
  isOnline: boolean;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  lastActiveAt: Date;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  profileCompletionRate: number | null;
  phoneCountryCode: string | null;
  timezone: string | null;
  lastPasswordChange: Date | null;
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
  lockedReason: string | null;
  twoFactorEnabledAt: Date | null;
  twoFactorBackupCodes: string[];
  lastLoginIp: string | null;
  lastLoginLocation: string | null;
  lastLoginDevice: string | null;
  registrationIp: string | null;
  registrationLocation: string | null;
  registrationDevice: string | null;
  registrationCountry: string | null;
  userFeature?: UserFeatureData | null;
  _count?: {
    sentMessages?: number;
    conversations?: number;
  };
  /**
   * Les colonnes dont `AdminUserMetadata` est tiré (#8876). OPTIONNELLES : un
   * `FullUser` construit sans elles reste valide, et le bloc servi rend alors
   * `null` / `0` plutôt que de refuser la ligne. `pendingEmail` et
   * `pendingPhoneNumber` n'existent ici que pour que le serveur sache QU'UN
   * changement attend — leur valeur ne quitte jamais cette interface.
   */
  deviceLocale?: string | null;
  deviceCountry?: string | null;
  birthDate?: Date | null;
  ageVerifiedAt?: Date | null;
  voiceProfileConsentAt?: Date | null;
  voiceDataConsentAt?: Date | null;
  dataProcessingConsentAt?: Date | null;
  analyticsConsentAt?: Date | null;
  voiceCloningEnabledAt?: Date | null;
  termsAcceptedAt?: Date | null;
  termsVersion?: string | null;
  onboardingCompletedAt?: Date | null;
  currentStreakDays?: number;
  longestStreakDays?: number;
  engagementScore?: number;
  meeshBalance?: number;
  blockedUserIds?: string[];
  pendingEmail?: string | null;
  pendingPhoneNumber?: string | null;
}

/**
 * Les MÉTADONNÉES de compte d'un membre, telles que la fiche d'administration les
 * sert (#8876, #8005) : ce qui aide à COMPRENDRE un compte sans ouvrir la base.
 *
 * Servies aux seuls rôles qui voient les données sensibles, et seulement sur la
 * fiche. Jamais la valeur d'un changement en attente (`hasPendingEmail` /
 * `hasPendingPhone` disent qu'il existe), jamais la liste des comptes bloqués
 * (`blockedCount` en dit la taille).
 */
export type AdminUserMetadata = {
  readonly deviceLocale: string | null;
  readonly deviceCountry: string | null;
  readonly birthDate: Date | null;
  readonly ageVerifiedAt: Date | null;
  readonly voiceProfileConsentAt: Date | null;
  readonly voiceDataConsentAt: Date | null;
  readonly dataProcessingConsentAt: Date | null;
  readonly analyticsConsentAt: Date | null;
  readonly voiceCloningEnabledAt: Date | null;
  readonly termsAcceptedAt: Date | null;
  readonly termsVersion: string | null;
  readonly onboardingCompletedAt: Date | null;
  readonly currentStreakDays: number;
  readonly longestStreakDays: number;
  readonly engagementScore: number;
  readonly meeshBalance: number;
  readonly blockedCount: number;
  readonly hasPendingEmail: boolean;
  readonly hasPendingPhone: boolean;
};

/**
 * Type pour les donnees publiques (visibles par tous les admins)
 * Exclut les donnees sensibles
 */
export interface PublicUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  bio: string;
  avatar: string | null;
  banner: string | null;
  role: string;
  isActive: boolean;
  isOnline: boolean;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  /**
   * `null` = présence MASQUÉE pour ce viewer (`UserSanitizationService`, seuil
   * `canViewPresence` : ADMIN/BIGBOSS). La colonne, elle, n'est jamais nulle
   * (`FullUser.lastActiveAt: Date`) — c'est la valeur SERVIE qui peut l'être.
   */
  lastActiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  profileCompletionRate: number | null;
  _count?: {
    sentMessages?: number;
    conversations?: number;
  };
}

/**
 * Type pour les donnees sensibles (BIGBOSS & ADMIN uniquement)
 * Extension de PublicUser avec les champs sensibles
 */
export interface AdminUser extends PublicUser {
  email: string;
  phoneNumber: string | null;
  phoneCountryCode: string | null;
  timezone: string | null;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string | null;
  lastPasswordChange: Date | null;
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
  lockedReason: string | null;
  twoFactorEnabledAt: Date | null;
  /**
   * Le NOMBRE de codes de secours restants — jamais leurs empreintes (#8876).
   * `FullUser.twoFactorBackupCodes` reste la colonne ; aucune ligne servie ne la
   * porte.
   */
  twoFactorBackupCodesRemaining: number;
  lastLoginIp: string | null;
  lastLoginLocation: string | null;
  lastLoginDevice: string | null;
  registrationIp: string | null;
  registrationLocation: string | null;
  registrationDevice: string | null;
  registrationCountry: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  userFeature?: UserFeatureData | null;
  /** Présent sur la fiche seulement (#8876) ; absent d'une ligne de liste. */
  adminMetadata?: AdminUserMetadata;
  _count?: {
    sentMessages?: number;
    conversations?: number;
    createdShareLinks?: number;
    createdTrackingLinks?: number;
    createdAffiliateTokens?: number;
    affiliateRelations?: number;
    referredRelations?: number;
    sentFriendRequests?: number;
    receivedFriendRequests?: number;
  };
}

/**
 * Type pour les donnees masquees (MODO, AUDIT)
 * Comme PublicUser mais avec email/phone masques
 */
export interface MaskedUser extends PublicUser {
  email: string;  // Format: j***@domain.com
  phoneNumber: string | null;  // Format: +33 6** ** ** **
}

/**
 * Type union pour les reponses API selon le role
 */
export type UserResponse = PublicUser | AdminUser | MaskedUser;

/**
 * DTO pour mise a jour profil
 */
export interface UpdateUserProfileDTO {
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string | null;
  bio?: string;
  email?: string;
  phoneNumber?: string | null;
  phoneCountryCode?: string | null;
  avatar?: string | null;
  banner?: string | null;
  timezone?: string | null;
  systemLanguage?: string;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  birthDate?: Date | null;
}

/**
 * DTO pour creation utilisateur
 */
export interface CreateUserDTO {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  displayName?: string | null;
  bio?: string;
  phoneNumber?: string | null;
  role?: string;
  systemLanguage?: string;
  regionalLanguage?: string;
  /** L'administrateur atteste l'adresse : le compte naît actif (#8217). */
  emailVerified?: boolean;
}

/**
 * DTO pour changement d'email
 */
export interface UpdateEmailDTO {
  newEmail: string;
  password: string;  // Confirmation mot de passe requis
}

/**
 * DTO pour changement de role (BIGBOSS & ADMIN uniquement)
 */
export interface UpdateRoleDTO {
  role: string;
  reason?: string;  // Raison du changement (pour audit)
}

/**
 * DTO pour activation/desactivation
 */
export interface UpdateStatusDTO {
  isActive: boolean;
  reason?: string;  // Raison (pour audit)
}

/**
 * DTO pour reinitialisation mot de passe
 */
export interface ResetPasswordDTO {
  newPassword: string;
  sendEmail: boolean;  // Envoyer email de notification
}

/**
 * Filtres de recherche utilisateurs
 */
export interface UserFilters {
  search?: string;  // username, email, nom, prenom
  role?: string | readonly string[];  // un rôle, ou plusieurs (OU) — « le rang d'administration » = BIGBOSS + ADMIN
  isActive?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  twoFactorEnabled?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  lastActiveAfter?: Date;
  lastActiveBefore?: Date;
  sortBy?: 'createdAt' | 'lastActiveAt' | 'username' | 'email' | 'firstName' | 'lastName';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  offset: number;
  limit: number;
}

/**
 * @deprecated Use PaginationMeta from api-responses.ts instead
 * Kept for backwards compatibility
 */
export interface UserPaginationMeta extends PaginationMeta {
  /** @deprecated Use 'total' instead */
  totalUsers?: number;
}

/**
 * Reponse paginee
 */
export interface PaginatedUsersResponse<T = UserResponse> {
  users: T[];
  pagination: PaginationMeta;
}

/**
 * Actions d'audit
 */
export enum UserAuditAction {
  // Actions de lecture
  VIEW_USER = 'VIEW_USER',
  VIEW_USER_LIST = 'VIEW_USER_LIST',
  VIEW_AUDIT_LOG = 'VIEW_AUDIT_LOG',

  // Actions de creation/modification
  CREATE_USER = 'CREATE_USER',
  UPDATE_PROFILE = 'UPDATE_PROFILE',
  UPDATE_EMAIL = 'UPDATE_EMAIL',
  UPDATE_PHONE = 'UPDATE_PHONE',
  UPDATE_ROLE = 'UPDATE_ROLE',
  UPDATE_STATUS = 'UPDATE_STATUS',

  // Actions de securite
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  RESET_PASSWORD = 'RESET_PASSWORD',
  ENABLE_2FA = 'ENABLE_2FA',
  DISABLE_2FA = 'DISABLE_2FA',
  UNLOCK_ACCOUNT = 'UNLOCK_ACCOUNT',

  // Actions sur les ressources
  UPLOAD_AVATAR = 'UPLOAD_AVATAR',
  DELETE_AVATAR = 'DELETE_AVATAR',

  // Actions de suppression
  DEACTIVATE_USER = 'DEACTIVATE_USER',
  ACTIVATE_USER = 'ACTIVATE_USER',
  DELETE_USER = 'DELETE_USER',
  RESTORE_USER = 'RESTORE_USER',

  // Actions de verification
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  VERIFY_PHONE = 'VERIFY_PHONE',
  VERIFY_AGE = 'VERIFY_AGE',
  /**
   * Relance, par un administrateur, de la vérification d'un contact (#8289) —
   * un code + lien par e-mail, un SMS par téléphone. Distincte de
   * `VERIFY_EMAIL`/`VERIFY_PHONE`, qui POSENT la preuve : celle-ci n'en écrit
   * aucune, elle émet ce que le membre aurait pu redemander lui-même.
   */
  REQUEST_VERIFICATION = 'REQUEST_VERIFICATION',

  /**
   * Poser ou retirer, au nom d'un tiers, la preuve d'un consentement (#4154).
   *
   * L'age et les consentements etaient journalises en `UPDATE_PROFILE` : la
   * ligne d'audit ne disait donc pas QUEL geste avait eu lieu, et le geste le
   * plus lourd du fichier — fabriquer une piece legale — se lisait comme une
   * modification de profil ordinaire.
   */
  UPDATE_CONSENT = 'UPDATE_CONSENT',

  /**
   * Bannissement durable (#3719) — distinct de `DEACTIVATE_USER`/`ACTIVATE_USER` :
   * ces deux-là journalisent le SEUL bascule de `User.isActive`, sans motif
   * structuré ni durée. `BAN_USER`/`UNBAN_USER` journalisent le geste sur la
   * ligne `Ban` (motif requis, échéance optionnelle) qui pilote ce même bascule.
   */
  BAN_USER = 'BAN_USER',
  UNBAN_USER = 'UNBAN_USER',

  /**
   * Révocation, par un administrateur, d'une session nommée d'un tiers
   * (#6821) — distincte de `RESET_PASSWORD`, qui invalide TOUTES les
   * sessions comme effet de bord d'un autre geste.
   */
  REVOKE_SESSION = 'REVOKE_SESSION',

  /**
   * Écriture, par un administrateur, d'une catégorie de préférences d'un
   * tiers (#7845). La ligne porte la catégorie et les clés changées ; la
   * valeur avant/après de chaque clé voyage dans `changes`.
   */
  UPDATE_PREFERENCES = 'UPDATE_PREFERENCES'
}

/**
 * Log d'audit (type strictement)
 */
export interface UserAuditLog {
  id: string;
  userId: string;
  adminId: string;
  action: UserAuditAction;
  entity: 'User';
  entityId: string;
  changes: Record<string, AuditChange> | null;
  metadata: AuditMetadata | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * Detail d'un changement dans l'audit
 */
export interface AuditChange {
  before: unknown;
  after: unknown;
}

/**
 * Metadonnees d'audit
 */
export interface AuditMetadata {
  reason?: string;
  requestId?: string;
  [key: string]: unknown;
}
