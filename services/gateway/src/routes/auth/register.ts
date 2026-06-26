import { FastifyRequest, FastifyReply } from 'fastify';
import {
  userSchema,
  registerRequestSchema,
  validationErrorResponseSchema,
  errorResponseSchema
} from '@meeshy/shared/types';
import { AuthSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import { RegisterData } from '../../services/AuthService';
import { getRequestContext } from '../../services/GeoIPService';
import { createRegisterRateLimiter, createAuthGlobalRateLimiter } from '../../utils/rate-limiter.js';
import { AuthRouteContext, formatUserResponse } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendBadRequest, sendInternalError } from '../../utils/response.js';

const logger = enhancedLogger.child({ module: 'AuthRegisterRoute' });

/**
 * Register registration and availability check routes
 */
export function registerRegistrationRoutes(context: AuthRouteContext) {
  const { fastify, authService, phoneTransferService, redis } = context;

  const registerRateLimiter = createRegisterRateLimiter(redis);
  const authGlobalRateLimiter = createAuthGlobalRateLimiter(redis);

  // POST /register - Main registration endpoint
  fastify.post('/register', {
    schema: {
      description: 'Register a new user account. An email verification will be sent to the provided email address. The user is automatically added to the global "meeshy" conversation.',
      tags: ['auth'],
      summary: 'User registration',
      body: registerRequestSchema,
      response: {
        200: {
          description: 'Account created successfully - verification email sent',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                token: { type: 'string', description: 'JWT access token for API authentication' },
                expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 }
              }
            }
          }
        },
        400: validationErrorResponseSchema,
        429: {
          description: 'Too many registration attempts',
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
    preHandler: [registerRateLimiter.middleware(), authGlobalRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = validateSchema(AuthSchemas.register, request.body, 'register') as RegisterData & {
        phoneTransferToken?: string;
        skipPhoneConflictCheck?: boolean;
      };

      const requestContext = await getRequestContext(request);

      // Check if phoneTransferToken is provided
      let phoneTransferValidated = false;
      if (validatedData.phoneTransferToken) {
        logger.info('Phone transfer token provided — validating');
        const transferData = await phoneTransferService.getTransferDataByToken(validatedData.phoneTransferToken);

        if (!transferData.valid) {
          return sendBadRequest(reply, 'Token de transfert invalide ou expiré', { code: 'INVALID_TRANSFER_TOKEN' });
        }

        logger.info('Phone transfer token valid');
        phoneTransferValidated = true;
        validatedData.skipPhoneConflictCheck = true;
      }

      const result = await authService.register(validatedData as RegisterData, requestContext);

      if (!result) {
        return sendBadRequest(reply, 'Erreur lors de la création du compte');
      }

      // Handle phone ownership conflict
      if (result.phoneOwnershipConflict && result.phoneOwnerInfo) {
        logger.warn('Phone ownership conflict — account NOT created');
        return sendSuccess(reply, {
          phoneOwnershipConflict: true,
          phoneOwnerInfo: {
            maskedDisplayName: result.phoneOwnerInfo.maskedDisplayName,
            maskedUsername: result.phoneOwnerInfo.maskedUsername,
            maskedEmail: result.phoneOwnerInfo.maskedEmail,
            avatar: result.phoneOwnerInfo.avatar,
            phoneNumber: result.phoneOwnerInfo.phoneNumber,
            phoneCountryCode: result.phoneOwnerInfo.phoneCountryCode
          },
          pendingRegistration: {
            username: validatedData.username,
            email: validatedData.email,
            firstName: validatedData.firstName,
            lastName: validatedData.lastName,
            password: validatedData.password,
            systemLanguage: validatedData.systemLanguage,
            regionalLanguage: validatedData.regionalLanguage
          }
        });
      }

      const { user } = result;

      if (!user) {
        return sendBadRequest(reply, 'Erreur lors de la création du compte');
      }

      // Execute phone transfer if validated
      if (phoneTransferValidated && validatedData.phoneTransferToken) {
        logger.info('Executing phone transfer for new user');
        const transferResult = await phoneTransferService.executeRegistrationTransfer(
          validatedData.phoneTransferToken,
          user.id,
          requestContext.ip || 'unknown'
        );

        if (!transferResult.success) {
          logger.error('Phone transfer failed', { error: transferResult.error });
        } else {
          logger.info('Phone transfer completed successfully');
        }
      }

      const token = authService.generateToken(user);
      const permissions = authService.getUserPermissions(user);

      return sendSuccess(reply, {
        user: formatUserResponse(user, permissions),
        token,
        expiresIn: 24 * 60 * 60
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('Registration error', error as Error);

      // Erreurs de validation connues
      if (errorMessage.includes('déjà utilisé') || errorMessage.includes('already exists')) {
        return sendBadRequest(reply, errorMessage, { code: 'DUPLICATE_FIELD' });
      }

      if (errorMessage.includes('Email invalide') || errorMessage.includes('Format d\'email')) {
        return sendBadRequest(reply, errorMessage, { code: 'INVALID_EMAIL' });
      }

      if (errorMessage.includes('mot de passe') || errorMessage.includes('password')) {
        return sendBadRequest(reply, errorMessage, { code: 'INVALID_PASSWORD' });
      }

      if (errorMessage.includes('username') || errorMessage.includes('utilisateur')) {
        return sendBadRequest(reply, errorMessage, { code: 'INVALID_USERNAME' });
      }

      // Erreur générique avec détails en dev
      const isDev = process.env.NODE_ENV !== 'production';
      reply.status(500).send({
        success: false,
        error: isDev ? errorMessage : 'Erreur lors de la création du compte',
        code: 'REGISTRATION_ERROR',
        ...(isDev && { details: errorStack })
      });
    }
  });

  // GET /check-availability - Check username/email/phone availability
  fastify.get('/check-availability', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          phoneNumber: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { username, email, phoneNumber } = request.query as {
        username?: string;
        email?: string;
        phoneNumber?: string;
      };

      if (!username && !email && !phoneNumber) {
        return sendBadRequest(reply, 'Username, email ou numéro de téléphone requis');
      }

      const prisma = fastify.prisma;
      const { normalizePhoneNumber } = await import('../../utils/normalize');
      const result: {
        usernameAvailable?: boolean;
        suggestions?: string[];
        emailAvailable?: boolean;
        phoneNumberAvailable?: boolean;
        phoneNumberValid?: boolean;
      } = {};

      // Check username (case-insensitive)
      if (username) {
        const normalizedUsername = username.trim();
        const existingUser = await prisma.user.findFirst({
          where: {
            username: {
              equals: normalizedUsername,
              mode: 'insensitive'
            }
          }
        });
        result.usernameAvailable = !existingUser;

        if (existingUser) {
          const suggestions: string[] = [];
          let attempts = 0;
          while (suggestions.length < 3 && attempts < 10) {
            const suffix = Math.floor(Math.random() * 9999) + 1;
            const candidate = `${normalizedUsername}${suffix}`;

            const check = await prisma.user.findFirst({
              where: {
                username: {
                  equals: candidate,
                  mode: 'insensitive'
                }
              }
            });

            if (!check && !suggestions.includes(candidate)) {
              suggestions.push(candidate);
            }
            attempts++;
          }

          if (suggestions.length > 0) {
            result.suggestions = suggestions;
          }
        }
      }

      // Check email (case-insensitive)
      if (email) {
        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: 'insensitive'
            }
          }
        });
        result.emailAvailable = !existingUser;
      }

      // Check phone number (E.164 format)
      if (phoneNumber) {
        const requestContext = await getRequestContext(request);

        // Priorité: 1) Pays de la géoloc, 2) Défaut FR
        const defaultCountry = requestContext?.geoData?.country || 'FR';

        const { normalizePhoneWithCountry } = await import('../../utils/normalize');
        const phoneResult = normalizePhoneWithCountry(phoneNumber, defaultCountry);

        if (phoneResult && phoneResult.isValid) {
          const existingUser = await prisma.user.findFirst({
            where: {
              phoneNumber: phoneResult.phoneNumber
            }
          });
          result.phoneNumberAvailable = !existingUser;
          result.phoneNumberValid = true;
        } else {
          result.phoneNumberAvailable = false;
          result.phoneNumberValid = false;
        }
      }

      return sendSuccess(reply, result);
    } catch (error) {
      logger.error('Error checking availability', error as Error);
      return sendInternalError(reply, 'Erreur lors de la vérification');
    }
  });

  // POST /force-init - Force database initialization (temporary)
  fastify.post('/force-init', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { InitService } = await import('../../services/InitService');
      const initService = new InitService(fastify.prisma);
      await initService.initializeDatabase();

      return sendSuccess(reply, { message: 'Database initialized successfully' });
    } catch (error) {
      logger.error('Error during forced initialization', error as Error);
      return sendInternalError(reply, 'Failed to initialize database');
    }
  });
}
