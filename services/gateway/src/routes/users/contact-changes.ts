import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyPassword } from '../../utils/password-hash';
import { logError } from '../../utils/logger';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { normalizeEmail, normalizePhoneNumber } from '../../utils/normalize';
import { errorResponseSchema, userSchema } from '@meeshy/shared/types/api-schemas';
import { UserRoleEnum } from '@meeshy/shared/types';
import { smsService } from '../../services/SmsService';
import { getCacheStore } from '../../services/CacheStore';
import { createContactChangeRateLimitConfig } from '../../middleware/rate-limiter';
import { sendSuccess, sendError, sendInternalError, sendNotFound, sendUnauthorized, sendBadRequest } from '../../utils/response';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { formatUserResponse } from '../auth/types';
import { servedUserPermissions } from '../../services/admin/served-permissions';
import type { AuthenticatedRequest } from './types';
import {
  generateVerificationToken,
  hashToken,
  generatePhoneCode,
  comparerEnTempsConstant,
  compterEssaiRate,
  oublierEssais,
  verifierPlafondValeurCible,
} from './contact-change';

/**
 * `POST /users/me/contact-changes` et ses deux gestes satellites (#4341).
 *
 * Ce fichier porte la surface CIBLE annoncée par #4184 c.3/c.4/c.5/c.6 et
 * jamais construite : les cinq anciennes adresses de `contact-change.ts`
 * restent montées en ALIAS (§ ANNONCE_CONTACT_CHANGE de ce fichier voisin) et
 * délèguent leur PROTECTION par valeur cible aux mêmes fonctions exportées
 * que celles-ci appellent — jamais une seconde implémentation du plafond.
 *
 * Fichier SÉPARÉ de `contact-change.ts`, volontairement : le budget de taille
 * du dépôt (800–1100 lignes/fichier, `CLAUDE.md` racine) interdit d'empiler
 * quatre routes neuves, chacune avec son schéma complet, sur un fichier déjà
 * à 799 lignes. Les deux fichiers partagent leurs PRIMITIVES (génération de
 * token/code, hachage, comparaison à temps constant, compteur d'essais,
 * plafond par valeur cible) via des exports de `contact-change.ts` — jamais
 * une copie.
 */

const logger = enhancedLogger.child({ module: 'contact-changes' });

type ContactChannel = 'email' | 'phone';

/**
 * `POST /me/contact-changes` — schéma d'entrée (#4341, point 1).
 *
 * `currentPassword` est REQUIS : c'est la dernière asymétrie de la famille —
 * `PATCH /users/me/username` et `/password` (`profile.ts`) l'exigent déjà,
 * `change-email`/`change-phone` (l'ancienne surface) ne le font pas. La
 * comparaison passe par `verifyPassword` (`utils/password-hash`) — SITE UNIQUE
 * du hachage de mot de passe (#5216) —, jamais un `bcrypt.compare` direct.
 */
const contactChangeInitiateSchema = z.object({
  channel: z.enum(['email', 'phone']),
  value: z.string().min(1, 'Valeur requise'),
  currentPassword: z.string().min(1, 'Mot de passe requis'),
}).strict();

const contactChangeVerifySchema = z.object({
  code: z.string().min(1, 'Code requis'),
}).strict();

const channelParamsSchema = {
  type: 'object',
  required: ['channel'],
  properties: {
    channel: { type: 'string', enum: ['email', 'phone'], description: 'Contact channel: email or phone' }
  }
} as const;

/**
 * POST /users/me/contact-changes — initie un changement d'email ou de
 * téléphone (#4341, point 1). Remplace `change-email`/`change-phone`.
 */
