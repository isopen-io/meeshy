/**
 * Mises à jour du profil authentifié : `PATCH /users/me`,
 * `/users/me/avatar`, `/users/me/banner`. Extrait de `profile.ts` (#4284,
 * budget de taille) — la façade de ré-export vit là-bas.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { capitalizeName, normalizeDisplayName } from '../../utils/normalize';
import {
  updateUserProfileSchema,
  updateAvatarSchema,
  updateBannerSchema
} from '@meeshy/shared/utils/validation';
import {
  userSchema,
  updateUserRequestSchema,
  errorResponseSchema,
  validationErrorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest } from './types';
import { formatUserResponse } from '../auth/types';
import { UserRoleEnum } from '@meeshy/shared/types';
import { authUserCacheKey } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { withMutationLog } from '../../utils/withMutationLog';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { sendSuccess, sendInternalError, sendUnauthorized, sendBadRequest } from '../../utils/response';
import { servedUserPermissions } from '../../services/admin/served-permissions';

/**
 * Update authenticated user profile
 */
export async function updateUserProfile(fastify: FastifyInstance) {
  fastify.patch('/users/me', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update the authenticated user profile. Allows updating personal information, language preferences, and translation settings. Email and phone number are NOT accepted here (#4184) — use POST /users/me/change-email and /change-phone, which require proof of possession before writing.',
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
      // `email` et `phoneNumber` NE SONT PLUS lisibles sur `body` — retirés du
      // schéma (#4184) précisément pour qu'aucune ligne ne puisse plus les
      // écrire ici. Cette route les acceptait autrefois SANS preuve de
      // possession et les posait directement en base sans jamais remettre
      // `emailVerifiedAt`/`phoneVerifiedAt` à `null` : une session courte
      // suffisait à un attaquant pour prendre le compte en un seul appel.
      // Le bon geste — `POST /users/me/change-email` / `/change-phone`
      // (`contact-change.ts`) — prouve la possession avant d'écrire quoi que
      // ce soit ; ne pas recréer ce raccourci ici.
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
