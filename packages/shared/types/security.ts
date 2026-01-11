/**
 * Types pour la sécurité et l'authentification
 * Alignés avec les modèles Prisma: PasswordResetToken, PasswordHistory, SecurityEvent, UserSession
 */

// =====================================================
// PASSWORD RESET TOKEN
// =====================================================

/**
 * Raison de révocation d'un token de réinitialisation
 */
export type PasswordResetRevokedReason =
  | 'MANUAL'
  | 'SUSPICIOUS_ACTIVITY'
  | 'PASSWORD_CHANGED'
  | 'NEW_REQUEST';

/**
 * Token de réinitialisation de mot de passe
 * Aligned with schema.prisma PasswordResetToken
 */
export interface PasswordResetToken {
  readonly id: string;
  readonly userId: string;

  /** SHA-256 hash du token (PAS le token lui-même) */
  readonly tokenHash: string;

  /** Date d'expiration (15 minutes après création) */
  readonly expiresAt: Date;

  /** Date d'utilisation (null si pas encore utilisé) */
  readonly usedAt?: Date;

  /** Si le token a été révoqué */
  readonly isRevoked: boolean;

  /** Raison de la révocation */
  readonly revokedReason?: PasswordResetRevokedReason;

  /** Métadonnées de la requête (pour détection d'anomalies) */
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly deviceFingerprint?: string;
  readonly geoLocation?: string; // "City, Country"
  readonly geoCoordinates?: string; // "lat,lon"

  readonly createdAt: Date;
}

/**
 * DTO pour créer une demande de réinitialisation
 */
export interface CreatePasswordResetRequest {
  readonly email: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly deviceFingerprint?: string;
}

/**
 * DTO pour réinitialiser le mot de passe
 */
export interface ResetPasswordRequest {
  readonly token: string;
  readonly newPassword: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Réponse de création de token de réinitialisation
 */
export interface PasswordResetResponse {
  readonly success: boolean;
  readonly message: string;
  readonly expiresAt?: Date;
}

// =====================================================
// PASSWORD HISTORY
// =====================================================

/**
 * Source du changement de mot de passe
 */
export type PasswordChangeSource =
  | 'RESET'
  | 'USER_CHANGE'
  | 'ADMIN_RESET'
  | 'FORCED_RESET';

/**
 * Historique des mots de passe (anti-réutilisation)
 * Aligned with schema.prisma PasswordHistory
 */
export interface PasswordHistory {
  readonly id: string;
  readonly userId: string;

  /** Hash bcrypt du mot de passe (cost=12) */
  readonly passwordHash: string;

  /** Source du changement */
  readonly changedVia: PasswordChangeSource;

  /** Métadonnées */
  readonly ipAddress?: string;
  readonly userAgent?: string;

  readonly createdAt: Date;
}

// =====================================================
// SECURITY EVENT
// =====================================================

/**
 * Types d'événements de sécurité
 */
export type SecurityEventType =
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_SUCCESS'
  | 'PASSWORD_RESET_FAILED'
  | 'PASSWORD_CHANGE'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED'
  | 'LOGOUT'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED'
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_DISABLED'
  | 'TWO_FACTOR_SUCCESS'
  | 'TWO_FACTOR_FAILED'
  | 'EMAIL_CHANGE'
  | 'PHONE_CHANGE'
  | 'SUSPICIOUS_ACTIVITY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'BRUTE_FORCE_DETECTED';

/**
 * Niveau de sévérité d'un événement
 */
export type SecurityEventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Statut d'un événement de sécurité
 */
export type SecurityEventStatus = 'SUCCESS' | 'FAILED' | 'BLOCKED';

/**
 * Événement de sécurité (journal d'audit)
 * Aligned with schema.prisma SecurityEvent
 */
export interface SecurityEvent {
  readonly id: string;
  readonly userId?: string; // Null pour les tentatives de connexion échouées

  /** Classification de l'événement */
  readonly eventType: SecurityEventType;
  readonly severity: SecurityEventSeverity;
  readonly status: SecurityEventStatus;

  /** Détails de l'événement */
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;

  /** Contexte de la requête */
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly deviceFingerprint?: string;
  readonly geoLocation?: string;

