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
      };

      const requestContext = await getRequestContext(request);
      console.log('[AUTH] Inscription depuis:', requestContext.ip, requestContext.geoData?.location || 'Local');

      // Check if phoneTransferToken is provided
      let phoneTransferValidated = false;
      if (validatedData.phoneTransferToken) {
        console.log('[AUTH] 📱 Phone transfer token provided - validating...');
        const transferData = await phoneTransferService.getTransferDataByToken(validatedData.phoneTransferToken);

        if (!transferData.valid) {
          return reply.status(400).send({
            success: false,
            error: 'Token de transfert invalide ou expiré',
            code: 'INVALID_TRANSFER_TOKEN'
          });
        }

        console.log('[AUTH] 📱 Phone transfer token valid - phone:', transferData.phoneNumber);
        phoneTransferValidated = true;
        (validatedData as any).skipPhoneConflictCheck = true;
      }

      const result = await authService.register(validatedData as RegisterData, requestContext);

      if (!result) {
        return reply.status(400).send({
          success: false,
          error: 'Erreur lors de la création du compte'
        });
      }

      // Handle phone ownership conflict
      if (result.phoneOwnershipConflict && result.phoneOwnerInfo) {
        console.log('[AUTH] 📱 Phone ownership conflict - account NOT created');
        return reply.send({
          success: true,
          data: {
            phoneOwnershipConflict: true,
            phoneOwnerInfo: {
              maskedDisplayName: result.phoneOwnerInfo.maskedDisplayName,
              maskedUsername: result.phoneOwnerInfo.maskedUsername,
              maskedEmail: result.phoneOwnerInfo.maskedEmail,
              avatarUrl: result.phoneOwnerInfo.avatarUrl,
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
          }
        });
      }

      const { user } = result;

      if (!user) {
        return reply.status(400).send({
          success: false,
          error: 'Erreur lors de la création du compte'
        });
      }

      // Execute phone transfer if validated
      if (phoneTransferValidated && validatedData.phoneTransferToken) {
        console.log('[AUTH] 📱 Executing phone transfer for new user:', user.id);
        const transferResult = await phoneTransferService.executeRegistrationTransfer(
          validatedData.phoneTransferToken,
          user.id,
          requestContext.ip || 'unknown'
        );

        if (!transferResult.success) {
          console.error('[AUTH] ❌ Phone transfer failed:', transferResult.error);
        } else {
          console.log('[AUTH] ✅ Phone transfer completed successfully');
        }
      }

      const token = authService.generateToken(user);

      reply.send({
        success: true,
        data: {
          user: formatUserResponse(user),
          token,
          expiresIn: 24 * 60 * 60
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error in register:', error);

      if (error instanceof Error) {
        const errorMessage = error.message;
        if (errorMessage.includes('déjà utilisé')) {
          return reply.status(400).send({
            success: false,
            error: errorMessage
          });
        }
      }

      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création du compte'
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
        return reply.status(400).send({
          success: false,
          error: 'Username, email ou numéro de téléphone requis'
        });
      }

      const prisma = (fastify as any).prisma;
      const { normalizePhoneNumber } = await import('../../utils/normalize');
      const result: {
        usernameAvailable?: boolean;
        suggestions?: string[];
        emailAvailable?: boolean;
        phoneNumberAvailable?: boolean;
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
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const existingUser = await prisma.user.findFirst({
          where: {
            phoneNumber: normalizedPhone
          }
        });
        result.phoneNumberAvailable = !existingUser;
      }

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[GATEWAY] Error checking availability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification'
      });
    }
  });

  // POST /force-init - Force database initialization (temporary)
  fastify.post('/force-init', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { InitService } = await import('../../services/InitService');
      const initService = new InitService((fastify as any).prisma);
      await initService.initializeDatabase();

      return reply.send({
        success: true,
        data: { message: 'Database initialized successfully' }
      });
    } catch (error) {
      console.error('[GATEWAY] Error during forced initialization:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to initialize database'
      });
    }
  });
}
