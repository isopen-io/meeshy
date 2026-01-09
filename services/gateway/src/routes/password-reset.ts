/**
 * Password Reset Routes
 * Secure password reset endpoints with comprehensive validation and security features
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PasswordResetService } from '../services/PasswordResetService';
import { RedisWrapper } from '../services/RedisWrapper';
import { EmailService } from '../services/EmailService';
import { GeoIPService } from '../services/GeoIPService';

// Zod schemas for request validation
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  captchaToken: z.string().min(1, 'CAPTCHA token is required'),
  deviceFingerprint: z.string().optional()
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters').max(128),
  confirmPassword: z.string().min(12, 'Password confirmation is required').max(128),
  twoFactorCode: z.string().regex(/^[0-9]{6}$/, '2FA code must be 6 digits').optional(),
  deviceFingerprint: z.string().optional()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword']
});

export async function passwordResetRoutes(fastify: FastifyInstance) {
  // Initialize services
  const redisWrapper = new RedisWrapper();
  const emailService = new EmailService();
  const geoIPService = new GeoIPService();

  const passwordResetService = new PasswordResetService(
    fastify.prisma,
    redisWrapper,
    emailService,
    geoIPService,
    process.env.HCAPTCHA_SECRET || ''
  );

  /**
   * POST /auth/forgot-password
   * Request password reset via email
   */
  fastify.post('/forgot-password', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'captchaToken'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
            example: 'user@example.com'
          },
          captchaToken: {
            type: 'string',
            description: 'hCaptcha verification token',
            example: 'P0_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...'
          },
          deviceFingerprint: {
            type: 'string',
            description: 'Optional device fingerprint for anomaly detection',
            example: 'fp_abc123xyz'
          }
        }
      },
      response: {
        200: {
          description: 'Generic success response (always returned to prevent email enumeration)',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request body
      const body = forgotPasswordSchema.parse(request.body);

      // Extract IP address and user agent
      const ipAddress = request.ip || '127.0.0.1';
      const userAgent = request.headers['user-agent'] || 'Unknown';

      // Process password reset request
      const result = await passwordResetService.requestPasswordReset({
        email: body.email,
        captchaToken: body.captchaToken,
        deviceFingerprint: body.deviceFingerprint,
        ipAddress,
        userAgent
      });

      // Always return 200 OK with generic message (prevents email enumeration)
      return reply.status(200).send(result);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      fastify.log.error({ err: error }, '[PasswordReset] Error in forgot-password');
      // Return generic success response even on error (security)
      return reply.status(200).send({
        success: true,
        data: { message: 'If an account exists with this email, a password reset link has been sent.' }
      });
    }
  });

  /**
   * POST /auth/reset-password
   * Complete password reset with token from email
   */
  fastify.post('/reset-password', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'newPassword', 'confirmPassword'],
        properties: {
          token: {
            type: 'string',
            description: 'Reset token from email link',
            example: 'abc123xyz...'
          },
          newPassword: {
            type: 'string',
            minLength: 12,
            maxLength: 128,
            description: 'New password (min 12 characters, must include uppercase, lowercase, digit, special char)',
            example: 'MyS3cur3P@ssw0rd!'
          },
          confirmPassword: {
            type: 'string',
            minLength: 12,
            maxLength: 128,
            description: 'Password confirmation (must match newPassword)',
            example: 'MyS3cur3P@ssw0rd!'
          },
          twoFactorCode: {
            type: 'string',
            pattern: '^[0-9]{6}$',
            description: 'Optional 2FA code (required if user has 2FA enabled)',
            example: '123456'
          },
          deviceFingerprint: {
            type: 'string',
            description: 'Optional device fingerprint for anomaly detection',
            example: 'fp_abc123xyz'
          }
        }
      },
      response: {
        200: {
          description: 'Password reset successful',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          description: 'Password reset failed',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request body
      const body = resetPasswordSchema.parse(request.body);

      // Extract IP address and user agent
      const ipAddress = request.ip || '127.0.0.1';
      const userAgent = request.headers['user-agent'] || 'Unknown';

      // Process password reset completion
      const result = await passwordResetService.completePasswordReset({
        token: body.token,
        newPassword: body.newPassword,
        confirmPassword: body.confirmPassword,
        twoFactorCode: body.twoFactorCode,
        deviceFingerprint: body.deviceFingerprint,
        ipAddress,
        userAgent
      });

      if (result.success) {
        return reply.status(200).send({
          success: true,
          data: { message: result.message }
        });
      } else {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      fastify.log.error({ err: error }, '[PasswordReset] Error in reset-password');
      return reply.status(500).send({
        success: false,
        error: 'An error occurred while resetting your password. Please try again.'
      });
    }
  });

  /**
   * GET /auth/reset-password/verify-token
   * Verify if a reset token is valid (without using it)
   * Useful for frontend to check token validity before showing password form
   */
  fastify.get('/reset-password/verify-token', {
    schema: {
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            description: 'Reset token to verify'
          }
        }
      },
      response: {
        200: {
          description: 'Token verification result',
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            requires2FA: { type: 'boolean' },
            expiresAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = request.query as { token: string };

      if (!token) {
        return reply.status(400).send({
          valid: false,
          error: 'Token is required'
        });
      }

      // Hash the token to lookup in database
      const crypto = await import('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Find token in database
      const resetToken = await fastify.prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: {
              twoFactorEnabledAt: true
            }
          }
        }
      });

      if (!resetToken) {
        return reply.send({
          valid: false,
          requires2FA: false
        });
      }

      // Check if token is expired
      if (resetToken.expiresAt < new Date()) {
        return reply.send({
          valid: false,
          requires2FA: false
        });
      }

      // Check if token was already used
      if (resetToken.usedAt) {
        return reply.send({
          valid: false,
          requires2FA: false
        });
      }

      // Check if token is revoked
      if (resetToken.isRevoked) {
        return reply.send({
          valid: false,
          requires2FA: false
        });
      }

      return reply.send({
        valid: true,
        requires2FA: !!resetToken.user.twoFactorEnabledAt,
        expiresAt: resetToken.expiresAt.toISOString()
      });

    } catch (error) {
      fastify.log.error({ err: error }, '[PasswordReset] Error verifying token');
      return reply.status(500).send({
        valid: false,
        error: 'Error verifying token'
      });
    }
  });

  fastify.log.info('[PasswordReset] Routes registered successfully');
}
