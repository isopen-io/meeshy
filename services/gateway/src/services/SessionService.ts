/**
 * Session Service - Manages user sessions with device/location tracking
 * Provides security features like session listing, revocation, and cleanup
 */

import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { RequestContext } from './GeoIPService';

// Session configuration
const SESSION_EXPIRY_DAYS = 30;
const MAX_SESSIONS_PER_USER = 10;

// Module-level prisma reference (initialized via initSessionService)
let prisma: PrismaClient;

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
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  location: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  isCurrentSession: boolean;
  isTrusted: boolean;
}

export interface CreateSessionInput {
  userId: string;
  token: string;
  requestContext: RequestContext;
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
 * Create a new session for a user
 */
export async function createSession(input: CreateSessionInput): Promise<SessionData> {
  const db = getPrisma();
  const { userId, token, requestContext } = input;
  const { ip, geoData, deviceInfo } = requestContext;

  // Hash the token for storage
  const sessionToken = hashToken(token);

  // Calculate expiry date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

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
      // Geo info
      ipAddress: ip,
      country: geoData?.country || null,
      city: geoData?.city || null,
      location: geoData?.location || null,
      latitude: geoData?.latitude || null,
      longitude: geoData?.longitude || null,
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
      invalidatedAt: null,
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
 * Get all active sessions for a user
 */
export async function getUserSessions(
  userId: string,
  currentToken?: string
): Promise<SessionData[]> {
  const db = getPrisma();
  const currentTokenHash = currentToken ? hashToken(currentToken) : null;

  const sessions = await db.userSession.findMany({
    where: {
      userId,
      isValid: true,
      invalidatedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastActivityAt: 'desc' },
  });

  return sessions.map((session) =>
    mapSessionToData(session, session.sessionToken === currentTokenHash)
  );
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
    await db.userSession.update({
      where: { id: sessionId },
      data: {
        isValid: false,
        invalidatedAt: new Date(),
        invalidatedReason: reason,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Invalidate all sessions for a user except the current one
 */
export async function invalidateAllSessions(
  userId: string,
  exceptToken?: string,
  reason: string = 'user_revoked_all'
): Promise<number> {
  const db = getPrisma();
  const exceptTokenHash = exceptToken ? hashToken(exceptToken) : null;

  const result = await db.userSession.updateMany({
    where: {
      userId,
      isValid: true,
      ...(exceptTokenHash ? { sessionToken: { not: exceptTokenHash } } : {}),
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
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const db = getPrisma();
  const result = await db.userSession.updateMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { isValid: false },
      ],
      invalidatedAt: null,
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
 * Mark a session as trusted (e.g., after 2FA verification)
 */
export async function markSessionTrusted(sessionId: string): Promise<boolean> {
  const db = getPrisma();
  try {
    await db.userSession.update({
      where: { id: sessionId },
      data: { isTrusted: true },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Enforce maximum sessions per user
 */
async function enforceSessionLimit(userId: string): Promise<void> {
  const db = getPrisma();
  const sessions = await db.userSession.findMany({
    where: {
      userId,
      isValid: true,
      invalidatedAt: null,
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
    ipAddress: session.ipAddress,
    country: session.country,
    city: session.city,
    location: session.location,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    isCurrentSession,
    isTrusted: session.isTrusted,
  };
}

/**
 * SessionService class wrapper (for dependency injection)
 */
export class SessionService {
  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      initSessionService(prismaClient);
    }
  }

  async create(input: CreateSessionInput): Promise<SessionData> {
    return createSession(input);
  }

  async validate(token: string): Promise<SessionData | null> {
    return validateSession(token);
  }

  async getUserSessions(userId: string, currentToken?: string): Promise<SessionData[]> {
    return getUserSessions(userId, currentToken);
  }

  async invalidate(sessionId: string, reason?: string): Promise<boolean> {
    return invalidateSession(sessionId, reason);
  }

  async invalidateAll(userId: string, exceptToken?: string, reason?: string): Promise<number> {
    return invalidateAllSessions(userId, exceptToken, reason);
  }

  async revoke(userId: string, sessionId: string): Promise<boolean> {
    return revokeSession(userId, sessionId);
  }

  async logout(token: string): Promise<boolean> {
    return logout(token);
  }

  async cleanup(): Promise<number> {
    return cleanupExpiredSessions();
  }

  async markTrusted(sessionId: string): Promise<boolean> {
    return markSessionTrusted(sessionId);
  }

  generateToken(): string {
    return generateSessionToken();
  }
}
