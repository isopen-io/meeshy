/**
 * Identifiants du compte : `PATCH /users/me/password`,
 * `/users/me/username`. Extrait de `profile.ts` (#4284, budget de taille) —
 * la façade de ré-export vit là-bas.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { hashPassword, verifyPassword } from '../../utils/password-hash';
import {
  updatePasswordSchema,
  updateUsernameSchema
} from '@meeshy/shared/utils/validation';
import {
  errorResponseSchema,
  validationErrorResponseSchema,
  usernamePatternSource
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest } from './types';
import { authUserCacheKey } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendError, sendInternalError, sendNotFound, sendUnauthorized, sendBadRequest } from '../../utils/response';
import { searchTokensFor } from '../../utils/search-tokens';

const logger = enhancedLogger.child({ module: 'UserProfileRoutes' });

/**
 * Change user password
 */
export async function updateUserPassword(fastify: FastifyInstance) {
  fastify.patch('/users/me/password', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Change the authenticated user password. Requires current password for verification. New password must meet security requirements.',
      tags: ['users'],
      summary: 'Change user password',
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1, description: 'Current password for verification — no length bound: a bound would lock out accounts created under a lower one' },
          newPassword: { type: 'string', minLength: 6, description: 'New password (min 6 characters — PASSWORD_MIN_LENGTH)' }
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
                message: { type: 'string', example: 'Password updated successfully' }
              }
            }
          }
        },
        400: { description: 'Validation error or incorrect current password', ...validationErrorResponseSchema },
        401: errorResponseSchema,
        404: errorResponseSchema,
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

      const body = updatePasswordSchema.parse(request.body);

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true }
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      const isPasswordValid = await verifyPassword(body.currentPassword, user.password);

      if (!isPasswordValid) {
        return sendBadRequest(reply, 'Current password is incorrect');
      }

      const hashedPassword = await hashPassword(body.newPassword);

      await fastify.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      // Notification sécurité
      const notificationService = fastify.notificationService;
      if (notificationService) {
        notificationService.createPasswordChangedNotification({
          recipientUserId: userId,
        }).catch((err: unknown) => logger.error('Notification error password_changed', err as Error));
      }

      return sendSuccess(reply, { message: 'Password updated successfully' });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, error.issues[0]?.message || 'Invalid data');
      }

      logError(fastify.log, 'Update password error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Body de `PATCH /users/me/username`, extrait de la déclaration de route pour
 * être montable dans un test sans booter le service entier — le contrat Ajv est
 * ainsi vérifié par le vrai compilateur, pas par une copie du schéma.
 */
export const updateUsernameBodySchema = {
  type: 'object',
  required: ['newUsername', 'currentPassword'],
  properties: {
    newUsername: {
      type: 'string',
      minLength: 2,
      maxLength: 16,
      pattern: usernamePatternSource,
      description: 'New username (2-16 chars: letters, digits, - and _ only — no spaces)'
    },
    currentPassword: { type: 'string', minLength: 1, description: 'Current password for verification' }
  }
} as const;

/**
 * Change username with history tracking
 */
export async function updateUsername(fastify: FastifyInstance) {
  fastify.patch('/users/me/username', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Change the authenticated user username. Requires password confirmation. Username changes are limited to once every 30 days and history is tracked (max 10 entries).',
      tags: ['users'],
      summary: 'Change username',
      body: updateUsernameBodySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                username: { type: 'string', description: 'New username' },
                message: { type: 'string', example: 'Username updated successfully' }
              }
            }
          }
        },
        400: { description: 'Validation error, username taken, or rate limit', ...validationErrorResponseSchema },
        401: errorResponseSchema,
        404: errorResponseSchema,
        429: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            error: { type: 'string', example: 'Username change limited to once every 30 days' },
            nextChangeAllowedAt: { type: 'string', format: 'date-time' },
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
      const body = updateUsernameSchema.parse(request.body);

      // Get user with current username and password
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          password: true,
          usernameHistory: true,
          // Les trois autres composants du nom : ils ne CHANGENT pas ici, mais
          // les jetons de recherche se recalculent sur les QUATRE à la fois
          // (#4159). Une projection trop étroite rendrait le recalcul impossible
          // en aval, et c'est la projection — pas l'appel manquant — qui est le
          // vrai obstacle dans ce genre de cas.
          displayName: true,
          firstName: true,
          lastName: true
        }
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      // Verify password
      const isPasswordValid = await verifyPassword(body.currentPassword, user.password);
      if (!isPasswordValid) {
        return sendBadRequest(reply, 'Current password is incorrect');
      }

      // Check if new username is the same as current
      if (body.newUsername.toLowerCase() === user.username.toLowerCase()) {
        return sendBadRequest(reply, 'New username must be different from current username');
      }

      // Check if username is already taken
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          username: {
            equals: body.newUsername,
            mode: 'insensitive'
          },
          id: { not: userId }
        }
      });

      if (existingUser) {
        return sendBadRequest(reply, 'This username is already taken');
      }

      // Check rate limit (30 days between changes)
      const history = (user.usernameHistory as any[]) || [];
      if (history.length > 0) {
        const lastChange = new Date(history[0].changedAt);
        const daysSinceLastChange = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24);
        const RATE_LIMIT_DAYS = 30;

        if (daysSinceLastChange < RATE_LIMIT_DAYS) {
          const nextChangeAllowedAt = new Date(lastChange.getTime() + RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000);
          return sendError(reply, 429, `Username change limited to once every ${RATE_LIMIT_DAYS} days`);
        }
      }

      // Get request context for history
      /* istanbul ignore next — defensive IP fallbacks; request.ip always set by Fastify inject */
      const ipAddress = request.ip || request.headers['x-forwarded-for'] as string || request.headers['x-real-ip'] as string || 'unknown';
      /* istanbul ignore next — defensive fallback; user-agent is always present in practice */
      const userAgent = request.headers['user-agent'] || 'unknown';

      // Add new entry to history (limit to 10 most recent)
      const newHistoryEntry = {
        newUsername: body.newUsername,
        changedAt: new Date().toISOString(),
        ipAddress,
        userAgent
      };

      const updatedHistory = [newHistoryEntry, ...history].slice(0, 10);

      // Update username and history
      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          username: body.newUsername,
          usernameHistory: updatedHistory,
          // Recalculés avec le nom qui change : sans cela, l'ancien pseudo
          // resterait indexé et le nouveau serait introuvable (#4159).
          searchTokens: searchTokensFor({
            username: body.newUsername,
            displayName: user.displayName,
            firstName: user.firstName,
            lastName: user.lastName,
          }),
        },
        select: {
          id: true,
          username: true,
          // Les trois autres composants du nom : `username` n'est le nom RENDU
          // que si `displayName` et « Prénom Nom » sont vides, et le
          // destinataire ne peut pas le savoir sans eux. Même règle de groupe
          // que le chemin `PATCH /users/me`.
          displayName: true,
          firstName: true,
          lastName: true
        }
      });

      try { await getCacheStore().del(authUserCacheKey(userId!)); } catch { /* best-effort */ }

      fastify.notificationService?.emitUserUpdated({
        userId: userId!,
        changes: {
          username: updatedUser.username,
          displayName: updatedUser.displayName,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
        },
      })
        .catch((err: unknown) => fastify.log.error({ err }, '[USERNAME_CHANGE] emitUserUpdated failed'));

      // `username` fait partie de l'identité de frappe mise en cache par
      // StatusHandler (`{ username, displayName }`). L'invalider pour que
      // l'indicateur « en train d'écrire » reflète le nouveau handle sans
      // attendre l'expiration du TTL. Cf. refreshUserTypingIdentity.
      fastify.socketIOHandler?.getManager?.()?.refreshUserTypingIdentity(userId!);

      fastify.log.info(`[USERNAME_CHANGE] User ${userId} changed username from "${user.username}" to "${body.newUsername}"`);

      return sendSuccess(reply, {
        username: updatedUser.username,
        message: 'Username updated successfully'
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, error.issues[0]?.message || 'Invalid data');
      }

      logError(fastify.log, 'Update username error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}
