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
import { generateNumericCode } from '../../utils/verification-code';
import { getCacheStore } from '../../services/CacheStore';
import { createContactChangeRateLimitConfig } from '../../middleware/rate-limiter';
import { sendSuccess, sendError, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendConflict } from '../../utils/response';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';

const logger = enhancedLogger.child({ module: 'contact-change' });

/**
 * Le plafond d'essais sur un code SMS, et sa fenêtre (#4184, critère 4).
 *
 * Six chiffres, c'est un million de combinaisons — quelques minutes d'appels
 * si personne ne compte. Cinq essais suffisent LARGEMENT à une faute de frappe
 * et ne suffisent à aucune recherche exhaustive.
 */
const ESSAIS_MAX_CODE_TELEPHONE = 5;
/** La fenêtre suit la durée de vie du code (15 min) : compter au-delà n'a pas d'objet. */
const FENETRE_ESSAIS_SECONDES = 900;

const cleEssaisTelephone = (userId: string) => `verify-phone-attempts:${userId}`;

/**
 * Compte un essai RATÉ et dit si le plafond est franchi.
 *
 * Le compteur vit dans le cache, comme le limiteur de renvoi voisin. C'est
 * assumé et borné : un cache vidé remettrait le compteur à zéro, et un
 * compteur qui repart à zéro n'est pas un compteur. C'est pourquoi l'appelant
 * n'utilise PAS ce verdict pour refuser seulement — il EFFACE la demande en
 * attente dans la ligne `User`. Le verdict est ainsi écrit là où il DURE :
 * même cache perdu, le code deviné n'ouvre plus rien, parce qu'il n'y a plus
 * de demande à confirmer.
 *
 * Et l'incrément est posé sur l'ÉCHEC, jamais sur le succès : c'est le chemin
 * raté que suit une recherche exhaustive, et une garde qui ne se déclenche
 * que sur le chemin réussi ne garde personne.
 */
async function compterEssaiRate(userId: string): Promise<{ plafondAtteint: boolean }> {
  const cache = getCacheStore();
  const cle = cleEssaisTelephone(userId);
  try {
    const precedents = Number.parseInt((await cache.get(cle)) ?? '0', 10) || 0;
    const total = precedents + 1;
    await cache.set(cle, String(total), FENETRE_ESSAIS_SECONDES);
    return { plafondAtteint: total >= ESSAIS_MAX_CODE_TELEPHONE };
  } catch {
    // Le gardien en panne ne devient pas l'absence de garde : un essai qu'on
    // ne peut pas compter est traité comme le dernier autorisé.
    return { plafondAtteint: true };
  }
}

/** Une vérification RÉUSSIE rend son crédit à l'utilisateur — sinon une faute
 *  de frappe d'hier enfermerait la demande de demain. */
async function oublierEssais(userId: string): Promise<void> {
  try {
    await getCacheStore().del(cleEssaisTelephone(userId));
  } catch {
    // Sans conséquence : la fenêtre expire d'elle-même.
  }
}

/**
 * Schema pour le changement d'email
 */