export async function initiateContactChange(fastify: FastifyInstance) {
  fastify.post('/users/me/contact-changes', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createContactChangeRateLimitConfig('initiate') },
    schema: {
      description: "Initiate an email or phone number change. Replaces POST /users/me/change-email and /change-phone (now legacy addresses): the channel is chosen in the body, and the current password is required — the last asymmetry with PATCH /users/me/username and /password, which already require it (#4341).",
      tags: ['users'],
      summary: 'Initiate contact change',
      body: {
        type: 'object',
        required: ['channel', 'value', 'currentPassword'],
        properties: {
          channel: { type: 'string', enum: ['email', 'phone'], description: 'Which contact channel to change' },
          value: { type: 'string', description: 'New email address or phone number, depending on channel' },
          currentPassword: { type: 'string', minLength: 1, description: 'Current password for verification' },
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
                message: { type: 'string', example: 'Verification sent to new address' },
                channel: { type: 'string', enum: ['email', 'phone'] },
                pendingValue: { type: 'string', description: 'The new email or phone number awaiting verification' },
              }
            }
          }
        },
        400: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'Validation error, incorrect password, or value already in use' },
          }
        },
        401: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;
      const body = contactChangeInitiateSchema.parse(request.body);

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, phoneNumber: true, password: true,
          firstName: true, lastName: true, displayName: true,
          ...RECIPIENT_LANG_SELECT,
        }
      });
      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      const isPasswordValid = await verifyPassword(body.currentPassword, user.password);
      if (!isPasswordValid) {
        return sendBadRequest(reply, 'Current password is incorrect');
      }

      if (body.channel === 'email') {
        const newEmail = normalizeEmail(body.value);
        if (newEmail.toLowerCase() === user.email.toLowerCase()) {
          return sendBadRequest(reply, 'New email must be different from current email');
        }
        const existing = await fastify.prisma.user.findFirst({
          where: { email: { equals: newEmail, mode: 'insensitive' }, id: { not: userId } }
        });
        if (existing) {
          return sendBadRequest(reply, 'This email address is already in use');
        }

        // Plafond par VALEUR CIBLE (#4341, point 2) — la MÊME fonction que
        // les deux anciennes adresses appellent : compte ENSEMBLE.
        const plafond = await verifierPlafondValeurCible('email', newEmail);
        if (!plafond.autorise) {
          return sendError(reply, 429, 'Trop de demandes de changement vers cette adresse. Veuillez patienter.');
        }

        const { raw: verificationToken, hash: verificationTokenHash } = generateVerificationToken();
        const tokenExpiryHours = 24;
        const verificationExpiry = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);

        await fastify.prisma.user.update({
          where: { id: userId },
          data: {
            pendingEmail: newEmail,
            pendingEmailVerificationToken: verificationTokenHash,
            pendingEmailVerificationExpiry: verificationExpiry,
          }
        });

        const { EmailService } = await import('../../services/EmailService');
        const emailService = new EmailService();
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const verificationLink = `${frontendUrl}/settings/verify-email-change?token=${verificationToken}`;
        await emailService.sendEmailChangeVerification({
          to: newEmail,
          name: user.displayName || `${user.firstName} ${user.lastName}`,
          verificationLink,
          expiryHours: tokenExpiryHours,
          language: recipientLanguage(user, 'fr'),
        });

        logger.info(`[CONTACT_CHANGE] Verification email sent to ${newEmail} for user ${userId}`);
        return sendSuccess(reply, { message: 'Verification email sent to new address', channel: 'email', pendingValue: newEmail });
      }

      const newPhoneNumber = normalizePhoneNumber(body.value);
      if (user.phoneNumber && newPhoneNumber === user.phoneNumber) {
        return sendBadRequest(reply, 'New phone number must be different from current number');
      }
      const existingPhone = await fastify.prisma.user.findFirst({
        where: { phoneNumber: newPhoneNumber, id: { not: userId } }
      });
      if (existingPhone) {
        return sendBadRequest(reply, 'This phone number is already in use');
      }

      const plafondPhone = await verifierPlafondValeurCible('phone', newPhoneNumber);
      if (!plafondPhone.autorise) {
        return sendError(reply, 429, 'Trop de demandes de changement vers ce numéro. Veuillez patienter.');
      }

      const code = generatePhoneCode();
      const hashedCode = hashToken(code);
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);

      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          pendingPhoneNumber: newPhoneNumber,
          pendingPhoneVerificationCode: hashedCode,
          pendingPhoneVerificationExpiry: codeExpiry,
        }
      });

      const smsResult = await smsService.sendVerificationCode(newPhoneNumber, code);
      if (!smsResult.success) {
        logger.error('[CONTACT_CHANGE] Failed to send SMS', smsResult.error);
        return sendInternalError(reply, 'Failed to send verification code');
      }

      logger.info(`[CONTACT_CHANGE] Verification code sent to ${newPhoneNumber} for user ${userId} via ${smsResult.provider}`);
      return sendSuccess(reply, { message: 'Verification code sent to new number', channel: 'phone', pendingValue: newPhoneNumber });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, error.issues[0]?.message || 'Invalid data');
      }
      logError(fastify.log, 'Initiate contact change error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * POST /users/me/contact-changes/:channel/verify — vérifie et active un
 * changement en attente (#4341, point 3). Remplace `verify-email-change` et
 * `verify-phone-change`, et rend le PROFIL À JOUR dans sa réponse — ce qui
 * supprime le besoin d'un `checkExistingSession` iOS après coup.
 */
export async function verifyContactChange(fastify: FastifyInstance) {
  fastify.post<{ Params: { channel: ContactChannel } }>('/users/me/contact-changes/:channel/verify', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createContactChangeRateLimitConfig('verify') },
    schema: {
      description: 'Verify and activate a pending email or phone change. Replaces POST /users/me/verify-email-change and /verify-phone-change, and returns the updated profile — no extra GET /users/me round-trip is required (#4341).',
      tags: ['users'],
      summary: 'Verify contact change',
      params: channelParamsSchema,
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', description: 'Verification token (email) or 6-digit SMS code (phone)' }
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
                message: { type: 'string', example: 'Contact updated successfully' },
                user: userSchema,
              }
            }
          }
        },
        400: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'Invalid or expired code, or value no longer available' },
          }
        },
        401: errorResponseSchema,
        429: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', description: 'Too many invalid codes — the pending change was cancelled' },
          }
        },
        500: errorResponseSchema,
      }
    }
  }, async (request, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;
      const channel = request.params.channel;
      const body = contactChangeVerifySchema.parse(request.body);
      const hashedCode = hashToken(body.code);

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, phoneNumber: true,
          pendingEmail: true, pendingEmailVerificationToken: true, pendingEmailVerificationExpiry: true,
          pendingPhoneNumber: true, pendingPhoneVerificationCode: true, pendingPhoneVerificationExpiry: true,
        }
      });
      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let updatedUser: any;

      if (channel === 'email') {
        if (!user.pendingEmail || !user.pendingEmailVerificationToken) {
          return sendBadRequest(reply, 'No pending email change');
        }
        // Comparaison à TEMPS CONSTANT (#4184 c.4) — la vérification unifiée
        // l'applique aux DEUX canaux ; l'ancienne route e-mail comparait en
        // clair (`!==`), l'ancienne route téléphone déjà en temps constant.
        if (!comparerEnTempsConstant(user.pendingEmailVerificationToken, hashedCode)) {
          return sendBadRequest(reply, 'Invalid verification token');
        }
        if (user.pendingEmailVerificationExpiry && user.pendingEmailVerificationExpiry < new Date()) {
          return sendBadRequest(reply, 'Verification token has expired');
        }
        const existing = await fastify.prisma.user.findFirst({
          where: { email: { equals: user.pendingEmail, mode: 'insensitive' }, id: { not: userId } }
        });
        if (existing) {
          return sendBadRequest(reply, 'This email address is no longer available');
        }
        updatedUser = await fastify.prisma.user.update({
          where: { id: userId },
          data: {
            email: user.pendingEmail,
            emailVerifiedAt: new Date(),
            pendingEmail: null,
            pendingEmailVerificationToken: null,
            pendingEmailVerificationExpiry: null,
          }
        });
        logger.info(`[CONTACT_CHANGE] Email changed successfully for user ${userId}`);
      } else {
        if (!user.pendingPhoneNumber || !user.pendingPhoneVerificationCode) {
          return sendBadRequest(reply, 'No pending phone change');
        }
        if (!comparerEnTempsConstant(user.pendingPhoneVerificationCode, hashedCode)) {
          const { plafondAtteint } = await compterEssaiRate(userId);
          if (plafondAtteint) {
            await fastify.prisma.user.update({
              where: { id: userId },
              data: { pendingPhoneNumber: null, pendingPhoneVerificationCode: null, pendingPhoneVerificationExpiry: null }
            });
            await oublierEssais(userId);
            logger.warn(`[CONTACT_CHANGE] essais epuises, demande annulee pour ${userId}`);
            return sendError(reply, 429, 'Too many invalid codes. The phone change request has been cancelled.');
          }
          return sendBadRequest(reply, 'Invalid verification code');
        }
        if (user.pendingPhoneVerificationExpiry && user.pendingPhoneVerificationExpiry < new Date()) {
          return sendBadRequest(reply, 'Verification code has expired');
        }
        const existingPhone = await fastify.prisma.user.findFirst({
          where: { phoneNumber: user.pendingPhoneNumber, id: { not: userId } }
        });
        if (existingPhone) {
          return sendBadRequest(reply, 'This phone number is no longer available');
        }
        updatedUser = await fastify.prisma.user.update({
          where: { id: userId },
          data: {
            phoneNumber: user.pendingPhoneNumber,
            phoneVerifiedAt: new Date(),
            pendingPhoneNumber: null,
            pendingPhoneVerificationCode: null,
            pendingPhoneVerificationExpiry: null,
          }
        });
        await oublierEssais(userId);
        logger.info(`[CONTACT_CHANGE] Phone changed successfully for user ${userId}`);
      }

      // La MATRICE, jamais une copie (#4152) — même garde que `profile.ts`.
      const permissions = servedUserPermissions(updatedUser.role as UserRoleEnum);
      return sendSuccess(reply, {
        message: 'Contact updated successfully',
        user: formatUserResponse(updatedUser, permissions),
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, error.issues[0]?.message || 'Invalid data');
      }
      logError(fastify.log, 'Verify contact change error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * POST /users/me/contact-changes/:channel/resend — renvoie la vérification
 * en attente (#4341, point 4). Remplace `resend-email-change-verification`
 * ET lui ajoute son pendant TÉLÉPHONE, qui n'existait pas : un code SMS perdu
 * obligeait à relancer un changement complet.
 */
export async function resendContactChangeVerification(fastify: FastifyInstance) {
  fastify.post<{ Params: { channel: ContactChannel } }>('/users/me/contact-changes/:channel/resend', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createContactChangeRateLimitConfig('resend') },
    schema: {
      description: 'Resend the pending verification for an email or phone change. Replaces POST /users/me/resend-email-change-verification, and adds its SMS twin for the phone channel (#4341).',
      tags: ['users'],
      summary: 'Resend contact change verification',
      params: channelParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Verification resent' },
                channel: { type: 'string', enum: ['email', 'phone'] },
                pendingValue: { type: 'string', description: 'The email or phone number awaiting verification' },
              }
            }
          }
        },
        400: {
          ...errorResponseSchema,
          properties: { ...errorResponseSchema.properties, error: { type: 'string', description: 'No pending change' } }
        },
        401: errorResponseSchema,
        429: {
          ...errorResponseSchema,
          properties: { ...errorResponseSchema.properties, error: { type: 'string', description: 'Rate limit exceeded' } }
        },
        500: errorResponseSchema,
      }
    }
  }, async (request, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;
      const channel = request.params.channel;
      const cacheStore = getCacheStore();
      const rateLimitKey = `resend-contact-change:${channel}:${userId}`;

      // Fail-CLOSED — même garde que l'ancien renvoi e-mail (#4184, c.5) :
      // une lecture de cache qui échoue REFUSE, jamais n'ouvre.
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

      if (channel === 'email') {
        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, firstName: true, lastName: true, displayName: true, ...RECIPIENT_LANG_SELECT, pendingEmail: true }
        });
        if (!user) return sendNotFound(reply, 'User not found');
        if (!user.pendingEmail) return sendBadRequest(reply, 'No pending email change');

        const { raw: verificationToken, hash: verificationTokenHash } = generateVerificationToken();
        const tokenExpiryHours = 24;
        const verificationExpiry = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);
        await fastify.prisma.user.update({
          where: { id: userId },
          data: { pendingEmailVerificationToken: verificationTokenHash, pendingEmailVerificationExpiry: verificationExpiry }
        });
        await cacheStore.set(rateLimitKey, Date.now().toString(), 60);

        const { EmailService } = await import('../../services/EmailService');
        const emailService = new EmailService();
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const verificationLink = `${frontendUrl}/settings/verify-email-change?token=${verificationToken}`;
        await emailService.sendEmailChangeVerification({
          to: user.pendingEmail,
          name: user.displayName || `${user.firstName} ${user.lastName}`,
          verificationLink,
          expiryHours: tokenExpiryHours,
          language: recipientLanguage(user, 'fr'),
        });

        logger.info(`[CONTACT_CHANGE] Verification email resent to ${user.pendingEmail} for user ${userId}`);
        return sendSuccess(reply, { message: 'Verification email resent', channel: 'email', pendingValue: user.pendingEmail });
      }

      // Le pendant SMS de `resend` (#4341, point 4) — n'existait pas avant ce
      // lot. Ne touche PAS le compteur d'essais (`compterEssaiRate`) : un
      // renvoi donne un SMS FRAIS, pas un budget de tentatives frais — sinon
      // le plafond de 5 essais (#4184, c.4) se contournerait en renvoyant.
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, pendingPhoneNumber: true }
      });
      if (!user) return sendNotFound(reply, 'User not found');
      if (!user.pendingPhoneNumber) return sendBadRequest(reply, 'No pending phone change');

      const code = generatePhoneCode();
      const hashedCode = hashToken(code);
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { pendingPhoneVerificationCode: hashedCode, pendingPhoneVerificationExpiry: codeExpiry }
      });
      await cacheStore.set(rateLimitKey, Date.now().toString(), 60);

      const smsResult = await smsService.sendVerificationCode(user.pendingPhoneNumber, code);
      if (!smsResult.success) {
        logger.error('[CONTACT_CHANGE] Failed to resend SMS', smsResult.error);
        return sendInternalError(reply, 'Failed to resend verification code');
      }

      logger.info(`[CONTACT_CHANGE] Verification code resent to ${user.pendingPhoneNumber} for user ${userId} via ${smsResult.provider}`);
      return sendSuccess(reply, { message: 'Verification code resent', channel: 'phone', pendingValue: user.pendingPhoneNumber });

    } catch (error: unknown) {
      logError(fastify.log, 'Resend contact change error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * GET /users/me/contact-changes — dit si un changement est en attente, SANS
 * relire le profil complet (#4341, point 5).
 */
export async function getContactChangeStatus(fastify: FastifyInstance) {
  fastify.get('/users/me/contact-changes', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Report whether an email or phone change is currently pending, without re-fetching the full profile (#4341).',
      tags: ['users'],
      summary: 'Get pending contact changes',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                email: {
                  type: 'object',
                  properties: {
                    pending: { type: 'boolean' },
                    value: { type: 'string', nullable: true },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  }
                },
                phone: {
                  type: 'object',
                  properties: {
                    pending: { type: 'boolean' },
                    value: { type: 'string', nullable: true },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }
      const userId = authContext.userId;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          pendingEmail: true, pendingEmailVerificationExpiry: true,
          pendingPhoneNumber: true, pendingPhoneVerificationExpiry: true,
        }
      });
      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, {
        email: {
          pending: user.pendingEmail !== null,
          value: user.pendingEmail,
          expiresAt: user.pendingEmailVerificationExpiry,
        },
        phone: {
          pending: user.pendingPhoneNumber !== null,
          value: user.pendingPhoneNumber,
          expiresAt: user.pendingPhoneVerificationExpiry,
        },
      });
    } catch (error: unknown) {
      logError(fastify.log, 'Get contact change status error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}
