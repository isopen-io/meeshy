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
import { errorResponseSchema, validationErrorResponseSchema } from '@meeshy/shared/types';

// Zod schemas for request validation
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  captchaToken: z.string().min(1, 'CAPTCHA token is required'),
  deviceFingerprint: z.string().optional()
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string().min(8, 'Password confirmation is required').max(128),
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
      description: 'Initiate password reset process by requesting a reset link via email. This endpoint always returns success to prevent email enumeration attacks. If the email exists, a password reset link will be sent.',
      tags: ['auth'],
      summary: 'Request password reset',
      body: {
        type: 'object',
        required: ['email', 'captchaToken'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
            description: 'User email address',
            example: 'user@example.com'
          },
          captchaToken: {
            type: 'string',
            minLength: 1,
            description: 'hCaptcha verification token to prevent automated abuse',
            example: 'P0_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...'
          },
          deviceFingerprint: {
            type: 'string',
            description: 'Optional device fingerprint for anomaly detection and security monitoring',
            example: 'fp_abc123xyz'
          }
        }
      },
      response: {
        200: {
          description: 'Generic success response - always returned to prevent email enumeration attacks',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  example: 'If an account exists with this email, a password reset link has been sent.'
                }
              }
            }
          }
        },
        400: validationErrorResponseSchema,
        500: errorResponseSchema
      },
      security: []
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
      description: 'Complete password reset using the token received via email. The new password must be at least 8 characters and include uppercase, lowercase, digit, and special character. If 2FA is enabled, a valid 2FA code must be provided.',
      tags: ['auth'],
      summary: 'Complete password reset',
      body: {
        type: 'object',
        required: ['token', 'newPassword', 'confirmPassword'],
        properties: {
          token: {
            type: 'string',
            minLength: 1,
            description: 'Reset token from email link (single-use, time-limited)',
            example: 'abc123xyz456def789...'
          },
          newPassword: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
            description: 'New password (minimum 8 characters, must include uppercase, lowercase, digit, and special character)',
            example: 'MyS3cur3P@ssw0rd!'
          },
          confirmPassword: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
            description: 'Password confirmation - must match newPassword exactly',
            example: 'MyS3cur3P@ssw0rd!'
          },
          twoFactorCode: {
            type: 'string',
            pattern: '^[0-9]{6}$',
            description: '6-digit 2FA code (required only if user has two-factor authentication enabled)',
            example: '123456'
          },
          deviceFingerprint: {
            type: 'string',
            description: 'Optional device fingerprint for anomaly detection and security monitoring',
            example: 'fp_abc123xyz'
          }
        }
      },
      response: {
        200: {
          description: 'Password reset completed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  example: 'Password has been reset successfully. You can now log in with your new password.'
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request - invalid token, password mismatch, weak password, or missing 2FA code',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'string',
              example: 'Invalid or expired reset token'
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
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
      description: 'Verify if a password reset token is valid without consuming it. This endpoint allows the frontend to check token validity before presenting the password reset form, improving user experience by detecting expired or invalid tokens early.',
      tags: ['auth'],
      summary: 'Verify reset token',
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            minLength: 1,
            description: 'Password reset token to verify (from email link)',
            example: 'abc123xyz456def789...'
          }
        }
      },
      response: {
        200: {
          description: 'Token verification result with validity status and additional information',
          type: 'object',
          properties: {
            valid: {
              type: 'boolean',
              description: 'Whether the token is valid and can be used for password reset',
              example: true
            },
            requires2FA: {
              type: 'boolean',
              description: 'Whether the user has 2FA enabled and will need to provide a code during reset',
              example: false
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'Token expiration timestamp (ISO 8601 format)',
              example: '2026-01-11T15:30:00.000Z'
            }
          }
        },
        400: {
          description: 'Bad request - missing token parameter',
          type: 'object',
          properties: {
            valid: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Token is required' }
          }
        },
        500: {
          description: 'Internal server error during token verification',
          type: 'object',
          properties: {
            valid: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error verifying token' }
          }
        }
      },
      security: []
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
              userFeature: {
                select: { twoFactorEnabledAt: true }
              }
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
        requires2FA: !!resetToken.user.userFeature?.twoFactorEnabledAt,
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
