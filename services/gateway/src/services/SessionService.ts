/**
 * Session Service - Manages user sessions with device/location tracking
 * Provides security features like session listing, revocation, and cleanup
 *
 * Session Duration:
 * - Mobile apps (iOS/Android): 365 days (configurable via SESSION_EXPIRY_MOBILE_DAYS)
 * - Desktop browsers: 30 days (configurable via SESSION_EXPIRY_DESKTOP_DAYS)
 * - Trusted devices: Extended duration (configurable via SESSION_EXPIRY_TRUSTED_DAYS)
 */

import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SessionLoginMethod } from '@meeshy/shared/utils/client-session';
import { RequestContext } from './GeoIPService';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'SessionService' });

// Session configuration (configurable via environment variables)
const SESSION_EXPIRY_MOBILE_DAYS = parseInt(process.env.SESSION_EXPIRY_MOBILE_DAYS || '365'); // 1 year for mobile apps
const SESSION_EXPIRY_DESKTOP_DAYS = parseInt(process.env.SESSION_EXPIRY_DESKTOP_DAYS || '30'); // 30 days for browsers
const SESSION_EXPIRY_TRUSTED_DAYS = parseInt(process.env.SESSION_EXPIRY_TRUSTED_DAYS || '365'); // 1 year for trusted devices
const MAX_SESSIONS_PER_USER = parseInt(process.env.MAX_SESSIONS_PER_USER || '10');

// Module-level prisma reference (initialized via initSessionService)
let prisma: PrismaClient;

/**
 * MongoDB filter for active sessions (invalidatedAt is null or field doesn't exist)
 * In MongoDB, when a field is not included during creation, it doesn't exist in the document.
 * Querying with `invalidatedAt: null` will only match documents where the field is explicitly null,
 * not documents where the field is missing. This filter handles both cases.
 */
const ACTIVE_SESSION_FILTER = {
  OR: [
    { invalidatedAt: null },
    { invalidatedAt: { isSet: false } }
  ]
};

/**
 * Initialize the session service with a prisma client
 * Must be called before using any session functions
 */
export function initSessionService(prismaClient: PrismaClient): void {
  prisma = prismaClient;
}

/**
 * Get the prisma client (throws if not initialized)
 */
function getPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error('SessionService not initialized. Call initSessionService first.');
  }
  return prisma;
}

export interface SessionData {
  id: string;
  userId: string;
  deviceType: string | null;
  deviceVendor: string | null;
  deviceModel: string | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  isMobile: boolean;
  /** Ce que le client a déclaré (#9610) — `null` pour un client qui n'en dit rien. */
  appVersion: string | null;
  appBuild: string | null;
  platform: string | null;
  deviceName: string | null;
  /** Posé par le serveur à l'ouverture (#9610). */
  loginMethod: string | null;
  ipAddress: string | null;
  country: string | null;
  /** Approximative : tirée de l'adresse IP par la base locale (#9609). */
  city: string | null;
  location: string | null;
  timezone: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  isCurrentSession: boolean;
  isTrusted: boolean;
}

export interface CreateSessionInput {
  userId: string;
  token: string;
  requestContext: RequestContext;
  /** Le moyen par lequel la session s'ouvre (#9610) ; absent, il reste inconnu. */
  loginMethod?: SessionLoginMethod;
}

/**
 * Hash a token for secure storage
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Determine session expiry based on device type
 * Mobile apps get longer sessions (365 days), desktop browsers get 30 days
 *
 * User-Agent detection patterns:
 * - iOS App: "Meeshy-iOS/1.0.0" (set in APIClient.swift)
 * - Android App: "Meeshy-Android/1.0.0" (future)
 * - Web App: Standard browser User-Agent (Safari, Chrome, etc.)
 */
