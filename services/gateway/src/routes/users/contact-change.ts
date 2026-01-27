import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { normalizeEmail, normalizePhoneNumber } from '../../utils/normalize';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { AuthenticatedRequest } from './types';
import { emailSchema } from '@meeshy/shared/types/validation';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { smsService } from '../../services/SmsService';
import crypto from 'crypto';

const logger = enhancedLogger.child({ module: 'contact-change' });

/**
 * Schema pour le changement d'email
 */
const changeEmailSchema = z.object({
  newEmail: z.string().email('Email invalide')
}).strict();

/**
 * Schema pour le changement de téléphone
 */
const changePhoneSchema = z.object({
  newPhoneNumber: z.string().min(10, 'Numéro de téléphone invalide')
}).strict();

/**
 * Schema pour la vérification du changement d'email
 */
const verifyEmailChangeSchema = z.object({
  token: z.string().min(1, 'Token requis')
}).strict();

/**
 * Schema pour la vérification du changement de téléphone
 */
const verifyPhoneChangeSchema = z.object({
  code: z.string().length(6, 'Le code doit contenir 6 chiffres')
}).strict();

/**
 * Génère un token de vérification sécurisé
 */
function generateVerificationToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

/**
 * Hash un token/code
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Génère un code SMS à 6 chiffres
 */
function generatePhoneCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /users/me/change-email - Initie le changement d'email
 */
