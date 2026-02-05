import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MagicLinkService } from '../services/MagicLinkService';
import { getRedisWrapper } from '../services/RedisWrapper';
import { EmailService } from '../services/EmailService';
import { GeoIPService, getRequestContext } from '../services/GeoIPService';
import { initSessionService, markSessionTrusted } from '../services/SessionService';

// Validation schemas
const requestMagicLinkSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  rememberDevice: z.boolean().optional().default(false) // Stored server-side for security
});

const validateMagicLinkSchema = z.object({
  token: z.string().min(1, 'Token is required')
  // rememberDevice is retrieved from server-side storage, not from client
});

export async function magicLinkRoutes(fastify: FastifyInstance) {
  // Use shared singleton instance to avoid multiple Redis connections
  const redisWrapper = getRedisWrapper();
  const emailService = new EmailService();
  const geoIPService = new GeoIPService();

  // Initialize session service for the routes
  initSessionService(fastify.prisma);

  const magicLinkService = new MagicLinkService(
    fastify.prisma,
    redisWrapper,
    emailService,
    geoIPService
  );

  /**
   * POST /auth/magic-link/request
   * Request a magic link to be sent via email
   */
  fastify.post('/magic-link/request', {
    schema: {
      description: 'Request a magic link for passwordless login. A link valid for 1 minute will be sent to the provided email address.',
      tags: ['auth'],
      summary: 'Request magic link',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address associated with the account',
            example: 'user@example.com'
          },
          rememberDevice: {
            type: 'boolean',
            description: 'Remember device for long session (365 days). Stored server-side for security.',
            default: false
          }
        }
      },
      response: {
        200: {
          description: 'Magic link request processed (always returns success to prevent email enumeration)',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'If an account exists, a login link has been sent.' }
          }
        },
        400: {
          description: 'Invalid request',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' }
          }
        }
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate input
      const validationResult = requestMagicLinkSchema.safeParse(request.body);
      if (!validationResult.success) {
        return reply.status(400).send({
          success: false,
          error: validationResult.error.errors[0]?.message || 'Invalid email address'
        });
      }

      const { email, rememberDevice } = validationResult.data;

      // Get request context
      const requestContext = await getRequestContext(request);

      // Request magic link - rememberDevice is stored server-side with the token
      const result = await magicLinkService.requestMagicLink({
        email,
        ipAddress: requestContext.ip,
        userAgent: requestContext.userAgent,
        deviceFingerprint: (request.body as any)?.deviceFingerprint,
        rememberDevice // Stored server-side for security
      });

      return reply.send(result);

    } catch (error) {
      console.error('[MagicLink Route] Error:', error);
      return reply.status(500).send({
        success: false,
        error: 'An error occurred. Please try again.'
      });
    }
  });

  /**
   * GET /auth/magic-link/validate
   * Validate magic link token and create session
   */
  fastify.get('/magic-link/validate', {
    schema: {
      description: 'Validate a magic link token and log the user in. The token must be valid and not expired (1 minute validity).',
      tags: ['auth'],
      summary: 'Validate magic link',
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            description: 'Magic link token from email',
            example: 'abc123xyz...'
          }
        }
      },
      response: {
        200: {
          description: 'Successful login via magic link',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: { type: 'object' },
                token: { type: 'string', description: 'JWT access token' },
                sessionToken: { type: 'string', description: 'Session token for device management' },
                session: { type: 'object' },
                expiresIn: { type: 'number', example: 86400 }
              }
            }
          }
        },
        400: {
          description: 'Invalid or expired token',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' }
          }
        }
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate input
      const query = request.query as { token?: string };
      const validationResult = validateMagicLinkSchema.safeParse({ token: query.token });

      if (!validationResult.success) {
        return reply.status(400).send({
          success: false,
          error: validationResult.error.errors[0]?.message || 'Token is required'
        });
      }

      const { token } = validationResult.data;

      // Get request context
      const requestContext = await getRequestContext(request);

      // Validate magic link
      const result = await magicLinkService.validateMagicLink({
        token,
        requestContext
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      // Return success with user data
      return reply.send({
        success: true,
        data: {
          user: result.user,
          token: result.token,
          sessionToken: result.sessionToken,
          session: result.session,
          expiresIn: 86400 // 24 hours
        }
      });

    } catch (error) {
      console.error('[MagicLink Route] Validation error:', error);
      return reply.status(500).send({
        success: false,
        error: 'An error occurred. Please try again.'
      });
    }
  });

  /**
   * POST /auth/magic-link/validate
   * Alternative POST endpoint for magic link validation
   */
  fastify.post('/magic-link/validate', {
    schema: {
      description: 'Validate a magic link token and log the user in (POST alternative).',
      tags: ['auth'],
      summary: 'Validate magic link (POST)',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            description: 'Magic link token from email'
          }
          // rememberDevice is retrieved from server-side storage (set during request)
        }
      },
      response: {
        200: {
          description: 'Successful login via magic link',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: { type: 'object' },
                token: { type: 'string' },
                sessionToken: { type: 'string' },
                session: { type: 'object' },
                expiresIn: { type: 'number', example: 86400 }
              }
            }
          }
        },
        400: {
          description: 'Invalid or expired token',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' }
          }
        }
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate input
      const validationResult = validateMagicLinkSchema.safeParse(request.body);

      if (!validationResult.success) {
        return reply.status(400).send({
          success: false,
          error: validationResult.error.errors[0]?.message || 'Token is required'
        });
      }

      const { token } = validationResult.data;

      // Get request context
      const requestContext = await getRequestContext(request);

      // Validate magic link
      const result = await magicLinkService.validateMagicLink({
        token,
        requestContext
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      // Use rememberDevice from SERVER-SIDE storage (not from client request)
      // This prevents client-side manipulation via sessionStorage
      const rememberDevice = result.rememberDevice || false;

      // If remember device is enabled, mark session as trusted (365 days)
      if (rememberDevice && result.session?.id) {
        const marked = await markSessionTrusted(result.session.id, {
          userId: result.user?.id,
          ipAddress: requestContext.ip,
          userAgent: requestContext.userAgent,
          source: 'magic_link'
        });
        if (!marked) {
          console.warn('[MagicLink Route] ⚠️ Échec du marquage session trusted - voir logs SECURITY_AUDIT_ERROR');
        }
      }

      // Calculate expiration time
      const expiresIn = rememberDevice ? 365 * 24 * 60 * 60 : 24 * 60 * 60; // 365 days or 24 hours

      // Return success with user data
      return reply.send({
        success: true,
        data: {
          user: result.user,
          token: result.token,
          sessionToken: result.sessionToken,
          session: { ...result.session, isTrusted: rememberDevice },
          expiresIn
        }
      });

    } catch (error) {
      console.error('[MagicLink Route] Validation error:', error);
      return reply.status(500).send({
        success: false,
        error: 'An error occurred. Please try again.'
      });
    }
  });
}
