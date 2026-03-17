import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantType, ParticipantPermissions } from '@meeshy/shared/types/participant';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import jwt from 'jsonwebtoken';
import { StatusService } from '../services/StatusService';
import { hashSessionToken } from '../utils/session-token';
import { PermissionDeniedError } from '../errors/custom-errors';
import { getRedisWrapper } from '../services/RedisWrapper';

const AUTH_USER_CACHE_TTL = 300; // 5 minutes

// ===== TYPES =====

export type RegisteredUser = {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly avatar?: string;
  readonly role: string;
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage?: string;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date;
  readonly emailVerifiedAt?: Date | null;
}

export type UnifiedAuthContext = {
  readonly type: ParticipantType;
  readonly isAuthenticated: boolean;
  readonly isAnonymous: boolean;

  readonly userId?: string;
  readonly jwtToken?: string;
  readonly sessionToken?: string;

  readonly participantId?: string;
  readonly participant?: unknown;

  readonly displayName: string;
  readonly userLanguage: string;
  readonly permissions?: ParticipantPermissions;
  readonly hasFullAccess: boolean;
  readonly canSendMessages: boolean;

  /** @deprecated Use userId + type checks instead */
  readonly registeredUser?: RegisteredUser;
  /** @deprecated Use participantId + permissions instead */
  readonly anonymousUser?: AnonymousUserCompat;
  /** @deprecated Use type checks instead */
  readonly jwtPayload?: unknown;
}

export type AnonymousUserCompat = {
  readonly id: string;
  readonly sessionToken: string;
  readonly username: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly language: string;
  readonly shareLinkId: string;
  readonly permissions: ParticipantPermissions;
}

export type UnifiedAuthRequest = FastifyRequest & {
  authContext: UnifiedAuthContext;
}

// ===== SERVICE =====

export class AuthMiddleware {
  constructor(
    private prisma: PrismaClient,
    private statusService?: StatusService
  ) {}

  async createAuthContext(
    authorizationHeader?: string,
    sessionToken?: string
  ): Promise<UnifiedAuthContext> {
    const jwtToken = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice(7)
      : null;

    if (jwtToken) {
      return this.createRegisteredUserContext(jwtToken, sessionToken);
    }

    if (sessionToken) {
      return this.createAnonymousUserContext(sessionToken);
    }

    return this.createUnauthenticatedContext();
  }