export async function initiateEmailChange(fastify: FastifyInstance) {
  fastify.post('/users/me/change-email', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Initiate email change. Sends verification email to the new email address. The email change only takes effect after verification.',
      tags: ['users'],
      summary: 'Initiate email change',
      body: {
        type: 'object',
        required: ['newEmail'],
        properties: {
          newEmail: { type: 'string', format: 'email', description: 'New email address' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Verification email sent to new address' },
                pendingEmail: { type: 'string', description: 'The new email awaiting verification' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Email already in use or invalid' }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const body = changeEmailSchema.parse(request.body);
      const newEmail = normalizeEmail(body.newEmail);

      // Get current user
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true, displayName: true, systemLanguage: true }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Check if new email is same as current
      if (newEmail.toLowerCase() === user.email.toLowerCase()) {
        return reply.status(400).send({
          success: false,
          error: 'New email must be different from current email'
        });
      }

      // Check if new email is already in use by another user
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          email: {
            equals: newEmail,
            mode: 'insensitive'
          },
          id: { not: userId }
        }
      });

      if (existingUser) {
        return reply.status(400).send({
          success: false,
          error: 'This email address is already in use'
        });
      }

      // Generate verification token
      const { raw: verificationToken, hash: verificationTokenHash } = generateVerificationToken();
      const tokenExpiryHours = 24;
      const verificationExpiry = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);

      // Store pending email with verification token
      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          pendingEmail: newEmail,
          pendingEmailVerificationToken: verificationTokenHash,
          pendingEmailVerificationExpiry: verificationExpiry
        }
      });

      // Send verification email to the NEW email address
      const { EmailService } = await import('../../services/EmailService');
      const emailService = new EmailService();
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const verificationLink = `${frontendUrl}/settings/verify-email-change?token=${verificationToken}`;

      // Temporary: Use sendEmailVerification with custom link (pending dedicated template)
      await emailService.sendEmailVerification({
        to: newEmail,
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        verificationLink,
        expiryHours: tokenExpiryHours,
        language: user.systemLanguage || 'fr'
      });

      logger.info(`[EMAIL_CHANGE] Verification email sent to ${newEmail} for user ${userId}`);

      return reply.send({
        success: true,
        data: {
          message: 'Verification email sent to new address',
          pendingEmail: newEmail
        }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid data',
          details: error.errors
        });
      }

      logError(fastify.log, 'Initiate email change error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}

/**
 * POST /users/me/verify-email-change - Vérifie et active le changement d'email
 */
export async function verifyEmailChange(fastify: FastifyInstance) {
  fastify.post('/users/me/verify-email-change', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Verify and activate email change using the token sent to the new email address.',
      tags: ['users'],
      summary: 'Verify email change',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Verification token from email' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Email changed successfully' },
                newEmail: { type: 'string', description: 'The new email address' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Invalid or expired token' }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const body = verifyEmailChangeSchema.parse(request.body);
      const hashedToken = hashToken(body.token);

      // Get user with pending email
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          pendingEmail: true,
          pendingEmailVerificationToken: true,
          pendingEmailVerificationExpiry: true
        }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      if (!user.pendingEmail || !user.pendingEmailVerificationToken) {
        return reply.status(400).send({
          success: false,
          error: 'No pending email change'
        });
      }

      // Verify token
      if (user.pendingEmailVerificationToken !== hashedToken) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid verification token'
        });
      }

      // Check expiry
      if (user.pendingEmailVerificationExpiry && user.pendingEmailVerificationExpiry < new Date()) {
        return reply.status(400).send({
          success: false,
          error: 'Verification token has expired'
        });
      }

      // Check if the pending email is still available (in case it was taken by another user since)
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          email: {
            equals: user.pendingEmail,
            mode: 'insensitive'
          },
          id: { not: userId }
        }
      });

      if (existingUser) {
        return reply.status(400).send({
          success: false,
          error: 'This email address is no longer available'
        });
      }

      // Activate the email change
      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          email: user.pendingEmail,
          emailVerifiedAt: new Date(),
          pendingEmail: null,
          pendingEmailVerificationToken: null,
          pendingEmailVerificationExpiry: null
        }
      });

      logger.info(`[EMAIL_CHANGE] Email changed successfully for user ${userId} to ${user.pendingEmail}`);

      return reply.send({
        success: true,
        data: {
          message: 'Email changed successfully',
          newEmail: user.pendingEmail
        }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid data',
          details: error.errors
        });
      }

      logError(fastify.log, 'Verify email change error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}

/**
 * POST /users/me/change-phone - Initie le changement de téléphone
 */
export async function initiatePhoneChange(fastify: FastifyInstance) {
  fastify.post('/users/me/change-phone', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Initiate phone number change. Sends SMS verification code to the new phone number. The phone change only takes effect after verification.',
      tags: ['users'],
      summary: 'Initiate phone change',
      body: {
        type: 'object',
        required: ['newPhoneNumber'],
        properties: {
          newPhoneNumber: { type: 'string', description: 'New phone number (E.164 format recommended)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Verification code sent to new number' },
                pendingPhoneNumber: { type: 'string', description: 'The new phone number awaiting verification' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Phone number already in use or invalid' }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const body = changePhoneSchema.parse(request.body);
      const newPhoneNumber = normalizePhoneNumber(body.newPhoneNumber);

      // Get current user
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, phoneNumber: true }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Check if new phone is same as current
      if (user.phoneNumber && newPhoneNumber === user.phoneNumber) {
        return reply.status(400).send({
          success: false,
          error: 'New phone number must be different from current number'
        });
      }

      // Check if new phone is already in use by another user
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          phoneNumber: newPhoneNumber,
          id: { not: userId }
        }
      });

      if (existingUser) {
        return reply.status(400).send({
          success: false,
          error: 'This phone number is already in use'
        });
      }

      // Generate verification code
      const code = generatePhoneCode();
      const hashedCode = hashToken(code);
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store pending phone with verification code
      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          pendingPhoneNumber: newPhoneNumber,
          pendingPhoneVerificationCode: hashedCode,
          pendingPhoneVerificationExpiry: codeExpiry
        }
      });

      // Send SMS code to the NEW phone number
      const smsResult = await smsService.sendVerificationCode(newPhoneNumber, code);

      if (!smsResult.success) {
        logger.error('[PHONE_CHANGE] Failed to send SMS', smsResult.error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to send verification code'
        });
      }

      logger.info(`[PHONE_CHANGE] Verification code sent to ${newPhoneNumber} for user ${userId} via ${smsResult.provider}`);

      return reply.send({
        success: true,
        data: {
          message: 'Verification code sent to new number',
          pendingPhoneNumber: newPhoneNumber
        }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid data',
          details: error.errors
        });
      }

      logError(fastify.log, 'Initiate phone change error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}

/**
 * POST /users/me/verify-phone-change - Vérifie et active le changement de téléphone
 */
export async function verifyPhoneChange(fastify: FastifyInstance) {
  fastify.post('/users/me/verify-phone-change', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Verify and activate phone number change using the SMS code sent to the new number.',
      tags: ['users'],
      summary: 'Verify phone change',
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 6, description: '6-digit verification code from SMS' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Phone number changed successfully' },
                newPhoneNumber: { type: 'string', description: 'The new phone number' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Invalid or expired code' }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const body = verifyPhoneChangeSchema.parse(request.body);
      const hashedCode = hashToken(body.code);

      // Get user with pending phone
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          phoneNumber: true,
          pendingPhoneNumber: true,
          pendingPhoneVerificationCode: true,
          pendingPhoneVerificationExpiry: true
        }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      if (!user.pendingPhoneNumber || !user.pendingPhoneVerificationCode) {
        return reply.status(400).send({
          success: false,
          error: 'No pending phone change'
        });
      }

      // Verify code
      if (user.pendingPhoneVerificationCode !== hashedCode) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid verification code'
        });
      }

      // Check expiry
      if (user.pendingPhoneVerificationExpiry && user.pendingPhoneVerificationExpiry < new Date()) {
        return reply.status(400).send({
          success: false,
          error: 'Verification code has expired'
        });
      }

      // Check if the pending phone is still available
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          phoneNumber: user.pendingPhoneNumber,
          id: { not: userId }
        }
      });

      if (existingUser) {
        return reply.status(400).send({
          success: false,
          error: 'This phone number is no longer available'
        });
      }

      // Activate the phone change
      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          phoneNumber: user.pendingPhoneNumber,
          phoneVerifiedAt: new Date(),
          pendingPhoneNumber: null,
          pendingPhoneVerificationCode: null,
          pendingPhoneVerificationExpiry: null
        }
      });

      logger.info(`[PHONE_CHANGE] Phone changed successfully for user ${userId} to ${user.pendingPhoneNumber}`);

      return reply.send({
        success: true,
        data: {
          message: 'Phone number changed successfully',
          newPhoneNumber: user.pendingPhoneNumber
        }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid data',
          details: error.errors
        });
      }

      logError(fastify.log, 'Verify phone change error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}
