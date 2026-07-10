import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  userSchema,
  sessionSchema,
  errorResponseSchema,
  sessionsListResponseSchema,
  refreshTokenRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
  sendPhoneCodeRequestSchema,
  verifyPhoneRequestSchema,
  validateSessionRequestSchema
} from '@meeshy/shared/types';
import { AuthSchemas, SessionSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest} from '../../middleware/auth';
import { AuthRouteContext, formatUserResponse } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response';

// Logger dédié pour magic-link
const logger = enhancedLogger.child({ module: 'magic-link' });


/**
 * Register magic link, email/phone verification, session management, and /me routes
 */
export function registerMagicLinkRoutes(context: AuthRouteContext) {
  const { fastify, authService } = context;

  // GET /me - Get current authenticated user profile
  fastify.get('/me', {
    schema: {
      description: 'Get the current authenticated user profile. Works with both JWT tokens (registered users) and session tokens (anonymous users).',
      tags: ['auth', 'user'],
      summary: 'Get current user profile',
      response: {
        200: {
          description: 'User profile retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [createUnifiedAuthMiddleware(fastify.prisma, { requireAuth: true })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;

      if (!authContext.isAuthenticated) {
        return sendUnauthorized(reply, 'Non authentifié');
      }

      // Registered user (JWT)
      if (authContext.type === 'user' && authContext.registeredUser) {
        const user = authContext.registeredUser;
        const permissions = authService.getUserPermissions(user as any);

        return sendSuccess(reply, {
          user: formatUserResponse(user, permissions)
        });
      }

      // Anonymous user (Session)
      if (authContext.type === 'anonymous' && authContext.anonymousUser) {
        const anonymousUser = authContext.anonymousUser;

        return sendSuccess(reply, {
          user: {
            id: authContext.userId,
            username: anonymousUser.username,
            email: null,
            firstName: anonymousUser.firstName,
            lastName: anonymousUser.lastName,
            displayName: authContext.displayName,
            avatar: null,
            role: 'ANONYMOUS',
            systemLanguage: anonymousUser.language,
            regionalLanguage: anonymousUser.language,
            customDestinationLanguage: null,
            autoTranslateEnabled: false,
            isOnline: true,
            lastActiveAt: new Date(),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            permissions: anonymousUser.permissions
          }
        });
      }

      return sendNotFound(reply, 'Utilisateur non trouvé');

    } catch (error) {
      logger.error('Error in /auth/me', error);
      sendInternalError(reply, 'Erreur lors de la récupération du profil');
    }
  });

  // POST /refresh - Refresh JWT token
  fastify.post('/refresh', {
    schema: {
      description: 'Refresh an existing JWT token to get a new one. Supports indefinite session renewal: passing a long-lived sessionToken (returned by /auth/login) lets the server issue a fresh JWT even when the current one is expired, and slides the session expiration forward (sliding window).',
      tags: ['auth'],
      summary: 'Refresh token',
      body: refreshTokenRequestSchema,
      response: {
        200: {
          description: 'Token refreshed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                token: { type: 'string', description: 'New JWT token' },
                sessionToken: { type: 'string', description: 'Same session token (rotated forward in TTL)' },
                expiresIn: { type: 'number', description: 'JWT expiration in seconds' }
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.refreshToken, request.body, 'refresh');
      const { token, sessionToken } = validatedData;

      // Try to decode the JWT — accept expired tokens (ignoreExpiration) so that
      // the client can rotate a valid-but-stale JWT without a sessionToken round-trip.
      // If the signature itself is invalid (tampered), jwt.verify will still throw.
      let decoded: { userId?: string; username?: string; role?: string } | null = null;
      try {
        decoded = jwt.verify(token, authService['jwtSecret'], { ignoreExpiration: true }) as { userId?: string; username?: string; role?: string };
      } catch {
        // Signature invalid — decoded stays null; will be rejected below unless sessionToken covers it.
        decoded = jwt.decode(token) as { userId?: string; username?: string; role?: string } | null;
      }

      let activeSession: { id: string; userId: string; expiresAt: Date } | null = null;

      if (sessionToken && decoded?.userId) {
        const hashedSession = crypto.createHash('sha256').update(sessionToken).digest('hex');
        const session = await context.prisma.userSession.findFirst({
          where: {
            sessionToken: hashedSession,
            userId: decoded.userId,
            isValid: true,
            isTrusted: true,
            expiresAt: { gt: new Date() }
          },
          select: { id: true, userId: true, expiresAt: true }
        });
        if (session) {
          activeSession = session;
          logger.info('Token refresh via trusted session', { userId: decoded.userId });
        }
      }

      if (!decoded?.userId) {
        return sendUnauthorized(reply, 'Token invalide ou expiré');
      }

      const user = await authService.getUserById(decoded!.userId!);

      if (!user) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const newToken = authService.generateToken(user);

      // Sliding window: extend the trusted session another full cycle on every
      // successful refresh and bump lastActiveAt. As long as the user opens the
      // app at least once per session lifetime (365d for mobile), the session
      // never expires — the same sessionToken stays valid indefinitely.
      if (activeSession) {
        const now = new Date();
        const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
        const nextExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
        await context.prisma.userSession.update({
          where: { id: activeSession.id },
          data: {
            expiresAt: nextExpiresAt,
            lastActiveAt: now
          }
        }).catch((err: unknown) => {
          logger.warn('Failed to slide session expiresAt on refresh', { err });
        });
      }

      const permissions = authService.getUserPermissions(user as any);

      sendSuccess(reply, {
        user: formatUserResponse(user, permissions),
        token: newToken,
        sessionToken: sessionToken ?? undefined,
        expiresIn: 24 * 60 * 60
      });

    } catch (error) {
      logger.error('Error in /auth/refresh', error);
      sendInternalError(reply, 'Erreur lors du rafraîchissement du token');
    }
  });

  // POST /verify-email - Verify email with token
  fastify.post('/verify-email', {
    schema: {
      description: 'Verify user email address with a token sent via email',
      tags: ['auth'],
      summary: 'Verify email',
      body: verifyEmailRequestSchema,
      response: {
        200: {
          description: 'Email verified successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                alreadyVerified: { type: 'boolean' },
                verifiedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.verifyEmail, request.body, 'verify-email');
      const { token, code, email } = validatedData;

      logger.info(`[AUTH] Tentative de vérification email pour email=${email} (method=${code ? 'code' : 'token'})`);

      const result = code
        ? await authService.verifyEmail(code, email, true)
        : await authService.verifyEmail(token!, email, false);

      if (!result.success) {
        logger.warn(`[AUTH] ❌ Échec de vérification email result.error=${result.error}`);
        return sendBadRequest(reply, result.error as string);
      }

      if (result.alreadyVerified && result.verifiedAt) {
        logger.info(`[AUTH] ℹ️ Email déjà vérifié pour email=${email} le result.verifiedAt.toISOString()=${result.verifiedAt.toISOString()}`);
        return sendSuccess(reply, {
          message: 'Votre adresse email est déjà vérifiée.',
          alreadyVerified: true,
          verifiedAt: result.verifiedAt.toISOString()
        });
      }

      logger.info(`[AUTH] ✅ Email vérifié avec succès pour email=${email}`);

      return sendSuccess(reply, {
        message: 'Votre adresse email a été vérifiée avec succès !',
        alreadyVerified: false,
        verifiedAt: result.verifiedAt?.toISOString()
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur lors de la vérification email', error);
      return sendInternalError(reply, 'Erreur lors de la vérification');
    }
  });

  // POST /resend-verification - Resend email verification
  fastify.post('/resend-verification', {
    schema: {
      description: 'Resend email verification link to user',
      tags: ['auth'],
      summary: 'Resend verification email',
      body: resendVerificationRequestSchema,
      response: {
        200: {
          description: 'Verification email sent (if account exists)',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.resendVerification, request.body, 'resend-verification');
      const { email } = validatedData;

      logger.info(`[AUTH] Demande de renvoi de vérification pour email=${email}`);

      const result = await authService.resendVerificationEmail(email);

      if (!result.success) {
        if (result.error?.includes('déjà vérifiée')) {
          return sendBadRequest(reply, result.error);
        }
      }

      logger.info('[AUTH] ✅ Email de vérification envoyé (si compte existe)');

      return sendSuccess(reply, { message: 'Si un compte existe avec cette adresse email, un email de vérification a été envoyé.' });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur lors du renvoi de vérification', error);
      return sendInternalError(reply, 'Erreur lors de l\'envoi de l\'email');
    }
  });

  // POST /send-phone-code - Send SMS verification code
  fastify.post('/send-phone-code', {
    schema: {
      description: 'Send SMS verification code to phone number',
      tags: ['auth'],
      summary: 'Send phone verification code',
      body: sendPhoneCodeRequestSchema,
      response: {
        200: {
          description: 'SMS code sent successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.sendPhoneCode, request.body, 'send-phone-code');
      const { phoneNumber } = validatedData;

      logger.info(`[AUTH] Envoi code SMS pour phoneNumber=${phoneNumber}`);

      const result = await authService.sendPhoneVerificationCode(phoneNumber);

      if (!result.success) {
        logger.warn(`[AUTH] ❌ Échec envoi code SMS result.error=${result.error}`);
        return sendBadRequest(reply, result.error as string);
      }

      logger.info('[AUTH] ✅ Code SMS envoyé');

      return sendSuccess(reply, { message: 'Code de vérification envoyé par SMS.' });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur envoi code SMS', error);
      return sendInternalError(reply, 'Erreur lors de l\'envoi du code');
    }
  });

  // POST /verify-phone - Verify phone number with SMS code
  fastify.post('/verify-phone', {
    schema: {
      description: 'Verify phone number with SMS code',
      tags: ['auth'],
      summary: 'Verify phone number',
      body: verifyPhoneRequestSchema,
      response: {
        200: {
          description: 'Phone number verified successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.verifyPhone, request.body, 'verify-phone');
      const { phoneNumber, code } = validatedData;

      logger.info(`[AUTH] Vérification téléphone phoneNumber=${phoneNumber}`);

      const result = await authService.verifyPhone(phoneNumber, code);

      if (!result.success) {
        logger.warn(`[AUTH] ❌ Échec vérification téléphone result.error=${result.error}`);
        return sendBadRequest(reply, result.error as string);
      }

      logger.info('[AUTH] ✅ Téléphone vérifié');

      return sendSuccess(reply, { message: 'Numéro de téléphone vérifié avec succès !' });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur vérification téléphone', error);
      return sendInternalError(reply, 'Erreur lors de la vérification');
    }
  });

  // GET /sessions - List all active sessions
  fastify.get('/sessions', {
    schema: {
      description: 'List all active sessions for the authenticated user',
      tags: ['auth', 'sessions'],
      summary: 'Get active sessions',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Current session token (optional, to mark current session)' }
        }
      },
      response: {
        200: sessionsListResponseSchema,
        401: errorResponseSchema
      }
    },
    preValidation: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      const currentToken = request.headers['x-session-token'] as string | undefined;

      logger.info(`[AUTH] Récupération des sessions pour: ${userId}`);

      const sessions = await authService.getUserActiveSessions(userId, currentToken);

      return sendSuccess(reply, {
        sessions: sessions.map(session => ({
          id: session.id,
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
          isCurrentSession: session.isCurrentSession,
          isTrusted: session.isTrusted
        })),
        totalCount: sessions.length
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur récupération sessions', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des sessions');
    }
  });

  // DELETE /sessions/:sessionId - Revoke specific session
  fastify.delete('/sessions/:sessionId', {
    schema: {
      description: 'Revoke a specific session (log out from a specific device)',
      tags: ['auth', 'sessions'],
      summary: 'Revoke a session',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', description: 'Session ID to revoke' }
        }
      },
      response: {
        200: {
          description: 'Session revoked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        },
        404: {
          description: 'Session not found',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    },
    preValidation: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      const { sessionId } = request.params as { sessionId: string };

      logger.info(`[AUTH] Révocation session:', sessionId, 'pour user userId=${userId}`);

      const sessions = await authService.getUserActiveSessions(userId);
      const sessionBelongsToUser = sessions.some(s => s.id === sessionId);

      if (!sessionBelongsToUser) {
        return sendNotFound(reply, 'Session non trouvée');
      }

      const revoked = await authService.revokeSession(sessionId);

      if (!revoked) {
        return sendNotFound(reply, 'Impossible de révoquer cette session');
      }

      logger.info(`[AUTH] ✅ Session révoquée sessionId=${sessionId}`);

      return sendSuccess(reply, { message: 'Session révoquée avec succès' });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur révocation session', error);
      return sendInternalError(reply, 'Erreur lors de la révocation de la session');
    }
  });

  // DELETE /sessions - Revoke all sessions except current
  fastify.delete('/sessions', {
    schema: {
      description: 'Revoke all sessions except the current one (log out from all other devices)',
      tags: ['auth', 'sessions'],
      summary: 'Revoke all other sessions',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Current session token to keep active' }
        }
      },
      response: {
        200: {
          description: 'Sessions revoked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                revokedCount: { type: 'number' }
              }
            }
          }
        }
      }
    },
    preValidation: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      const currentToken = request.headers['x-session-token'] as string | undefined;

      logger.info(`Révocation de toutes les sessions pour userId=${userId} (sauf courante)`);

      const revokedCount = await authService.revokeAllSessionsExceptCurrent(userId, currentToken);

        logger.info(`Sessions révoquées count=${revokedCount}`);

      return sendSuccess(reply, {
        message: `${revokedCount} session(s) révoquée(s) avec succès`,
        revokedCount
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur révocation sessions', error);
      return sendInternalError(reply, 'Erreur lors de la révocation des sessions');
    }
  });

  // POST /validate-session - Validate session token
  fastify.post('/validate-session', {
    schema: {
      description: 'Validate a session token and get session info',
      tags: ['auth', 'sessions'],
      summary: 'Validate session token',
      body: validateSessionRequestSchema,
      response: {
        200: {
          description: 'Session validation result',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                valid: { type: 'boolean' },
                session: { ...sessionSchema, nullable: true }
              }
            }
          }
        },
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(SessionSchemas.validateToken, request.body, 'validate-session');
      const { sessionToken } = validatedData;

      const session = await authService.validateSessionToken(sessionToken);

      if (!session) {
        return sendSuccess(reply, {
          valid: false,
          session: null
        });
      }

      return sendSuccess(reply, {
        valid: true,
        session: {
          id: session.id,
          userId: session.userId,
          deviceType: session.deviceType,
          browserName: session.browserName,
          osName: session.osName,
          location: session.location,
          isMobile: session.isMobile,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          isTrusted: session.isTrusted
        }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur validation session', error);
      return sendInternalError(reply, 'Erreur lors de la validation de la session');
    }
  });
}