  private async createRegisteredUserContext(jwtToken: string, sessionToken?: string): Promise<UnifiedAuthContext> {
    try {
      let jwtPayload: Record<string, unknown>;
      let jwtExpired = false;

      try {
        jwtPayload = jwt.verify(jwtToken, process.env.JWT_SECRET!) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError && sessionToken) {
          jwtPayload = jwt.decode(jwtToken) as Record<string, unknown>;
          jwtExpired = true;
        } else {
          throw error;
        }
      }

      const jwtUserId = jwtPayload.userId as string;

      if (jwtExpired && sessionToken) {
        const hashedSessionToken = hashSessionToken(sessionToken);
        const trustedSession = await this.prisma.userSession.findFirst({
          where: {
            sessionToken: hashedSessionToken,
            userId: jwtUserId,
            isValid: true,
            isTrusted: true,
            expiresAt: { gt: new Date() }
          }
        });

        if (!trustedSession) {
          throw new Error('JWT expired and no valid trusted session found');
        }

        this.prisma.userSession.update({
          where: { id: trustedSession.id },
          data: { lastActivityAt: new Date() }
        }).catch(err => {
          console.warn('[UnifiedAuth] Failed to update trusted session lastActivityAt:', err);
        });
      }

      const cacheKey = `auth:user:${jwtUserId}`;
      const redis = getRedisWrapper();

      type UserRow = {
        id: string;
        username: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        displayName: string | null;
        avatar: string | null;
        role: string;
        systemLanguage: string;
        regionalLanguage: string;
        customDestinationLanguage: string | null;
        isOnline: boolean;
        lastActiveAt: string | Date;
        isActive: boolean;
        emailVerifiedAt: string | Date | null;
        createdAt: string | Date;
        updatedAt: string | Date;
      };

      let user: UserRow | null = null;

      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as UserRow;
          // Rehydrate Date fields that JSON.stringify serialized as ISO strings
          user = {
            ...parsed,
            lastActiveAt: new Date(parsed.lastActiveAt),
            emailVerifiedAt: parsed.emailVerifiedAt ? new Date(parsed.emailVerifiedAt) : null,
            createdAt: new Date(parsed.createdAt),
            updatedAt: new Date(parsed.updatedAt),
          };
        }
      } catch {
        // Redis unavailable or parse error — fall through to Prisma
        user = null;
      }

      if (!user) {
        user = await this.prisma.user.findUnique({
          where: { id: jwtUserId },
        }) as UserRow | null;

        if (user?.isActive) {
          try {
            await redis.set(cacheKey, JSON.stringify(user), AUTH_USER_CACHE_TTL);
          } catch {
            // Redis write failure is non-fatal
          }
        }
      }

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      if (this.statusService) {
        this.statusService.updateUserLastSeen(user.id);
        if (!user.isOnline) {
          this.statusService.ensureUserOnline(user.id, false);
        }
      }

      if (sessionToken && !jwtExpired) {
        const hashedSessionToken = hashSessionToken(sessionToken);
        this.prisma.userSession.update({
          where: { sessionToken: hashedSessionToken },
          data: { lastActivityAt: new Date() }
        }).catch(err => {
          console.warn('[UnifiedAuth] Failed to update trusted session lastActivityAt:', err);
        });
      }

      const userLanguage = resolveUserLanguage(user as any);

      return {
        type: 'user',
        isAuthenticated: true,
        isAnonymous: false,

        userId: user.id,
        jwtToken,
        sessionToken: sessionToken || undefined,

        displayName: user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username,
        userLanguage,
        hasFullAccess: true,
        canSendMessages: true,

        registeredUser: user as RegisteredUser,
        jwtPayload,
      };

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        console.warn('[UnifiedAuth] JWT expired:', new Date(error.expiredAt).toISOString());
      } else if (error instanceof jwt.JsonWebTokenError) {
        console.warn('[UnifiedAuth] JWT invalid:', error.message);
      } else {
        console.error('[UnifiedAuth] Unexpected JWT error:', error);
      }
      throw new Error('Invalid JWT token');
    }
  }

  private async createAnonymousUserContext(sessionToken: string): Promise<UnifiedAuthContext> {
    try {
      const tokenHash = hashSessionToken(sessionToken);

      const participant = await this.prisma.participant.findFirst({
        where: {
          sessionTokenHash: tokenHash,
          type: 'anonymous',
          isActive: true,
        },
        select: {
          id: true,
          conversationId: true,
          type: true,
          displayName: true,
          avatar: true,
          role: true,
          language: true,
          permissions: true,
          isActive: true,
          isOnline: true,
          lastActiveAt: true,
          nickname: true,
          anonymousSession: true,
        }
      });

      if (!participant) {
        throw new Error('Anonymous participant not found or inactive');
      }

      if (this.statusService) {
        this.statusService.updateAnonymousLastSeen(participant.id);
      }

      const profile = participant.anonymousSession?.profile;
      const rights = participant.anonymousSession?.rights;

      const resolvedPermissions: ParticipantPermissions = {
        canSendMessages: rights?.canSendMessages ?? participant.permissions.canSendMessages,
        canSendFiles: rights?.canSendFiles ?? participant.permissions.canSendFiles,
        canSendImages: rights?.canSendImages ?? participant.permissions.canSendImages,
        canSendVideos: rights?.canSendVideos ?? participant.permissions.canSendVideos,
        canSendAudios: rights?.canSendAudios ?? participant.permissions.canSendAudios,
        canSendLocations: rights?.canSendLocations ?? participant.permissions.canSendLocations,
        canSendLinks: rights?.canSendLinks ?? participant.permissions.canSendLinks,
      };

      const displayName = participant.nickname
        || (profile?.firstName && profile?.lastName
          ? `${profile.firstName} ${profile.lastName}`.trim()
          : profile?.username ?? participant.displayName);

      const anonymousCompat: AnonymousUserCompat = {
        id: participant.id,
        sessionToken,
        username: profile?.username ?? participant.displayName,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        language: participant.language,
        shareLinkId: participant.anonymousSession?.shareLinkId ?? '',
        permissions: resolvedPermissions,
      };

      return {
        type: 'anonymous',
        isAuthenticated: true,
        isAnonymous: true,

        sessionToken,
        participantId: participant.id,
        participant,

        displayName,
        userLanguage: participant.language,
        permissions: resolvedPermissions,
        hasFullAccess: false,
        canSendMessages: resolvedPermissions.canSendMessages,

        userId: participant.id,
        anonymousUser: anonymousCompat,
      };

    } catch (error) {
      console.warn('[UnifiedAuth] Invalid session token or inactive participant');
      throw new Error('Invalid session token');
    }
  }

  private createUnauthenticatedContext(): UnifiedAuthContext {
    return {
      type: 'anonymous',
      isAuthenticated: false,
      isAnonymous: true,

      userLanguage: 'fr',
      displayName: 'Visiteur',
      userId: 'anonymous',

      canSendMessages: false,
      hasFullAccess: false
    };
  }
}

// ===== MIDDLEWARE FASTIFY =====

