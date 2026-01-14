/**
 * Password Reset Routes
 * Secure password reset endpoints with comprehensive validation and security features
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PasswordResetService } from '../services/PasswordResetService';
import { PhonePasswordResetService } from '../services/PhonePasswordResetService';
import { RedisWrapper } from '../services/RedisWrapper';
import { EmailService } from '../services/EmailService';
import { SmsService } from '../services/SmsService';
import { GeoIPService } from '../services/GeoIPService';
import {
  createPasswordResetRateLimiter,
  createPasswordResetDailyRateLimiter,
  createAuthGlobalRateLimiter,
  createPhoneResetLookupRateLimiter,
  createPhoneResetIdentityRateLimiter,
  createPhoneResetCodeRateLimiter,
  createPhoneResetResendRateLimiter
} from '../utils/rate-limiter.js';
import { errorResponseSchema, validationErrorResponseSchema } from '@meeshy/shared/types';

// Zod schemas for request validation
// Note: captchaToken is now optional as we use built-in bot protection instead
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  captchaToken: z.string().optional(), // No longer required - using rate limiting + honeypot
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

// Phone password reset schemas
const phoneLookupSchema = z.object({
  phoneNumber: z.string().min(5, 'Phone number is required').max(20),
  countryCode: z.string().length(2, 'Country code must be 2 characters (ISO 3166-1)').optional()
});

const phoneVerifyIdentitySchema = z.object({
  tokenId: z.string().min(1, 'Token ID is required'),
  fullUsername: z.string().min(2, 'Username is required').max(30),
  fullEmail: z.string().email('Valid email is required').max(255)
});

const phoneVerifyCodeSchema = z.object({
  tokenId: z.string().min(1, 'Token ID is required'),
  code: z.string().regex(/^[0-9]{6}$/, 'Code must be 6 digits')
});

const phoneResendCodeSchema = z.object({
  tokenId: z.string().min(1, 'Token ID is required')
});

export async function passwordResetRoutes(fastify: FastifyInstance) {
  // Initialize services
  const redisWrapper = new RedisWrapper();
  const emailService = new EmailService();
  const geoIPService = new GeoIPService();

  // Initialize SMS service
  const smsService = new SmsService();

  // Initialize rate limiters
  const redis = (fastify as any).redis;
  const passwordResetRateLimiter = createPasswordResetRateLimiter(redis);
  const passwordResetDailyRateLimiter = createPasswordResetDailyRateLimiter(redis);
  const authGlobalRateLimiter = createAuthGlobalRateLimiter(redis);

  // Phone reset rate limiters
  const phoneResetLookupRateLimiter = createPhoneResetLookupRateLimiter(redis);
  const phoneResetIdentityRateLimiter = createPhoneResetIdentityRateLimiter(redis);
  const phoneResetCodeRateLimiter = createPhoneResetCodeRateLimiter(redis);
  const phoneResetResendRateLimiter = createPhoneResetResendRateLimiter(redis);

  const passwordResetService = new PasswordResetService(
    fastify.prisma,
    redisWrapper,
    emailService,
    geoIPService,
    process.env.HCAPTCHA_SECRET || '' // Optional now - rate limiting provides protection
  );

  // Phone password reset service
  const phonePasswordResetService = new PhonePasswordResetService(
    fastify.prisma,
    redisWrapper,
    smsService,
    geoIPService
  );

  /**
   * POST /auth/forgot-password
   * Request password reset via email
   */
  fastify.post('/forgot-password', {
    schema: {
      description: 'Initiate password reset process by requesting a reset link via email. This endpoint always returns success to prevent email enumeration attacks. If the email exists, a password reset link will be sent. Protected by rate limiting (3 requests per 30 minutes per IP/email).',
      tags: ['auth'],
      summary: 'Request password reset',
      body: {
        type: 'object',
        required: ['email'],
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
            description: 'Optional hCaptcha verification token (deprecated - rate limiting provides protection)',
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
        429: {
          description: 'Too many password reset requests',
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
    preHandler: [
      passwordResetRateLimiter.middleware(),      // 3 per 30 min per IP+email
      passwordResetDailyRateLimiter.middleware(), // 3 per day per email
      authGlobalRateLimiter.middleware()          // 20 per min per IP
    ]
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

  // ============================================
  // PHONE PASSWORD RESET ROUTES
  // ============================================

  /**
   * POST /auth/forgot-password/phone/lookup
   * Step 1: Lookup user by phone number
   */
  fastify.post('/forgot-password/phone/lookup', {
    schema: {
      description: 'Lookup user account by phone number for password reset. Returns masked user info (partial characters only) for identity verification. Rate limited to 3 lookups per hour per IP.',
      tags: ['auth'],
      summary: 'Phone reset - Step 1: Lookup by phone',
      body: {
        type: 'object',
        required: ['phoneNumber'],
        properties: {
          phoneNumber: {
            type: 'string',
            minLength: 5,
            maxLength: 20,
            description: 'Phone number to lookup (with or without country code)',
            example: '+33612345678'
          },
          countryCode: {
            type: 'string',
            minLength: 2,
            maxLength: 2,
            description: 'ISO 3166-1 alpha-2 country code (e.g., FR, US)',
            example: 'FR'
          }
        }
      },
      response: {
        200: {
          description: 'Lookup result with masked user info',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            tokenId: { type: 'string', description: 'Token ID for next steps' },
            maskedUserInfo: {
              type: 'object',
              properties: {
                displayName: { type: 'string', description: 'Masked display name (e.g., J**n D*e)' },
                username: { type: 'string', description: 'Masked username (e.g., t******5)' },
                email: { type: 'string', description: 'Masked email (e.g., je....n@f*****om)' },
                hasAvatar: { type: 'boolean' },
                avatarUrl: { type: 'string' }
              }
            },
            error: { type: 'string' }
          }
        },
        429: {
          description: 'Rate limit exceeded',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      },
      security: []
    },
    preHandler: [
      phoneResetLookupRateLimiter.middleware(),
      authGlobalRateLimiter.middleware()
    ]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = phoneLookupSchema.parse(request.body);
      const ipAddress = request.ip || '127.0.0.1';
      const userAgent = request.headers['user-agent'] || 'Unknown';

      const result = await phonePasswordResetService.lookupByPhone({
        phoneNumber: body.phoneNumber,
        countryCode: body.countryCode,
        ipAddress,
        userAgent
      });

      return reply.send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'validation_error',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }
      fastify.log.error({ err: error }, '[PhonePasswordReset] Error in phone lookup');
      return reply.status(500).send({ success: false, error: 'internal_error' });
    }
  });

  /**
   * POST /auth/forgot-password/phone/verify-identity
   * Step 2: Verify user identity with full username and email
   */
  fastify.post('/forgot-password/phone/verify-identity', {
    schema: {
      description: 'Verify user identity by providing the complete username AND email. If both match, an SMS code will be sent to the phone number. Rate limited to 3 attempts per 15 minutes.',
      tags: ['auth'],
      summary: 'Phone reset - Step 2: Verify identity',
      body: {
        type: 'object',
        required: ['tokenId', 'fullUsername', 'fullEmail'],
        properties: {
          tokenId: {
            type: 'string',
            description: 'Token ID from phone lookup step'
          },
          fullUsername: {
            type: 'string',
            minLength: 2,
            maxLength: 30,
            description: 'Complete username (case-insensitive)'
          },
          fullEmail: {
            type: 'string',
            format: 'email',
            maxLength: 255,
            description: 'Complete email address (case-insensitive)'
          }
        }
      },
      response: {
        200: {
          description: 'Identity verification result',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            codeSent: { type: 'boolean', description: 'Whether SMS code was sent' },
            attemptsRemaining: { type: 'number', description: 'Remaining identity verification attempts' },
            error: { type: 'string' }
          }
        },
        429: {
          description: 'Rate limit exceeded',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      },
      security: []
    },
    preHandler: [
      phoneResetIdentityRateLimiter.middleware(),
      authGlobalRateLimiter.middleware()
    ]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = phoneVerifyIdentitySchema.parse(request.body);
      const ipAddress = request.ip || '127.0.0.1';
      const userAgent = request.headers['user-agent'] || 'Unknown';

      const result = await phonePasswordResetService.verifyIdentity({
        tokenId: body.tokenId,
        fullUsername: body.fullUsername,
        fullEmail: body.fullEmail,
        ipAddress,
        userAgent
      });

      return reply.send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'validation_error',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }
      fastify.log.error({ err: error }, '[PhonePasswordReset] Error in identity verification');
      return reply.status(500).send({ success: false, error: 'internal_error' });
    }
  });

  /**
   * POST /auth/forgot-password/phone/verify-code
   * Step 3: Verify SMS code
   */
  fastify.post('/forgot-password/phone/verify-code', {
    schema: {
      description: 'Verify the 6-digit SMS code. If correct, returns a password reset token that can be used with the standard /auth/reset-password endpoint. Rate limited to 5 attempts per 10 minutes.',
      tags: ['auth'],
      summary: 'Phone reset - Step 3: Verify SMS code',
      body: {
        type: 'object',
        required: ['tokenId', 'code'],
        properties: {
          tokenId: {
            type: 'string',
            description: 'Token ID from phone lookup step'
          },
          code: {
            type: 'string',
            pattern: '^[0-9]{6}$',
            description: '6-digit SMS verification code'
          }
        }
      },
      response: {
        200: {
          description: 'Code verification result',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            resetToken: {
              type: 'string',
              description: 'Password reset token (use with /auth/reset-password)'
            },
            error: { type: 'string' }
          }
        },
        429: {
          description: 'Rate limit exceeded',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      },
      security: []
    },
    preHandler: [
      phoneResetCodeRateLimiter.middleware(),
      authGlobalRateLimiter.middleware()
    ]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = phoneVerifyCodeSchema.parse(request.body);
      const ipAddress = request.ip || '127.0.0.1';
      const userAgent = request.headers['user-agent'] || 'Unknown';

      const result = await phonePasswordResetService.verifyCode({
        tokenId: body.tokenId,
        code: body.code,
        ipAddress,
        userAgent
      });

      return reply.send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'validation_error',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }
      fastify.log.error({ err: error }, '[PhonePasswordReset] Error in code verification');
      return reply.status(500).send({ success: false, error: 'internal_error' });
    }
  });

  /**
   * POST /auth/forgot-password/phone/resend
   * Resend SMS code
   */
  fastify.post('/forgot-password/phone/resend', {
    schema: {
      description: 'Resend SMS verification code. Rate limited to 1 resend per minute.',
      tags: ['auth'],
      summary: 'Phone reset - Resend SMS code',
      body: {
        type: 'object',
        required: ['tokenId'],
        properties: {
          tokenId: {
            type: 'string',
            description: 'Token ID from phone lookup step'
          }
        }
      },
      response: {
        200: {
          description: 'Resend result',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        429: {
          description: 'Rate limit exceeded - wait before resending',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      },
      security: []
    },
    preHandler: [
      phoneResetResendRateLimiter.middleware(),
      authGlobalRateLimiter.middleware()
    ]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = phoneResendCodeSchema.parse(request.body);
      const ipAddress = request.ip || '127.0.0.1';

      const result = await phonePasswordResetService.resendCode(body.tokenId, ipAddress);

      return reply.send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'validation_error',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }
      fastify.log.error({ err: error }, '[PhonePasswordReset] Error in code resend');
      return reply.status(500).send({ success: false, error: 'internal_error' });
    }
  });

  fastify.log.info('[PasswordReset] Routes registered successfully (including phone reset)');
}
