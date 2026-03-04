import { FastifyRequest, FastifyReply } from 'fastify';
import {
  userSchema,
  sessionMinimalSchema,
  loginRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types';
import { AuthSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import { getRequestContext } from '../../services/GeoIPService';
import { markSessionTrusted } from '../../services/SessionService';
import {
  createLoginRateLimiter,
  createAuthGlobalRateLimiter
} from '../../utils/rate-limiter.js';
import {
  AuthRouteContext,
  TwoFactorRequestBody,
  formatUserResponse,
  formatSessionResponse
} from './types';

/**
 * Register login and logout routes
 */
export function registerLoginRoutes(context: AuthRouteContext) {
  const { fastify, authService, redis } = context;

  const loginRateLimiter = createLoginRateLimiter(redis);
  const authGlobalRateLimiter = createAuthGlobalRateLimiter(redis);

  // POST /login - Main login endpoint
  fastify.post('/login', {
    schema: {
      description: 'Authenticate a user with username/email/phone and password. Returns user profile, JWT token, and session token for device management.',
      tags: ['auth'],
      summary: 'User login',
      body: loginRequestSchema,
      response: {
        200: {
          description: 'Successful login - returns user data, tokens, and session info',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                token: { type: 'string', description: 'JWT access token for API authentication' },
                sessionToken: { type: 'string', description: 'Session token for device management (store securely)' },
                session: sessionMinimalSchema,
                expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 }
              }
            }
          }
        },
        401: errorResponseSchema,
        429: {
          description: 'Too many login attempts',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'string' },
            retryAfter: { type: 'number' }
          }
        },
        500: errorResponseSchema
      },
      security: []
    },
    preHandler: [loginRateLimiter.middleware(), authGlobalRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.login, request.body, 'login');
      const { username, password, rememberDevice } = validatedData;
      console.log('[AUTH] Tentative de connexion pour:', username, '| Remember device:', rememberDevice);

      const requestContext = await getRequestContext(request);
      console.log('[AUTH] Contexte:', requestContext.ip, requestContext.geoData?.location || 'Local');

      const authResult = await authService.authenticate({ username, password }, requestContext);

      if (!authResult) {
        console.error('[AUTH] ❌ Échec de connexion pour:', username, '- Identifiants invalides');
        return reply.status(401).send({
          success: false,
          error: 'Identifiants invalides'
        });
      }

      const { user, sessionToken, session, requires2FA, twoFactorToken } = authResult;

      // If 2FA is required, return partial response
      if (requires2FA) {
        console.log('[AUTH] 🔐 2FA requis pour:', user.username);
        return reply.send({
          success: true,
          data: {
            requires2FA: true,
            twoFactorToken,
            rememberDevice,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              displayName: user.displayName,
              avatar: user.avatar
            },
            message: 'Veuillez entrer votre code d\'authentification à deux facteurs'
          }
        });
      }

      console.log('[AUTH] ✅ Connexion réussie pour:', user.username, '(ID:', user.id, ', Session:', session.id, ')');

      // Notification login nouvel appareil (session non trustée = nouvel appareil)
      if (!session.isTrusted) {
        const notificationService = (fastify as any).notificationService;
        if (notificationService) {
          notificationService.createLoginNewDeviceNotification({
            recipientUserId: user.id,
            deviceInfo: requestContext.userAgent,
            ipAddress: requestContext.ip,
          }).catch((err: unknown) => console.error('[AUTH] Notification error (login_new_device):', err));
        }
      }

      const jwtToken = authService.generateToken(user);

      // Mark session as trusted in background (non-blocking)
      if (rememberDevice && session.id) {
        markSessionTrusted(session.id, {
          userId: user.id,
          ipAddress: requestContext.ip,
          userAgent: requestContext.userAgent,
          source: 'login'
        }).then(marked => {
          if (!marked) {
            console.warn('[AUTH] ⚠️ Échec du marquage session trusted - voir logs SECURITY_AUDIT_ERROR');
          }
        }).catch(err => {
          console.error('[AUTH] ⚠️ Erreur lors du marquage session trusted:', err);
        });
      }

      reply.send({
        success: true,
        data: {
          user: formatUserResponse(user),
          token: jwtToken,
          sessionToken,
          session: formatSessionResponse(session, rememberDevice || false),
          expiresIn: rememberDevice ? 365 * 24 * 60 * 60 : 24 * 60 * 60
        }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur serveur lors de la connexion:', error);
      if (error instanceof Error) {
        console.error('[AUTH] Détails de l\'erreur:', error.message, error.stack);
      }
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la connexion'
      });
    }
  });

  // POST /login/2fa - Complete login with 2FA verification
  fastify.post<{ Body: TwoFactorRequestBody }>('/login/2fa', {
    schema: {
      description: 'Complete login with 2FA verification. Called after initial login returns requires2FA: true.',
      tags: ['auth', '2fa'],
      summary: 'Complete 2FA login',
      body: {
        type: 'object',
        required: ['twoFactorToken', 'code'],
        properties: {
          twoFactorToken: { type: 'string', description: 'Temporary token from initial login' },
          code: { type: 'string', minLength: 6, maxLength: 9, description: 'TOTP code (6 digits) or backup code (XXXX-XXXX)' },
          rememberDevice: { type: 'boolean', description: 'Remember device for long session (365 days)', default: false }
        }
      },
      response: {
        200: {
          description: 'Successful 2FA verification - returns full session',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                token: { type: 'string', description: 'JWT access token' },
                sessionToken: { type: 'string', description: 'Session token' },
                session: sessionMinimalSchema,
                expiresIn: { type: 'number', example: 86400 }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema
      },
      security: []
    }
  }, async (request, reply) => {
    try {
      const { twoFactorToken, code, rememberDevice } = request.body;

      if (!twoFactorToken || !code) {
        return reply.status(400).send({
          success: false,
          error: 'Token 2FA et code requis'
        });
      }

      const requestContext = await getRequestContext(request);
      const result = await authService.completeAuthWith2FA(twoFactorToken, code, requestContext);

      if ('success' in result && result.success === false) {
        return reply.status(401).send({
          success: false,
          error: result.error
        });
      }

      const authResult = result as { user: any; sessionToken: string; session: any };
      const { user, sessionToken, session } = authResult;

      console.log('[AUTH] ✅ Connexion 2FA réussie pour:', user.username);

      // Notification login nouvel appareil (session non trustée = nouvel appareil)
      if (!session.isTrusted) {
        const notificationService = (fastify as any).notificationService;
        if (notificationService) {
          notificationService.createLoginNewDeviceNotification({
            recipientUserId: user.id,
            deviceInfo: requestContext.userAgent,
            ipAddress: requestContext.ip,
          }).catch((err: unknown) => console.error('[AUTH] Notification error (login_new_device 2FA):', err));
        }
      }

      const jwtToken = authService.generateToken(user);

      // Mark session as trusted in background after 2FA verification
      if (rememberDevice && session.id) {
        markSessionTrusted(session.id, {
          userId: user.id,
          ipAddress: requestContext.ip,
          userAgent: requestContext.userAgent,
          source: '2fa_verification'
        }).then(marked => {
          if (!marked) {
            console.warn('[AUTH] ⚠️ Échec du marquage session trusted après 2FA - voir logs SECURITY_AUDIT_ERROR');
          }
        }).catch(err => {
          console.error('[AUTH] ⚠️ Erreur lors du marquage session trusted après 2FA:', err);
        });
      }

      const expiresIn = rememberDevice ? 365 * 24 * 60 * 60 : 24 * 60 * 60;

      return reply.send({
        success: true,
        data: {
          user: formatUserResponse(user),
          token: jwtToken,
          sessionToken,
          session: formatSessionResponse(session, rememberDevice || false),
          expiresIn
        }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur 2FA:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification 2FA'
      });
    }
  });

  // POST /logout - Logout and invalidate session
  fastify.post('/logout', {
    schema: {
      description: 'Logout the current user and invalidate the session',
      tags: ['auth'],
      summary: 'User logout',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Session token to invalidate' }
        }
      },
      response: {
        200: {
          description: 'Logout successful',
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
        }
      }
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const sessionToken = request.headers['x-session-token'] as string | undefined;

      await authService.updateOnlineStatus(userId, false);

      if (sessionToken) {
        const loggedOut = await authService.logout(sessionToken);
        if (loggedOut) {
          console.log('[AUTH] ✅ Session invalidée pour:', userId);
        }
      }

      reply.send({
        success: true,
        data: { message: 'Déconnexion réussie' }
      });

    } catch (error) {
      console.error('Error in logout:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la déconnexion'
      });
    }
  });
}