function getSessionExpiryDays(deviceInfo: RequestContext['deviceInfo']): number {
  const userAgent = deviceInfo?.rawUserAgent || '';

  // Check if it's a native mobile app (iOS/Android)
  // Pattern: "Meeshy-iOS/x.x.x" or "Meeshy-Android/x.x.x"
  const isMobileApp = /Meeshy-(iOS|Android)\/[\d.]+/.test(userAgent) ||
                      userAgent.includes('MeeshyApp') ||
                      (deviceInfo?.type === 'mobile' && !userAgent.includes('Safari') && !userAgent.includes('Chrome'));

  // Mobile apps get extended sessions
  if (isMobileApp) {
    logger.debug('Mobile app detected', { expiryDays: SESSION_EXPIRY_MOBILE_DAYS });
    return SESSION_EXPIRY_MOBILE_DAYS;
  }

  // Default for desktop/browser
  logger.debug('Desktop/browser session', { expiryDays: SESSION_EXPIRY_DESKTOP_DAYS });
  return SESSION_EXPIRY_DESKTOP_DAYS;
}

/**
 * Create a new session for a user
 */
export async function createSession(input: CreateSessionInput): Promise<SessionData> {
  const db = getPrisma();
  const { userId, token, requestContext } = input;
  const { ip, geoData, deviceInfo, client } = requestContext;

  // Hash the token for storage
  const sessionToken = hashToken(token);

  // Calculate expiry date based on device type
  const expiryDays = getSessionExpiryDays(deviceInfo);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  // Create the session
  const session = await db.userSession.create({
    data: {
      userId,
      sessionToken,
      expiresAt,
      // Device info
      deviceType: deviceInfo?.type || null,
      deviceVendor: deviceInfo?.vendor || null,
      deviceModel: deviceInfo?.model || null,
      osName: deviceInfo?.os || null,
      osVersion: deviceInfo?.osVersion || null,
      browserName: deviceInfo?.browser || null,
      browserVersion: deviceInfo?.browserVersion || null,
      isMobile: deviceInfo?.isMobile || false,
      userAgent: deviceInfo?.rawUserAgent || null,
      // Ce que le client déclare, et le moyen de connexion (#9610)
      appVersion: client?.appVersion ?? null,
      appBuild: client?.appBuild ?? null,
      platform: client?.platform ?? null,
      deviceName: client?.deviceName ?? null,
      loginMethod: input.loginMethod ?? null,
      // Geo info
      ipAddress: ip,
      country: geoData?.country || null,
      city: geoData?.city || null,
      location: geoData?.location || null,
      timezone: geoData?.timezone || null,
      // Flags
      isValid: true,
      isTrusted: false,
      isCurrentSession: true,
      lastActivityAt: new Date(),
    },
  });

  // Enforce session limit - remove oldest sessions if over limit
  await enforceSessionLimit(userId);

  return mapSessionToData(session, true);
}

/**
 * Validate a session token and update last activity
 */
export async function validateSession(token: string): Promise<SessionData | null> {
  const db = getPrisma();
  const sessionToken = hashToken(token);

  const session = await db.userSession.findFirst({
    where: {
      sessionToken,
      isValid: true,
      expiresAt: { gt: new Date() },
      ...ACTIVE_SESSION_FILTER,
    },
  });

  if (!session) {
    return null;
  }

  // Update last activity
  await db.userSession.update({
    where: { id: session.id },
    data: { lastActivityAt: new Date() },
  });

  return mapSessionToData(session, true);
}

/**
 * **La session courante — « cet appareil-ci » — se nomme de DEUX façons**
 * (#9606), et l'une suffit :
 *
 *  - `sessionId` : le claim `sid` du JWT VÉRIFIÉ (`UnifiedAuthContext.sessionId`).
 *    C'est la voie nominale : tout jeton d'un inscrit le porte depuis #4264, et
 *    la porte REST refuse ceux qui ne le portent pas.
 *  - `sessionToken` : l'en-tête `x-session-token`, en clair, haché ici. Gardé
 *    pour la rétrocompatibilité — aucun client inscrit ne l'envoie en REST,
 *    mais un client qui le ferait continue d'être compris.
 *
 * Quand les deux sont fournis et nomment deux sessions, les DEUX sont
 * « courantes » : le porteur détient les deux justificatifs, donc les deux
 * appareils. Une chaîne seule reste acceptée et vaut `{ sessionToken }` — la
 * forme d'avant, que des appelants passent encore.
 */
