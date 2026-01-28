import { FastifyRequest, FastifyReply } from 'fastify';
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
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { AuthRouteContext, formatUserResponse } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';

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
    preValidation: [createUnifiedAuthMiddleware((fastify as any).prisma, { requireAuth: true })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;

      if (!authContext.isAuthenticated) {
        return reply.status(401).send({
          success: false,
          error: 'Non authentifié'
        });
      }

      // Registered user (JWT)
      if (authContext.type === 'jwt' && authContext.registeredUser) {
        const user = authContext.registeredUser;
        const permissions = authService.getUserPermissions(user as any);

        return reply.send({
          success: true,
          data: {
            user: formatUserResponse(user, permissions)
          }
        });
      }

      // Anonymous user (Session)
      if (authContext.type === 'session' && authContext.anonymousUser) {
        const anonymousUser = authContext.anonymousUser;

        return reply.send({
          success: true,
          data: {
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
              translateToSystemLanguage: false,
              translateToRegionalLanguage: false,
              useCustomDestination: false,
              isOnline: true,
              lastActiveAt: new Date(),
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              permissions: anonymousUser.permissions
            }
          }
        });
      }

      return reply.status(404).send({
        success: false,
        error: 'Utilisateur non trouvé'
      });

    } catch (error) {
      logger.error('Error in /auth/me', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération du profil'
      });
    }
  });

  // POST /refresh - Refresh JWT token
  fastify.post('/refresh', {
    schema: {
      description: 'Refresh an existing JWT token to get a new one',
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
                token: { type: 'string', description: 'New JWT token' },
                expiresIn: { type: 'number', description: 'Token expiration in seconds' }
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
      const { token } = validatedData;

      const decoded = authService.verifyToken(token);

      if (!decoded) {
        return reply.status(401).send({
          success: false,
          error: 'Token invalide ou expiré'
        });
      }

      const user = await authService.getUserById(decoded.userId);

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'Utilisateur non trouvé'
        });
      }

      const newToken = authService.generateToken(user);

      reply.send({
        success: true,
        data: {
          token: newToken,
          expiresIn: 24 * 60 * 60
        }
      });

    } catch (error) {
      logger.error('Error in /auth/refresh', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors du rafraîchissement du token'
      });
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
      const { token, email } = validatedData;

      logger.info(`[AUTH] Tentative de vérification email pour email=${email}`);

      const result = await authService.verifyEmail(token, email);

      if (!result.success) {
        logger.warn(`[AUTH] ❌ Échec de vérification email result.error=${result.error}`);
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      if (result.alreadyVerified && result.verifiedAt) {
        logger.info(`[AUTH] ℹ️ Email déjà vérifié pour email=${email} le result.verifiedAt.toISOString()=${result.verifiedAt.toISOString()}`);
        return reply.send({
          success: true,
          data: {
            message: 'Votre adresse email est déjà vérifiée.',
            alreadyVerified: true,
            verifiedAt: result.verifiedAt.toISOString()
          }
        });
      }

      logger.info(`[AUTH] ✅ Email vérifié avec succès pour email=${email}`);

      return reply.send({
        success: true,
        data: {
          message: 'Votre adresse email a été vérifiée avec succès !',
          alreadyVerified: false,
          verifiedAt: result.verifiedAt?.toISOString()
        }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur lors de la vérification email', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification'
      });
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
          return reply.status(400).send({
            success: false,
            error: result.error
          });
        }
      }

      logger.info('[AUTH] ✅ Email de vérification envoyé (si compte existe)');

      return reply.send({
        success: true,
        data: { message: 'Si un compte existe avec cette adresse email, un email de vérification a été envoyé.' }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur lors du renvoi de vérification', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'envoi de l\'email'
      });
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
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      logger.info('[AUTH] ✅ Code SMS envoyé');

      return reply.send({
        success: true,
        data: { message: 'Code de vérification envoyé par SMS.' }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur envoi code SMS', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'envoi du code'
      });
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
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      logger.info('[AUTH] ✅ Téléphone vérifié');

      return reply.send({
        success: true,
        data: { message: 'Numéro de téléphone vérifié avec succès !' }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur vérification téléphone', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification'
      });
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
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const currentToken = request.headers['x-session-token'] as string | undefined;

      logger.info('[AUTH] Récupération des sessions pour:', userId);

      const sessions = await authService.getUserActiveSessions(userId, currentToken);

      return reply.send({
        success: true,
        data: {
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
        }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur récupération sessions', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des sessions'
      });
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
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { sessionId } = request.params as { sessionId: string };

      logger.info(`[AUTH] Révocation session:', sessionId, 'pour user userId=${userId}`);

      const sessions = await authService.getUserActiveSessions(userId);
      const sessionBelongsToUser = sessions.some(s => s.id === sessionId);

      if (!sessionBelongsToUser) {
        return reply.status(404).send({
          success: false,
          error: 'Session non trouvée'
        });
      }

      const revoked = await authService.revokeSession(sessionId);

      if (!revoked) {
        return reply.status(404).send({
          success: false,
          error: 'Impossible de révoquer cette session'
        });
      }

      logger.info(`[AUTH] ✅ Session révoquée sessionId=${sessionId}`);

      return reply.send({
        success: true,
        data: { message: 'Session révoquée avec succès' }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur révocation session', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la révocation de la session'
      });
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
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const currentToken = request.headers['x-session-token'] as string | undefined;

      logger.info(`Révocation de toutes les sessions pour userId=${userId} (sauf courante)`);

      const revokedCount = await authService.revokeAllSessionsExceptCurrent(userId, currentToken);

        logger.info(`Sessions révoquées count=${revokedCount}`);

      return reply.send({
        success: true,
        data: {
          message: `${revokedCount} session(s) révoquée(s) avec succès`,
          revokedCount
        }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur révocation sessions', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la révocation des sessions'
      });
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
        return reply.send({
          success: true,
          data: {
            valid: false,
            session: null
          }
        });
      }

      return reply.send({
        success: true,
        data: {
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
        }
      });

    } catch (error) {
      logger.error('[AUTH] ❌ Erreur validation session', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la validation de la session'
      });
    }
  });
}
