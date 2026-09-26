/**
 * Identifiants du compte : `PATCH /users/me/password`,
 * `/users/me/username`. Extrait de `profile.ts` (#4284, budget de taille) —
 * la façade de ré-export vit là-bas.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError, logWarn } from '../../utils/logger';
import { hashPassword, verifyPassword } from '../../utils/password-hash';
import { validatePasswordStrength } from '../../utils/password-strength';
import {
  PASSWORD_MIN_LENGTH,
  updatePasswordSchema,
  updateUsernameSchema
} from '@meeshy/shared/utils/validation';
import {
  errorResponseSchema,
  validationErrorResponseSchema,
  usernameMaxLength,
  usernameMinLength,
  usernamePatternSource
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest } from './types';
import { authUserCacheKey } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { getUserSessions, invalidateAllSessions } from '../../services/SessionService';
import { disconnectSession } from '../../socketio/disconnectSession';
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
      description: 'Change the authenticated user password. Requires current password for verification. New password must meet security requirements. Every OTHER session is revoked and disconnected (#6435) — pass `x-session-token` to keep the calling device signed in.',
      tags: ['users'],
      summary: 'Change user password',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Current session token, so this device is excluded from the post-change revocation' }
        }
      },
      body: {
        type: 'object',
        required: ['newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1, description: 'Current password for verification — REQUIRED unless the account has none yet (email-only signup, #6424), in which case the authenticated session is the proof. No length bound: a bound would lock out accounts created under a lower one' },
          newPassword: { type: 'string', minLength: PASSWORD_MIN_LENGTH, description: 'New password (min PASSWORD_MIN_LENGTH characters)' }
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

      /**
       * POSER LE PREMIER MOT DE PASSE (#6424).
       *
       * Un compte né d'une inscription par e-mail seul n'a pas de mot de
       * passe. Lui en réclamer un « actuel » pour en poser un premier rend la
       * porte inatteignable : la preuve exigée est précisément la chose que
       * l'appel vient créer.
       *
       * Ce qui la remplace n'est pas RIEN — c'est la SESSION. Un compte sans
       * mot de passe n'a qu'une porte, le lien magique, et la franchir prouve
       * le contrôle de la boîte mail. Le `onRequest: [fastify.authenticate]`
       * de cette route est donc déjà une preuve de possession, du même ordre
       * que celle qu'un lien de réinitialisation apporte à `/reset-password`.
       *
       * L'exception est BORNÉE par l'état de la ligne, jamais par ce que la
       * requête déclare : `user.password === null` est lu en base. Un appel
       * qui omettrait `currentPassword` sur un compte qui en a un se voit
       * refusé exactement comme avant.
       */
      const premierMotDePasse = user.password === null || user.password === undefined;

      if (!premierMotDePasse) {
        const isPasswordValid = await verifyPassword(body.currentPassword ?? '', user.password);

        if (!isPasswordValid) {
          return sendBadRequest(reply, 'Current password is incorrect');
        }
      }

      // #3629 — cette porte ne validait que la LONGUEUR (`updatePasswordSchema`,
      // Zod) ; `zxcvbn` et les classes de caractères n'étaient consultés qu'au
      // reset. Un compte pouvait donc CRÉER un mot de passe fort puis le
      // CHANGER pour un mot de passe trivial sans qu'aucune règle ne s'y
      // oppose.
      const strength = validatePasswordStrength(body.newPassword);
      if (!strength.isValid) {
        return sendBadRequest(reply, `Password requirements: ${strength.errors.join(', ')}`);
      }

      const hashedPassword = await hashPassword(body.newPassword);

      await fastify.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      // #6435 — changer son mot de passe ne révoquait AUCUNE autre session :
      // reprendre un compte (lien magique → on pose un mot de passe) ne
      // chassait pas l'intrus qui y était déjà connecté. Même patron que
      // `DELETE /sessions` (routes/auth/magic-link.ts) : les sessions à
      // couper se relèvent AVANT la révocation (une ligne révoquée quitte la
      // liste "active"), la session courante — identifiée par
      // `x-session-token`, comme sur les autres routes de gestion de
      // sessions — survit, et chaque AUTRE session voit son socket coupé
      // individuellement (jamais `disconnectRevokedSessions`, qui couperait
      // aussi l'appareil courant).
      const currentSessionToken = request.headers['x-session-token'] as string | undefined;
      const sessionsBeforeRevocation = await getUserSessions(userId, currentSessionToken);
      const sessionsToDisconnect = sessionsBeforeRevocation
        .filter((session) => !session.isCurrentSession)
        .map((session) => session.id);

      await invalidateAllSessions(userId, currentSessionToken, 'password_changed');

      const io = fastify.socketIOHandler?.getManager?.()?.getIO();
      for (const sessionId of sessionsToDisconnect) {
        await disconnectSession({
          io,
          userId,
          sessionId,
          message: 'This device was signed out because the password changed.',
          onError: (error) => logWarn(fastify.log, '[PASSWORD_CHANGE] socket cut failed', error),
        });
      }

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
      minLength: usernameMinLength,
      maxLength: usernameMaxLength,
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
          // #4859 — le schéma 429 déclare `nextChangeAllowedAt` (compte à
          // rebours affiché au client) depuis toujours ; jamais transmis, le
          // champ n'a jamais atteint personne.
          return sendError(reply, 429, `Username change limited to once every ${RATE_LIMIT_DAYS} days`, {
            details: { nextChangeAllowedAt: nextChangeAllowedAt.toISOString() },
          });
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
        .catch((err: unknown) => logError(fastify.log, '[USERNAME_CHANGE] emitUserUpdated failed', err));

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