export type CurrentSessionRef = {
  readonly sessionId?: string | null;
  readonly sessionToken?: string | null;
};

type CurrentSessionClause = { readonly id: string } | { readonly sessionToken: string };

function currentSessionClauses(current: string | CurrentSessionRef | undefined): CurrentSessionClause[] {
  const ref: CurrentSessionRef = typeof current === 'string' ? { sessionToken: current } : current ?? {};
  const byId: CurrentSessionClause[] = ref.sessionId ? [{ id: ref.sessionId }] : [];
  const byToken: CurrentSessionClause[] = ref.sessionToken ? [{ sessionToken: hashToken(ref.sessionToken) }] : [];
  return [...byId, ...byToken];
}

function isNamedBy(session: { id: string; sessionToken: string }, clauses: readonly CurrentSessionClause[]): boolean {
  return clauses.some((clause) =>
    'id' in clause ? session.id === clause.id : session.sessionToken === clause.sessionToken
  );
}

/**
 * Get all active sessions for a user — `isCurrentSession` marks the session(s)
 * named by `current` (see {@link CurrentSessionRef}).
 */
export async function getUserSessions(
  userId: string,
  current?: string | CurrentSessionRef
): Promise<SessionData[]> {
  const db = getPrisma();
  const clauses = currentSessionClauses(current);

  const sessions = await db.userSession.findMany({
    where: {
      userId,
      isValid: true,
      ...ACTIVE_SESSION_FILTER,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastActivityAt: 'desc' },
  });

  return sessions.map((session) => mapSessionToData(session, isNamedBy(session, clauses)));
}

/**
 * Invalidate a specific session
 */
export async function invalidateSession(
  sessionId: string,
  reason: string = 'user_revoked'
): Promise<boolean> {
  const db = getPrisma();
  try {
    // Une session DÉJÀ close ne se réécrit pas (audit A2-5) : son motif
    // d'origine resterait écrasé, et un `invalidatedAt` relancé prolongerait sa
    // conservation. `false` : rien n'a été fermé.
    const { count } = await db.userSession.updateMany({
      where: { id: sessionId, isValid: true },
      data: {
        isValid: false,
        invalidatedAt: new Date(),
        invalidatedReason: reason,
      },
    });
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Invalidate all sessions for a user except the current one(s) — see
 * {@link CurrentSessionRef}. With NOTHING naming the current session, every
 * session is invalidated: that is the deliberate « sign out everywhere » of
 * `POST /auth/revoke-all-sessions` (the e-mail link), and the only safe
 * reading of an anonymous caller — keeping nothing alive that should not be.
 */
export async function invalidateAllSessions(
  userId: string,
  except?: string | CurrentSessionRef,
  reason: string = 'user_revoked_all'
): Promise<number> {
  const db = getPrisma();
  const clauses = currentSessionClauses(except);

  const result = await db.userSession.updateMany({
    where: {
      userId,
      isValid: true,
      ...(clauses.length > 0 ? { NOT: clauses } : {}),
    },
    data: {
      isValid: false,
      invalidatedAt: new Date(),
      invalidatedReason: reason,
    },
  });

  return result.count;
}

/**
 * Revoke a specific session by ID (user-initiated)
 */
export async function revokeSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const db = getPrisma();
  // Verify the session belongs to the user
  const session = await db.userSession.findFirst({
    where: {
      id: sessionId,
      userId,
      isValid: true,
    },
  });

  if (!session) {
    return false;
  }

  return invalidateSession(sessionId, 'user_revoked');
}

/**
 * Logout - invalidate the current session
 */
export async function logout(token: string): Promise<boolean> {
  const db = getPrisma();
  const sessionToken = hashToken(token);

  const result = await db.userSession.updateMany({
    where: {
      sessionToken,
      isValid: true,
    },
    data: {
      isValid: false,
      invalidatedAt: new Date(),
      invalidatedReason: 'logout',
    },
  });

  return result.count > 0;
}

/**
 * Close the CURRENT session(s) of a user — the ones named by `current` (#9606).
 * `POST /auth/logout` used to close only the session named by the
 * `x-session-token` header, which no signed-in client sends in REST: logging
 * out left the session valid. Scoped by `userId`, so a reference can never
 * close another account's session. Returns how many sessions were closed.
 */
export async function endCurrentSession(
  userId: string,
  current: CurrentSessionRef,
  reason: string = 'logout'
): Promise<number> {
  const clauses = currentSessionClauses(current);
  if (clauses.length === 0) return 0;

  const result = await getPrisma().userSession.updateMany({
    where: { userId, isValid: true, OR: clauses },
    data: {
      isValid: false,
      invalidatedAt: new Date(),
      invalidatedReason: reason,
    },
  });
  return result.count;
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const db = getPrisma();
  const result = await db.userSession.updateMany({
    where: {
      AND: [
        {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isValid: false },
          ],
        },
        ACTIVE_SESSION_FILTER,
      ],
    },
    data: {
      isValid: false,
      invalidatedAt: new Date(),
      invalidatedReason: 'expired',
    },
  });

  return result.count;
}

