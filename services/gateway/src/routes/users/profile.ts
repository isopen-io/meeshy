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
import {
  userSchema,
  userMinimalSchema,
  updateUserRequestSchema,
  errorResponseSchema
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

const logger = enhancedLogger.child({ module: 'UserProfileRoutes' });


/**
 * Get authenticated user test endpoint
 */
export async function getUserTest(fastify: FastifyInstance) {
  fastify.get('/users/me/test', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Test endpoint for authenticated users. Verifies authentication token and returns user ID with timestamp.',
      tags: ['users'],
      summary: 'Test authentication endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                userId: { type: 'string', description: 'Authenticated user ID' },
                message: { type: 'string', example: 'Test endpoint working' },
                timestamp: { type: 'string', format: 'date-time' }
              }
            }
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
      fastify.log.info(`[TEST] Getting test data for user ${userId}`);

      return sendSuccess(reply, {
        userId,
        message: "Test endpoint working",
        timestamp: new Date()
      });
    } catch (error) {
      fastify.log.error(`[TEST] Error: ${error instanceof Error ? error.message : String(error)}`);
      return sendInternalError(reply, error instanceof Error ? error.message : 'Unknown error');
    }
  });
}

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
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Validation error or duplicate email/phone' },
            details: { type: 'array', items: { type: 'object' } }
          }
        },
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
      if (body.regionalLanguage !== undefined) updateData.regionalLanguage = body.regionalLanguage;
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

      const isAdmin = updatedUser.role === 'ADMIN' || updatedUser.role === 'BIGBOSS';
      const permissions = {
        canAccessAdmin: isAdmin,
        canManageUsers: isAdmin,
        canManageGroups: isAdmin,
        canManageConversations: isAdmin,
        canViewAnalytics: isAdmin,
        canModerateContent: isAdmin || updatedUser.role === 'MODERATOR',
        canViewAuditLogs: isAdmin || updatedUser.role === 'AUDIT',
        canManageNotifications: isAdmin,
        canManageTranslations: isAdmin,
      };

      return sendSuccess(reply, {
        user: formatUserResponse(updatedUser, permissions),
        message: 'Profile updated successfully'
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
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
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Invalid image format' },
            details: { type: 'array', items: { type: 'object' } }
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
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          displayName: true,
          avatar: true,
          banner: true,
          bio: true,
          isOnline: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          role: true,
          isActive: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      try { await getCacheStore().del(authUserCacheKey(userId!)); } catch { /* best-effort */ }

      fastify.log.info(`[AVATAR_UPDATE] Avatar updated successfully for user ${userId}`);

      return sendSuccess(reply, {
        user: updatedUser,
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
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Invalid image format' },
            details: { type: 'array', items: { type: 'object' } }
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

      fastify.log.info(`[BANNER_UPDATE] User ${userId} updating banner`);

      const body = updateBannerSchema.parse(request.body);

      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: { banner: body.banner },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          displayName: true,
          avatar: true,
          banner: true,
          bio: true,
          isOnline: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          role: true,
          isActive: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      try { await getCacheStore().del(authUserCacheKey(userId!)); } catch { /* best-effort */ }

      fastify.log.info(`[BANNER_UPDATE] Banner updated successfully for user ${userId}`);

      return sendSuccess(reply, {
        user: updatedUser,
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
          currentPassword: { type: 'string', minLength: 8, description: 'Current password for verification' },
          newPassword: { type: 'string', minLength: 8, description: 'New password (min 8 characters)' }
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
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Validation error or incorrect current password' },
            details: { type: 'array', items: { type: 'object' } }
          }
        },
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
 * Change username with history tracking
 */
export async function updateUsername(fastify: FastifyInstance) {
  fastify.patch('/users/me/username', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Change the authenticated user username. Requires password confirmation. Username changes are limited to once every 30 days and history is tracked (max 10 entries).',
      tags: ['users'],
      summary: 'Change username',
      body: {
        type: 'object',
        required: ['newUsername', 'currentPassword'],
        properties: {
          newUsername: { type: 'string', minLength: 2, maxLength: 16, description: 'New username (2-16 chars, alphanumeric, - and _ only)' },
          currentPassword: { type: 'string', minLength: 1, description: 'Current password for verification' }
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
                username: { type: 'string', description: 'New username' },
                message: { type: 'string', example: 'Username updated successfully' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Validation error, username taken, or rate limit' },
            details: { type: 'array', items: { type: 'object' } }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        429: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Username change limited to once every 30 days' },
            nextChangeAllowedAt: { type: 'string', format: 'date-time' }
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
          usernameHistory: true
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
      const ipAddress = request.ip || request.headers['x-forwarded-for'] as string || request.headers['x-real-ip'] as string || 'unknown';
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
          usernameHistory: updatedHistory
        },
        select: {
          id: true,
          username: true
        }
      });

      try { await getCacheStore().del(authUserCacheKey(userId!)); } catch { /* best-effort */ }

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

      fastify.log.info(`[USER_PROFILE_U] Fetching user profile for: ${username}`);

      const user = await fastify.prisma.user.findFirst({
        where: {
          username: {
            equals: username,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          banner: true,
          bio: true,
          role: true,
          isOnline: true,
          lastActiveAt: true,
          deactivatedAt: true,
          createdAt: true,
          voiceModel: { select: voiceModelSelect }
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_PROFILE_U] User not found: ${username}`);
        return sendNotFound(reply, 'User not found');
      }

      fastify.log.info(`[USER_PROFILE_U] User found: ${user.username} (${user.id})`);

      return sendSuccess(reply, await gateProfilePresence(fastify, request, withVoiceFields(user)));

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
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                displayName: { type: 'string' },
                avatar: { type: 'string', nullable: true },
                bio: { type: 'string', nullable: true },
                role: { type: 'string' },
                banner: { type: 'string', nullable: true },
                isOnline: { type: ['boolean', 'null'] },
                lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                voicePublic: { type: 'boolean' },
                voiceSampleUrl: { type: 'string', nullable: true },
                voiceSampleDurationMs: { type: 'number', nullable: true },
                voiceQuality: { type: 'number', nullable: true },
                systemLanguage: { type: 'string' },
                regionalLanguage: { type: 'string' },
                customDestinationLanguage: { type: 'string', nullable: true },
                autoTranslateEnabled: { type: 'boolean' },
                isActive: { type: 'boolean' },
                deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                email: { type: 'string', description: 'Masked for security' },
                phoneNumber: { type: 'string', nullable: true, description: 'Masked for security' },
                permissions: { type: 'object', nullable: true },
                isAnonymous: { type: 'boolean', example: false },
                isMeeshyer: { type: 'boolean', example: true }
              }
            }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      const isMongoId = /^[a-f\d]{24}$/i.test(id);

      fastify.log.info(`[USER_PROFILE] Fetching user profile for: ${id} (isMongoId: ${isMongoId})`);

      const user = await fastify.prisma.user.findFirst({
        where: isMongoId
          ? { id }
          : {
              username: {
                equals: id,
                mode: 'insensitive'
              }
            },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          banner: true,
          bio: true,
          role: true,
          isOnline: true,
          lastActiveAt: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          isActive: true,
          deactivatedAt: true,
          createdAt: true,
          updatedAt: true,
          voiceModel: { select: voiceModelSelect }
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_PROFILE] User not found: ${id}`);
        return sendNotFound(reply, 'User not found');
      }

      fastify.log.info(`[USER_PROFILE] User found: ${user.username} (${user.id})`);

      const publicUserProfile = {
        ...withVoiceFields(user),
        // TODO: Load from UserPreferences.application
        autoTranslateEnabled: true,
        email: '',
        phoneNumber: undefined,
        permissions: undefined,
        isAnonymous: false,
        isMeeshyer: true,
      };

      return sendSuccess(reply, await gateProfilePresence(fastify, request, publicUserProfile));

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

// Shared Prisma select fragment for a user's public voice profile.
// Selected via the `voiceModel` relation; `voicePublicAt` gates exposure.
const voiceModelSelect = {
  voicePublicAt: true,
  referenceAudioUrl: true,
  totalDurationMs: true,
  qualityScore: true,
} as const;

export type VoiceModelFields = {
  voicePublicAt: Date | null;
  referenceAudioUrl: string | null;
  totalDurationMs: number | null;
  qualityScore: number | null;
};

export type PublicVoiceFields =
  | { voicePublic: false }
  | {
      voicePublic: true;
      voiceSampleUrl: string;
      voiceSampleDurationMs: number | null;
      voiceQuality: number | null;
    };

/**
 * Maps a user's (optional) voice model to public-safe voice fields and strips
 * the raw `voiceModel` relation so internal columns never leak.
 *
 * A voice profile is exposed only when the user opted in (`voicePublicAt`
 * non-null) AND a reference audio URL exists. Block-relationship ACL is a
 * documented follow-up (see CLAUDE task notes) — this gates purely on opt-in.
 */
export function deriveVoiceFields(voiceModel: VoiceModelFields | null | undefined): PublicVoiceFields {
  if (voiceModel && voiceModel.voicePublicAt != null && voiceModel.referenceAudioUrl) {
    return {
      voicePublic: true,
      voiceSampleUrl: voiceModel.referenceAudioUrl,
      voiceSampleDurationMs: voiceModel.totalDurationMs ?? null,
      voiceQuality: voiceModel.qualityScore ?? null,
    };
  }
  return { voicePublic: false };
}

export function withVoiceFields<T extends { voiceModel?: VoiceModelFields | null }>(
  user: T
): Omit<T, 'voiceModel'> & PublicVoiceFields {
  const { voiceModel, ...rest } = user;
  return { ...rest, ...deriveVoiceFields(voiceModel) };
}

// Shared Prisma select & profile builder for dedicated lookup endpoints
const publicUserSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  banner: true,
  bio: true,
  role: true,
  isOnline: true,
  lastActiveAt: true,
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  voiceModel: { select: voiceModelSelect }
} as const;

function buildPublicProfile(user: Record<string, unknown>) {
  return {
    ...withVoiceFields(user as { voiceModel?: VoiceModelFields | null }),
    autoTranslateEnabled: true,
    email: '',
    phoneNumber: undefined,
    permissions: undefined,
    isAnonymous: false,
    isMeeshyer: true,
  };
}

export async function getUserByEmail(fastify: FastifyInstance) {
  fastify.get('/users/email/:email', {
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
            data: { type: 'object', additionalProperties: true }
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

      const user = await fastify.prisma.user.findFirst({
        where: { email },
        select: publicUserSelect
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, buildPublicProfile(user));
    } catch (error) {
      logError(fastify.log, 'Get user by email error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

export async function getUserByIdDedicated(fastify: FastifyInstance) {
  fastify.get('/users/id/:id', {
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
            data: { type: 'object', additionalProperties: true }
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

      if (!/^[a-f\d]{24}$/i.test(id)) {
        return sendBadRequest(reply, 'Invalid ObjectId format');
      }

      fastify.log.info(`[USER_PROFILE] Fetching user profile by ObjectId: ${id}`);

      const user = await fastify.prisma.user.findFirst({
        where: { id },
        select: publicUserSelect
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, buildPublicProfile(user));
    } catch (error) {
      logError(fastify.log, 'Get user by ID error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

export async function getUserByPhone(fastify: FastifyInstance) {
  fastify.get('/users/phone/:phone', {
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
            data: { type: 'object', additionalProperties: true }
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

      const user = await fastify.prisma.user.findFirst({
        where: { phoneNumber: normalized.phoneNumber },
        select: publicUserSelect
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, buildPublicProfile(user));
    } catch (error) {
      logError(fastify.log, 'Get user by phone error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}