export function createUnifiedAuthMiddleware(
  prisma: PrismaClient,
  options: {
    requireAuth?: boolean;
    allowAnonymous?: boolean;
    statusService?: StatusService;
  } = {}
) {
  const authMiddleware = new AuthMiddleware(prisma, options.statusService);

  return async function unifiedAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const authContext = await authMiddleware.createAuthContext(
        request.headers.authorization,
        request.headers['x-session-token'] as string
      );

      if (options.requireAuth && !authContext.isAuthenticated) {
        return reply.status(401).send({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!options.allowAnonymous && authContext.isAnonymous && authContext.type !== 'user') {
        return reply.status(403).send({
          error: 'Registered user required',
          code: 'REGISTERED_USER_REQUIRED'
        });
      }

      (request as UnifiedAuthRequest).authContext = authContext;

      // Legacy compat: dynamic property assignment on typed Fastify request requires `any`
      try {
        const req = request as unknown as Record<string, unknown>;
        req.user = req.user || {};
        if (authContext.isAuthenticated && authContext.userId) {
          const reqUser = req.user as Record<string, unknown>;
          reqUser.userId = authContext.userId;
          reqUser.username = authContext.displayName || (authContext.registeredUser && authContext.registeredUser.username);
          reqUser.isAnonymous = !!authContext.isAnonymous;
        } else {
          const reqUser = req.user as Record<string, unknown>;
          reqUser.userId = reqUser.userId || null;
        }
      } catch (e) {
        console.error('[UnifiedAuth] Failed to attach legacy request.user:', e);
      }

      try {
        const req = request as unknown as Record<string, unknown>;
        req.auth = {
          userId: authContext.userId,
          isAuthenticated: authContext.isAuthenticated,
          isAnonymous: authContext.isAnonymous
        };
      } catch (e) {
        console.error('[UnifiedAuth] Failed to attach request.auth:', e);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      console.warn('[UnifiedAuth] Auth failure:', errorMessage);

      if (options.requireAuth) {
        return reply.status(401).send({
          error: errorMessage,
          code: 'AUTH_FAILED'
        });
      }

      const fallbackMiddleware = new AuthMiddleware(prisma);
      (request as UnifiedAuthRequest).authContext = await fallbackMiddleware.createAuthContext();
    }
  };
}

// ===== HELPER FUNCTIONS =====

export function isRegisteredUser(authContext: UnifiedAuthContext): boolean {
  return authContext.type === 'user' && !authContext.isAnonymous;
}

export function isAnonymousUser(authContext: UnifiedAuthContext): boolean {
  return authContext.type === 'anonymous' && authContext.isAnonymous && authContext.isAuthenticated;
}

export function getUserPermissions(authContext: UnifiedAuthContext) {
  if (isRegisteredUser(authContext)) {
    return {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
      hasFullAccess: true
    };
  }

  if (authContext.permissions) {
    return {
      ...authContext.permissions,
      hasFullAccess: false
    };
  }

  if (isAnonymousUser(authContext) && authContext.anonymousUser) {
    return {
      ...authContext.anonymousUser.permissions,
      hasFullAccess: false
    };
  }

  return {
    canSendMessages: false,
    canSendFiles: false,
    canSendImages: false,
    canSendVideos: false,
    canSendAudios: false,
    canSendLocations: false,
    canSendLinks: false,
    hasFullAccess: false
  };
}

// ===== LEGACY COMPATIBILITY =====

/** @deprecated Use createUnifiedAuthMiddleware */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  console.warn('[AUTH] authenticate() is deprecated, use createUnifiedAuthMiddleware instead');

  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No authorization header');
    }

    const token = authHeader.substring(7);

    if (process.env.NODE_ENV === 'development') {
      const { AuthService } = await import('../services/AuthTestService');
      const decoded = AuthService.verifyToken(token);

      if (decoded) {
        const user = AuthService.getUserById(decoded.userId);
        if (user) {
          const req = request as unknown as Record<string, unknown>;
          req.user = {
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role
          };
          return;
        }
      }
    }

    await request.jwtVerify();

    const reqUser = request.user as Record<string, unknown>;
    const { userId } = reqUser;
    if (!userId) {
      throw new Error('Invalid token payload: missing userId');
    }
    reqUser.id = userId;

  } catch (error) {
    console.error('Authentication failed:', error);
    reply.code(401).send({
      success: false,
      message: 'Token invalide ou manquant'
    });
  }
}

/** @deprecated Use getUserPermissions */
export function requireRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;

      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        throw new PermissionDeniedError('Authentication required');
      }

      if (!roles.includes(authContext.registeredUser.role)) {
        throw new PermissionDeniedError('Insufficient role');
      }
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        reply.code(403).send({ success: false, error: { code: error.code, message: error.message } });
        return;
      }
      reply.code(403).send({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Insufficient permissions' } });
    }
  };
}

export const requireAdmin = requireRole(['BIGBOSS', 'ADMIN']);
export const requireModerator = requireRole(['BIGBOSS', 'ADMIN', 'MODERATOR']);
export const requireAnalyst = requireRole(['BIGBOSS', 'ADMIN', 'ANALYST']);

export async function requireEmailVerification(request: FastifyRequest, reply: FastifyReply) {
  const authContext = (request as UnifiedAuthRequest).authContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    reply.code(403).send({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Authentication required' } });
    return;
  }

  if (!authContext.registeredUser.emailVerifiedAt) {
    reply.code(403).send({ success: false, error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email verification required' } });
  }
}

export async function requireActiveAccount(_request: FastifyRequest, _reply: FastifyReply) {
}
