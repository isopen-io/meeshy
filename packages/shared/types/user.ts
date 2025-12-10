/**
 * Types unifiés pour les utilisateurs Meeshy
 * Harmonisation Gateway ↔ Frontend
 */

/**
 * Rôles utilisateur
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
 * DÉPRÉCIÉ : L'interface User a été supprimée
 * Utilisez SocketIOUser depuis socketio-events.ts à la place
 * @deprecated Utilisez SocketIOUser pour éviter la redondance
 */

/**
 * Alias pour SocketIOUser - Type principal recommandé
 * Utilisez ce type pour tous les nouveaux développements
 */
export type { SocketIOUser as UserUnified, SocketIOUser as User } from './socketio-events';

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
 * Préférences utilisateur
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
 * Type strict pour les données utilisateur complètes (BACKEND ONLY)
 * Ne doit JAMAIS être exposé directement via l'API
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
  lastSeen: Date;
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
 * Type pour les données publiques (visibles par tous les admins)
 * Exclut les données sensibles
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
  lastSeen: Date;
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
 * Type pour les données sensibles (BIGBOSS & ADMIN uniquement)
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
 * Type pour les données masquées (MODO, AUDIT)
 * Comme PublicUser mais avec email/phone masqués
 */
export interface MaskedUser extends PublicUser {
  email: string;  // Format: j***@domain.com
  phoneNumber: string | null;  // Format: +33 6** ** ** **
}

/**
 * Type union pour les réponses API selon le rôle
 */
export type UserResponse = PublicUser | AdminUser | MaskedUser;

/**
 * DTO pour mise à jour profil
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
 * DTO pour création utilisateur
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
 * DTO pour changement de rôle (BIGBOSS & ADMIN uniquement)
 */
export interface UpdateRoleDTO {
  role: string;
  reason?: string;  // Raison du changement (pour audit)
}

/**
 * DTO pour activation/désactivation
 */
export interface UpdateStatusDTO {
  isActive: boolean;
  reason?: string;  // Raison (pour audit)
}

/**
 * DTO pour réinitialisation mot de passe
 */
export interface ResetPasswordDTO {
  newPassword: string;
  sendEmail: boolean;  // Envoyer email de notification
}

/**
 * Filtres de recherche utilisateurs
 */
export interface UserFilters {
  search?: string;  // username, email, nom, prénom
  role?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  twoFactorEnabled?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  lastSeenAfter?: Date;
  lastSeenBefore?: Date;
  sortBy?: 'createdAt' | 'lastSeen' | 'username' | 'email' | 'firstName' | 'lastName';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Pagination
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Métadonnées de pagination pour utilisateurs
 */
export interface UserPaginationMeta {
  page: number;
  pageSize: number;
  totalUsers: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Réponse paginée
 */
export interface PaginatedUsersResponse<T = UserResponse> {
  users: T[];
  pagination: UserPaginationMeta;
}

/**
 * Actions d'audit
 */
export enum UserAuditAction {
  // Actions de lecture
  VIEW_USER = 'VIEW_USER',
  VIEW_USER_LIST = 'VIEW_USER_LIST',
  VIEW_AUDIT_LOG = 'VIEW_AUDIT_LOG',

  // Actions de création/modification
  CREATE_USER = 'CREATE_USER',
  UPDATE_PROFILE = 'UPDATE_PROFILE',
  UPDATE_EMAIL = 'UPDATE_EMAIL',
  UPDATE_PHONE = 'UPDATE_PHONE',
  UPDATE_ROLE = 'UPDATE_ROLE',
  UPDATE_STATUS = 'UPDATE_STATUS',

  // Actions de sécurité
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

  // Actions de vérification
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  VERIFY_PHONE = 'VERIFY_PHONE'
}

/**
 * Log d'audit (typé strictement)
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
 * Détail d'un changement dans l'audit
 */
export interface AuditChange {
  before: unknown;
  after: unknown;
}

/**
 * Métadonnées d'audit
 */
export interface AuditMetadata {
  reason?: string;
  requestId?: string;
  [key: string]: unknown;
}
