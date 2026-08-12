import { FastifyRequest, FastifyReply } from 'fastify';
import {
  userSchema,
  sessionMinimalSchema,
  loginRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types';
import { AuthSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import jwt from 'jsonwebtoken';
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
import type { AuthResult } from '../../services/AuthService';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import {
  sendSuccess,
  sendUnauthorized,
  sendBadRequest,
  sendInternalError
} from '../../utils/response.js';

const logger = enhancedLogger.child({ module: 'AuthLoginRoute' });

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
      logger.info('Tentative de connexion', { username, rememberDevice });

      const requestContext = await getRequestContext(request);
      logger.debug('Auth context', { ip: requestContext.ip, location: requestContext.geoData?.location });

      const authResult = await authService.authenticate({ username, password }, requestContext);

      if (!authResult) {
        logger.warn('Échec de connexion — identifiants invalides', { username });
        return sendUnauthorized(reply, 'Identifiants invalides');
      }

      const { user, sessionToken, session, requires2FA, twoFactorToken } = authResult;

      // If 2FA is required, return partial response
      if (requires2FA) {
        logger.info('2FA requis', { username: user.username });
        return sendSuccess(reply, {
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
        });
      }

      logger.info('Connexion réussie', { username: user.username });

      // Notification login nouvel appareil (session non trustée = nouvel appareil)
      if (!session.isTrusted) {
        const notificationService = fastify.notificationService;
        if (notificationService) {
          const jwtSecret = process.env.JWT_SECRET || 'meeshy-secret-key-dev';
          const revokeToken = jwt.sign(
            { userId: user.id, action: 'revoke-all' },
            jwtSecret,
            { expiresIn: '24h' }
          );
          notificationService.createLoginNewDeviceNotification({
            recipientUserId: user.id,
            deviceInfo: requestContext.deviceInfo,
            ipAddress: requestContext.ip,
            geoData: requestContext.geoData,
            revokeToken,
          }).catch((err: unknown) => logger.error('Notification error login_new_device', err as Error));
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
            logger.warn('Échec du marquage session trusted');
          }
        }).catch(err => {
          logger.error('Erreur lors du marquage session trusted', err as Error);
        });
      }

      const permissions = authService.getUserPermissions(user);

      return sendSuccess(reply, {
        user: formatUserResponse(user, permissions),
        token: jwtToken,
        sessionToken,
        session: formatSessionResponse(session, rememberDevice || false),
        expiresIn: rememberDevice ? 365 * 24 * 60 * 60 : 24 * 60 * 60
      });

    } catch (error) {
      logger.error('Erreur serveur lors de la connexion', error as Error);
      return sendInternalError(reply, 'Erreur lors de la connexion');
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
        return sendBadRequest(reply, 'Token 2FA et code requis');
      }

      const requestContext = await getRequestContext(request);
      const result = await authService.completeAuthWith2FA(twoFactorToken, code, requestContext);

      if ('success' in result && result.success === false) {
        return sendUnauthorized(reply, result.error);
      }

      const authResult = result as AuthResult;
      const { user, sessionToken, session } = authResult;

      logger.info('Connexion 2FA réussie', { username: user.username });

      // Notification login nouvel appareil (session non trustée = nouvel appareil)
      if (!session.isTrusted) {
        const notificationService = fastify.notificationService;
        if (notificationService) {
          const jwtSecret = process.env.JWT_SECRET || 'meeshy-secret-key-dev';
          const revokeToken = jwt.sign(
            { userId: user.id, action: 'revoke-all' },
            jwtSecret,
            { expiresIn: '24h' }
          );
          notificationService.createLoginNewDeviceNotification({
            recipientUserId: user.id,
            deviceInfo: requestContext.deviceInfo,
            ipAddress: requestContext.ip,
            geoData: requestContext.geoData,
            revokeToken,
          }).catch((err: unknown) => logger.error('Notification error login_new_device 2FA', err as Error));
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
            logger.warn('Échec du marquage session trusted après 2FA');
          }
        }).catch(err => {
          logger.error('Erreur lors du marquage session trusted après 2FA', err as Error);
        });
      }

      const expiresIn = rememberDevice ? 365 * 24 * 60 * 60 : 24 * 60 * 60;
      const twoFAPermissions = authService.getUserPermissions(user);

      return sendSuccess(reply, {
        user: formatUserResponse(user, twoFAPermissions),
        token: jwtToken,
        sessionToken,
        session: formatSessionResponse(session, rememberDevice || false),
        expiresIn
      });

    } catch (error) {
      logger.error('Erreur 2FA', error as Error);
      return sendInternalError(reply, 'Erreur lors de la vérification 2FA');
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
    preValidation: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      const sessionToken = request.headers['x-session-token'] as string | undefined;

      await authService.updateOnlineStatus(userId, false);

      if (sessionToken) {
        const loggedOut = await authService.logout(sessionToken);
        if (loggedOut) {
          logger.info('Session invalidée');
        }
      }

      return sendSuccess(reply, { message: 'Déconnexion réussie' });

    } catch (error) {
      logger.error('Error in logout', error as Error);
      return sendInternalError(reply, 'Erreur lors de la déconnexion');
    }
  });
}
