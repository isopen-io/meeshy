/**
 * Types unifies pour les utilisateurs Meeshy
 * Harmonisation Gateway - Frontend
 */

import type { PaginationMeta } from './api-responses.js';

/**
 * Roles utilisateur
 */
export type UserRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'BIGBOSS' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'MEMBER';

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
  translateToSystemLanguage: boolean;
  translateToRegionalLanguage: boolean;
  useCustomDestination: boolean;
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
  role: string;
  isActive: boolean;
  isOnline: boolean;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  twoFactorEnabledAt: Date | null;
  lastActiveAt: Date;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string | null;
  autoTranslateEnabled: boolean;
  translateToSystemLanguage: boolean;
  translateToRegionalLanguage: boolean;
  useCustomDestination: boolean;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  profileCompletionRate: number | null;
  lastPasswordChange: Date | null;
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
  _count?: {
    sentMessages?: number;
    conversations?: number;
  };
}

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
  role: string;
  isActive: boolean;
  isOnline: boolean;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  lastActiveAt: Date;
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
  twoFactorEnabledAt: Date | null;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string | null;
  autoTranslateEnabled: boolean;
  translateToSystemLanguage: boolean;
  translateToRegionalLanguage: boolean;
  useCustomDestination: boolean;
  lastPasswordChange: Date | null;
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  _count?: {
    sentMessages?: number;
    conversations?: number;
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
  phoneNumber?: string | null;
  avatar?: string | null;
  systemLanguage?: string;
  regionalLanguage?: string;
  customDestinationLanguage?: string | null;
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
  role?: string;
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
  VERIFY_PHONE = 'VERIFY_PHONE'
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