const changeEmailSchema = z.object({
  newEmail: z.email('Email invalide')
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
  // Cryptographically secure 6-digit code (CWE-338) — single source of truth.
  return generateNumericCode();
}

/**
 * POST /users/me/change-email - Initie le changement d'email
 */
export async function initiateEmailChange(fastify: FastifyInstance) {
  fastify.post('/users/me/change-email', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createContactChangeRateLimitConfig('initiate') },
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
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'Email already in use or invalid' },
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
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;
      const body = changeEmailSchema.parse(request.body);
      const newEmail = normalizeEmail(body.newEmail);

      // Get current user
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true, displayName: true, ...RECIPIENT_LANG_SELECT }
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      // Check if new email is same as current
      if (newEmail.toLowerCase() === user.email.toLowerCase()) {
        return sendBadRequest(reply, 'New email must be different from current email');
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
        return sendBadRequest(reply, 'This email address is already in use');
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

      await emailService.sendEmailChangeVerification({
        to: newEmail,
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        verificationLink,
        expiryHours: tokenExpiryHours,
        language: recipientLanguage(user, 'fr')
      });

      logger.info(`[EMAIL_CHANGE] Verification email sent to ${newEmail} for user ${userId}`);

      return sendSuccess(reply, {
        message: 'Verification email sent to new address',
        pendingEmail: newEmail
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, error.issues[0]?.message || 'Invalid data');
      }

      logError(fastify.log, 'Initiate email change error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * POST /users/me/verify-email-change - Vérifie et active le changement d'email
 */
export async function verifyEmailChange(fastify: FastifyInstance) {
  fastify.post('/users/me/verify-email-change', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createContactChangeRateLimitConfig('verify') },
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
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'Invalid or expired token' },
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
        return sendUnauthorized(reply, 'Authentication required');
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
        return sendNotFound(reply, 'User not found');
      }

      if (!user.pendingEmail || !user.pendingEmailVerificationToken) {
        return sendBadRequest(reply, 'No pending email change');
      }

      // Verify token
      if (user.pendingEmailVerificationToken !== hashedToken) {
        return sendBadRequest(reply, 'Invalid verification token');
      }

      // Check expiry
      if (user.pendingEmailVerificationExpiry && user.pendingEmailVerificationExpiry < new Date()) {
        return sendBadRequest(reply, 'Verification token has expired');
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
        return sendBadRequest(reply, 'This email address is no longer available');
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

      return sendSuccess(reply, {
        message: 'Email changed successfully',
        newEmail: user.pendingEmail
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, error.issues[0]?.message || 'Invalid data');
      }

      logError(fastify.log, 'Verify email change error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * POST /users/me/resend-email-change-verification - Renvoie l'email de vérification du changement
 */
export async function resendEmailChangeVerification(fastify: FastifyInstance) {
  fastify.post('/users/me/resend-email-change-verification', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createContactChangeRateLimitConfig('resend') },
    schema: {
      description: 'Resend verification email for pending email change. Generates a new token and sends to the pending email address.',
      tags: ['users'],
      summary: 'Resend email change verification',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Verification email resent' },
                pendingEmail: { type: 'string', description: 'The email address awaiting verification' }
              }
            }
          }
        },
        400: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'No pending email change' },
          }
        },
        401: errorResponseSchema,
        429: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'Rate limit exceeded' },
          }
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;

      // Get user with pending email
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          displayName: true,
          ...RECIPIENT_LANG_SELECT,
          pendingEmail: true,
          pendingEmailVerificationExpiry: true
        }
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      if (!user.pendingEmail) {
        return sendBadRequest(reply, 'No pending email change');
      }

      // Rate limiting: Check if we sent an email in the last minute.
      //
      // #4184 c.5 — FAIL-CLOSED. La lecture était nue : une panne du cache
      // faisait lever, la route rendait 500 sans envoyer — mais toute lecture
      // qui ne rend RIEN laissait passer, et la panne du gardien devenait
      // l'absence de garde sur un envoi d'e-mails en boucle. Un limiteur qu'on
      // ne peut pas interroger REFUSE : le coût est un renvoi différé d'une
      // minute, contre un envoi non borné vers une adresse choisie.
      const cacheStore = getCacheStore();
      const rateLimitKey = `resend-email-change:${userId}`;
      let lastSent: string | null;
      try {
        lastSent = await cacheStore.get(rateLimitKey);
      } catch {
        return sendError(reply, 429, 'Verification service temporarily unavailable, please retry shortly');
      }

      if (lastSent) {
        const secondsRemaining = Math.ceil((parseInt(lastSent) + 60000 - Date.now()) / 1000);
        if (secondsRemaining > 0) {
          return sendError(reply, 429, `Please wait ${secondsRemaining} seconds before resending`);
        }
      }

      // Generate new verification token
      const { raw: verificationToken, hash: verificationTokenHash } = generateVerificationToken();
      const tokenExpiryHours = 24;
      const verificationExpiry = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);

      // Update user with new token
      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          pendingEmailVerificationToken: verificationTokenHash,
          pendingEmailVerificationExpiry: verificationExpiry
        }
      });

      // Set rate limit
      await cacheStore.set(rateLimitKey, Date.now().toString(), 60);

      // Send verification email
      const { EmailService } = await import('../../services/EmailService');
      const emailService = new EmailService();
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const verificationLink = `${frontendUrl}/settings/verify-email-change?token=${verificationToken}`;

      await emailService.sendEmailChangeVerification({
        to: user.pendingEmail,
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        verificationLink,
        expiryHours: tokenExpiryHours,
        language: recipientLanguage(user, 'fr')
      });

      logger.info(`[EMAIL_CHANGE] Verification email resent to ${user.pendingEmail} for user ${userId}`);

      return sendSuccess(reply, {
        message: 'Verification email resent',
        pendingEmail: user.pendingEmail
      });

    } catch (error: unknown) {
      logError(fastify.log, 'Resend email change verification error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * POST /users/me/change-phone - Initie le changement de téléphone
 */
export async function initiatePhoneChange(fastify: FastifyInstance) {
  fastify.post('/users/me/change-phone', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createContactChangeRateLimitConfig('initiate') },
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
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'Phone number already in use or invalid' },
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
        return sendUnauthorized(reply, 'Authentication required');
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
        return sendNotFound(reply, 'User not found');
      }

      // Check if new phone is same as current
      if (user.phoneNumber && newPhoneNumber === user.phoneNumber) {
        return sendBadRequest(reply, 'New phone number must be different from current number');
      }

      // Check if new phone is already in use by another user
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          phoneNumber: newPhoneNumber,
          id: { not: userId }
        }
      });

      if (existingUser) {
        return sendBadRequest(reply, 'This phone number is already in use');
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
        return sendInternalError(reply, 'Failed to send verification code');
      }

      logger.info(`[PHONE_CHANGE] Verification code sent to ${newPhoneNumber} for user ${userId} via ${smsResult.provider}`);

      return sendSuccess(reply, {
        message: 'Verification code sent to new number',
        pendingPhoneNumber: newPhoneNumber
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, error.issues[0]?.message || 'Invalid data');
      }

      logError(fastify.log, 'Initiate phone change error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * POST /users/me/verify-phone-change - Vérifie et active le changement de téléphone
 */
export async function verifyPhoneChange(fastify: FastifyInstance) {
  fastify.post('/users/me/verify-phone-change', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createContactChangeRateLimitConfig('verify') },
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
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'Invalid or expired code' },
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
        return sendUnauthorized(reply, 'Authentication required');
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
        return sendNotFound(reply, 'User not found');
      }

      if (!user.pendingPhoneNumber || !user.pendingPhoneVerificationCode) {
        return sendBadRequest(reply, 'No pending phone change');
      }

      // Verify code — comparaison à TEMPS CONSTANT (#4184 c.4). Les deux
      // valeurs sont des empreintes, donc la fuite serait fine ; `timingSafeEqual`
      // la supprime pour le coût d'une longueur à comparer d'abord (la fonction
      // lève sur des tailles différentes).
      const attendu = Buffer.from(user.pendingPhoneVerificationCode, 'utf8');
      const fourni = Buffer.from(hashedCode, 'utf8');
      const codeJuste = attendu.length === fourni.length && crypto.timingSafeEqual(attendu, fourni);

      if (!codeJuste) {
        const { plafondAtteint } = await compterEssaiRate(userId);

        if (plafondAtteint) {
          // Le verdict s'écrit LÀ OÙ IL DURE — voir `compterEssaiRate`.
          await fastify.prisma.user.update({
            where: { id: userId },
            data: {
              pendingPhoneNumber: null,
              pendingPhoneVerificationCode: null,
              pendingPhoneVerificationExpiry: null
            }
          });
          await oublierEssais(userId);
          logger.warn(`[PHONE_CHANGE] essais epuises, demande annulee pour ${userId}`);
          return sendError(reply, 429, 'Too many invalid codes. The phone change request has been cancelled.');
        }

        return sendBadRequest(reply, 'Invalid verification code');
      }

      // Check expiry
      if (user.pendingPhoneVerificationExpiry && user.pendingPhoneVerificationExpiry < new Date()) {
        return sendBadRequest(reply, 'Verification code has expired');
      }

      // Check if the pending phone is still available
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          phoneNumber: user.pendingPhoneNumber,
          id: { not: userId }
        }
      });

      if (existingUser) {
        return sendBadRequest(reply, 'This phone number is no longer available');
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

      await oublierEssais(userId);

      logger.info(`[PHONE_CHANGE] Phone changed successfully for user ${userId} to ${user.pendingPhoneNumber}`);

      return sendSuccess(reply, {
        message: 'Phone number changed successfully',
        newPhoneNumber: user.pendingPhoneNumber
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, error.issues[0]?.message || 'Invalid data');
      }

      logError(fastify.log, 'Verify phone change error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}