  readonly createdAt: Date;
}

/**
 * Filtres pour rechercher des événements de sécurité
 */
export interface SecurityEventFilters {
  readonly userId?: string;
  readonly eventType?: SecurityEventType;
  readonly severity?: SecurityEventSeverity;
  readonly status?: SecurityEventStatus;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly ipAddress?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * DTO pour créer un événement de sécurité
 */
export interface CreateSecurityEventDTO {
  readonly userId?: string;
  readonly eventType: SecurityEventType;
  readonly severity: SecurityEventSeverity;
  readonly status: SecurityEventStatus;
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly deviceFingerprint?: string;
  readonly geoLocation?: string;
}

// =====================================================
// USER SESSION
// =====================================================

/**
 * Type d'appareil
 */
export type SessionDeviceType = 'mobile' | 'tablet' | 'desktop' | 'smarttv';

/**
 * Raison d'invalidation d'une session
 */
export type SessionInvalidationReason =
  | 'LOGOUT'
  | 'PASSWORD_RESET'
  | 'USER_REVOKED'
  | 'ADMIN_ACTION'
  | 'EXPIRED'
  | 'SECURITY_BREACH';

/**
 * Session utilisateur pour le tableau de bord de sécurité
 * Aligned with schema.prisma UserSession
 */
export interface UserSession {
  readonly id: string;
  readonly userId: string;

  /** Données de session */
  readonly sessionToken: string; // Hash SHA-256 du JWT
  readonly refreshToken?: string; // Pour la rotation des refresh tokens

  /** Informations sur l'appareil (parsées depuis User-Agent) */
  readonly deviceType?: SessionDeviceType;
  readonly deviceVendor?: string; // Apple, Samsung, Huawei
  readonly deviceModel?: string; // iPhone, Galaxy S23, Pixel 8
  readonly osName?: string; // iOS, Android, Windows, macOS
  readonly osVersion?: string;
  readonly browserName?: string; // Safari, Chrome, Firefox
  readonly browserVersion?: string;
  readonly isMobile: boolean;
  readonly userAgent?: string; // Chaîne User-Agent brute

  /** Réseau & Localisation */
  readonly ipAddress?: string;
  readonly country?: string; // ISO 3166-1 alpha-2 (FR, US)
  readonly city?: string;
  readonly location?: string; // "Paris, France"
  readonly latitude?: number;
  readonly longitude?: number;
  readonly timezone?: string; // Fuseau horaire IANA

  /** Sécurité */
  readonly deviceFingerprint?: string;
  readonly isTrusted: boolean; // Appareil marqué comme de confiance
  readonly isCurrentSession: boolean; // Marqué pendant la réponse

  /** Cycle de vie */
  readonly expiresAt: Date;
  readonly isValid: boolean;
  readonly invalidatedAt?: Date;
  readonly invalidatedReason?: SessionInvalidationReason;

  readonly createdAt: Date;
  readonly lastActivityAt: Date;
}

/**
 * Session formatée pour l'affichage dans le tableau de bord
 */
export interface UserSessionDisplay {
  readonly id: string;
  readonly deviceLabel: string; // "iPhone 15 Pro - Safari"
  readonly location: string; // "Paris, France"
  readonly lastActive: string; // "Il y a 2 heures"
  readonly isCurrentSession: boolean;
  readonly isTrusted: boolean;
  readonly isMobile: boolean;
  readonly createdAt: Date;
}

/**
 * DTO pour créer une session
 */
export interface CreateUserSessionDTO {
  readonly userId: string;
  readonly sessionToken: string;
  readonly refreshToken?: string;
  readonly userAgent?: string;
  readonly ipAddress?: string;
  readonly deviceFingerprint?: string;
  readonly expiresAt: Date;
}

/**
 * DTO pour mettre à jour une session
 */
export interface UpdateUserSessionDTO {
  readonly lastActivityAt?: Date;
  readonly isTrusted?: boolean;
  readonly ipAddress?: string;
}

/**
 * DTO pour invalider une session
 */
export interface InvalidateSessionDTO {
  readonly reason: SessionInvalidationReason;
}

/**
 * Réponse listant les sessions
 */
export interface UserSessionsResponse {
  readonly sessions: readonly UserSessionDisplay[];
  readonly currentSessionId: string;
  readonly totalCount: number;
}

// =====================================================
// TYPE GUARDS
// =====================================================

/**
 * Vérifie si une session est expirée
 */
export function isSessionExpired(session: UserSession): boolean {
  return new Date() > session.expiresAt;
}

/**
 * Vérifie si une session est valide et non expirée
 */
export function isSessionActive(session: UserSession): boolean {
  return session.isValid && !isSessionExpired(session);
}

/**
 * Vérifie si un événement est critique
 */
export function isCriticalSecurityEvent(event: SecurityEvent): boolean {
  return event.severity === 'CRITICAL' || event.severity === 'HIGH';
}
