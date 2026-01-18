import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import bcrypt from 'bcryptjs';
import { normalizeEmail, capitalizeName, normalizeDisplayName, normalizePhoneNumber } from '../../utils/normalize';
import { buildPaginationMeta } from '../../utils/pagination';
import {
  updateUserProfileSchema,
  updateAvatarSchema,
  updatePasswordSchema
} from '@meeshy/shared/utils/validation';
import {
  userSchema,
  userMinimalSchema,
  updateUserRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest, PaginationParams, UserIdParams, UsernameParams } from './types';

/**
 * Validate and sanitize pagination parameters
 */
function validatePagination(
  offset: string = '0',
  limit: string = '20',
  defaultLimit: number = 20,
  maxLimit: number = 100
): PaginationParams {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || defaultLimit), maxLimit);
  return { offsetNum, limitNum };
}

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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      fastify.log.info(`[TEST] Getting test data for user ${userId}`);

      return reply.send({
        success: true,
        data: {
          userId,
          message: "Test endpoint working",
          timestamp: new Date()
        }
      });
    } catch (error) {
      fastify.log.error(`[TEST] Error: ${error instanceof Error ? error.message : String(error)}`);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      fastify.log.info(`[PROFILE_UPDATE] User ${userId} updating profile. Body keys: ${Object.keys(request.body || {}).join(', ')}`);

      const body = updateUserProfileSchema.parse(request.body);

      const updateData: any = {};

      if (body.firstName !== undefined) updateData.firstName = capitalizeName(body.firstName);
      if (body.lastName !== undefined) updateData.lastName = capitalizeName(body.lastName);
      if (body.displayName !== undefined) updateData.displayName = normalizeDisplayName(body.displayName);
      if (body.email !== undefined) updateData.email = normalizeEmail(body.email);
      if (body.phoneNumber !== undefined) {
        updateData.phoneNumber = (body.phoneNumber === '' || body.phoneNumber === null)
          ? null
          : normalizePhoneNumber(body.phoneNumber);
      }
      if (body.bio !== undefined) updateData.bio = body.bio;

      if (body.systemLanguage !== undefined) updateData.systemLanguage = body.systemLanguage;
      if (body.regionalLanguage !== undefined) updateData.regionalLanguage = body.regionalLanguage;
      if (body.customDestinationLanguage !== undefined) {
        updateData.customDestinationLanguage = body.customDestinationLanguage === '' ? null : body.customDestinationLanguage;
      }

      const featureUpdateData: any = {};
      if (body.autoTranslateEnabled !== undefined) featureUpdateData.autoTranslateEnabled = body.autoTranslateEnabled;
      if (body.translateToSystemLanguage !== undefined) featureUpdateData.translateToSystemLanguage = body.translateToSystemLanguage;
      if (body.translateToRegionalLanguage !== undefined) featureUpdateData.translateToRegionalLanguage = body.translateToRegionalLanguage;
      if (body.useCustomDestination !== undefined) featureUpdateData.useCustomDestination = body.useCustomDestination;

      if (body.translateToSystemLanguage === true) {
        featureUpdateData.translateToRegionalLanguage = false;
        featureUpdateData.useCustomDestination = false;
      } else if (body.translateToRegionalLanguage === true) {
        featureUpdateData.translateToSystemLanguage = false;
        featureUpdateData.useCustomDestination = false;
      } else if (body.useCustomDestination === true) {
        featureUpdateData.translateToSystemLanguage = false;
        featureUpdateData.translateToRegionalLanguage = false;
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
          return reply.status(400).send({
            success: false,
            error: 'This email address is already in use'
          });
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
          return reply.status(400).send({
            success: false,
            error: 'This phone number is already in use'
          });
        }
      }

      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          displayName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          role: true,
          isActive: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true,
          userFeature: {
            select: {
              autoTranslateEnabled: true,
              translateToSystemLanguage: true,
              translateToRegionalLanguage: true,
              useCustomDestination: true
            }
          }
        }
      });

      if (Object.keys(featureUpdateData).length > 0) {
        await fastify.prisma.userFeature.upsert({
          where: { userId },
          update: featureUpdateData,
          create: { userId, ...featureUpdateData }
        });
      }

      const responseUser = {
        ...updatedUser,
        autoTranslateEnabled: updatedUser.userFeature?.autoTranslateEnabled ?? true,
        translateToSystemLanguage: updatedUser.userFeature?.translateToSystemLanguage ?? true,
        translateToRegionalLanguage: updatedUser.userFeature?.translateToRegionalLanguage ?? false,
        useCustomDestination: updatedUser.userFeature?.useCustomDestination ?? false
      };
      delete (responseUser as any).userFeature;

      return reply.send({
        success: true,
        data: {
          user: responseUser,
          message: 'Profile updated successfully'
        }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const userId = authContext?.userId || 'unknown';
        fastify.log.error(`[PROFILE_UPDATE] Validation error for user ${userId}: ${JSON.stringify(error.errors)}`);
        return reply.status(400).send({
          success: false,
          error: 'Invalid data',
          details: error.errors
        });
      }

      logError(fastify.log, 'Update user profile error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
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
          avatar: { type: 'string', format: 'uri', description: 'Avatar image URL' }
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
                avatar: { type: 'string', description: 'Updated avatar URL' },
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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      fastify.log.info(`[AVATAR_UPDATE] User ${userId} updating avatar. Body: ${JSON.stringify(request.body)}`);

      const body = updateAvatarSchema.parse(request.body);

      fastify.log.info(`[AVATAR_UPDATE] Avatar URL validated: ${body.avatar}`);

      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: { avatar: body.avatar },
        select: {
          id: true,
          username: true,
          avatar: true
        }
      });

      fastify.log.info(`[AVATAR_UPDATE] Avatar updated successfully for user ${userId}`);

      return reply.send({
        success: true,
        data: {
          avatar: updatedUser.avatar,
          message: 'Avatar updated successfully'
        }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        fastify.log.error(`[AVATAR_UPDATE] Validation error: ${JSON.stringify(error.errors)}`);
        return reply.status(400).send({
          success: false,
          error: 'Invalid image format',
          details: error.errors
        });
      }

      logError(fastify.log, 'Update user avatar error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      const body = updatePasswordSchema.parse(request.body);

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      const isPasswordValid = await bcrypt.compare(body.currentPassword, user.password);

      if (!isPasswordValid) {
        return reply.status(400).send({
          success: false,
          error: 'Current password is incorrect'
        });
      }

      const BCRYPT_COST = 12;
      const hashedPassword = await bcrypt.hash(body.newPassword, BCRYPT_COST);

      await fastify.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      return reply.send({
        success: true,
        data: { message: 'Password updated successfully' }
      });

    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid data',
          details: error.errors
        });
      }

      logError(fastify.log, 'Update password error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}

/**
 * Get user profile by username (public route)
 */
export async function getUserByUsername(fastify: FastifyInstance) {
  fastify.get('/u/:username', {
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
                bio: { type: 'string', nullable: true },
                role: { type: 'string' },
                isOnline: { type: 'boolean' },
                lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
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
          bio: true,
          role: true,
          isOnline: true,
          lastActiveAt: true,
          createdAt: true
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_PROFILE_U] User not found: ${username}`);
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      fastify.log.info(`[USER_PROFILE_U] User found: ${user.username} (${user.id})`);

      return reply.status(200).send({
        success: true,
        data: user
      });

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}

/**
 * Get user profile by ID or username
 */
export async function getUserById(fastify: FastifyInstance) {
  fastify.get('/users/:id', {
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
                isOnline: { type: 'boolean' },
                lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                systemLanguage: { type: 'string' },
                regionalLanguage: { type: 'string' },
                customDestinationLanguage: { type: 'string', nullable: true },
                autoTranslateEnabled: { type: 'boolean' },
                translateToSystemLanguage: { type: 'boolean' },
                translateToRegionalLanguage: { type: 'boolean' },
                useCustomDestination: { type: 'boolean' },
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
  }, async (request: FastifyRequest<{ Params: UserIdParams }>, reply: FastifyReply) => {
    try {
      const { userId: id } = request.params;

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
          userFeature: {
            select: {
              autoTranslateEnabled: true,
              translateToSystemLanguage: true,
              translateToRegionalLanguage: true,
              useCustomDestination: true
            }
          }
        }
      });

      if (!user) {
        fastify.log.warn(`[USER_PROFILE] User not found: ${id}`);
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      fastify.log.info(`[USER_PROFILE] User found: ${user.username} (${user.id})`);

      const { userFeature, ...userWithoutFeature } = user;

      const publicUserProfile = {
        ...userWithoutFeature,
        autoTranslateEnabled: userFeature?.autoTranslateEnabled ?? true,
        translateToSystemLanguage: userFeature?.translateToSystemLanguage ?? true,
        translateToRegionalLanguage: userFeature?.translateToRegionalLanguage ?? false,
        useCustomDestination: userFeature?.useCustomDestination ?? false,
        email: '',
        phoneNumber: undefined,
        permissions: undefined,
        isAnonymous: false,
        isMeeshyer: true,
      };

      return reply.status(200).send({
        success: true,
        data: publicUserProfile
      });

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}
