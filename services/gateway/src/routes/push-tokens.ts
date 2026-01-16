/**
 * Push Token Routes
 *
 * Manages device registration for push notifications (APNS, FCM, VoIP)
 * Supports iOS, Android, and Web platforms
 *
 * @module routes/push-tokens
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import {
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const registerDeviceTokenSchema = z.object({
  // The push token from the device (accept both 'token' and 'apnsToken' for iOS compatibility)
  token: z.string().min(10).max(500).optional(),
  apnsToken: z.string().min(10).max(500).optional(),

  // Token type: apns (Apple Push), fcm (Firebase), voip (Apple VoIP)
  type: z.enum(['apns', 'fcm', 'voip']).optional(),

  // Platform: ios, android, web
  platform: z.enum(['ios', 'android', 'web']),

  // Optional device identifier for managing multiple devices
  deviceId: z.string().max(255).optional(),

  // Optional device name for user identification
  deviceName: z.string().max(100).optional(),

  // App version for compatibility tracking
  appVersion: z.string().max(50).optional(),

  // Bundle ID for the app
  bundleId: z.string().max(255).optional(),
}).refine(
  (data) => data.token || data.apnsToken,
  { message: 'Either token or apnsToken must be provided' }
);

const unregisterDeviceTokenSchema = z.object({
  // Token to unregister (optional - if not provided, unregisters all tokens for current device)
  token: z.string().min(10).max(500).optional(),

  // Device ID to unregister all tokens for
  deviceId: z.string().max(255).optional(),
});

// ============================================
// ROUTES
// ============================================

export async function pushTokenRoutes(fastify: FastifyInstance) {
  /**
   * POST /users/register-device-token
   * Register a push notification token for the authenticated user's device
   */
  fastify.post('/users/register-device-token', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Register a push notification token for the authenticated user device. Supports APNS (iOS), FCM (Firebase - iOS/Android/Web), and VoIP (iOS calls). Tokens are deduplicated per user/type combination.',
      tags: ['users', 'push-notifications'],
      summary: 'Register device push token',
      body: {
        type: 'object',
        required: ['token', 'platform'],
        properties: {
          token: {
            type: 'string',
            minLength: 10,
            maxLength: 500,
            description: 'Push notification token from the device'
          },
          type: {
            type: 'string',
            enum: ['apns', 'fcm', 'voip'],
            default: 'fcm',
            description: 'Token type: apns (Apple Push), fcm (Firebase), voip (Apple VoIP Push)'
          },
          platform: {
            type: 'string',
            enum: ['ios', 'android', 'web'],
            description: 'Device platform'
          },
          deviceId: {
            type: 'string',
            maxLength: 255,
            description: 'Unique device identifier for managing multiple devices'
          },
          deviceName: {
            type: 'string',
            maxLength: 100,
            description: 'Human-readable device name (e.g., "iPhone 15 Pro")'
          },
          appVersion: {
            type: 'string',
            maxLength: 50,
            description: 'App version for compatibility tracking'
          },
          bundleId: {
            type: 'string',
            maxLength: 255,
            description: 'App bundle identifier'
          }
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
                id: { type: 'string', description: 'Push token record ID' },
                type: { type: 'string', description: 'Token type' },
                platform: { type: 'string', description: 'Device platform' },
                deviceName: { type: 'string', nullable: true },
                isNew: { type: 'boolean', description: 'Whether this is a newly registered token' },
                message: { type: 'string' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const body = registerDeviceTokenSchema.parse(request.body);

      // Normalize token (accept both 'token' and 'apnsToken' for iOS compatibility)
      const token = body.token || body.apnsToken!;

      // Determine token type: if not specified, infer from platform
      // iOS defaults to 'apns', Android/Web default to 'fcm'
      const tokenType = body.type || (body.platform === 'ios' ? 'apns' : 'fcm');

      fastify.log.info(`[PUSH_TOKEN] Registering ${tokenType} token for user ${userId} on ${body.platform}`);

      // Upsert the token (create or update if exists)
      const pushToken = await fastify.prisma.pushToken.upsert({
        where: {
          userId_token_type: {
            userId,
            token,
            type: tokenType
          }
        },
        update: {
          platform: body.platform,
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          appVersion: body.appVersion,
          bundleId: body.bundleId,
          isActive: true,
          failedAttempts: 0, // Reset failed attempts on re-registration
          lastError: null,
          updatedAt: new Date()
        },
        create: {
          userId,
          token,
          type: tokenType,
          platform: body.platform,
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          appVersion: body.appVersion,
          bundleId: body.bundleId,
          isActive: true
        },
        select: {
          id: true,
          type: true,
          platform: true,
          deviceName: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Determine if this was a new registration or update
      const isNew = pushToken.createdAt.getTime() === pushToken.updatedAt.getTime();

      fastify.log.info(`[PUSH_TOKEN] ${isNew ? 'Registered new' : 'Updated'} ${body.type} token for user ${userId}`);

      return reply.send({
        success: true,
        data: {
          id: pushToken.id,
          type: pushToken.type,
          platform: pushToken.platform,
          deviceName: pushToken.deviceName,
          isNew,
          message: isNew ? 'Device token registered successfully' : 'Device token updated successfully'
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        fastify.log.warn(`[PUSH_TOKEN] Validation error: ${JSON.stringify(error.errors)}`);
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }

      logError(fastify.log, '[PUSH_TOKEN] Error registering device token:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to register device token'
      });
    }
  });

  /**
   * DELETE /users/register-device-token
   * Unregister push notification token(s) for the authenticated user
   */
  fastify.delete('/users/register-device-token', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Unregister push notification token(s) for the authenticated user. Can unregister a specific token, all tokens for a device, or all tokens for the user.',
      tags: ['users', 'push-notifications'],
      summary: 'Unregister device push token',
      body: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            minLength: 10,
            maxLength: 500,
            description: 'Specific token to unregister'
          },
          deviceId: {
            type: 'string',
            maxLength: 255,
            description: 'Unregister all tokens for this device ID'
          }
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
                deletedCount: { type: 'number', description: 'Number of tokens deleted' },
                message: { type: 'string' }
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const body = unregisterDeviceTokenSchema.parse(request.body || {});

      fastify.log.info(`[PUSH_TOKEN] Unregistering tokens for user ${userId}`);

      // Build the where clause based on provided parameters
      const whereClause: any = { userId };

      if (body.token) {
        // Unregister specific token
        whereClause.token = body.token;
      } else if (body.deviceId) {
        // Unregister all tokens for a specific device
        whereClause.deviceId = body.deviceId;
      }
      // If neither token nor deviceId provided, delete all user's tokens (logout from all devices)

      const result = await fastify.prisma.pushToken.deleteMany({
        where: whereClause
      });

      fastify.log.info(`[PUSH_TOKEN] Deleted ${result.count} token(s) for user ${userId}`);

      return reply.send({
        success: true,
        data: {
          deletedCount: result.count,
          message: result.count > 0
            ? `Successfully unregistered ${result.count} device token(s)`
            : 'No matching tokens found'
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        fastify.log.warn(`[PUSH_TOKEN] Validation error: ${JSON.stringify(error.errors)}`);
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }

      logError(fastify.log, '[PUSH_TOKEN] Error unregistering device token:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to unregister device token'
      });
    }
  });

  /**
   * GET /users/me/devices
   * List all registered devices/tokens for the authenticated user
   */
  fastify.get('/users/me/devices', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'List all registered push notification devices for the authenticated user. Useful for device management UI.',
      tags: ['users', 'push-notifications'],
      summary: 'List registered devices',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string', enum: ['apns', 'fcm', 'voip'] },
                  platform: { type: 'string', enum: ['ios', 'android', 'web'] },
                  deviceId: { type: 'string', nullable: true },
                  deviceName: { type: 'string', nullable: true },
                  appVersion: { type: 'string', nullable: true },
                  isActive: { type: 'boolean' },
                  lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
                }
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      const devices = await fastify.prisma.pushToken.findMany({
        where: { userId },
        select: {
          id: true,
          type: true,
          platform: true,
          deviceId: true,
          deviceName: true,
          appVersion: true,
          isActive: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' }
      });

      return reply.send({
        success: true,
        data: devices
      });
    } catch (error) {
      logError(fastify.log, '[PUSH_TOKEN] Error listing devices:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list devices'
      });
    }
  });

  /**
   * DELETE /users/me/devices/:deviceId
   * Remove a specific device by ID
   */
  fastify.delete('/users/me/devices/:deviceId', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Remove a specific registered device by its record ID. This will unregister all push tokens for that device.',
      tags: ['users', 'push-notifications'],
      summary: 'Remove registered device',
      params: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string', description: 'Push token record ID to delete' }
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
                message: { type: 'string' }
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { deviceId: string } }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { deviceId } = request.params;

      // Delete only if belongs to the authenticated user (IDOR protection)
      const result = await fastify.prisma.pushToken.deleteMany({
        where: {
          id: deviceId,
          userId // Ensures user can only delete their own tokens
        }
      });

      if (result.count === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Device not found or not owned by user'
        });
      }

      fastify.log.info(`[PUSH_TOKEN] Deleted device ${deviceId} for user ${userId}`);

      return reply.send({
        success: true,
        data: {
          message: 'Device removed successfully'
        }
      });
    } catch (error) {
      logError(fastify.log, '[PUSH_TOKEN] Error removing device:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to remove device'
      });
    }
  });
}
