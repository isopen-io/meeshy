/**
 * Magic Link Authentication Types
 *
 * Passwordless authentication via email link.
 * Security: 1-minute expiry, single-use tokens, device/location tracking.
 */

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to send a magic link to user's email
 */
export interface MagicLinkRequestBody {
  /** User's email address */
  readonly email: string;
  /** Optional device fingerprint for additional security */
  readonly deviceFingerprint?: string;
}

/**
 * Response after requesting a magic link
 * Always returns success to prevent email enumeration
 */
export interface MagicLinkRequestResponse {
  readonly success: boolean;
  /** Generic message (same for success/failure to prevent enumeration) */
  readonly message: string;
}

/**
 * Request to validate a magic link token
 */
export interface MagicLinkValidateBody {
  /** The token from the magic link URL */
  readonly token: string;
}

/**
 * Query parameters for magic link validation (GET request)
 */
export interface MagicLinkValidateQuery {
  /** The token from the magic link URL */
  readonly token: string;
}

/**
 * Successful magic link validation response
 */
export interface MagicLinkValidateSuccessResponse {
  readonly success: true;
  /** The authenticated user */
  readonly user: MagicLinkUser;
  /** JWT token for API authentication */
  readonly token: string;
  /** Session token for session management */
  readonly sessionToken: string;
  /** Session details */
  readonly session: MagicLinkSession;
}

/**
 * Failed magic link validation response
 */
export interface MagicLinkValidateErrorResponse {
  readonly success: false;
  /** Error message */
  readonly error: string;
}

/**
 * Union type for validation response
 */
export type MagicLinkValidateResponse =
  | MagicLinkValidateSuccessResponse
  | MagicLinkValidateErrorResponse;

// ============================================================================
// USER & SESSION TYPES
// ============================================================================

/**
 * User data returned after magic link authentication
 */
export interface MagicLinkUser {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phoneNumber: string | null;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatar: string | null;
  readonly role: string;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date;
  readonly systemLanguage: string;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
  readonly autoTranslateEnabled: boolean;
  readonly translateToSystemLanguage: boolean;
  readonly translateToRegionalLanguage: boolean;
  readonly useCustomDestination: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
  readonly twoFactorEnabledAt: Date | null;
}

/**
 * Session data returned after magic link authentication
 */
export interface MagicLinkSession {
  readonly id: string;
  readonly userId: string;
  readonly deviceType: string | null;
  readonly deviceVendor: string | null;
  readonly deviceModel: string | null;
  readonly osName: string | null;
  readonly osVersion: string | null;
  readonly browserName: string | null;
  readonly browserVersion: string | null;
  readonly isMobile: boolean;
  readonly ipAddress: string | null;
  readonly country: string | null;
  readonly city: string | null;
  readonly location: string | null;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  readonly isCurrentSession: boolean;
  readonly isTrusted: boolean;
}

// ============================================================================
// TOKEN TYPES (for internal use)
// ============================================================================

/**
 * Magic link token stored in database
 */
export interface MagicLinkToken {
  readonly id: string;
  readonly userId: string;
  /** SHA-256 hash of the token */
  readonly tokenHash: string;
  /** Token expiry (1 minute from creation) */
  readonly expiresAt: Date;
  /** When the token was used (null if unused) */
  readonly usedAt: Date | null;
  /** Whether the token was revoked */
  readonly isRevoked: boolean;
  /** Reason for revocation (if revoked) */
  readonly revokedReason: string | null;
  /** IP address of the request */
  readonly ipAddress: string | null;
  /** User agent string */
  readonly userAgent: string | null;
  /** Device fingerprint (optional) */
  readonly deviceFingerprint: string | null;
  /** Geolocation (e.g., "Paris, France") */
  readonly geoLocation: string | null;
  /** Coordinates (e.g., "48.8566,2.3522") */
  readonly geoCoordinates: string | null;
  readonly createdAt: Date;
}

// ============================================================================
// SECURITY EVENT TYPES
// ============================================================================

/**
 * Security events related to magic link authentication
 */
export type MagicLinkSecurityEventType =
  | 'MAGIC_LINK_REQUESTED'
  | 'MAGIC_LINK_LOGIN_SUCCESS'
  | 'MAGIC_LINK_REUSE_ATTEMPT'
  | 'MAGIC_LINK_EXPIRED'
  | 'MAGIC_LINK_INVALID';

/**
 * Security event severity levels
 */
export type MagicLinkSecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
