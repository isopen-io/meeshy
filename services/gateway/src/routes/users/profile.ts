import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import bcrypt from 'bcryptjs';
import { normalizeEmail, capitalizeName, normalizeDisplayName, normalizePhoneNumber, normalizePhoneWithCountry } from '../../utils/normalize';
import { buildPaginationMeta } from '../../utils/pagination';
import {
  updateUserProfileSchema,
  updateAvatarSchema,
  updateBannerSchema,
  updatePasswordSchema,
  updateUsernameSchema
} from '@meeshy/shared/utils/validation';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import {
  userSchema,
  userMinimalSchema,
  updateUserRequestSchema,
  errorResponseSchema,
  validationErrorResponseSchema,
  usernamePatternSource
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest, UserIdParams, UsernameParams } from './types';
import { formatUserResponse } from '../auth/types';
import { UserRoleEnum } from '@meeshy/shared/types';
import { authUserCacheKey } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { withMutationLog } from '../../utils/withMutationLog';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { sendSuccess, sendError, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendConflict, sendPaginatedSuccess } from '../../utils/response';
import { gateProfilePresence, getOptionalAuth } from './presence-gate';
import { contactLookupScope, blockedIdsOfViewer } from '../../services/ContactDirectoryService';
import { searchTokensFor } from '../../utils/search-tokens';
import { servedUserPermissions } from '../../services/admin/served-permissions';
import {
  publicProfileSchema,
  publicUserSelect,
  buildPublicProfile,
  servirProfilPublic,
} from './public-profile';

// Ré-EXPORT, jamais copie. La forme publique d'un profil vit désormais dans
// `public-profile.ts` — les quatre décisions qui doivent voyager ensemble y
// sont tenues au même endroit (#4161). Ces symboles restent atteignables ici
// parce que d'autres modules et leurs témoins les importent par ce chemin :
// un ré-export garde UNE définition, une seconde déclaration en ferait deux.
export {
  deriveVoiceFields,
  withVoiceFields,
  publicUserSelect,
  publicProfileSchema,
  buildPublicProfile,
} from './public-profile';
export type { VoiceModelFields, PublicVoiceFields } from './public-profile';

const logger = enhancedLogger.child({ module: 'UserProfileRoutes' });


/**
 * `GET /users/me/test` a été RETIRÉE (#4185) : point de terminaison de test
 * d'authentification, consommé par PERSONNE — ni iOS, ni le SDK, ni le web, ni
 * Android (relevé sur les trois clients). Une route de test exposée en
 * production est une surface d'API qu'il faut garder, documenter et faire
 * évoluer, pour un usage qui n'existe pas.
 */

/**
 * Update authenticated user profile
 */
