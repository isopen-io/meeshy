import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantType, ParticipantPermissions } from '@meeshy/shared/types/participant';
import { resolveParticipantRights } from '../services/participantRights';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { StatusService } from '../services/StatusService';
import { hashSessionToken } from '../utils/session-token';
import { PermissionDeniedError } from '../errors/custom-errors';
import { getCacheStore } from '../services/CacheStore';
import { enhancedLogger } from '../utils/logger-enhanced';

const authLogger = enhancedLogger.child({ module: 'auth' });

// Reduced from 300s: role/language changes propagate within 60s now.
// Invalidated explicitly on profile updates via cache.del(`auth:user:{userId}`).
const AUTH_USER_CACHE_TTL = 60; // 1 minute
// JWT verification result cached for 55s (slightly shorter than user cache)
const JWT_VERIFY_CACHE_TTL = 55;
const expiredJwtLoggedTokens = new Map<string, number>(); // token prefix -> last log timestamp
const EXPIRED_JWT_LOG_INTERVAL = 60_000; // Log same expired token at most once per minute

// ===== TYPES =====

export type RegisteredUser = {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly bio?: string;
  readonly avatar?: string;
  readonly banner?: string;
  readonly phoneNumber?: string;
  readonly role: string;
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage?: string;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date;
  readonly emailVerifiedAt?: Date | null;
  readonly profileCompletionRate?: number;
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

// ===== REPLI PAR SESSION DE CONFIANCE =====

/**
 * Retrouve une session de confiance ACTIVE, liée au MÊME `userId`, pour ce
 * jeton de session — politique UNIQUE partagée par tout appelant qui a
 * besoin d'identifier « quelle session de confiance appuie ce jeton de
 * session » (aujourd'hui : `POST /refresh`, `routes/auth/magic-link.ts`,
 * pour glisser la fenêtre d'expiration de la session — cf. sa propre
 * documentation).
 *
 * task-1-fix-round-6 (décision du propriétaire, après clarification d'une
 * mauvaise lecture au round 5) : « une forme de connexion à la fois »,
 * jamais « une application à la fois » — être connecté depuis plusieurs
 * applications (web + iOS + Android) à la fois est un usage EXPLICITEMENT
 * légitime. Le round 5 avait ajouté ici une comparaison d'application
 * (`classifyApplicationSignal`) qui pénalisait cet usage sans jamais rien
 * protéger — une revue adverse a démontré, par exécution, qu'elle reposait
 * sur un `User-Agent` librement falsifiable. Retirée : cette fonction ne
 * discrimine plus JAMAIS sur `userAgent`/`browserName`.
 *
 * Ce que cette fonction NE fait PLUS (round 6, cf. `middleware/auth.ts`
 * `createRegisteredUserContext` et `routes/uploads/tus-handler.ts`) : servir
 * de rattrapage d'un ÉCHEC de vérification de jeton d'authentification (JWT
 * expiré ou à signature invalide). Le propriétaire a explicitement écarté ce
 * mélange de deux FORMES de justificatif — un jeton d'authentification et un
 * jeton de session ne se substituent plus l'un à l'autre nulle part, y
 * compris pour un jeton expiré. Un jeton forgé (signature invalide) reste,
 * comme avant, refusé sans aucun recours — la confiance vient exclusivement
 * de la session, jamais du JWT, mais la session elle-même ne rattrape plus
 * rien : voir `routes/auth/magic-link.ts` (`POST /refresh`) pour l'unique
 * endroit où l'expiration d'un JWT authentique reste tolérée — par le JWT
 * lui-même (`ignoreExpiration`), jamais par un repli de session.
 */
export async function findTrustedSession(
  prisma: Pick<PrismaClient, 'userSession'>,
  params: { userId: string; sessionToken: string }
): Promise<{ id: string } | null> {
  const hashedSessionToken = hashSessionToken(params.sessionToken);
  return prisma.userSession.findFirst({
    where: {
      sessionToken: hashedSessionToken,
      userId: params.userId,
      isValid: true,
      isTrusted: true,
      expiresAt: { gt: new Date() },
    },
  });
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

  private async createRegisteredUserContext(
    jwtToken: string,
    sessionToken?: string
  ): Promise<UnifiedAuthContext> {
    try {
      // task-1-fix-round-6 — AVANT : un `jwt.TokenExpiredError` accompagné
      // d'un `sessionToken` retombait sur `jwt.decode` (non vérifié) puis
      // sur `findTrustedSession` pour rattraper l'expiration. Le propriétaire
      // a explicitement écarté ce mélange de DEUX FORMES de justificatif —
      // un jeton d'authentification expiré est désormais refusé ici sans
      // aucun recours, quelle que soit la session de confiance présentée.
      // Cette tolérance n'existe plus QUE sur `POST /refresh`
      // (`routes/auth/magic-link.ts`), la route dont c'est la raison d'être.
      let jwtPayload: Record<string, unknown>;

      // Cache JWT verification result to avoid repeated HMAC-SHA256 per request
      const tokenHash = crypto.createHash('sha256').update(jwtToken).digest('hex');
      const jwtCacheKey = `jwt:v:${tokenHash}`;
      const cache = getCacheStore();
      let cachedPayload: Record<string, unknown> | null = null;
      try {
        const raw = await cache.get(jwtCacheKey);
        if (raw) cachedPayload = JSON.parse(raw) as Record<string, unknown>;
      } catch { /* cache miss — proceed to verify */ }

      if (cachedPayload) {
        jwtPayload = cachedPayload;
      } else {
        jwtPayload = jwt.verify(jwtToken, process.env.JWT_SECRET!) as Record<string, unknown>;
        try {
          await cache.set(jwtCacheKey, JSON.stringify(jwtPayload), JWT_VERIFY_CACHE_TTL);
        } catch { /* non-fatal */ }
      }

      const jwtUserId = jwtPayload.userId as string;

      const cacheKey = `auth:user:${jwtUserId}`;

      type CachedUserRow = {
        id: string;
        username: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        displayName: string | null;
        bio: string | null;
        avatar: string | null;
        banner: string | null;
        phoneNumber: string | null;
        role: string;
        isActive: boolean;
        systemLanguage: string;
        regionalLanguage: string;
        customDestinationLanguage: string | null;
        isOnline: boolean;
        lastActiveAt: string;
        emailVerifiedAt: string | null;
        createdAt: string;
        updatedAt: string;
        deviceLocale: string | null;
        profileCompletionRate: number | null;
      };

      type FullUserRow = Omit<CachedUserRow, 'lastActiveAt' | 'emailVerifiedAt' | 'createdAt' | 'updatedAt'> & {
        lastActiveAt: Date;
        emailVerifiedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
      };

      const deserializeCachedUser = (cached: CachedUserRow): FullUserRow => ({
        ...cached,
        lastActiveAt: new Date(cached.lastActiveAt),
        emailVerifiedAt: cached.emailVerifiedAt ? new Date(cached.emailVerifiedAt) : null,
        createdAt: new Date(cached.createdAt),
        updatedAt: new Date(cached.updatedAt),
      });

      let cachedRow: CachedUserRow | null = null;

      try {
        const raw = await cache.get(cacheKey);
        if (raw) {
          cachedRow = JSON.parse(raw) as CachedUserRow;
        }
      } catch {
        // Redis unavailable or parse error — fall through to Prisma
      }

      let user: FullUserRow | null = null;

      if (cachedRow) {
        if (!cachedRow.isActive) {
          throw new Error('User not found or inactive');
        }
        user = deserializeCachedUser(cachedRow);
      }

      if (!user) {
        const prismaUser = await this.prisma.user.findUnique({
          where: { id: jwtUserId },
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
            displayName: true,
            bio: true,
            avatar: true,
            banner: true,
            phoneNumber: true,
            role: true,
            systemLanguage: true,
            regionalLanguage: true,
            customDestinationLanguage: true,
            isOnline: true,
            lastActiveAt: true,
            isActive: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
            deviceLocale: true,
            profileCompletionRate: true,
          },
        }) as FullUserRow | null;

        user = prismaUser;

        if (user?.isActive) {
          const toCache: CachedUserRow = {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            bio: user.bio,
            avatar: user.avatar,
            banner: user.banner,
            phoneNumber: user.phoneNumber,
            role: user.role,
            isActive: user.isActive,
            systemLanguage: user.systemLanguage,
            regionalLanguage: user.regionalLanguage,
            customDestinationLanguage: user.customDestinationLanguage,
            isOnline: user.isOnline,
            lastActiveAt: user.lastActiveAt.toISOString(),
            emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            deviceLocale: user.deviceLocale,
            profileCompletionRate: user.profileCompletionRate,
          };
          try {
            await cache.set(cacheKey, JSON.stringify(toCache), AUTH_USER_CACHE_TTL);
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

      // round 6 — plus de concept de « JWT expiré mais accepté » à ce niveau
      // (il aurait déjà levé plus haut) : dès qu'on atteint ce point, le JWT
      // est valide et non expiré. Bookkeeping pur, ne décide jamais rien.
      if (sessionToken) {
        const hashedSessionToken = hashSessionToken(sessionToken);
        this.prisma.userSession.update({
          where: { sessionToken: hashedSessionToken },
          data: { lastActivityAt: new Date() }
        }).catch(err => {
          authLogger.warn('Failed to update trusted session lastActivityAt (anon)', { err });
        });
      }

      const userLanguage = resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined });

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
        const tokenPrefix = jwtToken.slice(-8);
        const now = Date.now();
        const lastLogged = expiredJwtLoggedTokens.get(tokenPrefix) ?? 0;
        if (now - lastLogged > EXPIRED_JWT_LOG_INTERVAL) {
          authLogger.warn('JWT expired', { expiredAt: new Date(error.expiredAt).toISOString() });
          expiredJwtLoggedTokens.set(tokenPrefix, now);
          if (expiredJwtLoggedTokens.size > 100) {
            for (const [key, ts] of expiredJwtLoggedTokens) {
              if (now - ts > EXPIRED_JWT_LOG_INTERVAL * 10) expiredJwtLoggedTokens.delete(key);
            }
          }
        }
      } else if (error instanceof jwt.JsonWebTokenError) {
        authLogger.warn('JWT invalid', { message: error.message });
      } else {
        authLogger.error('Unexpected JWT error', { error });
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

      const resolvedPermissions: ParticipantPermissions = resolveParticipantRights(participant);

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
      authLogger.warn('Invalid session token or inactive participant');
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
        authLogger.error('Failed to attach legacy request.user', { e });
      }

      try {
        const req = request as unknown as Record<string, unknown>;
        req.auth = {
          userId: authContext.userId,
          isAuthenticated: authContext.isAuthenticated,
          isAnonymous: authContext.isAnonymous
        };
      } catch (e) {
        authLogger.error('Failed to attach request.auth', { e });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      authLogger.warn('Auth failure', { errorMessage });

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

// ===== CACHE HELPERS =====

export const AUTH_USER_CACHE_PREFIX = 'auth:user:';

export function authUserCacheKey(userId: string): string {
  return `${AUTH_USER_CACHE_PREFIX}${userId}`;
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
    return;
  }
}