/**
 * Context for marking session as trusted (for audit logging)
 */
export interface MarkSessionTrustedContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  source?: 'magic_link' | '2fa_verification' | 'login' | 'admin';
}

/**
 * Log security event to database
 */
async function logSecurityEvent(
  db: PrismaClient,
  eventType: 'SESSION_TRUSTED' | 'SESSION_TRUSTED_FAILED',
  userId: string,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  status: 'SUCCESS' | 'FAILED',
  context?: MarkSessionTrustedContext,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.securityEvent.create({
      data: {
        userId,
        eventType,
        severity,
        status,
        description: `Session trust ${status === 'SUCCESS' ? 'enabled' : 'failed'} via ${context?.source || 'unknown'}`,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: context?.ipAddress || null,
        userAgent: context?.userAgent?.substring(0, 500) || null,
      }
    });
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    logger.error('Failed to log security event', error as Error);
  }
}

/**
 * Mark a session as trusted (e.g., after 2FA verification)
 * Trusted sessions get extended expiry (1 year by default)
 *
 * @param sessionId - The session ID to mark as trusted
 * @param context - Optional context for audit logging
 */
export async function markSessionTrusted(
  sessionId: string,
  context?: MarkSessionTrustedContext
): Promise<boolean> {
  const db = getPrisma();

  // Validate sessionId
  if (!sessionId || typeof sessionId !== 'string') {
    logger.error('markSessionTrusted: Invalid sessionId provided');
    return false;
  }

  try {
    // Verify session exists first
    const existingSession = await db.userSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, isTrusted: true, isValid: true }
    });

    if (!existingSession) {
      logger.error('markSessionTrusted: Session not found');
      return false;
    }

    if (!existingSession.isValid) {
      logger.warn('markSessionTrusted: Session is invalid');
      return false;
    }

    if (existingSession.isTrusted) {
      logger.debug('markSessionTrusted: Session already trusted');
      return true; // Already trusted, consider this a success
    }

    // Extend expiry for trusted sessions
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_EXPIRY_TRUSTED_DAYS);

    await db.userSession.update({
      where: { id: sessionId },
      data: {
        isTrusted: true,
        expiresAt: newExpiresAt
      },
    });

    // Log security event to database
    const userId = context?.userId || existingSession.userId;
    await logSecurityEvent(db, 'SESSION_TRUSTED', userId, 'LOW', 'SUCCESS', context, {
      sessionId,
      source: context?.source,
      expiresAt: newExpiresAt.toISOString(),
      trustedDays: SESSION_EXPIRY_TRUSTED_DAYS
    });

    logger.info(`Session marked trusted (${SESSION_EXPIRY_TRUSTED_DAYS} days)`);
    return true;

  } catch (error) {
    // Log failure to database
    const userId = context?.userId || 'unknown';
    await logSecurityEvent(db, 'SESSION_TRUSTED_FAILED', userId, 'MEDIUM', 'FAILED', context, {
      sessionId,
      source: context?.source,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    logger.error('markSessionTrusted failed', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Extend session expiry (useful for "remember me" or when user is active)
 * @param token - Session token
 * @param days - Number of days to extend (optional, uses device-appropriate default)
 */
export async function extendSessionExpiry(token: string, days?: number): Promise<boolean> {
  const db = getPrisma();
  const sessionToken = hashToken(token);

  try {
    // #5712 — sans `expiresAt`, une session morte depuis des mois (mesuré :
    // jusqu'à six mois en production, 140 lignes) se voyait PROLONGÉE et
    // redevenait active : `isValid` seul ne suffit pas, une session peut être
    // expirée sans jamais avoir été invalidée.
    const session = await db.userSession.findFirst({
      where: { sessionToken, isValid: true, expiresAt: { gt: new Date() } },
    });

    if (!session) return false;

    // Determine extension duration
    const extensionDays = days || (session.isMobile ? SESSION_EXPIRY_MOBILE_DAYS : SESSION_EXPIRY_DESKTOP_DAYS);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + extensionDays);

    await db.userSession.update({
      where: { id: session.id },
      data: {
        expiresAt: newExpiresAt,
        lastActivityAt: new Date()
      },
    });

    logger.debug(`Session extended by ${extensionDays} days`);
    return true;
  } catch {
    return false;
  }
}

// `rotateRefreshToken` (#3621) a été retiré : aucune route ne l'appelait, et
// `userSession.create` ci-dessus ne pose jamais `UserSession.refreshToken` —
// son `where: { refreshToken: refreshTokenHash }` ne pouvait donc JAMAIS
// matcher une ligne réelle. Le mécanisme de renouvellement effectivement
// utilisé est `POST /auth/refresh` (`routes/auth/magic-link.ts`), qui lie le
// JWT à sa session par le claim `sid` (`services/auth/session-jwt.ts`,
// #4213/#4264) plutôt que par un `refreshToken` séparé.

/**
 * Enforce maximum sessions per user
 */
async function enforceSessionLimit(userId: string): Promise<void> {
  const db = getPrisma();
  const sessions = await db.userSession.findMany({
    where: {
      userId,
      isValid: true,
      ...ACTIVE_SESSION_FILTER,
    },
    orderBy: { lastActivityAt: 'asc' },
  });

  if (sessions.length > MAX_SESSIONS_PER_USER) {
    const sessionsToRemove = sessions.slice(0, sessions.length - MAX_SESSIONS_PER_USER);

    for (const session of sessionsToRemove) {
      await invalidateSession(session.id, 'session_limit_exceeded');
    }
  }
}

/**
 * Map database session to SessionData
 */
function mapSessionToData(session: any, isCurrentSession: boolean): SessionData {
  return {
    id: session.id,
    userId: session.userId,
    deviceType: session.deviceType,
    deviceVendor: session.deviceVendor,
    deviceModel: session.deviceModel,
    osName: session.osName,
    osVersion: session.osVersion,
    browserName: session.browserName,
    browserVersion: session.browserVersion,
    isMobile: session.isMobile,
    appVersion: session.appVersion ?? null,
    appBuild: session.appBuild ?? null,
    platform: session.platform ?? null,
    deviceName: session.deviceName ?? null,
    loginMethod: session.loginMethod ?? null,
    ipAddress: session.ipAddress,
    country: session.country,
    city: session.city,
    location: session.location,
    timezone: session.timezone ?? null,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    isCurrentSession,
    isTrusted: session.isTrusted,
  };
}

/**
 * Get session configuration info (for debugging/admin)
 */
export function getSessionConfig(): {
  mobileDays: number;
  desktopDays: number;
  trustedDays: number;
  maxSessions: number;
} {
  return {
    mobileDays: SESSION_EXPIRY_MOBILE_DAYS,
    desktopDays: SESSION_EXPIRY_DESKTOP_DAYS,
    trustedDays: SESSION_EXPIRY_TRUSTED_DAYS,
    maxSessions: MAX_SESSIONS_PER_USER
  };
}