export async function updateUserProfile(fastify: FastifyInstance) {
  fastify.patch('/users/me', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update the authenticated user profile. Allows updating personal information, language preferences, and translation settings. Email and phone number uniqueness is enforced.',
      tags: ['users'],
      summary: 'Update user profile',
      body: updateUserRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                message: { type: 'string', example: 'Profile updated successfully' }
              }
            }
          }
        },
        // Schema partage : l'enveloppe pose `error`, `message` ET `code`
        // (`utils/response.ts`). Les cinq 400 de ce fichier, ecrits a la main,
        // supprimaient `message` et `code` a la serialisation, et declaraient
        // un tableau `details` que l'enveloppe ne pose jamais comme cle — elle
        // l'ETALE a la racine ; son champ tableau s'appelle `violations`.
        400: { description: 'Validation error or duplicate email/phone', ...validationErrorResponseSchema },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as AuthenticatedRequest).authContext;

    try {
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;

      /* istanbul ignore next — request.body is always an object in Fastify; defensive null guard */
      fastify.log.info(`[PROFILE_UPDATE] User ${userId} updating profile. Body keys: ${Object.keys(request.body || {}).join(', ')}`);

      const body = updateUserProfileSchema.parse(request.body);

      const updateData: any = {};

      if (body.firstName !== undefined) updateData.firstName = SecuritySanitizer.sanitizeText(capitalizeName(body.firstName));
      if (body.lastName !== undefined) updateData.lastName = SecuritySanitizer.sanitizeText(capitalizeName(body.lastName));
      if (body.displayName !== undefined) updateData.displayName = SecuritySanitizer.sanitizeText(normalizeDisplayName(body.displayName));
      if (body.email !== undefined) updateData.email = normalizeEmail(body.email);
      if (body.phoneNumber !== undefined) {
        updateData.phoneNumber = (body.phoneNumber === '' || body.phoneNumber === null)
          ? null
          : normalizePhoneNumber(body.phoneNumber);
      }
      if (body.bio !== undefined) updateData.bio = SecuritySanitizer.sanitizeText(body.bio);

      if (body.systemLanguage !== undefined) updateData.systemLanguage = body.systemLanguage;
      if (body.regionalLanguage !== undefined) {
        // Chaîne vide = effacement de la langue secondaire → null (le Prisme la
        // traite comme absente). Mirror de customDestinationLanguage.
        updateData.regionalLanguage = body.regionalLanguage === '' ? null : body.regionalLanguage;
      }
      if (body.customDestinationLanguage !== undefined) {
        updateData.customDestinationLanguage = body.customDestinationLanguage === '' ? null : body.customDestinationLanguage;
      }

      if (body.email) {
        const normalizedEmail = normalizeEmail(body.email);
        const existingUser = await fastify.prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: 'insensitive'
            },
            id: { not: userId }
          }
        });

        if (existingUser) {
          return sendBadRequest(reply, 'This email address is already in use');
        }
      }

      if (body.phoneNumber && body.phoneNumber !== null && body.phoneNumber.trim() !== '') {
        const normalizedPhone = normalizePhoneNumber(body.phoneNumber);
        const existingUser = await fastify.prisma.user.findFirst({
          where: {
            phoneNumber: normalizedPhone,
            id: { not: userId }
          }
        });

        if (existingUser) {
          return sendBadRequest(reply, 'This phone number is already in use');
        }
      }

      const updatedUser = await withMutationLog({
        request,
        fastify,
        userId: userId!,
        kind: 'updateProfile',
        // `converges` — voir `ReplayCost` : rejouer cette op rend le même état.
        replayCost: 'converges',
        op: () => fastify.prisma.user.update({
          where: { id: userId },
          data: updateData,
        }),
        onDuplicate: (resultId) => fastify.prisma.user.findUnique({
          where: { id: resultId },
        }),
      });

      try { await getCacheStore().del(authUserCacheKey(userId!)); } catch { /* best-effort */ }

      // Toggle de la visibilité publique du profil vocal. `updateMany` est
      // volontairement utilisé pour ne PAS lever P2025 quand l'utilisateur n'a
      // pas encore de modèle vocal : la requête affecte 0 ligne et le toggle est
      // un no-op silencieux (l'utilisateur n'a rien à exposer).
      if (body.voicePublic !== undefined) {
        await fastify.prisma.userVoiceModel.updateMany({
          where: { userId },
          data: { voicePublicAt: body.voicePublic ? new Date() : null },
        });
      }

      // B3 (5.3) — un changement de langue doit rafraîchir le snapshot
      // `resolvedLanguages` des sockets connectés du user, sinon SOCKET_LANG_FILTER
      // continue de filtrer sur l'ancienne langue jusqu'à reconnexion. Best-effort.
      const langChanged =
        body.systemLanguage !== undefined ||
        body.regionalLanguage !== undefined ||
        body.customDestinationLanguage !== undefined;
      if (langChanged) {
        fastify.socketIOHandler?.getManager?.()?.refreshUserResolvedLanguages(userId!, {
          systemLanguage: updatedUser.systemLanguage,
          regionalLanguage: updatedUser.regionalLanguage,
          customDestinationLanguage: updatedUser.customDestinationLanguage,
          deviceLocale: updatedUser.deviceLocale,
        });
      }

      // Realtime propagation to conversation partners (tasks/socketio-events-cleanup.md #6).
      // Only public-facing fields matter to other users' cached profile view.
      //
      // Les quatre composants du nom voyagent en GROUPE, pas en delta. Le nom
      // rendu par un client est `displayName > « Prénom Nom » > username` : un
      // delta partiel (« firstName vaut désormais Bob ») est IRRECOMPOSABLE chez
      // le destinataire, qui ne stocke que le nom déjà composé — il lui manque
      // toujours les autres composants. Envoyer les quatre ensemble laisse chaque
      // client appliquer SON résolveur (`getUserDisplayName` web,
      // `APIConversationUser.name` iOS) au lieu d'en fabriquer une quatrième
      // copie côté serveur.
      const nameChanged =
        body.firstName !== undefined ||
        body.lastName !== undefined ||
        body.displayName !== undefined;
      if (nameChanged) {
        const publicChanges = {
          displayName: updatedUser.displayName,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          username: updatedUser.username,
        };
        fastify.notificationService?.emitUserUpdated({ userId: userId!, changes: publicChanges })
          .catch((err: unknown) => fastify.log.error({ err }, '[PROFILE_UPDATE] emitUserUpdated failed'));

        // Le nom résolu pour l'indicateur de frappe (`displayName` > « Prénom Nom »
        // > `username`) dérive de ces trois champs, mis en cache par StatusHandler.
        // Invalider ce cache pour que « X écrit… » reflète le nouveau nom sans
        // attendre l'expiration du TTL. Jumeau du refresh de langue ci-dessus.
        fastify.socketIOHandler?.getManager?.()?.refreshUserTypingIdentity(userId!);
      }

      // La MATRICE, jamais une copie (#4152).
      //
      // Ces trois sites composaient les permissions à la main, sur le seul
      // prédicat `role === 'ADMIN' || role === 'BIGBOSS'` : un MODERATOR qui
      // changeait son avatar recevait `canAccessAdmin: false` et voyait la
      // console d'administration DISPARAÎTRE de son écran — sans qu'aucun rôle
      // n'ait changé, et alors que le serveur continuait de l'autoriser.
      const permissions = servedUserPermissions(updatedUser.role as UserRoleEnum);

      return sendSuccess(reply, {
        user: formatUserResponse(updatedUser, permissions),
        message: 'Profile updated successfully'
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        /* istanbul ignore next — authContext always set by authenticate preValidation */
        const userId = authContext?.userId || 'unknown';
        fastify.log.error(`[PROFILE_UPDATE] Validation error for user ${userId}: ${JSON.stringify(error.issues)}`);
        return sendBadRequest(reply, 'Invalid data');
      }

      logError(fastify.log, 'Update user profile error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Update user avatar
 */
export async function updateUserAvatar(fastify: FastifyInstance) {
  fastify.patch('/users/me/avatar', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update the authenticated user avatar image. Accepts a URL pointing to the avatar image.',
      tags: ['users'],
      summary: 'Update user avatar',
      body: {
        type: 'object',
        required: ['avatar'],
        properties: {
          avatar: { type: 'string', description: 'Avatar image URL or API path' }
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
                user: userSchema,
                message: { type: 'string', example: 'Avatar updated successfully' }
              }
            }
          }
        },
        400: { description: 'Invalid image format', ...validationErrorResponseSchema },
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

      const rawBody = request.body as { avatar?: unknown };
      if (typeof rawBody.avatar === 'string' && rawBody.avatar.startsWith('data:')) {
        return sendBadRequest(reply, 'Avatar must be a file URL. Data URI (base64) avatars are not accepted.');
      }

      fastify.log.info(`[AVATAR_UPDATE] User ${userId} updating avatar. Body: ${JSON.stringify(request.body)}`);

      const body = updateAvatarSchema.parse(request.body);

      fastify.log.info(`[AVATAR_UPDATE] Avatar URL validated: ${body.avatar}`);

      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: { avatar: body.avatar },
      });

      try { await getCacheStore().del(authUserCacheKey(userId!)); } catch { /* best-effort */ }

      fastify.notificationService?.emitUserUpdated({ userId: userId!, changes: { avatar: updatedUser.avatar } })
        .catch((err: unknown) => fastify.log.error({ err }, '[AVATAR_UPDATE] emitUserUpdated failed'));

      fastify.log.info(`[AVATAR_UPDATE] Avatar updated successfully for user ${userId}`);

      // La MATRICE, jamais une copie (#4152).
      //
      // Ces trois sites composaient les permissions à la main, sur le seul
      // prédicat `role === 'ADMIN' || role === 'BIGBOSS'` : un MODERATOR qui
      // changeait son avatar recevait `canAccessAdmin: false` et voyait la
      // console d'administration DISPARAÎTRE de son écran — sans qu'aucun rôle
      // n'ait changé, et alors que le serveur continuait de l'autoriser.
      const permissions = servedUserPermissions(updatedUser.role as UserRoleEnum);

      return sendSuccess(reply, {
        user: formatUserResponse(updatedUser, permissions),
        message: 'Avatar updated successfully'
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        fastify.log.error(`[AVATAR_UPDATE] Validation error: ${JSON.stringify(error.issues)}`);
        return sendBadRequest(reply, 'Invalid image format');
      }

      logError(fastify.log, 'Update user avatar error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Update user banner
 */
export async function updateUserBanner(fastify: FastifyInstance) {
  fastify.patch('/users/me/banner', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update the authenticated user banner image. Accepts a URL pointing to the banner image.',
      tags: ['users'],
      summary: 'Update user banner',
      body: {
        type: 'object',
        required: ['banner'],
        properties: {
          banner: { type: 'string', description: 'Banner image URL or API path' }
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
                user: userSchema,
                message: { type: 'string', example: 'Banner updated successfully' }
              }
            }
          }
        },
        400: { description: 'Invalid image format', ...validationErrorResponseSchema },
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

      fastify.log.info(`[BANNER_UPDATE] User ${userId} updating banner`);

      const body = updateBannerSchema.parse(request.body);

      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: { banner: body.banner },
      });

      try { await getCacheStore().del(authUserCacheKey(userId!)); } catch { /* best-effort */ }

      fastify.notificationService?.emitUserUpdated({ userId: userId!, changes: { banner: updatedUser.banner } })
        .catch((err: unknown) => fastify.log.error({ err }, '[BANNER_UPDATE] emitUserUpdated failed'));

      fastify.log.info(`[BANNER_UPDATE] Banner updated successfully for user ${userId}`);

      // La MATRICE, jamais une copie (#4152).
      //
      // Ces trois sites composaient les permissions à la main, sur le seul
      // prédicat `role === 'ADMIN' || role === 'BIGBOSS'` : un MODERATOR qui
      // changeait son avatar recevait `canAccessAdmin: false` et voyait la
      // console d'administration DISPARAÎTRE de son écran — sans qu'aucun rôle
      // n'ait changé, et alors que le serveur continuait de l'autoriser.
      const permissions = servedUserPermissions(updatedUser.role as UserRoleEnum);

      return sendSuccess(reply, {
        user: formatUserResponse(updatedUser, permissions),
        message: 'Banner updated successfully'
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        fastify.log.error(`[BANNER_UPDATE] Validation error: ${JSON.stringify(error.issues)}`);
        return sendBadRequest(reply, 'Invalid image format');
      }

      logError(fastify.log, 'Update user banner error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

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

      const isPasswordValid = await bcrypt.compare(body.currentPassword, user.password);

      if (!isPasswordValid) {
        return sendBadRequest(reply, 'Current password is incorrect');
      }

      const BCRYPT_COST = 12;
      const hashedPassword = await bcrypt.hash(body.newPassword, BCRYPT_COST);

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
      const isPasswordValid = await bcrypt.compare(body.currentPassword, user.password);
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

/**
 * Get user profile by username (public route)
 */
export async function getUserByUsername(fastify: FastifyInstance) {
  fastify.get('/u/:username', {
    preValidation: [getOptionalAuth(fastify.prisma)],
    schema: {
      description: 'Get public user profile by username. Returns public information only (excludes email, phone, password). Case-insensitive username matching.',
      tags: ['users'],
      summary: 'Get user profile by username',
      params: {
        type: 'object',
        required: ['username'],
        properties: {
          username: { type: 'string', description: 'Username to lookup (case-insensitive)' }
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
                id: { type: 'string' },
                username: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                displayName: { type: 'string' },
                avatar: { type: 'string', nullable: true },
                banner: { type: 'string', nullable: true },
                bio: { type: 'string', nullable: true },
                role: { type: 'string' },
                isOnline: { type: ['boolean', 'null'] },
                lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                voicePublic: { type: 'boolean' },
                voiceSampleUrl: { type: 'string', nullable: true },
                voiceSampleDurationMs: { type: 'number', nullable: true },
                voiceQuality: { type: 'number', nullable: true },
                createdAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: UsernameParams }>, reply: FastifyReply) => {
    try {
      const { username } = request.params;

      // ALIAS de `GET /directory/people/:handle` (#4161, critère 9).
      //
      // Cette porte servait une projection PLUS COURTE que ses trois voisines —
      // une troisième forme de réponse pour la même ligne de base. Elle sert
      // désormais la même, et les liens `/u/<pseudo>` déjà partagés continuent
      // de fonctionner.
      const profil = await servirProfilPublic(fastify, request, reply, username);
      if (!profil) return reply;

      return sendSuccess(reply, profil);

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Get user profile by ID or username
 */
export async function getUserById(fastify: FastifyInstance) {
  fastify.get('/users/:id', {
    preValidation: [getOptionalAuth(fastify.prisma)],
    schema: {
      description: 'Get public user profile by MongoDB ID or username. Returns public information including language settings. Automatically detects whether ID is MongoDB ObjectId or username.',
      tags: ['users'],
      summary: 'Get user profile by ID or username',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User MongoDB ID (24 hex chars) or username' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            // Le miroir DÉCLARÉ de `publicUserSelect`, comme les trois autres
            // portes de profil. Ce bloc énumérait encore, à la main, les six
            // champs que #4161 retire de la surface — `systemLanguage`,
            // `regionalLanguage`, `customDestinationLanguage`, `isActive`,
            // `deactivatedAt`, `updatedAt` — plus `autoTranslateEnabled`,
            // `email` et `phoneNumber`. Le `select` ne les charge plus, donc
            // rien ne partait ; une déclaration sans producteur n'est pourtant
            // pas neutre : elle PROMET un champ, et la première personne qui
            // le remet au `select` le publie sans qu'un témoin tombe.
            //
            // `permissions` a été RETIRÉ, du schéma comme de la charge utile.
            // Il n'avait pas de producteur : le handler posait
            // `permissions: undefined` DÉLIBÉRÉMENT — un profil public ne porte
            // pas les autorisations de son sujet — si bien que la clé ne
            // partait jamais sur le fil.
            data: publicProfileSchema
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      // ALIAS de `GET /directory/people/:handle` (#4161, critère 9).
      //
      // Ce handler recopiait la projection à la main — c'est lui qui chargeait,
      // et servait, les six champs privés. Il ne décide plus rien : la lecture,
      // la projection, la garde de présence et la composition vivent dans
      // `servirProfilPublic`, et cette adresse reste servie tant que des
      // versions iOS installées l'appellent. Un profil s'ouvre depuis un lien
      // partagé : la queue est longue, et une 302 casserait ces clients.
      const profil = await servirProfilPublic(fastify, request, reply, id);
      if (!profil) return reply;

      return sendSuccess(reply, profil);

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}


export async function getUserByEmail(fastify: FastifyInstance) {
  // AUTHENTIFIÉE, et non plus publique. Cette route confirmait sans compte
  // qu'une adresse appartient à un utilisateur Meeshy — et rendait son profil.
  // Avec `/users/phone/:phone`, ce sont les deux seules routes du dépôt qui
  // joignent « cet identifiant de contact » à « cette personne » : un annuaire
  // INVERSÉ, à partir duquel une liste d'adresses devient une liste d'identités
  // civiles (#4160). La jumelle `POST /users/me/contacts/match` posait déjà
  // cette garde ; ces deux-là ne l'avaient jamais eue.
  fastify.get('/users/email/:email', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get public user profile by email address (case-insensitive)',
      tags: ['users'],
      summary: 'Get user profile by email',
      params: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', description: 'User email address' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            // Déclaré, jamais `additionalProperties: true` : c'est ce
            // mécanisme exact qui laissait sortir six champs privés (#4161).
            data: publicProfileSchema
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { email: string } }>, reply: FastifyReply) => {
    try {
      const email = normalizeEmail(request.params.email);

      fastify.log.info(`[USER_PROFILE] Fetching user profile by email`);

      const viewerId = (request as unknown as { user?: { userId?: string } }).user?.userId ?? '';
      const user = await fastify.prisma.user.findFirst({
        where: {
          email,
          ...contactLookupScope({
            viewerId,
            blockedByViewer: await blockedIdsOfViewer(fastify.prisma, viewerId),
          }),
        },
        select: publicUserSelect
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, buildPublicProfile(await gateProfilePresence(fastify, request, user)));
    } catch (error) {
      logError(fastify.log, 'Get user by email error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

export async function getUserByIdDedicated(fastify: FastifyInstance) {
  fastify.get('/users/id/:id', {
    preValidation: [getOptionalAuth(fastify.prisma)],
    schema: {
      description: 'Get public user profile by MongoDB ObjectId',
      tags: ['users'],
      summary: 'Get user profile by UUID/ObjectId',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[a-f\\d]{24}$', description: 'MongoDB ObjectId (24 hex chars)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            // Déclaré, jamais `additionalProperties: true` : c'est ce
            // mécanisme exact qui laissait sortir six champs privés (#4161).
            data: publicProfileSchema
          }
        },
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      /* istanbul ignore next — Fastify params schema (pattern:^[a-fA-F\d]{24}$) rejects invalid ids before handler */
      if (!isValidObjectId(id)) {
        return sendBadRequest(reply, 'Invalid ObjectId format');
      }

      fastify.log.info(`[USER_PROFILE] Fetching user profile by ObjectId: ${id}`);

      // ALIAS de `GET /directory/people/:handle` (#4161, critère 9). Le
      // paramètre est ici contraint à un ObjectId par le schéma ; le lecteur
      // partagé accepte les deux formes, ce qui ne change rien à ce que cette
      // porte-ci laisse entrer.
      const profil = await servirProfilPublic(fastify, request, reply, id);
      if (!profil) return reply;

      return sendSuccess(reply, profil);
    } catch (error) {
      logError(fastify.log, 'Get user by ID error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

export async function getUserByPhone(fastify: FastifyInstance) {
  // AUTHENTIFIÉE — voir `/users/email/:email`. Celle-ci est la plus lourde des
  // deux : `User` ne porte AUCUN index sur `phoneNumber`, si bien qu'un
  // appelant anonyme faisait balayer la collection entière à chaque essai. Un
  // index manquant est ici aussi une surface de déni de service (#4160).
  fastify.get('/users/phone/:phone', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get public user profile by phone number. Accepts digits with optional country code prefix (e.g. 336199909344 or +336199909344). Normalizes to E.164 format for lookup.',
      tags: ['users'],
      summary: 'Get user profile by phone number',
      params: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', description: 'Phone number with country indicator (e.g. 336199909344)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            // Déclaré, jamais `additionalProperties: true` : c'est ce
            // mécanisme exact qui laissait sortir six champs privés (#4161).
            data: publicProfileSchema
          }
        },
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { phone: string } }>, reply: FastifyReply) => {
    try {
      const rawPhone = request.params.phone.trim();
      const phoneInput = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

      const normalized = normalizePhoneWithCountry(phoneInput);

      if (!normalized || !normalized.isValid) {
        return sendBadRequest(reply, 'Invalid phone number format');
      }

      fastify.log.info(`[USER_PROFILE] Fetching user profile by phone: ${normalized.countryCode}`);

      const viewerId = (request as unknown as { user?: { userId?: string } }).user?.userId ?? '';
      const user = await fastify.prisma.user.findFirst({
        where: {
          phoneNumber: normalized.phoneNumber,
          ...contactLookupScope({
            viewerId,
            blockedByViewer: await blockedIdsOfViewer(fastify.prisma, viewerId),
          }),
        },
        select: publicUserSelect
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, buildPublicProfile(await gateProfilePresence(fastify, request, user)));
    } catch (error) {
      logError(fastify.log, 'Get user by phone error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}
